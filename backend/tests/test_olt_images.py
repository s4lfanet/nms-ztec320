"""Foto OLT: validasi format/ukuran, simpan, tampil di dashboard, hapus."""
import io
import secrets

from app import app, db
from models import OLT, User
from tests.test_link_state import ctx  # noqa: F401
import olt_images

H = {'X-Requested-With': 'XMLHttpRequest'}
PNG_MAGIC = b'\x89PNG\r\n\x1a\n'


def _img(size=(8, 4), fmt='PNG', mode='RGB', color=(10, 120, 200), **kw):
    from PIL import Image
    b = io.BytesIO()
    Image.new(mode, size, color).save(b, fmt, **kw)
    return b.getvalue()


PNG = _img()


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
    assert olt_images.detect_ext(PNG) == 'png' and olt_images.detect_ext(PNG_MAGIC + b'x') == 'png'
    assert olt_images.detect_ext(b'\xff\xd8\xff\xe0') == 'jpg'
    assert olt_images.detect_ext(b'RIFF\x00\x00\x00\x00WEBPVP8 ') == 'webp'
    assert olt_images.detect_ext(b'RIFF\x00\x00\x00\x00WAVE') is None


def test_model_photo_fallback_and_priority(ctx, tmp_path, monkeypatch):
    (tmp_path / 'o').mkdir(); (tmp_path / 'm').mkdir()
    monkeypatch.setattr(olt_images, '_dir', lambda: str(tmp_path / 'o'))
    monkeypatch.setattr(olt_images, '_model_dir', lambda: str(tmp_path / 'm'))
    a = OLT(name='A', ip_address='10.0.0.2', vendor='zte', model='C320')
    b = OLT(name='B', ip_address='10.0.0.3', vendor='zte', model='C320')
    db.session.add_all([a, b]); db.session.commit()
    c = _client_admin()
    r = c.post('/api/olt-models/image', headers=H, content_type='multipart/form-data',
               data={'vendor': 'zte', 'model': 'C320', 'image': (io.BytesIO(PNG), 'm.png')}).get_json()
    assert r['success'] and r['key'] == 'zte--c320'
    # model foto dipakai kedua OLT
    olts = c.get('/api/dashboard?nocache=1', headers=H).get_json()['olts']
    assert all(o['image_url'].startswith('/api/olt-models/zte--c320/image') and o['image_source'] == 'model' for o in olts)
    # foto khusus OLT menang atas foto model
    c.post(f'/api/olt/{a.id}/image', headers=H, content_type='multipart/form-data',
           data={'image': (io.BytesIO(PNG), 'a.png')})
    olts = {o['id']: o for o in c.get('/api/dashboard?nocache=1', headers=H).get_json()['olts']}
    assert olts[a.id]['image_source'] == 'olt' and olts[b.id]['image_source'] == 'model'
    models = c.get('/api/olt-models', headers=H).get_json()['models']
    assert models[0]['key'] == 'zte--c320' and models[0]['olt_count'] == 2 and models[0]['image_url']
    assert c.get('/api/olt-models/zte--c320/image', headers=H).data.startswith(b'\x89PNG')
    # kunci tidak valid ditolak (tanpa path traversal)
    assert c.delete('/api/olt-models/bad.key/image', headers=H).status_code == 400
    assert c.get('/api/olt-models/bad.key/image', headers=H).status_code == 404
    assert c.delete('/api/olt-models/zte--c320/image', headers=H).get_json()['success']
    assert olt_images.find_model('zte--c320') is None


def test_model_key():
    assert olt_images.model_key('ZTE', 'ZXA10 C320') == 'zte--zxa10-c320'
    assert olt_images.model_key('hsgq', '') is None
    assert olt_images.model_key(None, 'C320') == 'zte--c320'


def test_normalize_resizes_to_standard_png():
    from PIL import Image
    # foto besar JPG berukuran apa pun → PNG, sisi terpanjang 512, rasio asli tetap
    out, err = olt_images.normalize(_img((3000, 1200), 'JPEG', quality=60))
    assert not err and out.startswith(PNG_MAGIC)
    im = Image.open(io.BytesIO(out))
    assert im.size == (512, 205) and im.format == 'PNG'
    # gambar kecil tidak diperbesar
    im = Image.open(io.BytesIO(olt_images.normalize(_img((100, 50)))[0]))
    assert im.size == (100, 50)
    # tinggi > lebar
    im = Image.open(io.BytesIO(olt_images.normalize(_img((600, 1800)))[0]))
    assert im.size == (171, 512)
    # transparansi dipertahankan
    im = Image.open(io.BytesIO(olt_images.normalize(_img((900, 900), mode='RGBA', color=(1, 2, 3, 0)))[0]))
    assert im.mode == 'RGBA' and im.getpixel((0, 0))[3] == 0
    # WEBP diterima; gambar rusak ditolak
    out, err = olt_images.normalize(_img((700, 300), 'WEBP'))
    assert out and Image.open(io.BytesIO(out)).size == (512, 219)
    out, err = olt_images.normalize(PNG_MAGIC + b'rusak')
    assert out is None and 'rusak' in err


def test_exif_orientation_applied():
    from PIL import Image
    im = Image.new('RGB', (200, 100), (255, 0, 0))
    ex = Image.Exif(); ex[274] = 6          # putar 90° saat ditampilkan
    b = io.BytesIO(); im.save(b, 'JPEG', exif=ex)
    out, _ = olt_images.normalize(b.getvalue())
    assert Image.open(io.BytesIO(out)).size == (100, 200)


def test_upload_converts_and_stores_png(ctx, tmp_path, monkeypatch):
    from PIL import Image
    monkeypatch.setattr(olt_images, '_dir', lambda: str(tmp_path))
    olt = OLT(name='C320', ip_address='10.0.0.9', vendor='zte', model='C320')
    db.session.add(olt); db.session.commit()
    c = _client_admin()
    big = _img((2400, 1600), 'JPEG', quality=70)
    assert len(big) < olt_images.MAX_BYTES
    r = c.post(f'/api/olt/{olt.id}/image', headers=H, data={'image': (io.BytesIO(big), 'foto.jpg')},
               content_type='multipart/form-data').get_json()
    assert r['success'] and olt_images.find(olt.id).endswith('.png')
    got = c.get(f'/api/olt/{olt.id}/image', headers=H).data
    assert Image.open(io.BytesIO(got)).size == (512, 341)
    bad = c.post(f'/api/olt/{olt.id}/image', headers=H, data={'image': (io.BytesIO(PNG_MAGIC + b'rusak'), 'x.png')},
                 content_type='multipart/form-data')
    assert bad.status_code == 400
