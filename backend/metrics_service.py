"""Prometheus metrics collection for Salfanet NMS.

Exposes /metrics endpoint for monitoring with Prometheus + Grafana.

Metrics exposed:
    - nms_http_requests_total{method, endpoint, status} — Counter
    - nms_http_request_duration_seconds{method, endpoint} — Histogram
    - nms_snmp_poll_duration_seconds{olt_id, poll_type} — Histogram
    - nms_snmp_poll_errors_total{olt_id, error_type} — Counter
    - nms_olt_online_total — Gauge
    - nms_onu_total{olt_id, status} — Gauge
    - nms_sync_duration_seconds{olt_id} — Histogram
    - nms_sync_errors_total{olt_id} — Counter
    - nms_cache_hits_total / nms_cache_misses_total — Counter
    - nms_websocket_connections — Gauge
    - nms_active_users — Gauge
"""
import time
import logging
from functools import wraps

logger = logging.getLogger(__name__)

try:
    from prometheus_client import (
        Counter, Histogram, Gauge, generate_latest,
        CONTENT_TYPE_LATEST, CollectorRegistry, REGISTRY,
    )
    _ENABLED = True
except ImportError:
    _ENABLED = False
    logger.warning("prometheus-client not installed, metrics disabled")

if _ENABLED:
    # HTTP metrics
    http_requests_total = Counter(
        'nms_http_requests_total',
        'Total HTTP requests',
        ['method', 'endpoint', 'status']
    )
    http_request_duration = Histogram(
        'nms_http_request_duration_seconds',
        'HTTP request duration in seconds',
        ['method', 'endpoint'],
        buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
    )

    # SNMP metrics
    snmp_poll_duration = Histogram(
        'nms_snmp_poll_duration_seconds',
        'SNMP poll duration in seconds',
        ['olt_id', 'poll_type'],
        buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 120.0]
    )
    snmp_poll_errors = Counter(
        'nms_snmp_poll_errors_total',
        'Total SNMP poll errors',
        ['olt_id', 'error_type']
    )

    # OLT/ONU metrics
    olt_online = Gauge(
        'nms_olt_online_total',
        'Total online OLTs'
    )
    onu_total = Gauge(
        'nms_onu_total',
        'Total ONUs by status',
        ['olt_id', 'status']
    )

    # Sync metrics
    sync_duration = Histogram(
        'nms_sync_duration_seconds',
        'OLT sync duration in seconds',
        ['olt_id'],
        buckets=[1.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0]
    )
    sync_errors = Counter(
        'nms_sync_errors_total',
        'Total sync errors',
        ['olt_id']
    )

    # Cache metrics
    cache_hits = Counter(
        'nms_cache_hits_total',
        'Total cache hits'
    )
    cache_misses = Counter(
        'nms_cache_misses_total',
        'Total cache misses'
    )

    # WebSocket metrics
    ws_connections = Gauge(
        'nms_websocket_connections',
        'Active WebSocket connections'
    )

    # User metrics
    active_users = Gauge(
        'nms_active_users',
        'Active logged-in users'
    )

    def metrics_response():
        """Generate Prometheus metrics response."""
        return generate_latest(), CONTENT_TYPE_LATEST

    def track_http_request(method: str, endpoint: str, status: int, duration: float):
        """Record HTTP request metrics."""
        http_requests_total.labels(method=method, endpoint=endpoint, status=str(status)).inc()
        http_request_duration.labels(method=method, endpoint=endpoint).observe(duration)

    def track_snmp_poll(olt_id: int, poll_type: str, duration: float, error: str = ''):
        """Record SNMP poll metrics."""
        snmp_poll_duration.labels(olt_id=str(olt_id), poll_type=poll_type).observe(duration)
        if error:
            snmp_poll_errors.labels(olt_id=str(olt_id), error_type=error).inc()

    def track_sync(olt_id: int, duration: float, error: bool = False):
        """Record sync metrics."""
        sync_duration.labels(olt_id=str(olt_id)).observe(duration)
        if error:
            sync_errors.labels(olt_id=str(olt_id)).inc()

    def update_olt_gauge(online_count: int):
        """Update online OLT gauge."""
        olt_online.set(online_count)

    def update_onu_gauge(olt_id: int, status: str, count: int):
        """Update ONU count gauge."""
        onu_total.labels(olt_id=str(olt_id), status=status).set(count)

    def track_cache_hit():
        cache_hits.inc()

    def track_cache_miss():
        cache_misses.inc()

    def set_ws_connections(count: int):
        ws_connections.set(count)

    def set_active_users(count: int):
        active_users.set(count)

else:
    # No-op stubs when prometheus_client is not installed
    def metrics_response():
        return b'', 'text/plain'
    def track_http_request(*a, **kw): pass
    def track_snmp_poll(*a, **kw): pass
    def track_sync(*a, **kw): pass
    def update_olt_gauge(*a, **kw): pass
    def update_onu_gauge(*a, **kw): pass
    def track_cache_hit(): pass
    def track_cache_miss(): pass
    def set_ws_connections(*a, **kw): pass
    def set_active_users(*a, **kw): pass
