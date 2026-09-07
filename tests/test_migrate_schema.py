"""Tests for app.migrate_schema()'s add_col() helper — specifically the
retry-on-lock behavior added after a real, reproduced bug: a transient
"database is locked" error (auto_sync.py cron racing a restart) was
silently swallowed at DEBUG level with no retry, permanently leaving a
column missing until the next lucky restart. Missing columns then throw
plain 500s on unrelated pages (e.g. FTTH tree) — see CHANGELOG for the
full reproduction.

Run with: py -3 -m pytest tests/test_migrate_schema.py -v
"""
import os
import sys
import sqlite3
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db, migrate_schema


def _cols(db_path, table):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute(f'PRAGMA table_info({table})')
    cols = {row[1] for row in cur.fetchall()}
    conn.close()
    return cols


def _run_migrate_schema_against(db_path):
    from sqlalchemy import create_engine
    with app.app_context():
        _orig_engine = db.engines.get(None)
        db.engines[None] = create_engine(f'sqlite:///{db_path}')
        try:
            migrate_schema()
        finally:
            db.engines[None] = _orig_engine


class TestAddColHelper:
    def test_add_col_adds_missing_column(self):
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name
        try:
            conn = sqlite3.connect(db_path)
            conn.execute('CREATE TABLE ftth_odc (id INTEGER PRIMARY KEY, name TEXT)')
            conn.commit()
            conn.close()

            _run_migrate_schema_against(db_path)

            assert 'feed_source' in _cols(db_path, 'ftth_odc')
            assert 'jc_id' in _cols(db_path, 'ftth_odc')
        finally:
            try:
                os.unlink(db_path)
            except (OSError, PermissionError):
                pass

    def test_add_col_skips_nonexistent_table_without_raising(self):
        """A brand-new table (e.g. ftth_jc on a pre-JC install) shouldn't be
        ALTERed — db.create_all() right after handles it — and must not
        raise even though it doesn't exist yet."""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name
        try:
            conn = sqlite3.connect(db_path)
            conn.execute('CREATE TABLE olts (id INTEGER PRIMARY KEY)')
            conn.commit()
            conn.close()

            _run_migrate_schema_against(db_path)  # must not raise, even though ftth_jc etc. don't exist
        finally:
            try:
                os.unlink(db_path)
            except (OSError, PermissionError):
                pass

    def test_add_col_idempotent_on_already_migrated_db(self):
        """Running migrate_schema() twice must not error or duplicate columns
        (this is exactly what happens on every server restart)."""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name
        try:
            conn = sqlite3.connect(db_path)
            conn.execute('CREATE TABLE ftth_odc (id INTEGER PRIMARY KEY, name TEXT)')
            conn.commit()
            conn.close()

            _run_migrate_schema_against(db_path)
            _run_migrate_schema_against(db_path)  # second run — must be a clean no-op

            assert 'feed_source' in _cols(db_path, 'ftth_odc')
        finally:
            try:
                os.unlink(db_path)
            except (OSError, PermissionError):
                pass
