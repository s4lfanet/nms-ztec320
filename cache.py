"""Redis caching layer — optional performance enhancement.

Provides a simple caching interface that works with or without Redis.
When REDIS_URL is not set, falls back to in-memory dict cache (dev mode).

Usage:
    from cache import cache_get, cache_set, cache_delete, cache_clear

    # Cache dashboard data for 30 seconds
    cache_set("dashboard:1", dashboard_data, ttl=30)
    data = cache_get("dashboard:1")

    # Cache decorator
    @cached("onus:list", ttl=15)
    def get_all_onus(olt_id):
        return expensive_query(olt_id)
"""
import json
import time
import logging
from functools import wraps
from typing import Optional, Any

logger = logging.getLogger("cache")

# ---------------------------------------------------------------------------
# Redis client (lazy init)
# ---------------------------------------------------------------------------
_redis_client = None
_redis_available = False


def _get_redis():
    """Get or create Redis client."""
    global _redis_client, _redis_available
    if _redis_client is not None:
        return _redis_client

    try:
        import os
        redis_url = os.environ.get("REDIS_URL", "")
        if not redis_url:
            logger.warning("REDIS_URL not set in environment — using memory cache")
            return None

        logger.info(f"Attempting Redis connection to {redis_url}")
        import redis
        _redis_client = redis.from_url(redis_url, decode_responses=True)
        _redis_client.ping()
        _redis_available = True
        logger.info(f"Redis connected: {redis_url}")
        return _redis_client
    except Exception as e:
        logger.warning(f"Redis not available, using memory cache: {e}")
        _redis_available = False
        return None


# ---------------------------------------------------------------------------
# In-memory fallback cache
# ---------------------------------------------------------------------------
_memory_cache: dict[str, tuple[Any, float]] = {}  # key → (value, expire_at)


def _memory_get(key: str) -> Optional[Any]:
    if key in _memory_cache:
        value, expire_at = _memory_cache[key]
        if expire_at == 0 or time.time() < expire_at:
            return value
        del _memory_cache[key]
    return None


def _memory_set(key: str, value: Any, ttl: int = 0):
    expire_at = 0 if ttl <= 0 else time.time() + ttl
    _memory_cache[key] = (value, expire_at)


def _memory_delete(key: str):
    _memory_cache.pop(key, None)


def _memory_clear():
    _memory_cache.clear()


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
            keys = r.keys(pattern)
            if keys:
                r.delete(*keys)
            return
        except Exception:
            pass
    if pattern == "*":
        _memory_clear()
    else:
        # Simple glob match for memory cache
        import fnmatch
        to_delete = [k for k in _memory_cache if fnmatch.fnmatch(k, pattern)]
        for k in to_delete:
            del _memory_cache[k]


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
            }
        except Exception:
            pass
    return {
        "backend": "memory",
        "keys": len(_memory_cache),
    }


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
            # Generate cache key
            if key_func:
                cache_key = f"{prefix}:{key_func(*args, **kwargs)}"
            elif args or kwargs:
                key_parts = [str(a) for a in args] + [f"{k}={v}" for k, v in kwargs.items()]
                cache_key = f"{prefix}:{':'.join(key_parts)}"
            else:
                cache_key = prefix

            # Try cache first
            result = cache_get(cache_key)
            if result is not None:
                return result

            # Compute and cache
            result = func(*args, **kwargs)
            if result is not None:
                cache_set(cache_key, result, ttl)
            return result
        return wrapper
    return decorator
