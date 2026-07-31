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
import sys
import threading
from contextlib import asynccontextmanager

import uvicorn

logger = logging.getLogger("run_server")


def run_flask(app, host: str, port: int):
    """Run Flask in a background thread."""
    import werkzeug.serving
    werkzeug.serving.run_simple(host, port, app, use_reloader=False, threaded=True)


def start_servers(flask_port: int = 5000, ws_port: int = 8765, host: str = "0.0.0.0"):
    """Start both Flask and FastAPI servers."""
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
    logger.info(f"FastAPI (WebSocket) running on http://{host}:{ws_port}")
    logger.info(f"API docs: http://{host}:{ws_port}/docs")
    uvicorn.run(
        fastapi_app,
        host=host,
        port=ws_port,
        log_level="info",
        access_log=False,
    )


def main():
    parser = argparse.ArgumentParser(description="Salfanet NMS — Hybrid Server")
    parser.add_argument("--port", type=int, default=5000, help="Flask port (default: 5000)")
    parser.add_argument("--ws-port", type=int, default=8765, help="WebSocket/FastAPI port (default: 8765)")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    try:
        start_servers(flask_port=args.port, ws_port=args.ws_port, host=args.host)
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        sys.exit(0)


if __name__ == "__main__":
    main()
