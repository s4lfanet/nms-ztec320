"""Tahap 2 integrasi: ping paralel dari VPS, riwayat sesi PPPoE, diagnosis pelanggan."""
from unittest.mock import patch

from app import app, db
from tests.test_link_state import (ctx, run_poll, _mk_olt_onu, _mk_dev, _fake_client,  # noqa: F401
                                   OK_PING, TIMEOUT_PING)
import link_state_poller as lsp


def _sess(uptime='1h', user='renny@rw02', ip='10.20.30.40'):
    return [{'name': user, 'address': ip, 'uptime': uptime, 'caller-id': 'AA:BB:CC:DD:EE:FF'}]


def test_uptime_seconds():
    assert lsp.uptime_seconds('1w2d03:04:05') == 7 * 86400 + 2 * 86400 + 3 * 3600 + 4 * 60 + 5
    assert lsp.uptime_seconds('2d3h4m5s') == 2 * 86400 + 3 * 3600 + 4 * 60 + 5
    assert lsp.uptime_seconds('00:05:12') == 312
    assert lsp.uptime_seconds('') is None and lsp.uptime_seconds('abc') is None


def test_session_events_down_up_reconnect(ctx):
    from models import PppoeSessionEvent, OnuLinkState
    _, onu = _mk_olt_onu()
    dev = _mk_dev(ping_enabled=False)
    for sessions in (_sess('2h'), [], _sess('5m'), _sess('40s')):
        with patch('link_state_poller.RouterOSClient', return_value=_fake_client(sessions)):
            run_poll(dev)
    ev = [e.event for e in PppoeSessionEvent.query.order_by(PppoeSessionEvent.id).all()]
    # sesi pertama tidak dicatat (status awal), lalu putus, nyambung, reconnect (uptime turun 5m → 40s)
    assert ev == ['down', 'up', 'reconnect']
    down = PppoeSessionEvent.query.filter_by(event='down').one()
    assert down.prev_uptime == '2h' and down.onu_id == onu.id
    assert OnuLinkState.query.filter_by(onu_id=onu.id).one().session_uptime == '40s'


def test_vps_ping_mode_pings_all_in_parallel(ctx):
    from models import OnuLinkState
    _, onu = _mk_olt_onu()
    dev = _mk_dev(ping_source='vps', ping_batch=1)
    cli = _fake_client(_sess())
    with patch('link_state_poller.RouterOSClient', return_value=cli), \
            patch('link_state_poller.ping_from_vps', return_value=OK_PING) as vp:
        run_poll(dev)
    assert vp.called and not cli.ping.called
    assert OnuLinkState.query.filter_by(onu_id=onu.id).one().link_state == 'ok'


def test_prune_events(ctx):
    from datetime import datetime, timedelta, timezone
    from models import PppoeSessionEvent
    _, onu = _mk_olt_onu()
    old = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=40)
    db.session.add_all([PppoeSessionEvent(onu_id=onu.id, event='down', at=old),
                        PppoeSessionEvent(onu_id=onu.id, event='up')])
    db.session.commit()
    assert lsp.prune_events(30) == 1 and PppoeSessionEvent.query.count() == 1


def test_diagnosis_rules(ctx):
    from models import OnuLinkState, PppoeSessionEvent
    from diagnosis import diagnose_onu
    _, onu = _mk_olt_onu()
    # online tanpa data PPPoE
    assert diagnose_onu(onu)['code'] == 'no_pppoe_data'
    st = OnuLinkState(onu_id=onu.id, link_state='ok', session_up=True, pppoe_user='renny@rw02')
    db.session.add(st); db.session.commit()
    assert diagnose_onu(onu)['level'] == 'ok'
    # ONU nyala, PPPoE tidak login → akun/isolir
    st.link_state, st.session_up = 'no_session', False
    db.session.commit()
    d = diagnose_onu(onu)
    assert d['code'] == 'pppoe_down' and d['level'] == 'critical' and 'billing' in d['action']
    # putus-nyambung tanpa drop optik → modem/router
    st.link_state, st.session_up = 'ok', True
    db.session.add_all([PppoeSessionEvent(onu_id=onu.id, event='reconnect') for _ in range(3)])
    db.session.commit()
    assert diagnose_onu(onu)['code'] == 'flapping_pppoe'
    # LOS
    onu.status = 'los'
    db.session.commit()
    d = diagnose_onu(onu)
    assert d['code'] == 'fiber' and d['events_24h']['pppoe_drops'] == 3


def test_diagnosis_endpoint_and_quick_command(ctx):
    from models import User, OnuLinkState
    import ai_agent
    _, onu = _mk_olt_onu()
    db.session.add(OnuLinkState(onu_id=onu.id, link_state='no_session', session_up=False))
    u = User(username='diag', full_name='d', is_super_admin=True)
    u.set_password('x-diag-' + str(onu.id))
    db.session.add(u); db.session.commit()
    with app.test_client() as c:
        with c.session_transaction() as sess:
            sess['_user_id'] = str(u.id); sess['_fresh'] = True
        r = c.get(f'/api/onu/{onu.id}/diagnosis', headers={'X-Requested-With': 'XMLHttpRequest'}).get_json()
        assert r['success'] and r['diagnosis']['code'] == 'pppoe_down'
    out = ai_agent.quick_command(f'/diagnosa {onu.id}')
    assert 'PPPoE tidak login' in out and 'Saran:' in out
    assert ai_agent.run_tool('diagnose', {'onu_id': onu.id})['code'] == 'pppoe_down'
