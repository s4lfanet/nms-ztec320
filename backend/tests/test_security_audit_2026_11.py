"""Regresi audit keamanan 2026-11: injeksi CLI, /metrics, system-config, batas ukuran, OSRM, Pillow."""
import io
import os
import secrets

from app import app, db
from models import SystemConfig
from tests.test_link_state import ctx  # noqa: F401
from tests.test_viewer_permissions import _user, _client

H = {'X-Requested-With': 'XMLHttpRequest'}


def test_cli_newline_blocked_on_olt_and_onu_routes(ctx):
    admin = _client(_user('view_dashboard', super_admin=True))
    payloads = [
        ('/api/olt/1/vlan/100/rename', {'name': 'PPPOE\nreload'}),
        ('/api/onu/1/update', {'name': 'budi\r\nno onu 5'}),
        ('/api/onu/1/update-field', {'field': 'name', 'value': 'x\tcomplete'}),
        ('/api/olt/1/uplink/1/description', {'description': 'UP\x1bLINK'}),
        ('/api/provision/unified', {'extra': {'services': [{'username': 'a\nb'}]}}),
    ]
    for path, body in payloads:
        r = admin.post(path, json=body, headers=H)
        assert r.status_code == 400, path
        assert 'karakter kontrol' in r.get_json()['message']


def test_cli_guard_allows_normal_text_and_other_areas(ctx):
    admin = _client(_user('view_dashboard', super_admin=True))
    # teks normal (spasi, tanda baca umum) lolos pagar — 404 karena ONU tidak ada, bukan 400
    r = admin.post('/api/onu/999999/update', json={'name': 'Budi Santoso / ODP-03'}, headers=H)
    assert r.status_code == 404
    # area lain (catatan banyak baris) tidak ikut diblokir pagar CLI
    r = admin.put('/api/system-config', json={'timezone': 'Asia/Jakarta'}, headers=H)
    assert r.status_code == 200


def test_metrics_not_public(ctx, monkeypatch):
    anon = app.test_client()
    assert anon.get('/metrics').status_code == 404
    tok = secrets.token_hex(8)
    monkeypatch.setenv('METRICS_TOKEN', tok)
    assert anon.get('/metrics', headers={'Authorization': 'Bearer wrong'}).status_code == 404
    assert anon.get('/metrics', headers={'Authorization': f'Bearer {tok}'}).status_code == 200
    admin = _client(_user('view_dashboard', super_admin=True))
    assert admin.get('/metrics').status_code == 200


def test_system_config_write_needs_customization_and_masks_secrets(ctx):
    viewer = _client(_user('view_dashboard'))
    r = viewer.put('/api/system-config', json={'alert_check_interval': '5'}, headers=H)
    assert r.status_code == 403
    alerts_admin = _client(_user('view_dashboard,customization'))
    assert alerts_admin.put('/api/system-config', json={'alert_check_interval': '60'}, headers=H).status_code == 200

    db.session.add(SystemConfig(key='zz_test_api_key_enc', value='gAAAAAciphertext'))
    db.session.commit()
    cfg = viewer.get('/api/system-config', headers=H).get_json()['config']
    assert cfg['zz_test_api_key_enc'] == '***'
    admin = _client(_user('view_dashboard', super_admin=True))
    assert admin.get('/api/system-config', headers=H).get_json()['config']['zz_test_api_key_enc'] == 'gAAAAAciphertext'


def test_request_size_limit(ctx):
    admin = _client(_user('view_dashboard', super_admin=True))
    big = b'x' * (26 * 1024 * 1024)
    r = admin.post('/api/ftth/import', data={'file': (io.BytesIO(big), 'a.csv')},
                   headers=H, content_type='multipart/form-data')
    assert r.status_code == 413


def test_osrm_coordinates_must_be_numbers(ctx):
    admin = _client(_user('view_dashboard', super_admin=True))
    r = admin.post('/api/ftth/auto-route', json={'from_lat': '1/../../x', 'from_lng': 1, 'to_lat': 1, 'to_lng': 1}, headers=H)
    assert r.status_code == 400
    r = admin.post('/api/ftth/auto-route', json={'from_lat': 200, 'from_lng': 1, 'to_lat': 1, 'to_lng': 1}, headers=H)
    assert r.status_code == 400


def test_branding_icons_reject_non_logo_formats(tmp_path, monkeypatch):
    from PIL import Image
    import branding_icons
    monkeypatch.setattr(branding_icons, 'ICON_DIR', str(tmp_path / 'icons'))
    bmp = tmp_path / 'logo.png'  # BMP isi, nama .png — dekoder BMP tidak boleh dipakai
    Image.new('RGB', (8, 8)).save(bmp, format='BMP')
    try:
        branding_icons.generate_branding_icons(str(bmp))
        raised = False
    except Exception:
        raised = True
    assert raised and not os.path.exists(tmp_path / 'icons' / 'favicon-32.png')
    png = tmp_path / 'ok.png'
    Image.new('RGBA', (64, 64), (0, 128, 255, 255)).save(png, format='PNG')
    branding_icons.generate_branding_icons(str(png))
    assert os.path.exists(tmp_path / 'icons' / 'favicon-32.png')


def test_masked_acs_password_resolved_from_profile(ctx):
    from models import TR069Profile
    from routes_onu import _sanitize_provisioning_input
    pw = 'Acs' + secrets.token_hex(4)
    p = TR069Profile(name='ACS-' + secrets.token_hex(2), acs_url='http://10.9.9.9:7547', acs_username='acs')
    p.acs_password = pw
    db.session.add(p); db.session.commit()
    out = _sanitize_provisioning_input(extra={'tr069_profile_id': p.id, 'acs_url': p.acs_url,
                                              'acs_user': 'acs', 'acs_pass': '***'})
    assert out['extra']['acs_pass'] == pw
    out = _sanitize_provisioning_input(tr069_config={'acs_url': p.acs_url, 'acs_user': 'acs', 'acs_pass': '***'})
    assert out['tr069_config']['acs_pass'] == pw
    out = _sanitize_provisioning_input(extra={'acs_url': 'http://lain', 'acs_user': 'x', 'acs_pass': '***'})
    assert out['extra']['acs_pass'] == ''  # tidak pernah mengirim '***' ke OLT
    out = _sanitize_provisioning_input(extra={'acs_pass': 'manual123'})
    assert out['extra']['acs_pass'] == 'manual123'
