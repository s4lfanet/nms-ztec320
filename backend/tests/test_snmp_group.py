"""Grup perangkat SNMP: simpan, tampil di daftar, muncul di alert; kolom lama dimigrasi."""
import sqlite3

from app import db
from models import SnmpDevice
from tests.test_snmp_topology import H, _client, _dev
from tests.test_link_state import ctx  # noqa: F401
import snmp_alerts


def test_group_api_dan_head(ctx):
    d = _dev('RB-G', '10.4.0.1', 'rb-g', [('ether1', '')])
    db.session.commit()
    c = _client()
    r = c.put(f'/api/snmp/devices/{d.id}', json={'name': 'RB-G', 'host': '10.4.0.1', 'community': 'public', 'group': '  Backbone '}, headers=H)
    assert r.status_code == 200, r.get_data(as_text=True)
    items = c.get('/api/snmp/devices', headers=H).get_json()['devices']
    assert next(x for x in items if x['id'] == d.id)['group'] == 'Backbone'
    assert 'Grup: Backbone' in snmp_alerts._head(db.session.get(SnmpDevice, d.id), 'T')


def test_kolom_group_name_dimigrasi():
    import tempfile, os
    from tests.test_migrate_schema import _cols, _run_migrate_schema_against
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        path = f.name
    try:
        con = sqlite3.connect(path)
        con.execute("CREATE TABLE snmp_devices (id INTEGER PRIMARY KEY, name VARCHAR(100) NOT NULL, host VARCHAR(255) NOT NULL)")
        con.execute("INSERT INTO snmp_devices (name, host) VALUES ('lama','10.0.0.9')")
        con.commit(); con.close()
        _run_migrate_schema_against(path)
        assert 'group_name' in _cols(path, 'snmp_devices')
    finally:
        try: os.unlink(path)
        except OSError: pass
