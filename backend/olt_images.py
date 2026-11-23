"""Foto/ikon OLT unggahan pengguna (mis. foto perangkat di rak sendiri).

Disimpan di instance/olt_images/<olt_id>.<ext> (bukan static — disajikan lewat
endpoint ber-login). Tanpa foto, frontend menggambar ilustrasi SVG orisinal
sesuai kelas perangkat (chassis besar/kecil, box 1U).
"""
import os

from flask import current_app

ALLOWED = {
    'png': b'\x89PNG\r\n\x1a\n',
    'jpg': b'\xff\xd8\xff',
    'webp': b'RIFF',
}
MAX_BYTES = 1_500_000


def _dir():
    d = os.path.join(current_app.instance_path, 'olt_images')
    os.makedirs(d, exist_ok=True)
    return d


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


def save(olt_id, data):
    """→ (ok, pesan). Mengganti foto lama apa pun formatnya."""
    if not data:
        return False, 'File kosong'
    if len(data) > MAX_BYTES:
        return False, f'File terlalu besar (maks {MAX_BYTES // 1000} KB)'
    ext = detect_ext(data)
    if not ext:
        return False, 'Format harus PNG, JPG, atau WEBP'
    remove(olt_id)
    with open(os.path.join(_dir(), f'{int(olt_id)}.{ext}'), 'wb') as f:
        f.write(data)
    return True, ''


def remove(olt_id):
    for ext in ALLOWED:
        p = os.path.join(_dir(), f'{int(olt_id)}.{ext}')
        if os.path.isfile(p):
            os.remove(p)
