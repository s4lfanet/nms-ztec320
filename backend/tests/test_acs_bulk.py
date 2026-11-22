"""Operasi massal TR-069: filter target, pratinjau, guard konfirmasi/maks/1 job, eksekusi & batal."""
import json
import secrets

from app import app, db
from models import OLT, ONU, GenieacsDeviceMap, User, AcsBulkJob, AcsBulkJobItem, FTTHODP, FTTHODPPort
from tests.test_link_state import ctx  # noqa: F401
import acs_bulk
import genieacs_client as gc

H = {'X-Requested-With': 'XMLHttpRequest'}


class _R:
    def __init__(self, data, status=200):
        self._d, self.status_code, self.text = data, status, json.dumps(data)

    def json(self):
        return self._d


def _seed():
    from models import SystemConfig
    db.session.add(SystemConfig(key='genieacs_nbi_url', value='http://acs:7557'))
    olt = OLT(name='C320', ip_address='10.0.0.9')
    olt2 = OLT(name='HIOSO', ip_address='10.0.0.8')
    db.session.add_all([olt, olt2]); db.session.flush()
    onus = []
    for i, (o, model, st) in enumerate([(olt, 'F663', 'online'), (olt, 'F663', 'online'), (olt, 'F670', 'online'),
                                         (olt, 'F663', 'los'), (olt2, 'F663', 'online')], start=1):
        x = ONU(olt_id=o.id, frame=1, slot=1, port=1, onu_id=i, name=f'p{i}', actual_type=model, status=st,
                serial_number=f'SN{i}')
        db.session.add(x); db.session.flush()
        db.session.add(GenieacsDeviceMap(onu_id=x.id, device_id=f'DEV-{i}'))
        onus.append(x)
    db.session.add(ONU(olt_id=olt.id, frame=1, slot=1, port=1, onu_id=9, name='tanpa-acs', status='online'))
    odp = FTTHODP(name='ODP-A', total_ports=4)
    db.session.add(odp); db.session.flush()
    db.session.add_all([FTTHODPPort(odp_id=odp.id, port_number=1, onu_id=onus[0].id, status='used'),
                        FTTHODPPort(odp_id=odp.id, port_number=2, onu_id=onus[2].id, status='used')])
    db.session.commit()
    return olt, odp, onus


def test_filters_and_preview(ctx):
    olt, odp, _ = _seed()
    names = lambda f: [o.name for o, _m in acs_bulk.select_targets(f)]
    assert names({}) == ['p1', 'p2', 'p3', 'p5']                 # default online saja, hanya yang terpetakan
    assert names({'olt_id': olt.id, 'model': 'F663'}) == ['p1', 'p2']
    assert names({'node_type': 'odp', 'node_id': odp.id}) == ['p1', 'p3']
    assert names({'status': 'all', 'model': 'F663'}) == ['p1', 'p2', 'p4', 'p5']
    pv = acs_bulk.preview({'olt_id': olt.id})
    assert pv['count'] == 3 and not pv['too_many'] and pv['items'][0]['model'] == 'F663'


def test_validate_action():
    assert acs_bulk.validate_action('nuke', {})
    assert acs_bulk.validate_action('inform_interval', {'seconds': 10})
    assert acs_bulk.validate_action('inform_interval', {'seconds': 3600}) is None
    assert acs_bulk.validate_action('firmware', {})
    assert acs_bulk.validate_action('set_param', {'path': 'Foo.Bar'})
    assert acs_bulk.validate_action('set_param', {'path': 'InternetGatewayDevice.ManagementServer.'})
    assert acs_bulk.validate_action('set_param', {'path': 'Device.ManagementServer.PeriodicInformInterval',
                                                  'type': 'xsd:unsignedInt'}) is None


def test_run_job_records_results(ctx, monkeypatch):
    olt, _odp, _ = _seed()
    sent = []

    def fake_post(url, json=None, auth=None, timeout=None):
        sent.append((url, json))
        return _R({}, 202 if 'DEV-2' in url else (500 if 'DEV-3' in url else 200))
    monkeypatch.setattr(gc.httpx, 'post', fake_post)
    monkeypatch.setattr(gc, 'data_model', lambda d: 'tr098')
    monkeypatch.setattr(acs_bulk, 'PAUSE_S', 0)
    job = acs_bulk.create_job({'olt_id': olt.id}, 'inform_interval', {'seconds': 3600}, 'admin')
    acs_bulk.run_job(app, job.id)
    db.session.expire_all()
    j = db.session.get(AcsBulkJob, job.id)
    assert (j.status, j.total, j.done, j.queued, j.failed) == ('finished', 3, 1, 1, 1)
    pv = sent[0][1]['parameterValues']
    assert pv[1] == ['InternetGatewayDevice.ManagementServer.PeriodicInformInterval', 3600, 'xsd:unsignedInt']
    st = {i.onu_name: i.status for i in AcsBulkJobItem.query.filter_by(job_id=job.id)}
    assert st == {'p1': 'done', 'p2': 'queued', 'p3': 'failed'}


def test_run_endpoint_guards_and_cancel(ctx, monkeypatch):
    olt, _odp, _ = _seed()
    u = User(username='bulk', full_name='b', is_super_admin=True)
    u.set_password(secrets.token_hex(8))
    db.session.add(u); db.session.commit()
    started = []
    monkeypatch.setattr(acs_bulk, 'start_job', lambda app_, jid: started.append(jid))
    with app.test_client() as c:
        with c.session_transaction() as sess:
            sess['_user_id'] = str(u.id); sess['_fresh'] = True
        body = {'filters': {'olt_id': olt.id}, 'action': 'reboot', 'params': {}}
        pv = c.post('/api/genieacs/bulk/preview', headers=H, json={'filters': body['filters']}).get_json()
        assert pv['count'] == 3
        r = c.post('/api/genieacs/bulk/run', headers=H, json=dict(body, confirm_count=2))
        assert r.status_code == 409 and 'berubah' in r.get_json()['message']
        r = c.post('/api/genieacs/bulk/run', headers=H, json=dict(body, action='firmware', confirm_count=3))
        assert r.status_code == 400
        monkeypatch.setattr(acs_bulk, 'MAX_TARGETS', 2)
        assert c.post('/api/genieacs/bulk/run', headers=H, json=dict(body, confirm_count=3)).status_code == 400
        monkeypatch.setattr(acs_bulk, 'MAX_TARGETS', 500)
        r = c.post('/api/genieacs/bulk/run', headers=H, json=dict(body, confirm_count=3)).get_json()
        assert r['success'] and started == [r['job']['id']]
        # job 'running' tanpa thread hidup (mis. setelah restart) → dirapikan, tidak mengunci
        jobs = c.get('/api/genieacs/bulk/jobs', headers=H).get_json()['jobs']
        assert jobs[0]['status'] == 'cancelled'
        d = c.get(f"/api/genieacs/bulk/jobs/{r['job']['id']}", headers=H).get_json()['job']
        assert {i['status'] for i in d['items']} == {'skipped'}
        assert c.post(f"/api/genieacs/bulk/jobs/{r['job']['id']}/cancel", headers=H).get_json()['success']


def test_list_files(ctx, monkeypatch):
    _seed()
    monkeypatch.setattr(gc.httpx, 'get', lambda *a, **k: _R([
        {'_id': 'F663N_V9.0.bin', 'length': 1000, 'metadata': {'fileType': '1 Firmware Upgrade Image',
                                                               'oui': 'ZTE', 'productClass': 'F663N', 'version': 'V9'}}]))
    f = acs_bulk.list_files()
    assert f[0]['name'] == 'F663N_V9.0.bin' and f[0]['product_class'] == 'F663N'
