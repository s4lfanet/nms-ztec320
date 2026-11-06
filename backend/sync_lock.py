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

Lock TTL: 10 minutes (safety net for crashed processes).
For flock() locks (no kernel TTL) staleness is enforced by timestamp:
acquire reaps holders whose recorded timestamp is older than the TTL —
same-process fd is force-closed, dead pids are skipped, live stale
processes are SIGTERMed. A per-sync watchdog timer additionally bounds
lock-hold time when the sync thread itself hangs (e.g. dead telnet).
"""
import logging
import os
import signal
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
                    _reap_stale_flock(olt_id, path)
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
                    _file_locks[olt_id] = (fh, token, time.time())
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
        fh = entry[0]
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


def _reap_stale_flock(olt_id: int, path: str) -> None:
    """Release a flock held longer than _LOCK_TTL or by a dead process.

    flock() has no kernel TTL — a hung sync thread would hold it forever,
    permanently blocking every later sync. Called on each failed acquire
    attempt; only acts on locks provably stale (recorded ts > _LOCK_TTL).
    """
    now = time.time()
    # Our own held lock (hung thread in THIS process) — close its fd,
    # which releases the kernel flock. Token check in release_sync_lock
    # protects the stale holder from ever releasing a newer lock.
    with _local_meta_lock:
        own = _file_locks.get(olt_id)
    if own:
        if (now - own[2]) <= _LOCK_TTL:
            return
        logger.warning(f"Sync lock for OLT {olt_id} held {int(now - own[2])}s "
                       f"(> {_LOCK_TTL}s) by this process — force-releasing")
        try:
            fcntl.flock(own[0].fileno(), fcntl.LOCK_UN)
            own[0].close()
        except OSError:
            pass
        with _local_meta_lock:
            _file_locks.pop(olt_id, None)
        return
    # Another process holds it — read holder pid/timestamp from the file.
    try:
        with open(path) as f:
            parts = f.read().strip().split('\n')
        if len(parts) < 3:
            return
        pid, ts = int(parts[1]), float(parts[2])
    except (OSError, ValueError):
        return
    if (now - ts) <= _LOCK_TTL or pid == os.getpid():
        return
    try:
        os.kill(pid, 0)  # liveness probe — no signal sent
    except ProcessLookupError:
        return  # holder dead — OS already released its flock, retry succeeds
    except PermissionError:
        pass  # alive but not ours
    logger.warning(f"Sync lock for OLT {olt_id} stale ({int(now - ts)}s) — "
                   f"terminating holder pid {pid}")
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError as e:
        logger.warning(f"Failed to terminate stale sync-lock holder pid {pid}: {e}")


def force_release_sync_lock(olt_id: int) -> None:
    """Force-release a lock held by THIS process regardless of token.

    Used by the sync watchdog when the holder thread has hung. Cannot
    release locks owned by other processes (their stale flock is handled
    by _reap_stale_flock instead).
    """
    if _HAS_FCNTL:
        with _local_meta_lock:
            entry = _file_locks.pop(olt_id, None)
        if entry:
            try:
                fcntl.flock(entry[0].fileno(), fcntl.LOCK_UN)
                entry[0].close()
            except OSError:
                pass
            logger.warning(f"Sync lock for OLT {olt_id} force-released (watchdog)")
            return
    with _local_meta_lock:
        had = _local_lock_holders.pop(olt_id, None) is not None
        _local_lock_timestamps.pop(olt_id, None)
        lock = _local_locks.get(olt_id)
    if lock and had:
        try:
            lock.release()
        except RuntimeError:
            pass
        logger.warning(f"Sync lock for OLT {olt_id} force-released (watchdog, in-memory)")
    # Redis path needs the token for atomic delete — its TTL already bounds
    # hold time, so nothing to do here.


def start_sync_watchdog(olt_id: int, token: str, max_seconds: float = None,
                        on_timeout=None) -> threading.Timer:
    """Daemon timer that force-releases a held lock after max_seconds.

    Bounds worst-case lock-hold when the sync thread itself hangs (e.g.
    dead telnet to the OLT). The caller MUST cancel() the returned timer
    before its own release_sync_lock in the finally block — otherwise a
    fast sync's lock would be released from under a still-running sync.
    on_timeout (optional) runs before the release — e.g. mark the sync
    row 'interrupted'.
    """
    limit = max_seconds or (_LOCK_TTL * 1.5)

    def _fire():
        logger.error(f"Sync lock watchdog fired for OLT {olt_id} after {limit}s — "
                     f"sync thread likely hung; force-releasing lock")
        if on_timeout:
            try:
                on_timeout()
            except Exception as e:
                logger.error(f"Sync watchdog on_timeout failed for OLT {olt_id}: {e}")
        force_release_sync_lock(olt_id)

    t = threading.Timer(limit, _fire)
    t.daemon = True
    t.start()
    return t


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
