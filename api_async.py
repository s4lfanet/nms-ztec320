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
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, Header
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
    x_internal_key: Optional[str] = Header(None, alias="X-Internal-Key"),
    request_client_host: Optional[str] = Header(None, alias="X-Forwarded-For"),
):
    """Internal API — broadcast a message to a WebSocket channel.

    Called by Flask backend (services_sync.py, app.py) to push real-time
    updates to connected frontend clients.
    Requires X-Internal-Key header matching INTERNAL_API_KEY (no SECRET_KEY fallback).
    Restricted to localhost requests only.
    """
    # Restrict to localhost (Flask runs in same process)
    client_host = request_client_host or ''
    if client_host not in ('', '127.0.0.1', '::1', 'localhost'):
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
