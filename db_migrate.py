"""Database migration helper — SQLite → PostgreSQL.

Usage:
    # 1. Export SQLite data to SQL dump:
    python db_migrate.py export

    # 2. Import into PostgreSQL:
    python db_migrate.py import

    # 3. Verify data counts:
    python db_migrate.py verify

Requires: DATABASE_URL env var pointing to PostgreSQL.
"""
import os
import sys
import json
import subprocess
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent
SQLITE_PATH = BASE_DIR / "instance" / "nms.db"
DUMP_FILE = BASE_DIR / "instance" / "nms_dump.json"


def get_sqlite_uri():
    return f"sqlite:///{SQLITE_PATH}"


def get_pg_uri():
    uri = os.environ.get("DATABASE_URL", "")
    if not uri or "sqlite" in uri:
        print("ERROR: Set DATABASE_URL to PostgreSQL connection string.")
        print("Example: DATABASE_URL=postgresql://user:pass@localhost:5432/salfanet_nms")
        sys.exit(1)
    return uri


def export_sqlite():
    """Export all SQLite tables to JSON dump."""
    if not SQLITE_PATH.exists():
        print(f"SQLite database not found at {SQLITE_PATH}")
        sys.exit(1)

    # Use SQLAlchemy to read from SQLite
    from sqlalchemy import create_engine, text, inspect

    engine = create_engine(get_sqlite_uri())
    inspector = inspect(engine)

    tables = inspector.get_table_names()
    dump = {"exported_at": datetime.now().isoformat(), "tables": {}}

    with engine.connect() as conn:
        for table in tables:
            if table == "alembic_version":
                continue
            result = conn.execute(text(f"SELECT * FROM [{table}]"))
            rows = [dict(row._mapping) for row in result]
            dump["tables"][table] = {
                "count": len(rows),
                "rows": rows,
            }
            print(f"  Exported {table}: {len(rows)} rows")

    with open(DUMP_FILE, "w", encoding="utf-8") as f:
        json.dump(dump, f, default=str, ensure_ascii=False, indent=2)

    total = sum(t["count"] for t in dump["tables"].values())
    print(f"\n✓ Exported {len(tables)} tables, {total} rows → {DUMP_FILE}")


def import_to_pg():
    """Import JSON dump into PostgreSQL."""
    if not DUMP_FILE.exists():
        print(f"Dump file not found: {DUMP_FILE}")
        print("Run 'python db_migrate.py export' first.")
        sys.exit(1)

    from sqlalchemy import create_engine, text

    pg_uri = get_pg_uri()
    engine = create_engine(pg_uri)

    with open(DUMP_FILE, "r", encoding="utf-8") as f:
        dump = json.load(f)

    # Create all tables first using SQLAlchemy models
    print("Creating tables in PostgreSQL...")
    sys.path.insert(0, str(BASE_DIR))
    os.environ["DATABASE_URL"] = pg_uri

    # Temporarily override app config
    from flask import Flask
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = pg_uri
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    from models import db
    db.init_app(app)

    with app.app_context():
        db.create_all()
        print("✓ Tables created.")

        # Import data
        for table_name, table_data in dump["tables"].items():
            rows = table_data["rows"]
            if not rows:
                continue

            # Check if table exists in SQLAlchemy metadata
            if table_name not in db.metadata.tables:
                print(f"  ⚠ Skipping {table_name} (not in models)")
                continue

            table = db.metadata.tables[table_name]

            # Handle PostgreSQL-specific issues
            for row in rows:
                # Remove None keys
                clean_row = {k: v for k, v in row.items() if v is not None}
                # Convert SQLite integer booleans to PostgreSQL booleans
                for key in clean_row:
                    if key.startswith("is_") or key in ("visible", "admin_state"):
                        if isinstance(clean_row[key], int):
                            clean_row[key] = bool(clean_row[key])

                try:
                    stmt = table.insert().values(**clean_row)
                    db.session.execute(stmt)
                except Exception as e:
                    # Skip duplicate key errors (idempotent import)
                    if "duplicate key" in str(e).lower() or "unique" in str(e).lower():
                        pass
                    else:
                        print(f"  ⚠ Error inserting into {table_name}: {e}")

            db.session.commit()
            print(f"  ✓ Imported {table_name}: {len(rows)} rows")

    print(f"\n✓ Import complete!")


def verify_data():
    """Verify row counts in PostgreSQL match the dump."""
    if not DUMP_FILE.exists():
        print(f"Dump file not found: {DUMP_FILE}")
        sys.exit(1)

    from sqlalchemy import create_engine, text

    pg_uri = get_pg_uri()
    engine = create_engine(pg_uri)

    with open(DUMP_FILE, "r", encoding="utf-8") as f:
        dump = json.load(f)

    print(f"{'Table':<30} {'Dump':>8} {'PG':>8} {'Match':>6}")
    print("-" * 55)

    all_match = True
    with engine.connect() as conn:
        for table_name, table_data in dump["tables"].items():
            expected = table_data["count"]
            try:
                result = conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
                actual = result.scalar()
            except Exception:
                actual = "N/A"

            match = "✓" if actual == expected else "✗"
            if actual != expected:
                all_match = False
            print(f"{table_name:<30} {expected:>8} {actual:>8} {match:>6}")

    print("-" * 55)
    print("✓ All counts match!" if all_match else "✗ Some counts differ!")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1].lower()
    if cmd == "export":
        export_sqlite()
    elif cmd == "import":
        import_to_pg()
    elif cmd == "verify":
        verify_data()
    else:
        print(f"Unknown command: {cmd}")
        print("Commands: export, import, verify")
        sys.exit(1)


if __name__ == "__main__":
    main()
