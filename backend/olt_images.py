"""Foto/ikon OLT unggahan pengguna. Semua unggahan otomatis diubah menjadi PNG standar (lihat normalize).

Dua tingkat, urutan prioritas:
1. Foto khusus satu OLT  → instance/olt_images/<olt_id>.<ext>
2. Foto per model        → instance/olt_model_images/<vendor>--<model>.<ext>
   (unggah sekali, dipakai semua OLT dengan vendor+model yang sama)
Tanpa keduanya, frontend menggambar ilustrasi SVG orisinal sesuai kelas
perangkat. Semua disajikan lewat endpoint ber-login (bukan static).
"""
import os
import re

from flask import current_app

ALLOWED = {
    'png': b'\x89PNG\r\n\x1a\n',
    'jpg': b'\xff\xd8\xff',
    'webp': b'RIFF',
}
MAX_BYTES = 1_500_000        # batas berkas unggahan asli
STANDARD_PX = 512            # sisi terpanjang hasil standar (rasio asli dipertahankan)
MAX_SOURCE_PIXELS = 40_000_000   # tolak gambar raksasa (bom dekompresi) sebelum dibuka penuh


def _dir():
    d = os.path.join(current_app.instance_path, 'olt_images')
    os.makedirs(d, exist_ok=True)
    return d


def _model_dir():
    d = os.path.join(current_app.instance_path, 'olt_model_images')
    os.makedirs(d, exist_ok=True)
    return d


def _slug(text):
    return re.sub(r'[^a-z0-9]+', '-', (text or '').lower()).strip('-')[:60]


KEY_RE = re.compile(r'^[a-z0-9-]{1,60}--[a-z0-9-]{1,60}$')


def model_key(vendor, model):
    """'ZTE', 'ZXA10 C320' → 'zte--zxa10-c320'. None bila model kosong."""
    v, m = _slug(vendor or 'zte'), _slug(model)
    return f'{v}--{m}' if v and m else None


def _find_in(d, name):
    for ext in ALLOWED:
        p = os.path.join(d, f'{name}.{ext}')
        if os.path.isfile(p):
            return p
    return None


def find_model(key):
    if not key or not KEY_RE.match(key):
        return None
    return _find_in(_model_dir(), key)


def model_url(vendor, model):
    key = model_key(vendor, model)
    p = find_model(key)
    return f'/api/olt-models/{key}/image?v={int(os.path.getmtime(p))}' if p else None


def resolve(olt):
    """→ (image_url, sumber) dengan sumber 'olt' | 'model' | None."""
    u = url(olt.id)
    if u:
        return u, 'olt'
    u = model_url(olt.vendor, olt.model)
    return (u, 'model') if u else (None, None)


def _validate(data):
    if not data:
        return None, 'File kosong'
    if len(data) > MAX_BYTES:
        return None, f'File terlalu besar (maks {MAX_BYTES // 1000} KB)'
    ext = detect_ext(data)
    if not ext:
        return None, 'Format harus PNG, JPG, atau WEBP'
    return ext, ''


def normalize(data, remove_bg=True, info=None):
    """Ubah gambar unggahan apa pun (PNG/JPG/WEBP, resolusi berapa pun) menjadi PNG standar:
    arah EXIF diluruskan, sisi terpanjang paling besar STANDARD_PX (rasio asli dipertahankan, tidak
    diperbesar), transparansi dipertahankan, metadata dibuang. → (png_bytes, '') atau (None, pesan)."""
    import io
    from PIL import Image, ImageOps
    try:
        im = Image.open(io.BytesIO(data))
        w, h = im.size
        if w * h > MAX_SOURCE_PIXELS:
            return None, 'Resolusi gambar terlalu besar'
        im = ImageOps.exif_transpose(im)
        im.load()
    except Exception:
        return None, 'Gambar rusak atau tidak bisa dibaca'
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGBA' if ('A' in im.getbands() or 'transparency' in im.info) else 'RGB')
    if remove_bg:
        import image_bg
        work = im
        if max(im.size) > 1024:        # segmentasi tak butuh resolusi tinggi → lebih cepat & hemat memori
            work = im.copy()
            work.thumbnail((1024, 1024), Image.LANCZOS)
        res, removed = image_bg.remove_background(work)
        if removed:
            im = res
        if info is not None:
            info['background_removed'] = bool(removed)
    if max(im.size) > STANDARD_PX:
        im.thumbnail((STANDARD_PX, STANDARD_PX), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, 'PNG', optimize=True)
    return out.getvalue(), ''


def save_model(key, data, info=None):
    if not key or not KEY_RE.match(key):
        return False, 'Vendor/model tidak valid'
    ext, msg = _validate(data)
    if not ext:
        return False, msg
    png, msg = normalize(data, info=info)
    if not png:
        return False, msg
    remove_model(key)
    with open(os.path.join(_model_dir(), f'{key}.png'), 'wb') as f:
        f.write(png)
    return True, ''


def remove_model(key):
    if not key or not KEY_RE.match(key):
        return
    for ext in ALLOWED:
        p = os.path.join(_model_dir(), f'{key}.{ext}')
        if os.path.isfile(p):
            os.remove(p)


def list_model_keys():
    out = {}
    for name in os.listdir(_model_dir()):
        stem, _, ext = name.rpartition('.')
        if ext in ALLOWED and KEY_RE.match(stem):
            out[stem] = int(os.path.getmtime(os.path.join(_model_dir(), name)))
    return out


def find(olt_id):
    for ext in ALLOWED:
        p = os.path.join(_dir(), f'{int(olt_id)}.{ext}')
        if os.path.isfile(p):
            return p
    return None


def url(olt_id):
    p = find(olt_id)
    return f'/api/olt/{int(olt_id)}/image?v={int(os.path.getmtime(p))}' if p else None


def detect_ext(data):
    for ext, magic in ALLOWED.items():
        if data.startswith(magic) and (ext != 'webp' or data[8:12] == b'WEBP'):
            return ext
    return None


def save(olt_id, data, info=None):
    """→ (ok, pesan). Mengganti foto lama apa pun formatnya."""
    ext, msg = _validate(data)
    if not ext:
        return False, msg
    png, msg = normalize(data, info=info)
    if not png:
        return False, msg
    remove(olt_id)
    with open(os.path.join(_dir(), f'{int(olt_id)}.png'), 'wb') as f:
        f.write(png)
    return True, ''


def remove(olt_id):
    for ext in ALLOWED:
        p = os.path.join(_dir(), f'{int(olt_id)}.{ext}')
        if os.path.isfile(p):
            os.remove(p)


def reprocess_all():
    """Proses ulang SEMUA foto tersimpan (per OLT & per model): hapus latar + standarkan, lalu simpan
    sebagai PNG. → {'total','removed','failed'}. Foto yang gagal diproses dibiarkan apa adanya."""
    res = {'total': 0, 'removed': 0, 'failed': 0}
    for d, rm in ((_dir(), remove), (_model_dir(), remove_model)):
        for name in sorted(os.listdir(d)):
            stem, _, ext = name.rpartition('.')
            if ext not in ALLOWED or not stem:
                continue
            path = os.path.join(d, name)
            res['total'] += 1
            try:
                with open(path, 'rb') as f:
                    data = f.read()
                info = {}
                png, _msg = normalize(data, info=info)
                if not png:
                    res['failed'] += 1
                    continue
                if ext != 'png':
                    os.remove(path)
                with open(os.path.join(d, f'{stem}.png'), 'wb') as f:
                    f.write(png)
                res['removed'] += 1 if info.get('background_removed') else 0
            except Exception:
                res['failed'] += 1
    return res
