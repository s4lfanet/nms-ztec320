"""Pemantau job mati (job_health) + perapian sampel redaman di poller."""
import time
from unittest.mock import patch

from app import app
from models import db, SystemConfig, Notification
from tests.test_link_state import ctx  # noqa: F401
import job_health


def test_evaluate_stale_recovered_and_skip():
    now = 100000
    beats = {'alert-monitor': now - 3600, 'db-backup': now - 60, 'link-poller': now - 5000}
    r = {x[0]: x[3] for x in job_health.evaluate(now, beats, {})}
    assert r == {'alert-monitor': 'stale', 'link-poller': 'stale'}
    r2 = {x[0]: x[3] for x in job_health.evaluate(now, {'alert-monitor': now - 10}, {'alert-monitor': '1'})}
    assert r2 == {'alert-monitor': 'recovered'}
    assert job_health.evaluate(now, beats, {}, skip=('alert-monitor', 'link-poller')) == []
    assert job_health.evaluate(now, {}, {}) == []              # belum pernah berdetak → dilewati


def test_check_alerts_once_then_recovers(ctx):
    sent = []
    with app.app_context():
        SystemConfig.query.filter(SystemConfig.key.like('job_%')).delete(synchronize_session=False)
        db.session.commit()
        old = int(time.time()) - 6 * 3600
        db.session.add(SystemConfig(key='job_beat_db-backup', value=str(old)))
        db.session.commit()
        with patch('alerts._send_external_alerts', side_effect=lambda a, r=None: sent.extend(a)):
            assert job_health.check() == 1
            assert job_health.check() == 0                     # tidak dikirim ulang
            n = Notification.query.filter_by(category='job_stale', resolved=False).count()
            assert n == 1
            job_health.beat('db-backup')
            assert job_health.check() == 1                     # pulih
        assert [a['is_recovery'] for a in sent] == [False, True]
        assert Notification.query.filter_by(category='job_stale', resolved=False).count() == 0


def test_idle_job_without_devices_not_alerted(ctx):
    with app.app_context():
        SystemConfig.query.filter(SystemConfig.key.like('job_%')).delete(synchronize_session=False)
        db.session.add(SystemConfig(key='job_beat_link-poller', value=str(int(time.time()) - 7200)))
        db.session.commit()
        with patch('alerts._send_external_alerts') as m:
            job_health.check()
        assert not m.called  # tidak ada MikroTik terdaftar → wajar idle


def test_status_lists_all_jobs(ctx):
    with app.app_context():
        names = {j['name'] for j in job_health.status()}
        assert names == set(job_health.JOBS)
