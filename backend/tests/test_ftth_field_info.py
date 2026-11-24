"""FTTH tahap 3: keterangan lapangan node, status core manual, foto node, export lengkap."""
import io
import secrets

from app import app, db
from models import User, FTTHOTB, FTTHODC, FTTHJC, FTTHFiberCore, FTTHPonPort, OLT
import ftth_photos
from tests.test_link_state import ctx  # noqa: F401

H = {'X-Requested-With': 'XMLHttpRequest'}
JPG = b'\xff\xd8\xff\xe0' + b'\x00' * 64


def _client():
    u = User(username='f' + secrets.token_hex(3), full_name='f', is_super_admin=True)
    u.set_password(secrets.token_hex(8))
    db.session.add(u); db.session.commit()
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['_user_id'] = str(u.id); sess['_fresh'] = True
    return c


def test_field_info_create_update_validate(ctx):
    c = _client()
    r = c.post('/api/ftth/otb', headers=H, json={'name': 'OTB-F', 'total_cores': 24, 'cable_label': 'FEEDER-01',
                                                 'cable_type': 'adss', 'cable_cores': 24, 'cable_route': 'T1–T9',
                                                 'node_status': 'active', 'installed_at': '2025-03-14'}).get_json()
    assert r['success'] and r['item']['cable_label'] == 'FEEDER-01' and r['item']['installed_at'] == '2025-03-14'
    oid = r['item']['id']
    bad = c.put(f'/api/ftth/otb/{oid}', headers=H, json={'node_status': 'hilang'})
    assert bad.status_code == 400
    bad = c.put(f'/api/ftth/otb/{oid}', headers=H, json={'installed_at': '14/03/2025'})
    assert bad.status_code == 400
    ok = c.put(f'/api/ftth/otb/{oid}', headers=H, json={'node_status': 'maintenance', 'installed_at': ''}).get_json()
    assert ok['item']['node_status'] == 'maintenance' and ok['item']['installed_at'] is None
    j = c.post('/api/ftth/jc', headers=H, json={'name': 'JC-F', 'cable_type': 'figure8', 'node_status': 'planned'}).get_json()
    assert j['item']['cable_type'] == 'figure8' and j['item']['node_status'] == 'planned'


def test_core_status_manual(ctx):
    otb = FTTHOTB(name='OTB-C', total_cores=12)
    db.session.add(otb); db.session.commit()
    c = _client()
    odc = c.post('/api/ftth/odc', headers=H, json={'name': 'ODC-C', 'feed_source': 'otb', 'otb_id': otb.id, 'otb_core_number': 2}).get_json()
    # core dipakai → tidak boleh dicadangkan / dibebaskan
    r = c.put(f'/api/ftth/cores/otb/{otb.id}/2', headers=H, json={'status': 'reserved'})
    assert r.status_code == 400 and 'ODC-C' in r.get_json()['message']
    # boleh ditandai rusak (dengan peringatan)
    r = c.put(f'/api/ftth/cores/otb/{otb.id}/2', headers=H, json={'status': 'damaged', 'notes': 'putus di T7'}).get_json()
    assert r['success'] and r['core']['status'] == 'damaged' and r['warning']
    # core rusak tidak bisa dipakai node baru
    r2 = c.post('/api/ftth/odc', headers=H, json={'name': 'ODC-D', 'feed_source': 'otb', 'otb_id': otb.id, 'otb_core_number': 2})
    assert r2.status_code == 400 and 'rusak' in r2.get_json()['message']
    # pindah ODC ke core lain → core 2 tetap rusak (bukan tersedia)
    assert c.put(f"/api/ftth/odc/{odc['item']['id']}", headers=H, json={'otb_core_number': 3}).get_json()['success']
    core2 = FTTHFiberCore.query.filter_by(owner_type='otb', owner_id=otb.id, core_number=2).first()
    assert core2.status == 'damaged' and core2.assigned_to_id is None
    # cadangkan core kosong + redaman terukur; di luar kapasitas ditolak
    r = c.put(f'/api/ftth/cores/otb/{otb.id}/5', headers=H, json={'status': 'reserved', 'attenuation_db': 0.8}).get_json()
    assert r['core']['status'] == 'reserved' and r['core']['attenuation_db'] == 0.8
    assert c.put(f'/api/ftth/cores/otb/{otb.id}/13', headers=H, json={'status': 'reserved'}).status_code == 400
    rep = c.get('/api/ftth/quality', headers=H).get_json()
    assert rep['counts'].get('damaged_in_use', 0) == 0


def test_damaged_in_use_reported(ctx):
    olt = OLT(name='O', ip_address='10.7.0.1', vendor='zte', model='C320')
    otb = FTTHOTB(name='OTB-R', total_cores=12)
    db.session.add_all([olt, otb]); db.session.flush()
    db.session.add(FTTHPonPort(olt_id=olt.id, frame=1, slot=1, port=1, otb_id=otb.id, otb_core_number=1))
    db.session.commit()
    c = _client()
    c.put(f'/api/ftth/cores/otb/{otb.id}/1', headers=H, json={'status': 'damaged'})
    rep = c.get('/api/ftth/quality', headers=H).get_json()
    assert rep['counts'].get('damaged_in_use') == 1


def test_photos_upload_list_get_delete(ctx, tmp_path, monkeypatch):
    monkeypatch.setattr(ftth_photos, '_dir', lambda kind, nid, create=False: (tmp_path / kind / str(nid)).mkdir(parents=True, exist_ok=True) or str(tmp_path / kind / str(nid)))
    jc = FTTHJC(name='JC-P')
    db.session.add(jc); db.session.commit()
    c = _client()
    bad = c.post(f'/api/ftth/photos/jc/{jc.id}', headers=H, content_type='multipart/form-data',
                 data={'photo': (io.BytesIO(b'GIF89a....'), 'x.gif')})
    assert bad.status_code == 400
    r = c.post(f'/api/ftth/photos/jc/{jc.id}', headers=H, content_type='multipart/form-data',
               data={'photo': (io.BytesIO(JPG), 'a.jpg')}).get_json()
    assert r['success'] and len(r['photos']) == 1
    name = r['photos'][0]['name']
    assert c.get(r['photos'][0]['url'], headers=H).data.startswith(b'\xff\xd8')
    assert c.get(f'/api/ftth/photos/jc/{jc.id}/..%2Fx', headers=H).status_code == 404
    assert c.post('/api/ftth/photos/odp/999', headers=H, content_type='multipart/form-data',
                  data={'photo': (io.BytesIO(JPG), 'a.jpg')}).status_code == 404
    assert c.delete(f'/api/ftth/photos/jc/{jc.id}/{name}', headers=H).get_json()['photos'] == []


def test_export_csv_and_json_complete(ctx):
    otb = FTTHOTB(name='OTB-E', total_cores=12, cable_label='FEED-E', node_status='active')
    db.session.add(otb); db.session.flush()
    jc = FTTHJC(name='JC-E', parent_type='otb', parent_id=otb.id, total_cores=12)
    db.session.add(jc); db.session.commit()
    c = _client()
    csv_text = c.get('/api/ftth/export', headers=H).get_data(as_text=True)
    assert '=== JC ===' in csv_text and '=== JC SPLICES ===' in csv_text and '=== FIBER CORES ===' in csv_text
    assert 'FEED-E' in csv_text
    js = c.get('/api/ftth/export.json', headers=H).get_json()
    assert js['version'] == 3 and js['otbs'][0]['cable_label'] == 'FEED-E' and js['jcs'][0]['name'] == 'JC-E'
    # import CSV lama tetap jalan dengan file export baru (kolom tambahan diabaikan)
    imp = c.post('/api/ftth/import', headers=H, content_type='multipart/form-data',
                 data={'file': (io.BytesIO(csv_text.replace('OTB-E', 'OTB-E2').encode()), 'f.csv')}).get_json()
    assert imp['success'] and imp['imported']['otbs'] == 1
