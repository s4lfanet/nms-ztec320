"""Tamper-evident audit log chain (Fase 11).

Each ActionLog row carries `prev_hash` (the `hash` of the previous row) and
`hash` = sha256(canonical row payload + prev_hash). Any UPDATE/DELETE that
rewrites history breaks every subsequent hash, so `verify_chain()` can detect
it. Deletion of old rows is only allowed through `archive_action_logs()`,
which exports to a compressed JSONL file first and records the chain tip in
SystemConfig so verification still anchors correctly.

Canonical payload (order fixed — changing it invalidates stored hashes):
    id|user_id|username|action|category|target|detail|ip_address|created_at_iso|prev_hash
"""
import gzip
import hashlib
import json
import logging
import os
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

GENESIS = 'GENESIS'
ARCHIVE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'backups', 'audit-log')
CHAIN_TIP_KEY = 'action_log_archive_tip'


def compute_log_hash(fields: dict, prev_hash: str) -> str:
    """Deterministic SHA-256 over the row payload + previous hash."""
    created = fields.get('created_at')
    if isinstance(created, datetime):
        # Normalize to naive UTC — the column default writes tz-aware
        # datetimes, but SQLite returns naive ones on read-back, and the
        # two isoformats would hash differently for the same instant.
        created = created.replace(tzinfo=None) if created.tzinfo else created
        created_iso = created.isoformat()
    else:
        created_iso = str(created or '')
    payload = '|'.join([
        str(fields.get('id') or ''),
        str(fields.get('user_id') or ''),
        str(fields.get('username') or ''),
        str(fields.get('action') or ''),
        str(fields.get('category') or ''),
        str(fields.get('target') or ''),
        str(fields.get('detail') or ''),
        str(fields.get('ip_address') or ''),
        created_iso,
        prev_hash or GENESIS,
    ])
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


def _row_fields(row) -> dict:
    return {
        'id': row.id, 'user_id': row.user_id, 'username': row.username,
        'action': row.action, 'category': row.category, 'target': row.target,
        'detail': row.detail, 'ip_address': row.ip_address,
        'created_at': row.created_at,
    }


def backfill_missing_hashes(batch: int = 2000) -> int:
    """Compute chain hashes for legacy rows (hash IS NULL), oldest first.

    Idempotent — already-hashed rows are skipped. Runs inside the caller's
    app context. Returns number of rows stamped.
    """
    from models import db
    from models import ActionLog

    stamped = 0
    last = ActionLog.query.filter(ActionLog.hash.isnot(None)).order_by(ActionLog.id.desc()).first()
    prev_hash = last.hash if last else GENESIS
    while True:
        rows = (ActionLog.query.filter(ActionLog.hash.is_(None))
                .order_by(ActionLog.id.asc()).limit(batch).all())
        if not rows:
            break
        for row in rows:
            row.prev_hash = prev_hash
            row.hash = compute_log_hash(_row_fields(row), prev_hash)
            prev_hash = row.hash
            stamped += 1
        db.session.commit()
    if stamped:
        logger.info(f'  Audit chain: stamped {stamped} legacy ActionLog row(s)')
    return stamped


def verify_chain(limit: int | None = None) -> dict:
    """Walk rows in id order and recompute each hash.

    Returns {verified, checked, first_bad_id, detail, archived}. `archived`
    indicates the oldest table row anchors to a recorded archive tip rather
    than GENESIS — expected when old logs were archived away.
    """
    from models import ActionLog, SystemConfig

    tip = SystemConfig.query.filter_by(key=CHAIN_TIP_KEY).first()
    archive_tip = tip.value if tip else None

    checked = 0
    prev_hash = None
    first_row = True
    q = ActionLog.query.order_by(ActionLog.id.asc())
    if limit:
        q = q.limit(limit)
    for row in q.yield_per(1000):
        stored_prev = row.prev_hash or ''
        # Linkage check: this row must point at the previous row's hash.
        if first_row:
            expected_prev = archive_tip or GENESIS
            anchored = stored_prev == expected_prev or (not stored_prev and expected_prev == GENESIS)
            if not anchored:
                return {'verified': False, 'checked': checked, 'first_bad_id': row.id,
                        'archived': bool(archive_tip),
                        'detail': f'First row does not anchor to {"archive tip" if archive_tip else "GENESIS"}'}
        else:
            if stored_prev != prev_hash:
                return {'verified': False, 'checked': checked, 'first_bad_id': row.id,
                        'archived': bool(archive_tip),
                        'detail': f'Broken link before row {row.id}'}
        # Content check: recomputed hash must equal stored hash.
        if not row.hash or compute_log_hash(_row_fields(row), stored_prev) != row.hash:
            return {'verified': False, 'checked': checked, 'first_bad_id': row.id,
                    'archived': bool(archive_tip),
                    'detail': f'Hash mismatch at row {row.id} — record was modified'}
        prev_hash = row.hash
        checked += 1
        first_row = False
    return {'verified': True, 'checked': checked, 'first_bad_id': None,
            'archived': bool(archive_tip),
            'detail': f'Chain intact across {checked} record(s)'}


def archive_action_logs(older_than_days: int = 90) -> dict:
    """Export rows older than N days to a gzipped JSONL file, then delete them.

    The hash of the last archived row is recorded in SystemConfig so the
    surviving chain still verifies from the archive tip. PostgreSQL's
    append-only trigger is dropped for the delete and recreated after.
    """
    from models import db
    from models import ActionLog, SystemConfig
    from sqlalchemy import text as sqla_text

    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=older_than_days)
    rows = (ActionLog.query.filter(ActionLog.created_at < cutoff)
            .order_by(ActionLog.id.asc()).all())
    if not rows:
        return {'archived': 0, 'file': None, 'detail': 'Nothing older than cutoff'}

    os.makedirs(ARCHIVE_DIR, exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    path = os.path.join(ARCHIVE_DIR, f'action_logs_{stamp}.jsonl.gz')
    with gzip.open(path, 'wt', encoding='utf-8') as fh:
        for r in rows:
            fh.write(json.dumps({
                'id': r.id, 'user_id': r.user_id, 'username': r.username,
                'action': r.action, 'category': r.category, 'target': r.target,
                'detail': r.detail, 'ip_address': r.ip_address,
                'created_at': r.created_at.isoformat() if r.created_at else None,
                'prev_hash': r.prev_hash, 'hash': r.hash,
            }) + '\n')

    # Record the chain tip = hash of the last archived row.
    last_hash = rows[-1].hash
    tip = SystemConfig.query.filter_by(key=CHAIN_TIP_KEY).first()
    if tip:
        tip.value = last_hash
    else:
        db.session.add(SystemConfig(key=CHAIN_TIP_KEY, value=last_hash))

    ids = [r.id for r in rows]
    is_pg = db.engine.dialect.name == 'postgresql'
    with db.engine.connect() as conn:
        if is_pg:
            conn.execute(sqla_text('DROP TRIGGER IF EXISTS action_logs_immutable ON action_logs'))
        conn.execute(sqla_text(f'DELETE FROM action_logs WHERE id IN ({",".join(str(i) for i in ids)})'))
        if is_pg:
            conn.execute(sqla_text(
                "CREATE TRIGGER action_logs_immutable BEFORE UPDATE OR DELETE ON action_logs "
                "FOR EACH ROW EXECUTE FUNCTION action_logs_reject_mutation()"))
        conn.commit()

    logger.info(f'Audit archive: exported+deleted {len(rows)} ActionLog row(s) -> {path}')
    return {'archived': len(rows), 'file': path, 'detail': f'Archived {len(rows)} rows to {os.path.basename(path)}'}


def create_immutable_trigger() -> bool:
    """PostgreSQL-only: install BEFORE UPDATE/DELETE trigger on action_logs.

    Returns True when the trigger now exists (already present or just
    created), False on non-PostgreSQL dialects (enforcement stays app-level).
    """
    from models import db
    from sqlalchemy import text as sqla_text

    if db.engine.dialect.name != 'postgresql':
        return False
    stmts = [
        """CREATE OR REPLACE FUNCTION action_logs_reject_mutation() RETURNS trigger
           LANGUAGE plpgsql AS $$
           BEGIN
             RAISE EXCEPTION 'action_logs is append-only';
             RETURN NULL;
           END $$""",
        "DROP TRIGGER IF EXISTS action_logs_immutable ON action_logs",
        """CREATE TRIGGER action_logs_immutable BEFORE UPDATE OR DELETE ON action_logs
           FOR EACH ROW EXECUTE FUNCTION action_logs_reject_mutation()""",
    ]
    with db.engine.connect() as conn:
        for s in stmts:
            conn.execute(sqla_text(s))
        conn.commit()
    logger.info('  Audit chain: PostgreSQL append-only trigger installed on action_logs')
    return True
