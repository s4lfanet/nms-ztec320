"""Hybrid server — runs Flask (WSGI) + FastAPI (ASGI) in a single process.

Usage:
    python run_server.py              # Start both servers (default ports)
    python run_server.py --port 5000  # Custom Flask port
    python run_server.py --ws-port 8765  # Custom WebSocket port

Architecture:
    - Flask (WSGI) on port 5000 — serves all existing routes + static files
    - FastAPI (ASGI) on port 8765 — serves WebSocket + async endpoints
    - Both share the same Python process and database connections

In production:
    - Nginx proxies /api/* → Flask (port 5000)
    - Nginx proxies /ws/*  → FastAPI (port 8765)
    - Frontend is served as static files from dist/
"""
import argparse
import asyncio
import logging
import os
import signal
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path

# Load .env before anything below reads FLASK_ENV/INTERNAL_API_KEY — config.py
# does the same loading, but that only happens once app.py is imported inside
# start_servers(), which is too late for the production check right below.
# Without this, FLASK_ENV=production in .env is invisible here, the production
# check never fires, and INTERNAL_API_KEY silently gets an ephemeral dev value
# instead of the one actually configured in .env.
_env_file = Path(__file__).resolve().parent / ".env"
if _env_file.exists():
    with open(_env_file) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _key, _, _value = _line.partition("=")
                _key = _key.strip()
                _value = _value.strip().strip('"').strip("'")
                if _key and _key not in os.environ:
                    os.environ[_key] = _value

# Mark this as the server process so app.py runs schema init (migrate_schema +
# db.create_all + seed_initial_data). Cron scripts that import app.py won't
# have this env var, preventing concurrent db.create_all() on SQLite WAL.
os.environ.setdefault('NMS_SERVER_PROCESS', '1')

# Set INTERNAL_API_KEY for Flask→FastAPI internal communication.
# This must be set BEFORE importing app.py or api_async.py so they pick it up.
# SECRET_KEY must NEVER be used as INTERNAL_API_KEY — they serve different purposes.
if not os.environ.get('INTERNAL_API_KEY'):
    _is_production = os.environ.get('FLASK_ENV', 'development') == 'production'
    if _is_production:
        raise RuntimeError(
            "INTERNAL_API_KEY must be explicitly configured in production. "
            "Set it in your .env file or environment variables."
        )
    # Development only: generate ephemeral key for local testing
    import secrets as _secrets
    os.environ['INTERNAL_API_KEY'] = _secrets.token_hex(32)

import uvicorn

logger = logging.getLogger("run_server")

_shutting_down = False


def _graceful_shutdown(signum=None, frame=None):
    """Graceful shutdown — dispose DB sessions, log, then exit."""
    global _shutting_down
    if _shutting_down:
        return
    _shutting_down = True
    logger.info("Graceful shutdown initiated...")
    try:
        from app import app as flask_app
        with flask_app.app_context():
            from extensions import db
            db.session.remove()
            db.engine.dispose()
            logger.info("Database connections closed.")
    except Exception as e:
        logger.warning(f"Error during shutdown cleanup: {e}")
    logger.info("Shutdown complete.")
    sys.exit(0)


def run_flask(app, host: str, port: int):
    """Run Flask in a background thread."""
    import werkzeug.serving
    werkzeug.serving.run_simple(host, port, app, use_reloader=False, threaded=True)


def start_servers(flask_port: int = 5000, ws_port: int = 8765,
                   host: str = "0.0.0.0", ws_host: str = "0.0.0.0"):
    """Start both Flask and FastAPI servers.

    Args:
        flask_port: Flask WSGI port (default 5000)
        ws_port: FastAPI/WebSocket port (default 8765)
        host: Flask bind host (default 0.0.0.0)
        ws_host: FastAPI/WebSocket bind host. In production, set to 127.0.0.1
            so WebSocket is only accessible via Nginx reverse proxy, not
            directly from the internet. Configure via WS_HOST env var or
            --ws-host CLI argument.
    """
    # Import Flask app
    from app import app as flask_app
    from api_async import fastapi_app

    # Start alert monitor (background thread for ONU/OLT health monitoring)
    from alerts import run_alert_monitor
    alert_thread = threading.Thread(
        target=run_alert_monitor, args=(flask_app,), daemon=True, name="alert-monitor"
    )
    alert_thread.start()
    logger.info("Alert monitor started")

    # Start Flask in a background thread
    flask_thread = threading.Thread(
        target=run_flask,
        args=(flask_app, host, flask_port),
        daemon=True,
        name="flask-server",
    )
    flask_thread.start()
    logger.info(f"Flask running on http://{host}:{flask_port}")

    # Run FastAPI in the main thread (uvicorn needs the main thread)
    logger.info(f"FastAPI (WebSocket) running on http://{ws_host}:{ws_port}")
    logger.info(f"API docs: http://{ws_host}:{ws_port}/docs")
    if ws_host == "0.0.0.0":
        logger.warning(
            "WebSocket bound to 0.0.0.0 — in production, set WS_HOST=127.0.0.1 "
            "and use Nginx reverse proxy. Firewall: block port 8765 from WAN."
        )
    uvicorn.run(
        fastapi_app,
        host=ws_host,
        port=ws_port,
        log_level="info",
        access_log=False,
    )


def main():
    parser = argparse.ArgumentParser(description="Salfanet NMS — Hybrid Server")
    parser.add_argument("--port", type=int, default=5000, help="Flask port (default: 5000)")
    parser.add_argument("--ws-port", type=int, default=8765, help="WebSocket/FastAPI port (default: 8765)")
    parser.add_argument("--host", default="0.0.0.0", help="Flask bind host (default: 0.0.0.0)")
    parser.add_argument("--ws-host", default=None,
                        help="WebSocket/FastAPI bind host. Production: 127.0.0.1 (Nginx proxy). "
                             "Default: same as --host or WS_HOST env var.")
    args = parser.parse_args()

    # Determine WS host: CLI arg > env var > Flask host (backward compatible)
    ws_host = args.ws_host or os.environ.get('WS_HOST', '') or args.host

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    try:
        signal.signal(signal.SIGTERM, _graceful_shutdown)
        signal.signal(signal.SIGINT, _graceful_shutdown)
        start_servers(flask_port=args.port, ws_port=args.ws_port,
                      host=args.host, ws_host=ws_host)
    except KeyboardInterrupt:
        _graceful_shutdown()


if __name__ == "__main__":
    main()
