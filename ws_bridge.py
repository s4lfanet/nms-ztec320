"""WebSocket bridge — allows Flask (sync) to push events to FastAPI (async).

This module provides a simple HTTP client that posts events to the
FastAPI /broadcast endpoint. Called from Flask route handlers and
background threads to push real-time updates to WebSocket clients.

Usage:
    from ws_bridge import ws_broadcast_sync, ws_broadcast_onu, ws_broadcast_dashboard

    # Push sync progress (called from services_sync.py)
    ws_broadcast_sync(olt_id=1, pct=50, message="Collecting ONUs...", status="running")

    # Push ONU status change
    ws_broadcast_onu(olt_id=1, onu_id=42, field="status", old_val="offline", new_val="online")

    # Push dashboard event
    ws_broadcast_dashboard("olt_status", {"olt_id": 1, "is_online": True})
"""
import json
import logging
import os
import threading
from typing import Optional

import httpx

logger = logging.getLogger("ws_bridge")

# FastAPI WebSocket server URL (default: localhost:8765)
_ws_base_url = "http://localhost:8765"


def _get_internal_api_key():
    """Get the shared secret for Flask→FastAPI internal communication."""
    return os.environ.get('INTERNAL_API_KEY', '') or os.environ.get('SECRET_KEY', 'fallback-dev-key')


def set_ws_url(url: str):
    """Override WebSocket server URL (e.g., from config)."""
    global _ws_base_url
    _ws_base_url = url


def _broadcast_async(channel: str, event: str, data: dict):
    """Post broadcast request to FastAPI (non-blocking, fire-and-forget)."""
    def _do_post():
        try:
            resp = httpx.post(
                f"{_ws_base_url}/broadcast",
                json={"channel": channel, "event": event, "data": data},
                headers={"X-Internal-Key": _get_internal_api_key()},
                timeout=2.0,
            )
            if resp.status_code != 200:
                logger.debug(f"WS broadcast failed ({resp.status_code}): {resp.text[:100]}")
        except Exception as e:
            # WebSocket server may not be running — this is OK, just skip
            logger.debug(f"WS broadcast error (server may be down): {e}")

    # Fire and forget in background thread
    thread = threading.Thread(target=_do_post, daemon=True)
    thread.start()


def ws_broadcast_sync(olt_id: int, pct: int, message: str, status: str = "running"):
    """Push sync progress to WebSocket clients."""
    _broadcast_async(f"sync:{olt_id}", "progress", {
        "olt_id": olt_id,
        "pct": pct,
        "message": message,
        "status": status,
    })


def ws_broadcast_onu(olt_id: int, onu_id: int, field: str, old_val, new_val):
    """Push ONU field change to WebSocket clients."""
    _broadcast_async(f"onus:{olt_id}", "onu_change", {
        "onu_id": onu_id,
        "field": field,
        "old": old_val,
        "new": new_val,
    })


def ws_broadcast_dashboard(event: str, data: dict):
    """Push dashboard event to WebSocket clients."""
    _broadcast_async("dashboard", event, data)
