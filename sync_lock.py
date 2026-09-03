"""Per-OLT sync lock — prevents concurrent syncs of the same OLT.

Uses Redis SET NX EX for distributed locking when Redis is available.
Without Redis, falls back to an flock()-based file lock on POSIX (this is
still cross-process — auto_sync.py's cron process and the Flask app's own
process otherwise can't see each other's locks at all, which let a manual
"Sync" click race a running auto-sync cycle undetected and hit the OLT
concurrently from two processes). On Windows (no fcntl — local dev only)
falls back further to an in-memory threading.Lock, which is single-process
but fine there since dev doesn't run the cron alongside the app.

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

try:
    import fcntl
    _HAS_FCNTL = True
except ImportError:
    _HAS_FCNTL = False

logger = logging.getLogger(__name__)

_LOCK_TTL = 600  # 10 minutes
_LOCK_KEY_PREFIX = 'sync_lock:olt'
_FILE_LOCK_DIR = os.environ.get('SYNC_LOCK_DIR', '/tmp')

# In-memory fallback locks (per-OLT) — used only when fcntl isn't available
_local_locks: dict[int, threading.Lock] = {}
_local_lock_holders: dict[int, str] = {}
_local_lock_timestamps: dict[int, float] = {}
_local_meta_lock = threading.Lock()

# Open file handles for held flock()-based locks (olt_id -> (file, token))
_file_locks: dict[int, tuple] = {}

# Redis client (lazy init)
_redis_client = None
_redis_checked = False


def _lock_file_path(olt_id: int) -> str:
    return os.path.join(_FILE_LOCK_DIR, f'salfanet_sync_lock_olt_{olt_id}.lock')


def _open_lock_file(path: str):
    """Open (creating if needed) a lock file that's writable by any user.

    auto_sync.py (cron) and the Flask app can run as different UIDs (e.g.
    root cron vs a 'salfanet' service user) — a plain open() creates the
    file honoring umask (usually 0644), so whichever process creates it
    first locks the other one out with a permission error, silently
    reintroducing the very cross-process race this lock exists to prevent.
    Explicit fchmod (not subject to umask, unlike the os.open mode arg)
    keeps it writable by everyone regardless of who creates it.
    """
    fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o666)
    try:
        os.fchmod(fd, 0o666)
    except OSError:
        pass  # already 0o666 from a prior run, or we don't own it — fine either way
    return os.fdopen(fd, 'r+')


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
            logger.warning(f"Redis sync lock failed, falling back to file lock: {e}")

    if _HAS_FCNTL:
        try:
            path = _lock_file_path(olt_id)
            deadline = time.time() + timeout
            while True:
                fh = _open_lock_file(path)
                try:
                    fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                except OSError:
                    fh.close()
                    if time.time() >= deadline:
                        logger.debug(f"Sync lock NOT acquired for OLT {olt_id} (already locked)")
                        return None
                    time.sleep(0.05)
                    continue
                fh.seek(0)
                fh.truncate()
                fh.write(f'{token}\n{os.getpid()}\n{time.time()}\n')
                fh.flush()
                with _local_meta_lock:
                    _file_locks[olt_id] = (fh, token)
                logger.debug(f"Sync lock acquired for OLT {olt_id} (file lock, token={token[:8]})")
                return token
        except OSError as e:
            logger.warning(f"File-based sync lock failed for OLT {olt_id}, falling back to in-memory: {e}")

    # In-memory fallback (no fcntl — e.g. Windows dev; single-process only)
    with _local_meta_lock:
        if olt_id not in _local_locks:
            _local_locks[olt_id] = threading.Lock()
        lock = _local_locks[olt_id]

    acquired = lock.acquire(timeout=timeout if timeout > 0 else 0)
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

    if _HAS_FCNTL:
        with _local_meta_lock:
            entry = _file_locks.get(olt_id)
        if not entry or entry[1] != token:
            logger.warning(f"Sync lock release failed for OLT {olt_id} (token mismatch)")
            return False
        fh, _ = entry
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        except OSError:
            pass
        fh.close()
        with _local_meta_lock:
            _file_locks.pop(olt_id, None)
        logger.debug(f"Sync lock released for OLT {olt_id} (file lock)")
        return True

    # In-memory fallback (no fcntl)
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

    if _HAS_FCNTL:
        with _local_meta_lock:
            if olt_id in _file_locks:
                return True  # held by this process
        try:
            fh = _open_lock_file(_lock_file_path(olt_id))
        except OSError:
            return False
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
            return False
        except OSError:
            return True  # held by another process
        finally:
            fh.close()

    with _local_meta_lock:
        return olt_id in _local_lock_holders
