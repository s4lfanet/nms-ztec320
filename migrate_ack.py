#!/usr/bin/env python3
"""One-time migration: add acknowledgement columns to notifications + SLA tracking table."""
import sqlite3
import sys
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'nms.db')
if not os.path.exists(DB_PATH):
    DB_PATH = 'instance/nms.db'

if not os.path.exists(DB_PATH):
    print(f"ERROR: Database not found at {DB_PATH}")
    sys.exit(1)

print(f"Database: {DB_PATH}")
conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

# 1. Add acknowledgement columns to notifications
c.execute('PRAGMA table_info(notifications)')
cols = [row[1] for row in c.fetchall()]
print(f"\n[notifications] Existing columns: {len(cols)}")

ack_cols = {
    'acknowledged': 'BOOLEAN DEFAULT 0',
    'acknowledged_by': 'TEXT DEFAULT ""',
    'acknowledged_at': 'DATETIME',
}

added = 0
for col_name, col_def in ack_cols.items():
    if col_name not in cols:
        c.execute(f'ALTER TABLE notifications ADD COLUMN {col_name} {col_def}')
        print(f'  Added: {col_name}')
        added += 1
    else:
        print(f'  Already exists: {col_name}')

# 2. Create uptime_log table
c.execute('''CREATE TABLE IF NOT EXISTS uptime_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    onu_id INTEGER,
    olt_id INTEGER,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
)''')
print('\n[uptime_log] Table created (or already exists)')

# 3. Create maintenance_windows table
c.execute('''CREATE TABLE IF NOT EXISTS maintenance_windows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER,
    olt_id INTEGER,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    reason TEXT DEFAULT '',
    created_by VARCHAR(100) DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (olt_id) REFERENCES olts(id)
)''')
print('[maintenance_windows] Table created (or already exists)')

# 4. Create metric_history table
c.execute('''CREATE TABLE IF NOT EXISTS metric_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER,
    olt_id INTEGER,
    onu_id INTEGER,
    metric_type VARCHAR(30) NOT NULL,
    value REAL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (olt_id) REFERENCES olts(id)
)''')
print('[metric_history] Table created (or already exists)')

# 5. Create index for fast queries
c.execute('CREATE INDEX IF NOT EXISTS idx_metric_history_lookup ON metric_history(metric_type, olt_id, onu_id, recorded_at)')
c.execute('CREATE INDEX IF NOT EXISTS idx_uptime_log_lookup ON uptime_log(olt_id, onu_id, changed_at)')
c.execute('CREATE INDEX IF NOT EXISTS idx_maintenance_window_lookup ON maintenance_windows(olt_id, start_time, end_time)')
print('[indexes] Created')

conn.commit()
conn.close()
print(f'\nDone! Added {added} columns + 3 new tables.')
