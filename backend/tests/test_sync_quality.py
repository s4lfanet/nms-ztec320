"""Penjaga kualitas sinkron OLT + detak auto-sync."""
from datetime import datetime, timedelta, timezone

import job_health
import sync_quality as sq
from app import db
from models import OLT, Notification, SystemConfig
from tests.test_link_state import ctx  # noqa: F401


def test_is_bad_rules():
    assert sq.is_bad(0, 0, True)                      # gagal
    assert sq.is_bad(0, 100, False)                   # tabel kosong
    assert sq.is_bad(40, 100, False)                  # < 50%
    assert not sq.is_bad(60, 100, False)              # sebagian kecil hilang masih wajar
    assert not sq.is_bad(0, 3, False)                 # OLT kecil/baru: tak dinilai
    assert not sq.is_bad(0, 0, False)


def test_next_state_alert_once_then_recover():
    st = (0, False)
    seq = []
    for bad in (True, True, True, True, False, False):
        s, a, act = sq.next_state(*st, bad)
        st = (s, a); seq.append(act)
    assert seq == [None, None, 'alert', None, 'recover', None]
    assert sq.next_state(2, False, False) == (0, False, None)     # putus sebelum 3 → reset tanpa pesan


def test_light_sync_due():
    now = datetime(2026, 11, 26, 12, 0, tzinfo=timezone.utc)
    assert sq.light_sync_due(300, now - timedelta(seconds=10), now)            # bawaan: selalu
    assert sq.light_sync_due(None, now, now) and sq.light_sync_due(900, None, now)
    assert not sq.light_sync_due(900, now - timedelta(seconds=300), now)       # belum 840 dtk
    assert sq.light_sync_due(900, now - timedelta(seconds=850), now)
    assert sq.light_sync_due(900, (now - timedelta(seconds=900)).replace(tzinfo=None), now)   # naive datetime


def _olt(name='C320-A', online=True):
    o = OLT(name=name, ip_address='10.5.5.' + str(abs(hash(name)) % 200 + 1), snmp_enabled=True, is_online=online)
    db.session.add(o); db.session.commit()
    return o


def test_record_alerts_after_three_bad_and_recovers(ctx, monkeypatch):
    sent = []
    monkeypatch.setattr('alerts._send_external_alerts', lambda a, r=None: sent.extend(x['title'] for x in a))
    o = _olt()
    for _ in range(2):
        assert sq.record(o, 0, 100, False) is None
    assert sq.record(o, 0, 100, False) == 'alert'
    n = Notification.query.filter_by(category='sync_partial', olt_id=o.id, resolved=False).all()
    assert len(n) == 1 and 'Hanya 0 dari 100' in n[0].message
    assert sq.record(o, 0, 100, False) is None                                 # tak mengulang
    assert sq.record(o, 98, 100, False) == 'recover'
    assert Notification.query.filter_by(category='sync_partial', olt_id=o.id, resolved=False).count() == 0
    assert len(sent) == 2 and 'pulih' in sent[1]


def test_record_failures_and_offline_olt_not_counted(ctx, monkeypatch):
    sent = []
    monkeypatch.setattr('alerts._send_external_alerts', lambda a, r=None: sent.extend(a))
    o = _olt('Gagal')
    for _ in range(2):
        sq.record(o, 0, 0, True, 'SNMP timeout')
    assert sq.record(o, 0, 0, True, 'SNMP timeout') == 'alert' and 'SNMP timeout' in sent[0]['message']
    off = _olt('Mati', online=False)
    for _ in range(5):
        assert sq.record(off, 0, 50, True, 'x') is None                        # offline → ditangani alert OLT offline
    assert SystemConfig.query.filter_by(key=f'sync_bad_{off.id}').first() is None


def test_auto_sync_job_registered_and_applicable(ctx):
    assert 'auto-sync' in job_health.JOBS
    assert job_health._applicable('olt_sync') is False
    _olt('Ada')
    assert job_health._applicable('olt_sync') is True
