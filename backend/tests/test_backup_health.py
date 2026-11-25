"""Status job & backup: salinan luar server, daftar backup, unduh aman, detak auto-backup."""
import os
import secrets
import time
from datetime import datetime, timedelta

import backup_health
import db_backup
import job_health
from app import app, db
from models import User, OLT, SystemConfig
from tests.test_link_state import ctx  # noqa: F401

H = {'X-Requested-With': 'XMLHttpRequest'}


def _admin():
    u = User(username='b' + secrets.token_hex(3), full_name='b', is_super_admin=True)
    u.set_password(secrets.token_hex(8))
    db.session.add(u); db.session.commit()
    c = app.test_client()
    with c.session_transaction() as s:
        s['_user_id'] = str(u.id); s['_fresh'] = True
    return c


def test_safe_backup_path_blocks_traversal(tmp_path):
    f = tmp_path / 'nms_db_backup_1.db'; f.write_bytes(b'x')
    assert backup_health.safe_backup_path('nms_db_backup_1.db', str(tmp_path)) == str(f)
    for bad in ('../etc/hosts', 'nms_db_backup_1.db/../x', 'other.db', '', '/etc/hosts', 'nms_db_backup_9.db'):
        assert backup_health.safe_backup_path(bad, str(tmp_path)) is None


def test_db_backups_sorted_newest_first(tmp_path):
    for i, age in enumerate((300, 10, 100)):
        p = tmp_path / f'nms_db_backup_{i}.db'; p.write_bytes(b'x' * (i + 1))
        os.utime(p, (time.time() - age, time.time() - age))
    (tmp_path / 'other.txt').write_text('x')
    items = backup_health.db_backups(str(tmp_path))
    assert [i['name'] for i in items] == ['nms_db_backup_1.db', 'nms_db_backup_2.db', 'nms_db_backup_0.db']


def test_remote_cycle_once_per_day_and_alert_on_transition(ctx, monkeypatch):
    monkeypatch.setenv('BACKUP_REMOTE_SCP_TARGET', 'u' + chr(64) + 'h:/b/')
    alerts, calls = [], []
    monkeypatch.setattr('alerts._send_external_alerts', lambda a, r=None: alerts.append(a[0]['title']))
    result = {'ok': False}
    monkeypatch.setattr(db_backup, 'upload_remote', lambda p, timeout=120: calls.append(p) or ((True, '') if result['ok'] else (False, 'denied')))
    assert backup_health.remote_cycle('/x', today='2026-11-26') == 'failed'
    assert backup_health.remote_cycle('/x', today='2026-11-26') == 'failed'   # coba lagi, tapi tak kirim alert dobel
    assert len(alerts) == 1 and 'GAGAL' in alerts[0]
    result['ok'] = True
    assert backup_health.remote_cycle('/x', today='2026-11-26') == 'ok' and 'pulih' in alerts[-1]
    n = len(calls)
    assert backup_health.remote_cycle('/x', today='2026-11-26') == 'done' and len(calls) == n  # sekali sehari
    assert backup_health.status()['remote'] == {'configured': True, 'target': 'h:/b/', 'last_ok': '2026-11-26',
                                                'status': 'ok', 'error': None}
    monkeypatch.delenv('BACKUP_REMOTE_SCP_TARGET')
    assert backup_health.remote_cycle('/x', today='2026-11-27') == 'off'


def test_olt_backup_stale_flag(ctx):
    now = datetime.utcnow()
    for name, ago in (('ok', 3), ('old', 80), ('never', None)):
        db.session.add(OLT(name=name, ip_address='10.0.0.' + str(len(name)), auto_backup_enabled=True,
                           auto_backup_interval=24, auto_backup_unit='hours',
                           last_backup_at=(now - timedelta(hours=ago)) if ago is not None else None))
    db.session.commit()
    res = {o['name']: o['stale'] for o in backup_health.olt_backups(now)}
    assert res == {'ok': False, 'old': True, 'never': True}


def test_auto_backup_job_registered_and_applicable(ctx):
    assert 'auto-backup' in job_health.JOBS
    assert job_health._applicable('olt_backup') is False
    db.session.add(OLT(name='a', ip_address='10.1.1.1', auto_backup_enabled=True)); db.session.commit()
    assert job_health._applicable('olt_backup') is True


def test_system_health_and_download_endpoints(ctx, tmp_path, monkeypatch):
    monkeypatch.setattr(db_backup, 'DEFAULT_BACKUP_DIR', str(tmp_path))
    (tmp_path / 'nms_db_backup_20261126_010000.db').write_bytes(b'SQLite')
    c = _admin()
    r = c.get('/api/system/health', headers=H).get_json()
    assert r['success'] and any(j['name'] == 'auto-backup' for j in r['jobs'])
    assert r['backup']['db']['count'] == 1 and r['backup']['db']['files'][0]['name'].startswith('nms_db_backup_')
    ok = c.get('/api/system/backups/nms_db_backup_20261126_010000.db', headers=H)
    assert ok.status_code == 200 and ok.data == b'SQLite'
    assert c.get('/api/system/backups/..%2Fapp.py', headers=H).status_code == 404
    assert c.get('/api/system/backups/nms_db_backup_nope.db', headers=H).status_code == 404
