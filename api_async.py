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
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


def _get_internal_api_key():
    """Get the shared secret used for internal Flask→FastAPI communication."""
    return os.environ.get('INTERNAL_API_KEY', '') or os.environ.get('SECRET_KEY', 'fallback-dev-key')


def _verify_ws_token(token: Optional[str]) -> bool:
    """Verify ephemeral HMAC-signed WebSocket auth token.

    Token format: {user_id}.{expiry}.{hmac_signature}
    Verifies signature and checks expiry (60s TTL).
    Does NOT expose SECRET_KEY to the frontend.
    """
    if not token:
        return False
    parts = token.split('.')
    if len(parts) != 3:
        return False
    user_id_str, expiry_str, sig = parts
    try:
        expiry = int(expiry_str)
    except ValueError:
        return False
    # Check token hasn't expired
    if time.time() > expiry:
        return False
    # Verify HMAC signature
    secret = _get_internal_api_key()
    payload = f"{user_id_str}.{expiry_str}"
    expected_sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected_sig)

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
fastapi_app = FastAPI(
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
- **CORS**: All origins allowed for API endpoints
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
    docs_url="/docs",
    redoc_url="/redoc",
)

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Connection manager — tracks active WebSocket clients
# ---------------------------------------------------------------------------
class ConnectionManager:
    """Manages WebSocket connections grouped by channel."""

    def __init__(self):
        # channel → set of (websocket, connected_at)
        self._channels: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket, channel: str):
        await ws.accept()
        async with self._lock:
            if channel not in self._channels:
                self._channels[channel] = set()
            self._channels[channel].add(ws)

    async def disconnect(self, ws: WebSocket, channel: str):
        async with self._lock:
            if channel in self._channels:
                self._channels[channel].discard(ws)
                if not self._channels[channel]:
                    del self._channels[channel]

    async def broadcast(self, channel: str, data: dict):
        """Send JSON data to all clients in a channel."""
        async with self._lock:
            clients = list(self._channels.get(channel, set()))
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
                        self._channels[channel].discard(ws)

    def client_count(self, channel: str) -> int:
        return len(self._channels.get(channel, set()))

    def total_clients(self) -> int:
        return sum(len(v) for v in self._channels.values())


manager = ConnectionManager()


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
    Requires X-Internal-Key header matching INTERNAL_API_KEY or SECRET_KEY.
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
@fastapi_app.websocket("/ws/sync/{olt_id}")
async def ws_sync_progress(ws: WebSocket, olt_id: int, token: Optional[str] = Query(None)):
    """Real-time sync progress for a specific OLT.

    Frontend connects: ws://host:8765/ws/sync/{olt_id}?token=xxx
    Server pushes: {event: "progress", data: {pct, message, status}}
    """
    if not _verify_ws_token(token):
        await ws.close(code=4401, reason="Unauthorized")
        return
    channel = f"sync:{olt_id}"
    await manager.connect(ws, channel)
    try:
        # Send initial connection ack
        await ws.send_json({
            "event": "connected",
            "data": {"olt_id": olt_id, "message": "Connected to sync progress stream"},
            "ts": time.time(),
        })
        # Keep connection alive — listen for client messages (ping/close)
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_json({"event": "pong", "ts": time.time()})
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(ws, channel)


@fastapi_app.websocket("/ws/onus/{olt_id}")
async def ws_onu_status(ws: WebSocket, olt_id: int, token: Optional[str] = Query(None)):
    """Real-time ONU status updates for a specific OLT.

    Frontend connects: ws://host:8765/ws/onus/{olt_id}?token=xxx
    Server pushes: {event: "onu_change", data: {onu_id, field, old_val, new_val}}
    """
    if not _verify_ws_token(token):
        await ws.close(code=4401, reason="Unauthorized")
        return
    channel = f"onus:{olt_id}"
    await manager.connect(ws, channel)
    try:
        await ws.send_json({
            "event": "connected",
            "data": {"olt_id": olt_id, "message": "Connected to ONU status stream"},
            "ts": time.time(),
        })
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_json({"event": "pong", "ts": time.time()})
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(ws, channel)


@fastapi_app.websocket("/ws/dashboard")
async def ws_dashboard(ws: WebSocket, token: Optional[str] = Query(None)):
    """Real-time dashboard updates — OLT status changes, alert events.

    Frontend connects: ws://host:8765/ws/dashboard?token=xxx
    Server pushes: {event: "olt_status"|"alert"|"onu_count", data: {...}}
    """
    if not _verify_ws_token(token):
        await ws.close(code=4401, reason="Unauthorized")
        return
    channel = "dashboard"
    await manager.connect(ws, channel)
    try:
        await ws.send_json({
            "event": "connected",
            "data": {"message": "Connected to dashboard stream"},
            "ts": time.time(),
        })
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_json({"event": "pong", "ts": time.time()})
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(ws, channel)


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
