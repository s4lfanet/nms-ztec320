"""FastAPI async API — WebSocket & async endpoints mounted alongside Flask.

This module provides:
- WebSocket endpoint for real-time sync progress
- WebSocket endpoint for live ONU status updates
- Async health check endpoint
- Future: async data collection endpoints

The FastAPI app is mounted as a sidecar on port 8765 (configurable).
Frontend connects to ws://host:8765/ws/... for real-time updates.
Flask continues to serve all existing routes on port 5000.
"""
import asyncio
import json
import os
import time
import hmac
import hashlib
import logging
from typing import Optional, Tuple

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Query, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logger = logging.getLogger("api_async")


# ---------------------------------------------------------------------------
# Internal API key — no SECRET_KEY fallback (P1: eliminate key reuse)
# ---------------------------------------------------------------------------
_INTERNAL_KEY = os.environ.get('INTERNAL_API_KEY', '')
if not _INTERNAL_KEY:
    _is_production = os.environ.get('FLASK_ENV', 'development') == 'production'
    if _is_production:
        raise RuntimeError(
            "INTERNAL_API_KEY must be explicitly configured in production. "
            "Set it in your .env file or environment variables."
        )
    # Development only: generate ephemeral key for local testing
    import secrets as _secrets
    _INTERNAL_KEY = _secrets.token_hex(32)


def _get_internal_api_key() -> str:
    """Get the shared secret for internal Flask→FastAPI communication.

    No SECRET_KEY fallback — INTERNAL_API_KEY must be set explicitly.
    In run_server.py, this is set before app import so both Flask and
    FastAPI share the same key.
    """
    return _INTERNAL_KEY


# ---------------------------------------------------------------------------
# Allowed CORS origins (P1: restrict from wildcard)
# ---------------------------------------------------------------------------
def _get_allowed_origins() -> list[str]:
    """Build allowed CORS origins from environment."""
    origins: list[str] = []
    # Explicit config
    cors_env = os.environ.get('CORS_ALLOWED_ORIGINS', '')
    if cors_env:
        origins.extend(o.strip() for o in cors_env.split(',') if o.strip())
    # Auto-derive from known domains
    base_url = os.environ.get('NEXTAUTH_URL', '') or os.environ.get('BASE_URL', '')
    if base_url:
        origins.append(base_url.rstrip('/'))
    # Always allow localhost for dev
    # In production, do not include localhost origins
    _is_prod = os.environ.get('FLASK_ENV', 'development') == 'production'
    if not _is_prod:
        origins.extend([
            'http://localhost:3000',
            'http://localhost:5000',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5000',
        ])
    # Safety: never allow wildcard with allow_credentials=True
    origins = [o for o in origins if o and o != '*']
    if not origins:
        # Last resort: only allow same-origin (empty list = no CORS headers)
        logger.warning('No CORS origins configured — WebSocket CORS will be restrictive')
    return list(dict.fromkeys(origins))  # dedupe preserving order


# ---------------------------------------------------------------------------
# WebSocket token verification with user identity + permissions (P0)
# ---------------------------------------------------------------------------
def _verify_ws_token(token: Optional[str]) -> Tuple[bool, Optional[int]]:
    """Verify ephemeral HMAC-signed WebSocket auth token.

    Token format: {user_id}.{expiry}.{hmac_signature}
    Verifies signature and checks expiry (60s TTL).
    Does NOT expose SECRET_KEY to the frontend.

    Returns (is_valid, user_id) tuple.
    """
    if not token:
        return False, None
    parts = token.split('.')
    if len(parts) != 3:
        return False, None
    user_id_str, expiry_str, sig = parts
    try:
        user_id = int(user_id_str)
        expiry = int(expiry_str)
    except ValueError:
        return False, None
    # Check token hasn't expired
    if time.time() > expiry:
        return False, None
    # Verify HMAC signature using constant-time comparison
    secret = _get_internal_api_key()
    payload = f"{user_id_str}.{expiry_str}"
    expected_sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    if hmac.compare_digest(sig, expected_sig):
        return True, user_id
    return False, None


# ---------------------------------------------------------------------------
# WebSocket authorization — verify user exists, is active, has permission (P3)
# ---------------------------------------------------------------------------
# Close codes for WebSocket authorization failures (consistent across all endpoints)
WS_CLOSE_UNAUTHORIZED = 4401   # Authentication failed (invalid/expired token)
WS_CLOSE_FORBIDDEN = 4403      # Authorization failed (user inactive/no permission)

def _authorize_ws_user(user_id: int, required_permission: str,
                        olt_id: Optional[int] = None) -> Tuple[bool, str]:
    """Authorize a WebSocket user after token verification.

    Checks (Phase 3+4+5):
    1. User exists in database
    2. User is active (not disabled/banned)
    3. User has the required permission (RBAC — same mechanism as Flask routes)
    4. If olt_id provided: OLT must exist in database

    Access control uses the existing RBAC mechanism:
    - User.has_permission() checks role permissions
    - 'all_olt' permission grants access to all OLTs
    - No per-OLT assignment exists in this system — permission check IS the OLT access control
    - This is consistent with Flask routes that use @permission_required('settings_ip_olts')

    Returns (authorized: bool, reason: str).
    """
    try:
        from app import app as flask_app
        from models import User, OLT, db
        with flask_app.app_context():
            user = db.session.get(User, user_id)
            if user is None:
                return False, "User not found"
            # UserMixin.is_active — False if user is disabled/deactivated
            if not user.is_active:
                return False, "User inactive"
            # Permission check (RBAC — reuses existing has_permission mechanism)
            if not user.has_permission(required_permission):
                return False, "Insufficient permissions"
            # OLT access control: verify OLT exists (Phase 4+5)
            if olt_id is not None:
                olt = db.session.get(OLT, olt_id)
                if olt is None:
                    return False, "OLT not found"
            return True, "OK"
    except Exception as e:
        logger.error(f"WS authorization error for user_id={user_id}: {e}")
        return False, "Authorization error"

# ---------------------------------------------------------------------------
# Connection manager — tracks active WebSocket clients
# ---------------------------------------------------------------------------
class ConnectionManager:
    """Manages WebSocket connections grouped by channel.

    Tracks user_id per connection for permission-based access control.
    Implements server-side heartbeat to detect and clean up idle connections.
    """

    # Heartbeat: send ping every 30s, close after 3 missed pongs (90s idle)
    HEARTBEAT_INTERVAL = 30.0
    HEARTBEAT_TIMEOUT = 90.0

    def __init__(self):
        # channel → set of (websocket, user_id, connected_at, last_pong)
        self._channels: dict[str, dict[WebSocket, dict]] = {}
        self._lock = asyncio.Lock()
        self._heartbeat_task: Optional[asyncio.Task] = None

    async def start_heartbeat(self):
        """Start the background heartbeat task (called once on startup)."""
        if self._heartbeat_task is None or self._heartbeat_task.done():
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def _heartbeat_loop(self):
        """Periodically ping all connections and close idle ones."""
        while True:
            await asyncio.sleep(self.HEARTBEAT_INTERVAL)
            now = time.time()
            dead: list[tuple[WebSocket, str]] = []
            async with self._lock:
                for channel, conns in self._channels.items():
                    for ws, meta in list(conns.items()):
                        idle = now - meta.get('last_pong', meta.get('connected_at', now))
                        if idle > self.HEARTBEAT_TIMEOUT:
                            dead.append((ws, channel))
                        else:
                            # Send server-side ping
                            try:
                                await ws.send_json({"event": "server_ping", "ts": now})
                            except Exception:
                                dead.append((ws, channel))
            # Close dead connections outside the lock
            for ws, channel in dead:
                try:
                    await ws.close(code=4408, reason="Idle timeout")
                except Exception:
                    pass
                async with self._lock:
                    if channel in self._channels:
                        self._channels[channel].pop(ws, None)
                        if not self._channels[channel]:
                            del self._channels[channel]

    async def connect(self, ws: WebSocket, channel: str, user_id: int):
        await ws.accept()
        now = time.time()
        async with self._lock:
            if channel not in self._channels:
                self._channels[channel] = {}
            self._channels[channel][ws] = {
                'user_id': user_id,
                'connected_at': now,
                'last_pong': now,
            }

    async def pong(self, ws: WebSocket, channel: str):
        """Update last_pong timestamp for a connection."""
        async with self._lock:
            if channel in self._channels and ws in self._channels[channel]:
                self._channels[channel][ws]['last_pong'] = time.time()

    async def disconnect(self, ws: WebSocket, channel: str):
        async with self._lock:
            if channel in self._channels:
                self._channels[channel].pop(ws, None)
                if not self._channels[channel]:
                    del self._channels[channel]

    async def broadcast(self, channel: str, data: dict):
        """Send JSON data to all clients in a channel."""
        async with self._lock:
            clients = list(self._channels.get(channel, {}).keys())
        dead = []
        for ws in clients:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    if channel in self._channels:
                        self._channels[channel].pop(ws, None)
                        if not self._channels[channel]:
                            del self._channels[channel]

    def client_count(self, channel: str) -> int:
        return len(self._channels.get(channel, {}))

    def total_clients(self) -> int:
        return sum(len(v) for v in self._channels.values())


manager = ConnectionManager()


@asynccontextmanager
async def _lifespan(app: FastAPI):
    """FastAPI lifespan — start WebSocket heartbeat on startup."""
    await manager.start_heartbeat()
    yield


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
fastapi_app = FastAPI(
    lifespan=_lifespan,
    title="Salfanet NMS — Complete API Documentation",
    description="""**Salfanet NMS** — OLT Management System for FTTH networks.

## For External Developers

If you're building your own frontend or integrating with Salfanet NMS, use this API reference.

### Authentication Flow
```
1. POST /api/auth/login  →  {username, password}  →  Set-Cookie: session
2. All subsequent requests use the session cookie automatically
3. POST /api/auth/logout  →  Clear session
```

### Important Notes
- **Base URL**: `http://your-server:5000/api/...`
- **Session cookie**: auto-sent by browser
- **CORS**: Restricted to explicit trusted origins. Configure via `CORS_ALLOWED_ORIGINS` (comma-separated), `NEXTAUTH_URL`, or `BASE_URL` env vars. Production must use explicit origins (e.g., `https://nms.example.com`). Wildcard `*` is never allowed.
- **Pagination**: `/api/all-onus?page=1&page_size=50&search=&sort_by=name&sort_dir=asc`
- **Error format**: `{\"error\": \"message\"}` with appropriate HTTP status code

### Public Endpoints (No Auth Required)
| Endpoint | Description |
|----------|-------------|
| `GET /api/public/branding` | NMS brand name, base_url |

### WebSocket (Real-time)
```
ws://{host}:8765/ws/sync/{olt_id}    → Sync progress
ws://{host}:8765/ws/onus/{olt_id}    → ONU status changes
ws://{host}:8765/ws/dashboard        → Dashboard events
```
Message format: `{\"event\": \"name\", \"data\": {...}, \"ts\": 1234567890.123}`

### OpenAPI Spec Download
- **JSON**: `GET /openapi.json`
- **ReDoc**: `GET /redoc` (clean reference)
- **Swagger**: `GET /docs` (interactive)

---
## Endpoint Categories
| Tag | Description |
|-----|-------------|
| **WebSocket** | Real-time sync, ONU status, dashboard events |
| **Auth** | Login, logout, session management |
| **Dashboard** | Summary stats, live traffic |
| **OLT Management** | CRUD, sync, connection test |
| **ONU Management** | CRUD, actions, live detail, migration |
| **ONU Registration** | Scan, pre-register new ONUs |
| **Uplink Ports** | Enable/disable, config, VLAN trunk, IP SVI |
| **PON Ports** | Stats, enable/disable, edit |
| **VLANs** | Rename, delete |
| **ONU Types** | Add, delete |
| **Speed Profiles** | TCONT + Traffic profiles |
| **WAN IP Profiles** | WAN IP provisioning |
| **FTTH Infrastructure** | OTB → ODC → ODP hierarchy |
| **Templates** | ONU provisioning templates |
| **TR069** | ACS profiles |
| **Users** | RBAC user management |
| **Customization** | Columns, signal filter, RX colors |
| **Notifications** | Alert notifications |
| **Alerts** | Alert rules |
| **Public** | No-auth endpoints (branding) |
| **WhatsApp Bot** | WA native gateway config |

## Base URLs
- **Flask API**: `http://host:5000/api/...`
- **FastAPI (this docs)**: `http://host:8765/docs`
- **WebSocket**: `ws://host:8765/ws/...`
""",
    version="1.0.0",
    docs_url="/docs" if os.environ.get("FLASK_ENV") != "production" else None,
    redoc_url="/redoc" if os.environ.get("FLASK_ENV") != "production" else None,
    openapi_url="/openapi.json" if os.environ.get("FLASK_ENV") != "production" else None,
)

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "X-Internal-Key"],
)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class HealthResponse(BaseModel):
    status: str
    uptime_seconds: float
    ws_clients: int
    channels: dict[str, int]


class BroadcastRequest(BaseModel):
    channel: str
    event: str
    data: dict


# ---------------------------------------------------------------------------
# Startup time
# ---------------------------------------------------------------------------
_start_time = time.time()


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------
@fastapi_app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint with WebSocket stats."""
    channels = {}
    for ch in list(manager._channels.keys()):
        cnt = manager.client_count(ch)
        if cnt > 0:
            channels[ch] = cnt
    return HealthResponse(
        status="ok",
        uptime_seconds=round(time.time() - _start_time, 1),
        ws_clients=manager.total_clients(),
        channels=channels,
    )


@fastapi_app.post("/broadcast")
async def broadcast_message(
    req: BroadcastRequest,
    request: Request,
    x_internal_key: Optional[str] = Header(None, alias="X-Internal-Key"),
):
    """Internal API — broadcast a message to a WebSocket channel.

    Called by Flask backend (services_sync.py, app.py) to push real-time
    updates to connected frontend clients.
    Requires X-Internal-Key header matching INTERNAL_API_KEY (no SECRET_KEY fallback).
    Restricted to localhost requests only.
    """
    # Restrict to localhost using the real ASGI peer address (uvicorn-populated,
    # not a client-controllable header — X-Forwarded-For was spoofable and an
    # absent header was wrongly treated as trusted localhost).
    client_host = request.client.host if request.client else ''
    if client_host not in ('127.0.0.1', '::1', 'localhost'):
        raise HTTPException(status_code=403, detail="Forbidden: broadcast only allowed from localhost")
    expected_key = _get_internal_api_key()
    if not x_internal_key or not hmac.compare_digest(x_internal_key, expected_key):
        raise HTTPException(status_code=403, detail="Forbidden: invalid internal API key")
    await manager.broadcast(req.channel, {
        "event": req.event,
        "data": req.data,
        "ts": time.time(),
    })
    return {"ok": True, "clients": manager.client_count(req.channel)}


# ---------------------------------------------------------------------------
# WebSocket endpoints
# ---------------------------------------------------------------------------
async def _ws_loop(ws: WebSocket, channel: str, user_id: int, ack_data: dict):
    """Common WebSocket message loop with heartbeat support.

    Handles client messages: 'ping' → pong, 'pong' → update last_pong timestamp.
    All other messages are ignored.
    """
    await manager.connect(ws, channel, user_id)
    try:
        await ws.send_json({
            "event": "connected",
            "data": ack_data,
            "ts": time.time(),
        })
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_json({"event": "pong", "ts": time.time()})
            elif data == "pong":
                await manager.pong(ws, channel)
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(ws, channel)


@fastapi_app.websocket("/ws/sync/{olt_id}")
async def ws_sync_progress(ws: WebSocket, olt_id: int, token: Optional[str] = Query(None)):
    """Real-time sync progress for a specific OLT.

    Frontend connects: ws://host:8765/ws/sync/{olt_id}?token=xxx
    Server pushes: {event: "progress", data: {pct, message, status}}
    """
    valid, user_id = _verify_ws_token(token)
    if not valid or user_id is None:
        await ws.close(code=WS_CLOSE_UNAUTHORIZED, reason="Unauthorized")
        return
    authorized, reason = _authorize_ws_user(user_id, 'settings_ip_olts', olt_id=olt_id)
    if not authorized:
        await ws.close(code=WS_CLOSE_FORBIDDEN, reason=f"Forbidden: {reason}")
        return
    channel = f"sync:{olt_id}"
    await _ws_loop(ws, channel, user_id, {"olt_id": olt_id, "message": "Connected to sync progress stream"})


@fastapi_app.websocket("/ws/onus/{olt_id}")
async def ws_onu_status(ws: WebSocket, olt_id: int, token: Optional[str] = Query(None)):
    """Real-time ONU status updates for a specific OLT.

    Frontend connects: ws://host:8765/ws/onus/{olt_id}?token=xxx
    Server pushes: {event: "onu_change", data: {onu_id, field, old_val, new_val}}
    """
    valid, user_id = _verify_ws_token(token)
    if not valid or user_id is None:
        await ws.close(code=WS_CLOSE_UNAUTHORIZED, reason="Unauthorized")
        return
    authorized, reason = _authorize_ws_user(user_id, 'view_onus', olt_id=olt_id)
    if not authorized:
        await ws.close(code=WS_CLOSE_FORBIDDEN, reason=f"Forbidden: {reason}")
        return
    channel = f"onus:{olt_id}"
    await _ws_loop(ws, channel, user_id, {"olt_id": olt_id, "message": "Connected to ONU status stream"})


@fastapi_app.websocket("/ws/dashboard")
async def ws_dashboard(ws: WebSocket, token: Optional[str] = Query(None)):
    """Real-time dashboard updates — OLT status changes, alert events.

    Frontend connects: ws://host:8765/ws/dashboard?token=xxx
    Server pushes: {event: "olt_status"|"alert"|"onu_count", data: {...}}
    """
    valid, user_id = _verify_ws_token(token)
    if not valid or user_id is None:
        await ws.close(code=WS_CLOSE_UNAUTHORIZED, reason="Unauthorized")
        return
    authorized, reason = _authorize_ws_user(user_id, 'view_dashboard')
    if not authorized:
        await ws.close(code=WS_CLOSE_FORBIDDEN, reason=f"Forbidden: {reason}")
        return
    channel = "dashboard"
    await _ws_loop(ws, channel, user_id, {"message": "Connected to dashboard stream"})


# ---------------------------------------------------------------------------
# Helper — called from Flask to push WebSocket events
# ---------------------------------------------------------------------------
async def push_sync_progress(olt_id: int, pct: int, message: str, status: str = "running"):
    """Push sync progress to WebSocket clients. Called from services_sync.py."""
    await manager.broadcast(f"sync:{olt_id}", {
        "event": "progress",
        "data": {"olt_id": olt_id, "pct": pct, "message": message, "status": status},
        "ts": time.time(),
    })


async def push_onu_change(olt_id: int, onu_id: int, field: str, old_val, new_val):
    """Push ONU field change to WebSocket clients."""
    await manager.broadcast(f"onus:{olt_id}", {
        "event": "onu_change",
        "data": {"onu_id": onu_id, "field": field, "old": old_val, "new": new_val},
        "ts": time.time(),
    })


async def push_dashboard_event(event: str, data: dict):
    """Push dashboard event to all connected dashboard clients."""
    await manager.broadcast("dashboard", {
        "event": event,
        "data": data,
        "ts": time.time(),
    })


# ---------------------------------------------------------------------------
# Register Flask API documentation (documentation-only routes)
# ---------------------------------------------------------------------------
from api_docs import register_flask_api_docs
register_flask_api_docs(fastapi_app)


# ---------------------------------------------------------------------------
# Fase 7 — Browser Telnet/SSH terminal bridge
# WS endpoint: ws://host:8765/ws/terminal/{olt_id}?token=xxx&proto=telnet|ssh
# Bridges the WebSocket to a raw telnet (socket) or SSH (paramiko channel).
# Audit: each submitted command line is logged to ActionLog with passwords masked.
# Limits: 10 min idle timeout, 60 min max session.
# ---------------------------------------------------------------------------
import re as _re
import threading as _threading
import queue as _queue

TERM_IDLE_TIMEOUT = 600      # 10 min no input → close
TERM_MAX_SESSION = 3600      # 60 min hard cap
TERM_MAX_INPUT = 512         # max bytes per WS message


def _audit_terminal_command(user_id, olt, line, password_expected=False):
    """Log one terminal command line to ActionLog; mask when a password prompt
    was visible. Runs in the caller's thread — uses its own app context."""
    try:
        from app import app as flask_app
        from models import db, ActionLog
        shown = '<password hidden>' if password_expected else line
        if len(shown) > 200:
            shown = shown[:200] + '…'
        with flask_app.app_context():
            db.session.add(ActionLog(
                user_id=user_id, action='olt_terminal_cmd',
                category='terminal', target=str(olt.id),
                detail=f'{olt.name}: {shown}',
            ))
            db.session.commit()
    except Exception as e:
        logger.debug(f"[TERM] audit log failed: {e}")


# --- Minimal RFC 854 client for the browser terminal -------------------------
# The terminal bridge is a raw pipe to xterm.js. A real telnet server starts
# with IAC negotiation (e.g. WILL ECHO / WILL SGA). Without replies the server
# never learns we accept its echo, so typed characters do not appear, and the
# IAC bytes themselves leak onto the screen as garbage. This filter answers the
# negotiation and strips IAC sequences from what is shown.
_IAC, _DONT, _DO, _WONT, _WILL, _SB, _SE = 255, 254, 253, 252, 251, 250, 240
_OPT_ECHO, _OPT_SGA, _OPT_NAWS = 1, 3, 31


class _TelnetStream:
    def __init__(self, send):
        self._send_raw = send
        self._pending = b''
        self._answered = set()   # (cmd, opt) already answered -> no negotiation loops
        self.naws = False
        self.cols, self.rows = 80, 24

    def _send(self, data):
        try:
            self._send_raw(data)
        except Exception:
            pass

    def _negotiate(self, cmd, opt):
        if (cmd, opt) in self._answered:
            return
        self._answered.add((cmd, opt))
        if cmd == _WILL:        # server offers an option
            self._send(bytes([_IAC, _DO if opt in (_OPT_ECHO, _OPT_SGA) else _DONT, opt]))
        elif cmd == _DO:        # server asks us to enable an option
            if opt == _OPT_NAWS:
                self.naws = True
                self._send(bytes([_IAC, _WILL, _OPT_NAWS]))
                self.send_size()
            else:
                self._send(bytes([_IAC, _WONT, opt]))

    def set_size(self, cols, rows):
        self.cols, self.rows = int(cols), int(rows)
        self.send_size()

    def send_size(self):
        if not self.naws:
            return
        body = bytearray()
        for v in (self.cols >> 8, self.cols & 0xFF, self.rows >> 8, self.rows & 0xFF):
            body.append(v)
            if v == _IAC:
                body.append(_IAC)
        self._send(bytes([_IAC, _SB, _OPT_NAWS]) + bytes(body) + bytes([_IAC, _SE]))

    def feed(self, data):
        """Return display bytes from raw server bytes (replies sent as needed)."""
        buf = self._pending + data
        self._pending = b''
        out = bytearray()
        i, n = 0, len(buf)
        while i < n:
            b = buf[i]
            if b != _IAC:
                out.append(b)
                i += 1
                continue
            if i + 1 >= n:
                self._pending = buf[i:]
                break
            cmd = buf[i + 1]
            if cmd == _IAC:
                out.append(_IAC)
                i += 2
            elif cmd in (_DO, _DONT, _WILL, _WONT):
                if i + 2 >= n:
                    self._pending = buf[i:]
                    break
                self._negotiate(cmd, buf[i + 2])
                i += 3
            elif cmd == _SB:
                end = buf.find(bytes([_IAC, _SE]), i + 2)
                if end < 0:
                    self._pending = buf[i:] if n - i < 4096 else b''
                    break
                i = end + 2
            else:
                i += 2
        return bytes(out)



def _open_terminal_channel(olt, proto):
    """Open a raw interactive channel to the OLT.
    Returns (write_fn, read_fn, close_fn, resize_fn, err)."""
    from telnet_client import SimpleTelnet
    try:
        if proto == 'ssh':
            import paramiko
            c = paramiko.SSHClient()
            c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            port = 22
            if getattr(olt, 'cli_port', None):
                port = olt.cli_port
            c.connect(olt.ip_address, port=port,
                      username=olt.cli_username, password=olt.cli_password,
                      timeout=15, banner_timeout=15, auth_timeout=15,
                      look_for_keys=False, allow_agent=False)
            ch = c.invoke_shell(width=200, height=50)
            ch.settimeout(0.25)
            def w(data): ch.send(data)
            def r():
                try:
                    d = ch.recv(4096)
                    return d if d else (b'' if ch.exit_status_ready() else None)
                except Exception:
                    return None
            def k():
                try: ch.close(); c.close()
                except Exception: pass
            def res(cols, rows):
                try: ch.resize_pty(width=int(cols), height=int(rows))
                except Exception: pass
            return w, r, k, res, ''
        else:
            port = 23
            if getattr(olt, 'cli_port', None):
                port = olt.cli_port
            tn = SimpleTelnet(olt.ip_address, port=port, timeout=15)
            if not tn.connect():
                return None, None, None, None, 'Telnet connect failed'
            tn.sock.settimeout(0.25)
            _lock = _threading.Lock()   # reader thread (IAC replies) vs. input writes

            def _send(b):
                with _lock:
                    tn.sock.sendall(b)
            stream = _TelnetStream(_send)

            def w(data):
                _send(data.replace(b'\xff', b'\xff\xff'))   # IAC must be doubled
            def r():
                try:
                    d = tn.sock.recv(4096)
                except Exception:
                    return None
                if not d:
                    return b''  # b'' = closed
                clean = stream.feed(d)
                return clean if clean else None
            def k():
                try: tn.close()
                except Exception: pass
            def res(cols, rows):
                try:
                    stream.set_size(cols, rows)
                except Exception:
                    pass
            return w, r, k, res, ''
    except Exception as e:
        return None, None, None, None, str(e)[:200]


def _terminal_reader_loop(read_fn, out_queue, stop_evt, loop):
    """Blocking-read thread → queue. Runs in a daemon thread;
    uses loop.call_soon_threadsafe to push items without blocking."""
    while not stop_evt.is_set():
        data = read_fn()
        if data is None:
            continue  # timeout — no data yet
        if data == b'':
            # channel closed
            loop.call_soon_threadsafe(out_queue.put_nowait, (None,))
            return
        loop.call_soon_threadsafe(out_queue.put_nowait, (data,))


async def ws_terminal_handler(ws: WebSocket, olt_id: int, proto: str):
    """Interactive terminal session handler."""
    from app import app as flask_app
    from models import OLT, OLTSyncStatus

    out_q = _queue.Queue()
    stop = _threading.Event()
    loop = asyncio.get_running_loop()
    last_input = time.time()
    start = time.time()
    line_buf = bytearray()
    password_expected = False
    chan_write = chan_close = None
    reader_thread = None

    try:
        # Resolve OLT + sync-lock warning under Flask context
        with flask_app.app_context():
            from models import db as _db
            olt = _db.session.get(OLT, olt_id)
            if not olt:
                await ws.send_text('\r\n*** OLT tidak ditemukan ***\r\n')
                return
            if not olt.cli_enabled or not olt.cli_username:
                await ws.send_text('\r\n*** CLI access belum dikonfigurasi untuk OLT ini ***\r\n')
                return
            running = _db.session.query(OLTSyncStatus).filter_by(olt_id=olt.id, status='running').first()
            if running:
                await ws.send_text(f'\r\n\x1b[33m*** PERINGATAN: sync sedang berjalan di OLT {olt.name} — '
                                   f'hindari perintah write/config sampai selesai ***\x1b[0m\r\n')

        # Open channel (blocking) off the event loop
        w, r, k, resz, err = await asyncio.to_thread(_open_terminal_channel, olt, proto)
        if w is None:
            await ws.send_text(f'\r\n*** Gagal konek {proto}://{olt.ip_address} — {err} ***\r\n')
            return
        chan_write, chan_close = w, k

        # Start reader thread
        reader_thread = _threading.Thread(
            target=_terminal_reader_loop, args=(r, out_q, stop, loop), daemon=True)
        reader_thread.start()

        # Main bridge loop: WS→chan via receive, chan→WS via queue drain
        user_id = getattr(ws, '_term_user_id', 0)
        while True:
            now = time.time()
            if now - last_input > TERM_IDLE_TIMEOUT:
                await ws.send_text('\r\n*** Session ditutup — idle timeout ***\r\n')
                break
            if now - start > TERM_MAX_SESSION:
                await ws.send_text('\r\n*** Session ditutup — max duration ***\r\n')
                break

            # Drain output queue (non-blocking)
            drained = False
            try:
                while True:
                    item = out_q.get_nowait()
                    if item == (None,):
                        await ws.send_text('\r\n*** Koneksi OLT ditutup oleh remote ***\r\n')
                        return
                    chunk = item[0].decode('utf-8', errors='replace')
                    # Detect password prompt to mask audit
                    if _re.search(r'[Pp]assword\s*:', chunk):
                        password_expected = True
                    await ws.send_text(chunk)
                    drained = True
            except _queue.Empty:
                pass
            if not drained:
                await asyncio.sleep(0.05)

            # Read input with short timeout so we can interleave output
            try:
                data = await asyncio.wait_for(ws.receive_text(), timeout=0.05)
                if data.startswith(''):
                    try:
                        msg = json.loads(data[1:])
                        if resz:
                            resz(msg.get('cols', 80), msg.get('rows', 24))
                    except Exception:
                        pass
                    continue
            except asyncio.TimeoutError:
                continue
            last_input = time.time()
            data = data[:TERM_MAX_INPUT]
            # Track submitted line for audit
            for ch in data:
                line_buf.extend(ch.encode())
                if ch in ('\r', '\n'):
                    line = line_buf.decode('utf-8', errors='replace').strip('\r\n ')
                    line_buf.clear()
                    if line or password_expected:
                        _audit_terminal_command(user_id, olt, line, password_expected)
                        password_expected = False
            chan_write(data.encode())
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"[TERM] session error olt={olt_id}: {e}")
    finally:
        stop.set()
        if chan_close:
            try: chan_close()
            except Exception: pass
        try:
            with flask_app.app_context():
                from models import db as _db, ActionLog
                uid = getattr(ws, '_term_user_id', 0)
                _db.session.add(ActionLog(user_id=uid, action='olt_terminal_close',
                                          category='terminal', target=str(olt_id),
                                          detail=f'proto={proto} dur={int(time.time()-start)}s'))
                _db.session.commit()
        except Exception:
            pass


@fastapi_app.websocket("/ws/terminal/{olt_id}")
async def ws_terminal(ws: WebSocket, olt_id: int, token: Optional[str] = Query(None),
                      proto: str = Query('telnet')):
    """Interactive terminal to an OLT over raw telnet or SSH.

    Frontend connects: ws://host:8765/ws/terminal/{olt_id}?token=xxx&proto=telnet
    Protocol: raw text in both directions (xterm.js pipe).
    """
    valid, user_id = _verify_ws_token(token)
    if not valid or user_id is None:
        await ws.close(code=WS_CLOSE_UNAUTHORIZED, reason="Unauthorized")
        return
    authorized, reason = _authorize_ws_user(user_id, 'olt_terminal', olt_id=olt_id)
    if not authorized:
        await ws.close(code=WS_CLOSE_FORBIDDEN, reason=f"Forbidden: {reason}")
        return
    proto = 'ssh' if proto == 'ssh' else 'telnet'
    await ws.accept()
    ws._term_user_id = user_id  # type: ignore[attr-defined]
    logger.info(f"[TERM] session start user={user_id} olt={olt_id} proto={proto}")
    await ws_terminal_handler(ws, olt_id, proto)
