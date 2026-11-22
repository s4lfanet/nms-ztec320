"""Tahap 1 audit integrasi: kredensial terenkripsi, GenieACS ringan (projection),
TR-181, status 'antre', hitungan klien, PPPoE path lengkap."""
import json
import secrets

from app import app, db
from models import User, Role, OLT, ONU, SystemConfig, GenieacsDeviceMap, MikrotikDevice
from tests.test_alert_correlation import client  # noqa: F401  (fixture)
import genieacs_client as gc

H = {'X-Requested-With': 'XMLHttpRequest'}
P1, P2, P3, P4 = (secrets.token_hex(6) for _ in range(4))


class _R:
    def __init__(self, data, status=200):
        self._d, self.status_code, self.text = data, status, json.dumps(data)

    def json(self):
        return self._d


def _login_admin(client):
    with app.app_context():
        role = Role(name='acs-admin', permissions='genieacs_manage,settings_ip_olts')
        db.session.add(role); db.session.flush()
        u = User(username='acsadmin', full_name='A', role_id=role.id, is_super_admin=True)
        u.set_password(secrets.token_hex(8))
        db.session.add(u); db.session.commit()
        uid = u.id
    with client.session_transaction() as sess:
        sess['_user_id'] = str(uid)
        sess['_fresh'] = True


def _cfg(key, value):
    db.session.add(SystemConfig(key=key, value=value))
    db.session.commit()


def test_mikrotik_password_encrypted_and_legacy_migrated(client):
    with app.app_context():
        d = MikrotikDevice(name='R1', host='10.0.0.1', api_user='u', api_password=P1)
        db.session.add(d); db.session.commit()
        raw = db.session.execute(db.text('SELECT api_password FROM mikrotik_devices')).scalar()
        assert raw != P1 and raw.startswith('gAAAAA')
        assert db.session.get(MikrotikDevice, d.id).api_password == P1
        # data lama polos → tetap terbaca, lalu dienkripsi oleh migrasi
        db.session.execute(db.text('UPDATE mikrotik_devices SET api_password=:v'), {'v': P2})
        _cfg('genieacs_nbi_password', P3)
        db.session.expire_all()
        assert db.session.get(MikrotikDevice, d.id).api_password == P2
        from secrets_migration import encrypt_legacy_secrets
        assert encrypt_legacy_secrets() == 2
        assert encrypt_legacy_secrets() == 0  # idempoten
        raw = db.session.execute(db.text('SELECT api_password FROM mikrotik_devices')).scalar()
        assert raw.startswith('gAAAAA')
        db.session.expire_all()
        assert db.session.get(MikrotikDevice, d.id).api_password == P2
        _url, _u, pwd = gc._nbi_config()
        assert pwd == P3


def test_genieacs_password_saved_encrypted(client):
    _login_admin(client)
    r = client.post('/api/genieacs/settings', headers=H, json={'nbi_url': 'http://acs:7557', 'nbi_user': 'a',
                                                               'nbi_password': P4})
    assert r.status_code == 200
    with app.app_context():
        row = SystemConfig.query.filter_by(key='genieacs_nbi_password').first()
        assert row.value.startswith('gAAAAA')
        assert gc._nbi_config()[2] == P4


def test_fetch_devices_uses_projection_and_paging(client, monkeypatch):
    calls = []
    page1 = [{'_id': f'OUI-MODEL-SN{i:04d}', 'InternetGatewayDevice': {}} for i in range(gc._PAGE)]
    page2 = [{'_id': 'OUI-HG8-485754430000ABCD',
              'Device': {'DeviceInfo': {'ModelName': {'_value': 'HG8145X6'}}}}]

    def fake_get(url, params=None, auth=None, timeout=None):
        calls.append(params)
        return _R(page1 if params['skip'] == 0 else page2)
    monkeypatch.setattr(gc.httpx, 'get', fake_get)
    with app.app_context():
        _cfg('genieacs_nbi_url', 'http://acs:7557')
        devs = gc.fetch_devices()
    assert len(devs) == gc._PAGE + 1 and len(calls) == 2
    assert all('projection' in c and '_id' in c['projection'] for c in calls)
    last = devs[-1]
    assert last['model'] == 'HG8145X6' and last['serial'] == 'HWTC0000ABCD'
    assert gc._DM_CACHE['OUI-HG8-485754430000ABCD'] == 'tr181'


TR181_DOC = {
    '_id': 'OUI-EG8-SN1', '_lastInform': '2026-11-23T01:00:00Z',
    'Device': {
        'DeviceInfo': {'ModelName': {'_value': 'EG8145'}, 'SoftwareVersion': {'_value': 'V5'},
                       'UpTime': {'_value': 3600}},
        'PPP': {'Interface': {'1': {'Username': {'_value': 'budi@rw01'}, 'ConnectionStatus': {'_value': 'Connected'},
                                    'IPCP': {'LocalIPAddress': {'_value': '100.64.1.2'}}, 'Enable': {'_value': True}}}},
        'WiFi': {'Radio': {'1': {'OperatingFrequencyBand': {'_value': '2.4GHz'}},
                           '2': {'OperatingFrequencyBand': {'_value': '5GHz'}}},
                 'SSID': {'1': {'SSID': {'_value': 'BUDI'}, 'Enable': {'_value': True},
                                'LowerLayers': {'_value': 'Device.WiFi.Radio.1.'}},
                          '2': {'SSID': {'_value': 'BUDI-5G'}, 'Enable': {'_value': True},
                                'LowerLayers': {'_value': 'Device.WiFi.Radio.2.'}}}},
        'Hosts': {'Host': {'1': {'Active': {'_value': True}}, '2': {'Active': {'_value': False}},
                           '3': {'Active': {'_value': True}}}},
    }}


def test_tr181_params_and_writes(client, monkeypatch):
    posts = []
    monkeypatch.setattr(gc.httpx, 'get', lambda *a, **k: _R([TR181_DOC]))
    monkeypatch.setattr(gc.httpx, 'post', lambda url, json=None, auth=None, timeout=None:
                        posts.append(json) or _R({}, 200))
    with app.app_context():
        _cfg('genieacs_nbi_url', 'http://acs:7557')
        gc._DM_CACHE.clear()
        p = gc.get_device_params('OUI-EG8-SN1')
        assert p['data_model'] == 'tr181' and p['model'] == 'EG8145'
        assert p['pppoe_username'] == 'budi@rw01' and p['wan_ip'] == '100.64.1.2'
        assert [(s['ssid'], s['band']) for s in p['ssids']] == [('BUDI', '2.4g'), ('BUDI-5G', '5g')]
        assert p['wifi_clients'] == 2
        ok, _ = gc.set_wifi_ssid('OUI-EG8-SN1', 'BARU', P1, index=2)
        assert ok and posts[-1]['parameterValues'][0][0] == 'Device.WiFi.SSID.2.SSID'
        assert posts[-1]['parameterValues'][-1][0] == 'Device.WiFi.AccessPoint.2.Security.KeyPassphrase'
        gc.refresh_params('OUI-EG8-SN1')
        assert posts[-1]['objectName'] == 'Device.'
        ok, _ = gc.set_pppoe('OUI-EG8-SN1', 'baru@rw', P2)
        assert ok and posts[-1]['parameterValues'][0][0] == 'Device.PPP.Interface.1.Username'
        ok, msg = gc.add_wan('OUI-EG8-SN1', 'pppoe', '100', 'x', P3)
        assert not ok and 'TR-181' in msg


def test_tr098_pppoe_full_path_and_client_count(client, monkeypatch):
    doc = {'_id': 'OUI-F663-SN2', 'InternetGatewayDevice': {
        'DeviceInfo': {'ModelName': {'_value': 'F663'}},
        'WANDevice': {'1': {'WANConnectionDevice': {'2': {'WANPPPConnection': {'1': {
            'Username': {'_value': 'ani@rw'}}}}}}},
        'LANDevice': {'1': {'Hosts': {'Host': {'1': {'HostName': {'_value': 'hp'}},
                                                '2': {'HostName': {'_value': 'tv'}}}}}}}}
    posts = []
    monkeypatch.setattr(gc.httpx, 'get', lambda *a, **k: _R([doc]))
    monkeypatch.setattr(gc.httpx, 'post', lambda url, json=None, auth=None, timeout=None:
                        posts.append(json) or _R({}, 200))
    with app.app_context():
        _cfg('genieacs_nbi_url', 'http://acs:7557')
        gc._DM_CACHE.clear()
        assert gc.get_device_params('OUI-F663-SN2')['wifi_clients'] == 2
        gc.set_pppoe('OUI-F663-SN2', 'ani2@rw', None)
        assert posts[-1]['parameterValues'][0][0] == \
            'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username'


def test_task_queued_is_reported(client, monkeypatch):
    _login_admin(client)
    with app.app_context():
        _cfg('genieacs_nbi_url', 'http://acs:7557')
        olt = OLT(name='O', ip_address='10.1.1.1')
        db.session.add(olt); db.session.flush()
        onu = ONU(olt_id=olt.id, frame=1, slot=1, port=1, onu_id=1, serial_number='ZTEG1', status='online')
        db.session.add(onu); db.session.flush()
        db.session.add(GenieacsDeviceMap(onu_id=onu.id, device_id='OUI-F663-SN3'))
        db.session.commit()
        oid = onu.id
    monkeypatch.setattr(gc.httpx, 'post', lambda *a, **k: _R({}, 202))
    r = client.post(f'/api/onu/{oid}/tr069/reboot', headers=H).get_json()
    assert r['success'] and r['queued'] and 'antre' in r['message']
    monkeypatch.setattr(gc.httpx, 'post', lambda *a, **k: _R({}, 200))
    r = client.post(f'/api/onu/{oid}/tr069/reboot', headers=H).get_json()
    assert r['success'] and not r['queued']
