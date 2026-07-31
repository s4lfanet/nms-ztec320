"""List all OLTs from the NMS PostgreSQL database.

Reads DATABASE_URL from .env in the current working directory.
Usage: python3 scripts/list_olts_pg.py
"""
import os
import re
import sys


def load_db_url():
    url = os.environ.get('DATABASE_URL')
    if url:
        return url
    try:
        with open('.env') as fh:
            for line in fh:
                line = line.strip()
                if line.startswith('DATABASE_URL='):
                    return line.split('=', 1)[1].strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return None


def main():
    url = load_db_url()
    if not url:
        print('DATABASE_URL not found')
        sys.exit(1)
    try:
        import psycopg2
    except ImportError:
        print('psycopg2 not installed')
        sys.exit(1)

    conn = psycopg2.connect(url)
    cur = conn.cursor()
    cur.execute(
        'SELECT id, name, ip_address, vendor, model, snmp_community, '
        'snmp_port, temperature FROM olts ORDER BY id')
    rows = cur.fetchall()
    if not rows:
        print('No OLTs in database')
    for r in rows:
        print(f'id={r[0]} name={r[1]!r} ip={r[2]} vendor={r[3]!r} '
              f'model={r[4]!r} community={r[5]!r} port={r[6]} '
              f'temp={r[7]}')
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
