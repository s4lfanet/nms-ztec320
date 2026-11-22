"""Enkripsi ulang kredensial integrasi yang masih tersimpan polos (data lama).

Dipanggil sekali saat server start (app.py). Idempoten: nilai yang sudah
berupa token Fernet ('gAAAAA…') dilewati. Bila paket cryptography tidak ada,
encrypt_field mengembalikan nilai asli dan tidak ada yang berubah.
"""
from models import db, MikrotikDevice, SystemConfig, encrypt_field

_FERNET_PREFIX = 'gAAAAA'


def _is_plain(v):
    return bool(v) and not v.startswith(_FERNET_PREFIX)


def encrypt_legacy_secrets():
    changed = 0
    for dev in MikrotikDevice.query.all():
        raw = dev._api_password_enc
        if _is_plain(raw):
            enc = encrypt_field(raw)
            if enc and enc != raw:
                dev._api_password_enc = enc
                changed += 1
    row = SystemConfig.query.filter_by(key='genieacs_nbi_password').first()
    if row and _is_plain(row.value):
        enc = encrypt_field(row.value)
        if enc and enc != row.value:
            row.value = enc
            changed += 1
    if changed:
        db.session.commit()
    return changed
