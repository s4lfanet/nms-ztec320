"""Foto OLT: validasi format/ukuran, simpan, tampil di dashboard, hapus."""
import io
import secrets

from app import app, db
from models import OLT, User
from tests.test_link_state import ctx  # noqa: F401
import olt_images

H = {'X-Requested-With': 'XMLHttpRequest'}
PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 64


def _client_admin():
    u = User(username='img', full_name='i', is_super_admin=True)
    u.set_password(secrets.token_hex(8))
    db.session.add(u); db.session.commit()
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['_user_id'] = str(u.id); sess['_fresh'] = True
    return c


def test_upload_show_delete(ctx, tmp_path, monkeypatch):
    monkeypatch.setattr(olt_images, '_dir', lambda: str(tmp_path))
    olt = OLT(name='C320', ip_address='10.0.0.1', vendor='zte', model='C320')
    db.session.add(olt); db.session.commit()
    c = _client_admin()
    bad = c.post(f'/api/olt/{olt.id}/image', headers=H, data={'image': (io.BytesIO(b'GIF89a...'), 'x.gif')},
                 content_type='multipart/form-data')
    assert bad.status_code == 400 and 'PNG' in bad.get_json()['message']
    big = c.post(f'/api/olt/{olt.id}/image', headers=H,
                 data={'image': (io.BytesIO(PNG + b'\x00' * olt_images.MAX_BYTES), 'b.png')},
                 content_type='multipart/form-data')
    assert big.status_code == 400
    r = c.post(f'/api/olt/{olt.id}/image', headers=H, data={'image': (io.BytesIO(PNG), 'c.png')},
               content_type='multipart/form-data').get_json()
    assert r['success'] and r['image_url'].startswith(f'/api/olt/{olt.id}/image?v=')
    assert c.get(f'/api/olt/{olt.id}/image', headers=H).data.startswith(b'\x89PNG')
    d = c.get('/api/dashboard?nocache=1', headers=H).get_json()
    assert d['olts'][0]['image_url'].startswith(f'/api/olt/{olt.id}/image')
    assert c.delete(f'/api/olt/{olt.id}/image', headers=H).get_json()['success']
    assert olt_images.find(olt.id) is None
    assert c.get(f'/api/olt/{olt.id}/image', headers=H).status_code == 404


def test_detect_ext():
    assert olt_images.detect_ext(PNG) == 'png'
    assert olt_images.detect_ext(b'\xff\xd8\xff\xe0') == 'jpg'
    assert olt_images.detect_ext(b'RIFF\x00\x00\x00\x00WEBPVP8 ') == 'webp'
    assert olt_images.detect_ext(b'RIFF\x00\x00\x00\x00WAVE') is None
