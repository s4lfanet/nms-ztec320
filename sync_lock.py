"""Per-OLT sync lock — prevents concurrent syncs of the same OLT.

Uses Redis SET NX EX for distributed locking when Redis is available.
Falls back to in-memory threading.Lock when Redis is unavailable.

All three sync entry points use this:
1. services_sync.py — UI-triggered sync (start_single_sync, start_sync_all)
2. auto_sync.py — cron-based auto-sync
3. app.py — _auto_sync_olt() after ONU actions

Lock TTL: 10 minutes (safety net for crashed processes)
"""
import logging
import os
import threading
import time
import uuid
from typing import Optional

logger = logging.getLogger(__name__)

_LOCK_TTL = 600  # 10 minutes
_LOCK_KEY_PREFIX = 'sync_lock:olt'

# In-memory fallback locks (per-OLT)
_local_locks: dict[int, threading.Lock] = {}
_local_lock_holders: dict[int, str] = {}
_local_lock_timestamps: dict[int, float] = {}
_local_meta_lock = threading.Lock()

# Redis client (lazy init)
_redis_client = None
_redis_checked = False


def _get_redis():
    """Get Redis client. Returns None if unavailable."""
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    try:
        import redis as _redis_mod
        url = os.environ.get('REDIS_URL', '')
        if url:
            _redis_client = _redis_mod.from_url(url, decode_responses=True)
            _redis_client.ping()
            logger.info("Sync lock: Redis available for distributed locking")
    except Exception:
        _redis_client = None
        logger.info("Sync lock: Redis unavailable, using in-memory locks")
    return _redis_client


def acquire_sync_lock(olt_id: int, timeout: float = 0.1) -> Optional[str]:
    """Try to acquire a sync lock for the given OLT.

    Args:
        olt_id: OLT ID to lock
        timeout: How long to wait for the lock (seconds). 0 = non-blocking

    Returns:
        Lock token (str) if acquired, None if already locked.
        The token must be passed to release_sync_lock().
    """
    token = str(uuid.uuid4())
    r = _get_redis()

    if r:
        try:
            key = f'{_LOCK_KEY_PREFIX}:{olt_id}'
            deadline = time.time() + timeout
            while True:
                result = r.set(key, token, nx=True, ex=_LOCK_TTL)
                if result:
                    logger.debug(f"Sync lock acquired for OLT {olt_id} (Redis, token={token[:8]})")
                    return token
                # Check if lock is stale (TTL expired but key still exists)
                ttl = r.ttl(key)
                if ttl is not None and ttl < 0:
                    # Key exists but no TTL — stale lock, try to delete and retry
                    r.delete(key)
                    continue
                if time.time() >= deadline:
                    logger.debug(f"Sync lock NOT acquired for OLT {olt_id} (already locked)")
                    return None
                time.sleep(0.05)
        except Exception as e:
            logger.warning(f"Redis sync lock failed, falling back to in-memory: {e}")

    # In-memory fallback
    with _local_meta_lock:
        if olt_id not in _local_locks:
            _local_locks[olt_id] = threading.Lock()
        lock = _local_locks[olt_id]

    acquired = lock.acquire(timeout=timeout if timeout > 0 else -1)
    if acquired:
        with _local_meta_lock:
            _local_lock_holders[olt_id] = token
            _local_lock_timestamps[olt_id] = time.time()
        logger.debug(f"Sync lock acquired for OLT {olt_id} (in-memory, token={token[:8]})")
        return token

    # Check for stale in-memory lock
    with _local_meta_lock:
        ts = _local_lock_timestamps.get(olt_id)
        if ts and (time.time() - ts) > _LOCK_TTL:
            logger.warning(f"Sync lock for OLT {olt_id} was stale (held > {_LOCK_TTL}s), force-releasing")
            _local_lock_holders.pop(olt_id, None)
            _local_lock_timestamps.pop(olt_id, None)
            # Force release — this is safe because the holder is likely dead
            lock.release()
            # Try again
            if lock.acquire(timeout=0.05):
                _local_lock_holders[olt_id] = token
                _local_lock_timestamps[olt_id] = time.time()
                return token

    logger.debug(f"Sync lock NOT acquired for OLT {olt_id} (already locked)")
    return None


def release_sync_lock(olt_id: int, token: str) -> bool:
    """Release a sync lock. Only the token holder can release.

    Returns True if released, False if token mismatch (lock was stolen/expired).
    """
    r = _get_redis()

    if r:
        try:
            key = f'{_LOCK_KEY_PREFIX}:{olt_id}'
            # Use Lua script for atomic check-and-delete
            script = """
            if redis.call('get', KEYS[1]) == ARGV[1] then
                return redis.call('del', KEYS[1])
            else
                return 0
            end
            """
            result = r.eval(script, 1, key, token)
            if result:
                logger.debug(f"Sync lock released for OLT {olt_id} (Redis)")
                return True
            logger.warning(f"Sync lock release failed for OLT {olt_id} (token mismatch — lock was stolen/expired)")
            return False
        except Exception as e:
            logger.warning(f"Redis sync lock release failed: {e}")
            return False

    # In-memory fallback
    with _local_meta_lock:
        holder = _local_lock_holders.get(olt_id)
        if holder != token:
            logger.warning(f"Sync lock release failed for OLT {olt_id} (token mismatch)")
            return False
        _local_lock_holders.pop(olt_id, None)
        _local_lock_timestamps.pop(olt_id, None)

    lock = _local_locks.get(olt_id)
    if lock:
        try:
            lock.release()
        except RuntimeError:
            pass  # Already released
    logger.debug(f"Sync lock released for OLT {olt_id} (in-memory)")
    return True


def is_sync_locked(olt_id: int) -> bool:
    """Check if an OLT is currently locked (non-blocking check)."""
    r = _get_redis()
    if r:
        try:
            key = f'{_LOCK_KEY_PREFIX}:{olt_id}'
            return r.exists(key) > 0
        except Exception:
            pass

    with _local_meta_lock:
        return olt_id in _local_lock_holders
