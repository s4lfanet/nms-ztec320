"""Foto node FTTH (OTB/ODC/ODP/JC) — FTTH tahap 3.

Disimpan di instance/ftth_photos/<jenis>/<id>/<nama acak>.<ext> (bukan
static; disajikan lewat endpoint ber-login). Format divalidasi dari magic
bytes, maks MAX_PHOTOS per node. Pola sama dengan foto insiden.
"""
import os
import re
import secrets
import shutil

from flask import current_app

KINDS = ('otb', 'odc', 'odp', 'jc')
ALLOWED = {'jpg': b'\xff\xd8\xff', 'png': b'\x89PNG\r\n\x1a\n', 'webp': b'RIFF'}
MAX_BYTES = 6_000_000
MAX_PHOTOS = 12
NAME_RE = re.compile(r'^[a-f0-9]{16}\.(jpg|png|webp)$')


def _dir(kind, node_id, create=False):
    d = os.path.join(current_app.instance_path, 'ftth_photos', kind, str(int(node_id)))
    if create:
        os.makedirs(d, exist_ok=True)
    return d


def detect_ext(data):
    for ext, magic in ALLOWED.items():
        if data.startswith(magic):
            if ext == 'webp' and data[8:12] != b'WEBP':
                continue
            return ext
    return None


def list_photos(kind, node_id):
    d = _dir(kind, node_id)
    if not os.path.isdir(d):
        return []
    out = []
    for name in os.listdir(d):
        if NAME_RE.match(name):
            st = os.stat(os.path.join(d, name))
            out.append({'name': name, 'size': st.st_size, 'mtime': int(st.st_mtime),
                        'url': f'/api/ftth/photos/{kind}/{node_id}/{name}'})
    return sorted(out, key=lambda x: x['mtime'])


def path_of(kind, node_id, name):
    if kind not in KINDS or not NAME_RE.match(name or ''):
        return None
    p = os.path.join(_dir(kind, node_id), name)
    return p if os.path.isfile(p) else None


def save(kind, node_id, data):
    if kind not in KINDS:
        return None, 'Jenis node tidak valid'
    if not data:
        return None, 'File kosong'
    if len(data) > MAX_BYTES:
        return None, f'Foto terlalu besar (maks {MAX_BYTES // 1_000_000} MB)'
    ext = detect_ext(data)
    if not ext:
        return None, 'Format harus JPG, PNG, atau WEBP'
    if len(list_photos(kind, node_id)) >= MAX_PHOTOS:
        return None, f'Maksimal {MAX_PHOTOS} foto per node — hapus yang lama dulu'
    name = f'{secrets.token_hex(8)}.{ext}'
    with open(os.path.join(_dir(kind, node_id, create=True), name), 'wb') as f:
        f.write(data)
    return name, ''


def remove(kind, node_id, name):
    p = path_of(kind, node_id, name)
    if p:
        os.remove(p)
        return True
    return False


def remove_all(kind, node_id):
    if kind in KINDS:
        shutil.rmtree(_dir(kind, node_id), ignore_errors=True)
