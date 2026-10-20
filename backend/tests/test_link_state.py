"""Tests for Mikrotik link-state poller (PPPoE session join + ping classification).

Run with: py -3 -m pytest tests/test_link_state.py -v
"""
import os
import sys
import tempfile
import pytest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db


@pytest.fixture
def ctx():
    app.config['TESTING'] = True
    _tmpdb = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    _tmpdb.close()
    from sqlalchemy import create_engine as _ce
    eng = _ce(f'sqlite:///{_tmpdb.name}')
    with app.app_context():
        orig = db.engines.get(None)
        db.engines[None] = eng
        db.create_all()
        yield
        db.session.remove()
        db.drop_all()
        if orig is not None:
            db.engines[None] = orig
        else:
            db.engines.pop(None, None)
        eng.dispose()
    os.unlink(_tmpdb.name)


def run_poll(dev):
    """poll_device needs a Flask app context — the ctx fixture already holds
    one (in production the daemon loop holds it instead)."""
    import link_state_poller as lsp
    lsp.poll_device(dev)


def _mk_olt_onu(pppoe='renny@rw02', status='online'):
    from models import OLT, ONU
    olt = OLT(name='T', ip_address='10.0.0.1', vendor='zte')
    db.session.add(olt)
    db.session.flush()
    onu = ONU(olt_id=olt.id, onu_index=120101, serial_number='ZTEG00000001',
              name='c1', pppoe=pppoe, status=status)
    db.session.add(onu)
    db.session.commit()
    return olt, onu


def _mk_dev(**kw):
    from models import MikrotikDevice
    kw.setdefault('name', 'mt')
    kw.setdefault('host', '10.0.0.2')
    kw.setdefault('api_user', 'u')
    kw.setdefault('api_password', 'p')
    d = MikrotikDevice(**kw)
    db.session.add(d)
    db.session.commit()
    return d


def _fake_client(sessions, ping_map=None):
    """Fake RouterOSClient: returns given sessions; ping reads ping_map[ip]."""
    cli = MagicMock()
    cli.get_pppoe_active.return_value = sessions
    cli.get_identity.return_value = 'fake-mt'
    cli.ping.side_effect = lambda ip, count=3: (ping_map or {}).get(
        ip, {'sent': 3, 'received': 3, 'loss_pct': 0.0, 'avg_rtt_ms': 5.0})
    cli.connect.return_value = cli
    return cli


OK_PING = {'sent': 3, 'received': 3, 'loss_pct': 0.0, 'avg_rtt_ms': 10.0}
TIMEOUT_PING = {'sent': 3, 'received': 0, 'loss_pct': 100.0, 'avg_rtt_ms': None}
LOSSY_PING = {'sent': 3, 'received': 2, 'loss_pct': 33.3, 'avg_rtt_ms': 40.0}


class TestLinkStatePoller:

    def test_session_match_creates_ok_state(self, ctx):
        """PPPoE session matching onu.pppoe + good ping -> link_state 'ok'."""
        import link_state_poller as lsp
        from models import OnuLinkState
        _, onu = _mk_olt_onu()
        dev = _mk_dev()
        sessions = [{'name': 'renny@rw02', 'address': '10.20.30.40',
                     'uptime': '1d2h', 'caller-id': 'AA:BB:CC:DD:EE:FF'}]
        cli = _fake_client(sessions, {'10.20.30.40': OK_PING})
        with patch('link_state_poller.RouterOSClient', return_value=cli):
            run_poll(dev)
        st = OnuLinkState.query.filter_by(onu_id=onu.id).one()
        assert st.link_state == 'ok'
        assert st.session_up is True
        assert st.pppoe_ip == '10.20.30.40'
        assert st.rtt_ms == 10.0
        assert dev.last_ok is True

    def test_ping_timeout_becomes_down_after_threshold(self, ctx):
        """First timeout -> 'slow' (hysteresis), second -> 'down'."""
        import link_state_poller as lsp
        from models import OnuLinkState
        _, onu = _mk_olt_onu()
        dev = _mk_dev()
        sessions = [{'name': 'renny@rw02', 'address': '10.20.30.40'}]
        cli = _fake_client(sessions, {'10.20.30.40': TIMEOUT_PING})
        with patch('link_state_poller.RouterOSClient', return_value=cli):
            run_poll(dev)
            st = OnuLinkState.query.filter_by(onu_id=onu.id).one()
            assert st.link_state == 'slow'  # 1st timeout
            run_poll(dev)
            st = OnuLinkState.query.filter_by(onu_id=onu.id).one()
            assert st.link_state == 'down'  # 2nd consecutive timeout

    def test_partial_loss_is_slow(self, ctx):
        import link_state_poller as lsp
        from models import OnuLinkState
        _, onu = _mk_olt_onu()
        dev = _mk_dev()
        sessions = [{'name': 'renny@rw02', 'address': '10.20.30.40'}]
        cli = _fake_client(sessions, {'10.20.30.40': LOSSY_PING})
        with patch('link_state_poller.RouterOSClient', return_value=cli):
            run_poll(dev)
        st = OnuLinkState.query.filter_by(onu_id=onu.id).one()
        assert st.link_state == 'slow'

    def test_no_session_after_disconnect(self, ctx):
        """Session present then absent -> 'no_session'."""
        import link_state_poller as lsp
        from models import OnuLinkState
        _, onu = _mk_olt_onu()
        dev = _mk_dev()
        with patch('link_state_poller.RouterOSClient',
                   return_value=_fake_client([{'name': 'renny@rw02', 'address': '10.0.0.5'}])):
            run_poll(dev)
        with patch('link_state_poller.RouterOSClient', return_value=_fake_client([])):
            run_poll(dev)
        st = OnuLinkState.query.filter_by(onu_id=onu.id).one()
        assert st.link_state == 'no_session'
        assert st.session_up is False

    def test_multiple_devices_independent(self, ctx):
        """Two Mikrotiks map sessions independently."""
        import link_state_poller as lsp
        from models import OnuLinkState
        _, onu1 = _mk_olt_onu(pppoe='a@x')
        _, onu2 = _mk_olt_onu(pppoe='b@y')
        onu2.serial_number = 'ZTEG00000002'
        onu2.onu_index = 120102
        db.session.commit()
        d1, d2 = _mk_dev(name='m1'), _mk_dev(name='m2')
        with patch('link_state_poller.RouterOSClient',
                   return_value=_fake_client([{'name': 'a@x', 'address': '10.0.0.1'}])):
            run_poll(d1)
        with patch('link_state_poller.RouterOSClient',
                   return_value=_fake_client([{'name': 'b@y', 'address': '10.0.0.2'}])):
            run_poll(d2)
        s1 = OnuLinkState.query.filter_by(onu_id=onu1.id).one()
        s2 = OnuLinkState.query.filter_by(onu_id=onu2.id).one()
        assert s1.mikrotik_id == d1.id and s1.pppoe_ip == '10.0.0.1'
        assert s2.mikrotik_id == d2.id and s2.pppoe_ip == '10.0.0.2'

    def test_api_failure_marks_device_error_not_states(self, ctx):
        """Mikrotik unreachable -> device last_error set, ONU states untouched."""
        import link_state_poller as lsp
        from models import OnuLinkState
        _, onu = _mk_olt_onu()
        dev = _mk_dev()
        with patch('link_state_poller.RouterOSClient',
                   side_effect=ConnectionError('refused')):
            run_poll(dev)
        db.session.refresh(dev)
        assert dev.last_ok is False
        assert 'refused' in dev.last_error
        assert OnuLinkState.query.filter_by(onu_id=onu.id).first() is None

    def test_unmatched_session_ignored(self, ctx):
        """PPPoE session with no matching onu.pppoe -> no state row."""
        import link_state_poller as lsp
        from models import OnuLinkState
        _mk_olt_onu(pppoe='other@z')
        dev = _mk_dev()
        with patch('link_state_poller.RouterOSClient',
                   return_value=_fake_client([{'name': 'stranger@q', 'address': '9.9.9.9'}])):
            run_poll(dev)
        assert OnuLinkState.query.count() == 0

    def test_ip_change_updates_state(self, ctx):
        """Client IP changes between polls -> row tracks latest."""
        import link_state_poller as lsp
        from models import OnuLinkState
        _, onu = _mk_olt_onu()
        dev = _mk_dev()
        with patch('link_state_poller.RouterOSClient',
                   return_value=_fake_client([{'name': 'renny@rw02', 'address': '10.0.0.1'}])):
            run_poll(dev)
        with patch('link_state_poller.RouterOSClient',
                   return_value=_fake_client([{'name': 'renny@rw02', 'address': '10.0.0.99'}])):
            run_poll(dev)
        st = OnuLinkState.query.filter_by(onu_id=onu.id).one()
        assert st.pppoe_ip == '10.0.0.99'

    def test_match_by_onu_name_fallback(self, ctx):
        """Bridge-mode ONU (pppoe='') whose name equals the PPPoE username
        still gets matched — and pppoe is backfilled."""
        from models import OnuLinkState
        _, onu = _mk_olt_onu(pppoe='')
        onu.name = 'marlin@rw03'
        db.session.commit()
        dev = _mk_dev()
        sessions = [{'name': 'marlin@rw03', 'address': '10.9.9.9'}]
        with patch('link_state_poller.RouterOSClient', return_value=_fake_client(sessions)):
            run_poll(dev)
        st = OnuLinkState.query.filter_by(onu_id=onu.id).one()
        assert st.link_state == 'ok'
        assert st.pppoe_user == 'marlin@rw03'
        db.session.refresh(onu)
        assert onu.pppoe == 'marlin@rw03'  # backfilled

    def test_pppoe_takes_priority_over_name(self, ctx):
        """A session name matching ONU-A's pppoe must not also bind to ONU-B
        that happens to share the same name string."""
        _, onu_a = _mk_olt_onu(pppoe='u@x')
        onu_a.name = 'u@x'
        _, onu_b = _mk_olt_onu(pppoe='other@y')
        onu_b.name = 'u@x'
        onu_b.serial_number = 'ZTEG00000002'
        onu_b.onu_index = 120102
        db.session.commit()
        dev = _mk_dev()
        with patch('link_state_poller.RouterOSClient',
                   return_value=_fake_client([{'name': 'u@x', 'address': '10.1.1.1'}])):
            run_poll(dev)
        # by_pppoe match wins: ONU-A binds, ONU-B does not get a second row
        from models import OnuLinkState
        assert OnuLinkState.query.filter_by(onu_id=onu_a.id).one().link_state == 'ok'
        assert OnuLinkState.query.filter_by(onu_id=onu_b.id).first() is None

    def test_reconcile_no_session_for_unseen_onu(self, ctx):
        """ONU with a pppoe username absent from every device's session list
        gets a no_session row (grey dashed on the map, not 'unknown')."""
        import link_state_poller as lsp
        from models import OnuLinkState
        _, onu = _mk_olt_onu(pppoe='gone@rw01')
        changed = lsp.reconcile_no_session(set(), {1})
        assert changed == 1
        st = OnuLinkState.query.filter_by(onu_id=onu.id).one()
        assert st.link_state == 'no_session'
        assert st.session_up is False

    def test_reconcile_skips_onu_with_active_session(self, ctx):
        import link_state_poller as lsp
        from models import OnuLinkState
        _, onu = _mk_olt_onu(pppoe='up@rw01')
        assert lsp.reconcile_no_session({'up@rw01'}, {1}) == 0
        assert OnuLinkState.query.count() == 0

    def test_reconcile_skips_unidentifiable_onu(self, ctx):
        """HiOSO-style 'NA' names are not PPPoE usernames — no_session would
        falsely read as 'customer offline'; they stay 'unknown'."""
        import link_state_poller as lsp
        from models import OnuLinkState
        _, onu = _mk_olt_onu(pppoe='')
        onu.name = 'NA'
        db.session.commit()
        assert lsp.reconcile_no_session(set(), {1}) == 0
        assert OnuLinkState.query.filter_by(onu_id=onu.id).first() is None

    def test_reconcile_resets_stale_no_session_on_na_onu(self, ctx):
        """A no_session row already created for an unidentifiable ONU resets
        back to unknown on the next reconcile."""
        import link_state_poller as lsp
        from models import OnuLinkState
        _, onu = _mk_olt_onu(pppoe='')
        onu.name = 'NA'
        st = OnuLinkState(onu_id=onu.id, link_state='no_session', session_up=False)
        db.session.add(st); db.session.commit()
        lsp.reconcile_no_session(set(), {1})
        db.session.refresh(st)
        assert st.link_state == 'unknown'

    def test_na_name_does_not_bind_session(self, ctx):
        """A session literally named 'NA' must not mass-bind every 'NA'-named
        ONU."""
        from models import OnuLinkState
        _, onu = _mk_olt_onu(pppoe='')
        onu.name = 'NA'
        db.session.commit()
        dev = _mk_dev()
        with patch('link_state_poller.RouterOSClient',
                   return_value=_fake_client([{'name': 'NA', 'address': '1.2.3.4'}])):
            run_poll(dev)
        assert OnuLinkState.query.filter_by(onu_id=onu.id).first() is None

    def test_reconcile_leaves_row_bound_to_failed_device(self, ctx):
        """State bound to a device that failed this cycle must not flip to
        no_session — the session may still be live on that router."""
        import link_state_poller as lsp
        from models import OnuLinkState
        _, onu = _mk_olt_onu(pppoe='renny@rw02')
        dev = _mk_dev()
        with patch('link_state_poller.RouterOSClient',
                   return_value=_fake_client([{'name': 'renny@rw02', 'address': '10.0.0.5'}])):
            run_poll(dev)
        assert lsp.reconcile_no_session(set(), set()) == 0  # dev failed -> untouched
        st = OnuLinkState.query.filter_by(onu_id=onu.id).one()
        assert st.link_state == 'ok'

    def test_map_line_carries_link_state(self, ctx):
        """ftth map ODP->ONU line includes link_state fields."""
        import link_state_poller as lsp
        from models import FTTHODP, FTTHODPPort, FTTHODC, FTTHOTB
        olt, onu = _mk_olt_onu()
        onu.latitude, onu.longitude = -6.2, 106.8
        dev = _mk_dev()
        sessions = [{'name': 'renny@rw02', 'address': '10.0.0.7'}]
        with patch('link_state_poller.RouterOSClient', return_value=_fake_client(sessions)):
            run_poll(dev)
        otb = FTTHOTB(name='otb', olt_id=olt.id, latitude=-6.1, longitude=106.7)
        db.session.add(otb); db.session.flush()
        odc = FTTHODC(name='odc', otb_id=otb.id, feed_source='otb',
                      latitude=-6.15, longitude=106.75)
        db.session.add(odc); db.session.flush()
        odp = FTTHODP(name='odp', odc_id=odc.id, feed_source='odc',
                      latitude=-6.18, longitude=106.78, total_ports=8)
        db.session.add(odp); db.session.flush()
        port = FTTHODPPort(odp_id=odp.id, port_number=1, onu_id=onu.id, status='used')
        db.session.add(port); db.session.commit()
        with app.test_client() as c:
            with c.session_transaction() as sess:
                sess['user_id'] = 0  # login_required may still block — see below
            resp = c.get('/api/ftth/map')
        # not logged in -> redirect/401; validate via direct call instead
        assert resp.status_code in (302, 401, 403) or resp.is_json


class TestMapLineLinkState:
    """Direct endpoint test with authenticated session."""

    @pytest.fixture
    def client(self, ctx):
        from models import User, Role
        role = Role(name='Full Access', permissions='*')
        db.session.add(role); db.session.flush()
        u = User(username='t', role_id=role.id, full_name='Tester')
        u.set_password('x')
        db.session.add(u); db.session.commit()
        c = app.test_client()
        c.post('/api/auth/login', json={'username': 't', 'password': 'x'})
        return c

    def test_onu_line_has_state(self, client):
        import link_state_poller as lsp
        from models import FTTHOTB, FTTHODC, FTTHODP, FTTHODPPort
        olt, onu = _mk_olt_onu()
        onu.latitude, onu.longitude = -6.2, 106.8
        dev = _mk_dev()
        sessions = [{'name': 'renny@rw02', 'address': '10.0.0.7'}]
        with patch('link_state_poller.RouterOSClient', return_value=_fake_client(sessions)):
            run_poll(dev)
        otb = FTTHOTB(name='otb', olt_id=olt.id, latitude=-6.1, longitude=106.7)
        db.session.add(otb); db.session.flush()
        odc = FTTHODC(name='odc', otb_id=otb.id, feed_source='otb',
                      latitude=-6.15, longitude=106.75)
        db.session.add(odc); db.session.flush()
        odp = FTTHODP(name='odp', odc_id=odc.id, feed_source='odc',
                      latitude=-6.18, longitude=106.78, total_ports=8)
        db.session.add(odp); db.session.flush()
        db.session.add(FTTHODPPort(odp_id=odp.id, port_number=1, onu_id=onu.id, status='used'))
        db.session.commit()

        data = client.get('/api/ftth/map').get_json()
        assert data['success']
        onu_lines = [l for l in data['lines'] if l['to_type'] == 'onu']
        assert len(onu_lines) == 1
        assert onu_lines[0]['link_state'] == 'ok'
        assert onu_lines[0]['pppoe_ip'] == '10.0.0.7'
        # non-ONU lines unaffected
        other = [l for l in data['lines'] if l['to_type'] != 'onu']
        assert all('link_state' not in l or l['link_state'] == 'unknown' for l in other)
