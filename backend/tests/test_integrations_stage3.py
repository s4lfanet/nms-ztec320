"""Tahap 3 integrasi: kesehatan router MikroTik + alert, GenieACS fault/stale/auto-sync,
data tambahan modem (RX modem, perangkat terhubung, kanal)."""
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from app import app, db
from tests.test_link_state import ctx, _mk_olt_onu, _mk_dev  # noqa: F401
import genieacs_client as gc


class _R:
    def __init__(self, data, status=200):
        self._d, self.status_code, self.text = data, status, json.dumps(data)

    def json(self):
        return self._d


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _cfg(k, v):
    from models import SystemConfig
    db.session.add(SystemConfig(key=k, value=v)); db.session.commit()


def test_read_health_v6_and_v7(ctx):
    import link_state_poller as lsp
    dev = _mk_dev()
    cli = MagicMock()
    cli.get_resource.return_value = {'cpu-load': '37', 'free-memory': '256000000', 'total-memory': '1024000000',
                                     'uptime': '3w2d', 'version': '7.16.1 (stable)', 'board-name': 'CCR1072'}
    cli.get_health.return_value = {'cpu-temperature': '58', 'voltage': '24'}
    lsp.read_health(dev, cli)
    assert dev.cpu_load == 37 and dev.mem_used_pct == 75.0 and dev.temperature == 58.0
    assert dev.board == 'CCR1072' and dev.ros_uptime == '3w2d'
    # REST v7: baris name/value
    from routeros_client import RouterOSClient
    c = RouterOSClient('h', api_mode='rest')
    c._rest = lambda m, p, **k: [{'name': 'temperature', 'value': '44', 'type': 'C'}] if 'health' in p else {}
    assert c.get_health() == {'temperature': '44'}


def test_mikrotik_down_cpu_temp_alerts_and_recovery(ctx):
    from models import Notification
    from integration_health import check_mikrotik_health
    dev = _mk_dev(name='CCR-A')
    now = _now()
    dev.last_polled_at, dev.last_ok, dev.last_ok_at = now, False, now - timedelta(minutes=10)
    db.session.commit()
    notifs, alerts = [], []
    check_mikrotik_health(now, notifs, alerts)
    assert [n['category'] for n in notifs] == ['mikrotik_down'] and alerts[0]['severity'] == 'critical'
    for n in notifs:
        db.session.add(Notification(**n))
    db.session.commit()
    # pulih + CPU tinggi 3 siklus + suhu tinggi
    dev.last_ok, dev.last_ok_at, dev.cpu_load, dev.temperature = True, now, 95, 75.0
    db.session.commit()
    cats = []
    for _ in range(3):
        notifs, alerts = [], []
        check_mikrotik_health(now, notifs, alerts)
        for n in notifs:
            db.session.add(Notification(**n))
        db.session.commit()
        cats.append(sorted(a['type'] for a in alerts))
    assert cats[0] == ['mikrotik_down_recovery', 'mikrotik_temp']
    assert cats[1] == [] and cats[2] == ['mikrotik_cpu']
    assert Notification.query.filter_by(category='mikrotik_down').one().resolved is True


def test_sync_sets_last_inform_and_stale_and_diagnosis(ctx, monkeypatch):
    from models import GenieacsDeviceMap
    from diagnosis import diagnose_onu
    _, onu = _mk_olt_onu()
    onu.serial_number = 'ZTEGC0FFEE01'
    db.session.commit()
    old = (datetime.now(timezone.utc) - timedelta(hours=50)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    monkeypatch.setattr(gc.httpx, 'get', lambda *a, **k: _R(
        [{'_id': 'ZTE-F663-ZTEGC0FFEE01', '_lastInform': old}] if k.get('params', {}).get('skip', 0) == 0 else []))
    _cfg('genieacs_nbi_url', 'http://acs:7557')
    matched, total, _ = gc.sync_device_maps()
    assert matched == 1
    m = GenieacsDeviceMap.query.one()
    assert m.last_inform is not None and (_now() - m.last_inform) > timedelta(hours=49)
    hours, rows = gc.stale_devices()
    assert hours == 24 and rows[0]['onu_id'] == onu.id
    assert any(f['code'] == 'acs_stale' for f in diagnose_onu(onu)['findings'])


def test_faults_endpoint_maps_onu_and_delete(ctx, monkeypatch):
    from models import User, GenieacsDeviceMap
    _, onu = _mk_olt_onu()
    db.session.add(GenieacsDeviceMap(onu_id=onu.id, device_id='DEV-1'))
    u = User(username='acs3', full_name='a', is_super_admin=True)
    u.set_password('x-' + str(onu.id) + '-acs3')
    db.session.add(u)
    _cfg('genieacs_nbi_url', 'http://acs:7557')
    monkeypatch.setattr(gc.httpx, 'get', lambda *a, **k: _R([
        {'_id': 'DEV-1:task_x', 'device': 'DEV-1', 'channel': 'task_x', 'code': 'cwmp.9002',
         'detail': {'faultString': 'Internal error'}, 'retries': 2, 'timestamp': '2026-11-23T01:00:00Z'}]))
    deleted = []
    monkeypatch.setattr(gc.httpx, 'delete', lambda url, auth=None, timeout=None: deleted.append(url) or _R({}, 200))
    with app.test_client() as c:
        with c.session_transaction() as sess:
            sess['_user_id'] = str(u.id); sess['_fresh'] = True
        H = {'X-Requested-With': 'XMLHttpRequest'}
        r = c.get('/api/genieacs/faults', headers=H).get_json()
        f = r['faults'][0]
        assert f['onu_id'] == onu.id and f['message'] == 'Internal error' and f['code'] == 'cwmp.9002'
        assert c.delete('/api/genieacs/faults/DEV-1:task_x', headers=H).get_json()['success']
    assert deleted[0].endswith('/faults/DEV-1%3Atask_x')


def test_extra_modem_data(ctx, monkeypatch):
    doc = {'_id': 'OUI-F670-SN9', 'InternetGatewayDevice': {
        'WANDevice': {'1': {'X_ZTE-COM_WANPONInterfaceConfig': {'RXPower': {'_value': -2150}}}},
        'LANDevice': {'1': {
            'WLANConfiguration': {'1': {'SSID': {'_value': 'RUMAH'}, 'Enable': {'_value': True},
                                        'SSIDAdvertisementEnabled': {'_value': True}, 'Channel': {'_value': 6}}},
            'Hosts': {'Host': {'1': {'HostName': {'_value': 'HP-Ani'}, 'IPAddress': {'_value': '192.168.1.5'},
                                     'MACAddress': {'_value': 'aa:bb'}, 'InterfaceType': {'_value': '802.11'},
                                     'Active': {'_value': True}}}}}}}}
    monkeypatch.setattr(gc.httpx, 'get', lambda *a, **k: _R([doc]))
    _cfg('genieacs_nbi_url', 'http://acs:7557')
    p = gc.get_device_params('OUI-F670-SN9')
    assert p['optical_rx_dbm'] == -21.5
    assert p['ssids'][0]['channel'] == 6
    assert p['hosts'][0] == {'name': 'HP-Ani', 'ip': '192.168.1.5', 'mac': 'aa:bb', 'via': 'wifi', 'active': True}
    assert gc._to_dbm(-21500) == -21.5 and gc._to_dbm(-19.3) == -19.3 and gc._to_dbm('x') is None
