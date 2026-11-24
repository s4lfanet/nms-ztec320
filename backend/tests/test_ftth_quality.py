"""FTTH Tahap 1: core ganda ditolak, kapasitas core, laporan kualitas data,
hitungan yatim, PON vs jalur fisik, trace memilih PON sesuai core."""
import secrets

from app import app, db
from models import (User, OLT, ONU, FTTHOTB, FTTHODC, FTTHODP, FTTHODPPort, FTTHJC,
                    FTTHJCSplice, FTTHPonPort, FTTHFiberCore)
from tests.test_link_state import ctx  # noqa: F401

H = {'X-Requested-With': 'XMLHttpRequest'}


def _client():
    u = User(username='q' + secrets.token_hex(3), full_name='q', is_super_admin=True)
    u.set_password(secrets.token_hex(8))
    db.session.add(u); db.session.commit()
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['_user_id'] = str(u.id); sess['_fresh'] = True
    return c


def _base():
    olt = OLT(name='OLT-A', ip_address='10.9.0.1', vendor='zte', model='C320')
    db.session.add(olt); db.session.flush()
    otb = FTTHOTB(name='OTB-1', total_cores=12)
    db.session.add(otb); db.session.flush()
    db.session.add_all([
        FTTHPonPort(olt_id=olt.id, frame=1, slot=1, port=1, pon_name='gpon-olt_1/1/1', otb_id=otb.id, otb_core_number=1),
        FTTHPonPort(olt_id=olt.id, frame=1, slot=1, port=2, pon_name='gpon-olt_1/1/2', otb_id=otb.id, otb_core_number=2),
    ])
    db.session.commit()
    return olt, otb


def test_odc_core_conflict_and_range(ctx):
    _olt, otb = _base()
    c = _client()
    r = c.post('/api/ftth/odc', headers=H, json={'name': 'ODC-A', 'feed_source': 'otb', 'otb_id': otb.id, 'otb_core_number': 2})
    assert r.get_json()['success']
    dup = c.post('/api/ftth/odc', headers=H, json={'name': 'ODC-B', 'feed_source': 'otb', 'otb_id': otb.id, 'otb_core_number': 2})
    assert dup.status_code == 400 and 'ODC-A' in dup.get_json()['message']
    over = c.post('/api/ftth/odc', headers=H, json={'name': 'ODC-C', 'feed_source': 'otb', 'otb_id': otb.id, 'otb_core_number': 13})
    assert over.status_code == 400 and 'kapasitas' in over.get_json()['message']
    # Edit field lain pada ODC yang sama tetap boleh; pindah ke core kosong boleh
    odc_a = FTTHODC.query.filter_by(name='ODC-A').first()
    assert c.put(f'/api/ftth/odc/{odc_a.id}', headers=H, json={'description': 'x'}).get_json()['success']
    assert c.put(f'/api/ftth/odc/{odc_a.id}', headers=H, json={'otb_core_number': 3}).get_json()['success']


def test_odp_and_pon_core_conflicts(ctx):
    _olt, otb = _base()
    odc = FTTHODC(name='ODC-1', otb_id=otb.id, otb_core_number=1, total_cores=8)
    db.session.add(odc); db.session.commit()
    c = _client()
    assert c.post('/api/ftth/odp', headers=H, json={'name': 'ODP-1', 'feed_source': 'odc', 'odc_id': odc.id, 'odc_core_number': 1}).get_json()['success']
    r = c.post('/api/ftth/odp', headers=H, json={'name': 'ODP-2', 'feed_source': 'odc', 'odc_id': odc.id, 'odc_core_number': 1})
    assert r.status_code == 400 and 'ODP-1' in r.get_json()['message']
    pon = c.post('/api/ftth/pon', headers=H, json={'olt_id': _olt.id, 'slot': 1, 'port': 3, 'otb_id': otb.id, 'otb_core_number': 1})
    assert pon.status_code == 400 and 'PON' in pon.get_json()['message']
    # PON core N dan ODC core N di OTB yang sama itu normal (ODC-1 sudah di core 1 bersama PON 1/1/1)


def test_jc_core_conflict_and_splice_range(ctx):
    _olt, otb = _base()
    jc = FTTHJC(name='JC-1', total_cores=4, parent_type='otb', parent_id=otb.id)
    db.session.add(jc); db.session.commit()
    c = _client()
    over = c.post(f'/api/ftth/jc/{jc.id}/splice', headers=H, json={'core_in': 1, 'core_out': 5})
    assert over.status_code == 400
    assert c.post(f'/api/ftth/jc/{jc.id}/splice', headers=H, json={'core_in': 1, 'core_out': 1}).get_json()['success']
    assert c.post('/api/ftth/odc', headers=H, json={'name': 'ODC-J', 'feed_source': 'jc', 'jc_id': jc.id, 'jc_core_number': 1}).get_json()['success']
    r = c.post('/api/ftth/odp', headers=H, json={'name': 'ODP-J', 'feed_source': 'jc', 'jc_id': jc.id, 'jc_core_number': 1})
    assert r.status_code == 400 and 'ODC-J' in r.get_json()['message']


def test_release_keeps_core_used_when_other_node_still_uses_it(ctx):
    _olt, otb = _base()
    # Data lama yang sudah bentrok (dibuat langsung di DB, lewat API ditolak)
    a = FTTHODC(name='Lama-A', otb_id=otb.id, otb_core_number=5)
    b = FTTHODC(name='Lama-B', otb_id=otb.id, otb_core_number=5)
    db.session.add_all([a, b]); db.session.commit()
    c = _client()
    assert c.put(f'/api/ftth/odc/{a.id}', headers=H, json={'otb_core_number': 6}).get_json()['success']
    core5 = FTTHFiberCore.query.filter_by(owner_type='otb', owner_id=otb.id, core_number=5).first()
    assert core5 and core5.status == 'used' and core5.assigned_to_id == b.id


def test_quality_report_and_orphans(ctx):
    olt, otb = _base()
    odc = FTTHODC(name='ODC-1', otb_id=otb.id, otb_core_number=1, total_cores=8, latitude=-7.0, longitude=110.0)
    db.session.add(odc); db.session.flush()
    odp = FTTHODP(name='ODP-1', odc_id=odc.id, odc_core_number=1, total_ports=2)
    db.session.add(odp); db.session.flush()
    ports = [FTTHODPPort(odp_id=odp.id, port_number=i) for i in (1, 2)]
    db.session.add_all(ports); db.session.flush()
    child = FTTHODP(name='ODP-Anak', feed_source='odp', parent_odp_port_id=ports[1].id, total_ports=4)
    dup1 = FTTHODC(name='Bentrok-1', otb_id=otb.id, otb_core_number=4)
    dup2 = FTTHODC(name='Bentrok-2', otb_id=otb.id, otb_core_number=4)
    # ONU di PON 1/1/2 tapi dipasang ke ODP yang jalurnya core 1 → PON 1/1/1
    onu = ONU(olt_id=olt.id, frame=1, slot=1, port=2, onu_id=1, serial_number='ZTEGQ0000001', name='pel-1', status='online')
    db.session.add_all([child, dup1, dup2, onu]); db.session.flush()
    ports[0].onu_id = onu.id; ports[0].status = 'used'
    db.session.commit()
    c = _client()
    rep = c.get('/api/ftth/quality', headers=H).get_json()
    assert rep['success']
    assert rep['counts'].get('core_conflict') == 1
    assert any('ODP-Anak' == i['name'] for i in rep['issues'].get('orphan', [])) is False  # kaskade bukan yatim
    assert rep['counts'].get('pon_mismatch') == 1 and '1/1/1' in rep['issues']['pon_mismatch'][0]['message']
    assert any(i['name'] == 'ODP-1' for i in rep['issues']['no_coordinates'])
    stats = c.get('/api/ftth/stats', headers=H).get_json()
    assert stats['orphans']['odps'] == 0 if 'odps' in stats['orphans'] else True
    # Trace memakai PON yang di-patch ke core 1, bukan PON pertama sembarang
    tr = c.get(f'/api/ftth/trace/onu/{onu.id}', headers=H).get_json()
    olt_hop = [h for h in tr['hops'] if h['type'] == 'olt'][0]
    assert olt_hop['port'] == 1


def test_trace_picks_pon_by_core(ctx):
    olt, otb = _base()
    odc = FTTHODC(name='ODC-2', otb_id=otb.id, otb_core_number=2, total_cores=8)
    db.session.add(odc); db.session.flush()
    odp = FTTHODP(name='ODP-2', odc_id=odc.id, odc_core_number=1, total_ports=8)
    db.session.add(odp); db.session.flush()
    onu = ONU(olt_id=olt.id, frame=1, slot=1, port=2, onu_id=2, serial_number='ZTEGQ0000002', name='pel-2', status='online')
    db.session.add(onu); db.session.flush()
    db.session.add(FTTHODPPort(odp_id=odp.id, port_number=1, onu_id=onu.id, status='used'))
    db.session.commit()
    c = _client()
    tr = c.get(f'/api/ftth/trace/onu/{onu.id}', headers=H).get_json()
    assert [h for h in tr['hops'] if h['type'] == 'olt'][0]['detail'] == 'gpon-olt_1/1/2'
    rep = c.get('/api/ftth/quality', headers=H).get_json()
    assert rep['counts'].get('pon_mismatch', 0) == 0


def test_odp_port_rejects_onu_on_two_ports_and_warns_mismatch(ctx):
    olt, otb = _base()
    odc = FTTHODC(name='ODC-3', otb_id=otb.id, otb_core_number=1, total_cores=8)
    db.session.add(odc); db.session.flush()
    odp = FTTHODP(name='ODP-3', odc_id=odc.id, odc_core_number=1, total_ports=2)
    db.session.add(odp); db.session.flush()
    p1, p2 = FTTHODPPort(odp_id=odp.id, port_number=1), FTTHODPPort(odp_id=odp.id, port_number=2)
    onu = ONU(olt_id=olt.id, frame=1, slot=1, port=2, onu_id=3, serial_number='ZTEGQ0000003', name='pel-3', status='online')
    db.session.add_all([p1, p2, onu]); db.session.commit()
    c = _client()
    r = c.put(f'/api/ftth/odp-port/{p1.id}', headers=H, json={'onu_id': onu.id}).get_json()
    assert r['success'] and r['warning'] and 'PON 1/1/2' in r['warning']
    r2 = c.put(f'/api/ftth/odp-port/{p2.id}', headers=H, json={'onu_id': onu.id})
    assert r2.status_code == 400 and 'port 1' in r2.get_json()['message']
