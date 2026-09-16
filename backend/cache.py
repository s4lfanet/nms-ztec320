"""Redis caching layer — reduces OLT CPU/RAM load by caching static/semi-static data.

Provides a simple caching interface that works with or without Redis.
When REDIS_URL is not set, falls back to in-memory dict cache (dev mode).

Cache strategy for OLT data (inspired by snmp-olt-zte Go service):
    - Static data (chassis, ONU types, VLANs, profiles): TTL 300s (5 min)
    - Semi-static data (PON ports, uplinks): TTL 60s (1 min)
    - ONU list per OLT: TTL 30min, background refresh at 20% expiry
    - ONU detail: NOT cached (always live, singleflight coalescing only)
    - Dashboard aggregation: TTL 15s
    - Dynamic data (RX power, ONU status, traffic): NOT cached (real-time)

Advanced features:
    - Background refresh (stale-while-revalidate): returns stale data while
      refreshing in background thread when TTL < 20% remaining
    - Singleflight: deduplicates concurrent identical requests — only one
      SNMP fetch runs, others wait for the result
    - Per-OLT namespacing: olt:{olt_id}: prefix prevents cache collisions
    - Cache pre-warming: populate cache on startup for all OLTs
    - Redis connection pool with configurable size and timeout

Usage:
    from cache import cache_get, cache_set, cache_delete, cache_clear

    # Basic usage
    cache_set("dashboard:global", dashboard_data, ttl=15)
    data = cache_get("dashboard:global")

    # Stale-while-revalidate with singleflight
    data = cache_get_or_refresh("olt:1:onus:list", fetch_fn, ttl=1800)

    # Per-OLT namespaced key
    key = olt_cache_key(1, "onus:list")

    # Cache decorator
    @cached("onus:list", ttl=15)
    def get_all_onus(olt_id):
        return expensive_query(olt_id)
"""
import json
import time
import logging
import threading
from functools import wraps
from typing import Optional, Any, Callable

logger = logging.getLogger("cache")

# ---------------------------------------------------------------------------
# Redis client (lazy init)
# ---------------------------------------------------------------------------
_redis_client = None
_redis_available = False


def _get_redis():
    """Get or create Redis client with connection pool."""
    global _redis_client, _redis_available
    if _redis_client is not None:
        return _redis_client

    try:
        import os
        redis_url = os.environ.get("REDIS_URL", "")
        if not redis_url:
            return None

        import redis
        pool = redis.ConnectionPool.from_url(
            redis_url,
            decode_responses=True,
            max_connections=int(os.environ.get("REDIS_POOL_SIZE", "50")),
            socket_timeout=float(os.environ.get("REDIS_SOCKET_TIMEOUT", "5")),
            socket_connect_timeout=float(os.environ.get("REDIS_CONNECT_TIMEOUT", "2")),
            health_check_interval=30,
        )
        _redis_client = redis.Redis(connection_pool=pool)
        _redis_client.ping()
        _redis_available = True
        logger.info(f"Redis connected: {redis_url} (pool_size={pool.max_connections})")
        return _redis_client
    except Exception as e:
        logger.warning(f"Redis not available, using memory cache: {e}")
        _redis_available = False
        return None


# ---------------------------------------------------------------------------
# In-memory fallback cache
# ---------------------------------------------------------------------------
_MEMORY_MAX_ENTRIES = 1000
_memory_cache: dict[str, tuple[Any, float]] = {}  # key -> (value, expire_at)
_memory_access_order: dict[str, float] = {}  # key -> last_access_time (for LRU)


def _memory_evict():
    """Evict expired entries and enforce max entries limit via LRU."""
    now = time.time()
    # First pass: remove expired entries
    expired = [k for k, (_, exp) in _memory_cache.items() if exp != 0 and now >= exp]
    for k in expired:
        _memory_cache.pop(k, None)
        _memory_access_order.pop(k, None)
    # Second pass: enforce max entries via LRU
    while len(_memory_cache) > _MEMORY_MAX_ENTRIES:
        # Find the least recently accessed key
        lru_key = None
        lru_time = None
        for k, t in _memory_access_order.items():
            if lru_time is None or t < lru_time:
                lru_key = k
                lru_time = t
        if lru_key is None:
            break
        _memory_cache.pop(lru_key, None)
        _memory_access_order.pop(lru_key, None)


def _memory_get(key: str) -> Optional[Any]:
    if key in _memory_cache:
        value, expire_at = _memory_cache[key]
        if expire_at == 0 or time.time() < expire_at:
            _memory_access_order[key] = time.time()
            return value
        del _memory_cache[key]
        _memory_access_order.pop(key, None)
    return None


def _memory_set(key: str, value: Any, ttl: int = 0):
    expire_at = 0 if ttl <= 0 else time.time() + ttl
    _memory_cache[key] = (value, expire_at)
    _memory_access_order[key] = time.time()
    if len(_memory_cache) > _MEMORY_MAX_ENTRIES:
        _memory_evict()


def _memory_delete(key: str):
    _memory_cache.pop(key, None)
    _memory_access_order.pop(key, None)


def _memory_clear():
    _memory_cache.clear()
    _memory_access_order.clear()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def cache_get(key: str) -> Optional[Any]:
    """Get a value from cache. Returns None if not found or expired."""
    r = _get_redis()
    if r:
        try:
            data = r.get(key)
            if data:
                return json.loads(data)
            return None
        except Exception:
            pass
    return _memory_get(key)


def cache_set(key: str, value: Any, ttl: int = 60):
    """Set a value in cache with TTL (seconds). ttl=0 = no expiry."""
    r = _get_redis()
    if r:
        try:
            data = json.dumps(value, default=str)
            if ttl > 0:
                r.setex(key, ttl, data)
            else:
                r.set(key, data)
            return
        except Exception:
            pass
    _memory_set(key, value, ttl)


def cache_delete(key: str):
    """Delete a specific key from cache."""
    r = _get_redis()
    if r:
        try:
            r.delete(key)
            return
        except Exception:
            pass
    _memory_delete(key)


def cache_clear(pattern: str = "*"):
    """Clear all cache entries matching pattern."""
    r = _get_redis()
    if r:
        try:
            # Use SCAN instead of KEYS to avoid blocking Redis
            cursor = 0
            while True:
                cursor, batch = r.scan(cursor=cursor, match=pattern, count=100)
                if batch:
                    r.delete(*batch)
                if cursor == 0:
                    break
            return
        except Exception:
            pass
    if pattern == "*":
        _memory_clear()
    else:
        import fnmatch
        to_delete = [k for k in _memory_cache if fnmatch.fnmatch(k, pattern)]
        for k in to_delete:
            _memory_cache.pop(k, None)
            _memory_access_order.pop(k, None)


def cache_stats() -> dict:
    """Get cache statistics."""
    r = _get_redis()
    if r:
        try:
            info = r.info("memory")
            return {
                "backend": "redis",
                "used_memory": info.get("used_memory_human", "N/A"),
                "keys": r.dbsize(),
                "singleflight_active": len(_singleflight_locks),
            }
        except Exception:
            pass
    return {
        "backend": "memory",
        "keys": len(_memory_cache),
        "singleflight_active": len(_singleflight_locks),
    }


# ---------------------------------------------------------------------------
# Per-OLT cache key namespacing
# ---------------------------------------------------------------------------
def olt_cache_key(olt_id: int, suffix: str) -> str:
    """Generate a per-OLT namespaced cache key to prevent collisions.

    e.g. olt_cache_key(1, 'onus:list') -> 'olt:1:onus:list'
    """
    return f"olt:{olt_id}:{suffix}"


# ---------------------------------------------------------------------------
# Singleflight — deduplicate concurrent identical requests
# ---------------------------------------------------------------------------
_singleflight_locks: dict[str, threading.Lock] = {}
_singleflight_meta_lock = threading.Lock()


def _get_singleflight_lock(key: str) -> threading.Lock:
    """Get or create a per-key lock for singleflight deduplication."""
    with _singleflight_meta_lock:
        if key not in _singleflight_locks:
            _singleflight_locks[key] = threading.Lock()
        return _singleflight_locks[key]


def _cleanup_singleflight_lock(key: str):
    """Remove a singleflight lock entry after use to prevent unbounded growth."""
    with _singleflight_meta_lock:
        lock = _singleflight_locks.get(key)
        if lock and not lock.locked():
            _singleflight_locks.pop(key, None)


# ---------------------------------------------------------------------------
# Background refresh (stale-while-revalidate)
# ---------------------------------------------------------------------------
def _refresh_cache_background(key: str, fetch_fn: Callable, ttl: int):
    """Background cache refresh — runs in daemon thread."""
    try:
        data = fetch_fn()
        if data is not None:
            cache_set(key, data, ttl)
            logger.debug(f"Background refresh OK: {key}")
    except Exception as e:
        logger.warning(f"Background refresh failed for {key}: {e}")


def cache_get_or_refresh(
    key: str,
    fetch_fn: Callable,
    ttl: int = 1800,
    refresh_threshold: float = 0.2,
) -> Optional[Any]:
    """Stale-while-revalidate cache pattern with singleflight deduplication.

    1. Check cache — if hit and TTL > threshold, return cached data immediately
    2. If TTL < threshold (20% remaining), return stale data + trigger background refresh
    3. If cache miss, fetch with singleflight (only 1 concurrent fetch per key)
    4. Save result to cache and return

    Args:
        key: Cache key
        fetch_fn: Callable that returns data to cache (called only on miss/refresh)
        ttl: Cache TTL in seconds
        refresh_threshold: Fraction of TTL remaining before background refresh (0.2 = 20%)

    Returns:
        Cached or freshly fetched data, or None if fetch fails
    """
    # Step 1: Check cache
    data = cache_get(key)
    if data is not None:
        # Check TTL for background refresh
        r = _get_redis()
        if r:
            try:
                remaining = r.ttl(key)
                if 0 < remaining < ttl * refresh_threshold:
                    # TTL < 20% remaining — refresh in background
                    t = threading.Thread(
                        target=_refresh_cache_background,
                        args=(key, fetch_fn, ttl),
                        daemon=True,
                    )
                    t.start()
                    logger.debug(f"Background refresh triggered: {key} (TTL={remaining}s)")
            except Exception:
                pass
        else:
            # Memory cache — check expiry proximity
            if key in _memory_cache:
                _, expire_at = _memory_cache[key]
                if expire_at > 0:
                    remaining = expire_at - time.time()
                    if 0 < remaining < ttl * refresh_threshold:
                        t = threading.Thread(
                            target=_refresh_cache_background,
                            args=(key, fetch_fn, ttl),
                            daemon=True,
                        )
                        t.start()
        return data

    # Step 2: Cache miss — fetch with singleflight
    lock = _get_singleflight_lock(key)
    with lock:
        # Double-check after acquiring lock (another thread may have populated)
        data = cache_get(key)
        if data is not None:
            _cleanup_singleflight_lock(key)
            return data

        # Fetch fresh data
        try:
            data = fetch_fn()
        except Exception as e:
            logger.error(f"Singleflight fetch failed for {key}: {e}")
            _cleanup_singleflight_lock(key)
            return None

        if data is not None:
            cache_set(key, data, ttl)

    _cleanup_singleflight_lock(key)
    return data


# ---------------------------------------------------------------------------
# Cache pre-warming
# ---------------------------------------------------------------------------
def prewarm_cache(prewarm_fn: Callable, olt_ids: list[int]) -> dict:
    """Pre-warm cache for all OLTs at startup.

    Runs pre-warm in background threads (one per OLT) to populate cache
    so first user requests are cache hits.

    Args:
        prewarm_fn: Callable(olt_id) -> None that populates cache for one OLT
        olt_ids: List of OLT IDs to pre-warm

    Returns:
        Dict with pre-warm status per OLT
    """
    results = {}
    threads = []

    def _prewarm_one(olt_id):
        try:
            prewarm_fn(olt_id)
            results[olt_id] = 'ok'
            logger.info(f"Cache pre-warm OK: OLT {olt_id}")
        except Exception as e:
            results[olt_id] = f'error: {e}'
            logger.warning(f"Cache pre-warm failed: OLT {olt_id}: {e}")

    for olt_id in olt_ids:
        t = threading.Thread(target=_prewarm_one, args=(olt_id,), daemon=True)
        threads.append(t)
        t.start()

    # Don't block startup — wait max 30s
    for t in threads:
        t.join(timeout=30)

    return results


# ---------------------------------------------------------------------------
# Cache decorator
# ---------------------------------------------------------------------------
def cached(prefix: str, ttl: int = 60, key_func=None):
    """Decorator to cache function results.

    Args:
        prefix: Cache key prefix
        ttl: Time-to-live in seconds
        key_func: Optional function to generate cache key from args
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if key_func:
                cache_key = f"{prefix}:{key_func(*args, **kwargs)}"
            elif args or kwargs:
                key_parts = [str(a) for a in args] + [f"{k}={v}" for k, v in kwargs.items()]
                cache_key = f"{prefix}:{':'.join(key_parts)}"
            else:
                cache_key = prefix

            result = cache_get(cache_key)
            if result is not None:
                return result

            result = func(*args, **kwargs)
            if result is not None:
                cache_set(cache_key, result, ttl)
            return result
        return wrapper
    return decorator
