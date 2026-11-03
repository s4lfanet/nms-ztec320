"""Web Push (VAPID) service — Fase 14.

Browser Push subscriptions disimpan di tabel `push_subscriptions` (per user).
Keypair VAPID digenerate sekali lalu disimpan di SystemConfig:
  - 'vapid_public_key'  → base64url uncompressed EC point (kirim ke browser)
  - 'vapid_private_key' → PEM, disimpan terenkripsi via encrypt_field()

Pengiriman memakai pywebpush. Subscription yang mati (HTTP 404/410 Gone)
otomatis dihapus agar tidak menumpuk.
"""
import base64
import json
import logging
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

PUB_KEY = 'vapid_public_key'
PRIV_KEY = 'vapid_private_key'


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def _cfg_get(key):
    from models import SystemConfig
    row = SystemConfig.query.filter_by(key=key).first()
    return row.value if row else None


def _cfg_set(key, value):
    from models import db
    from models import SystemConfig
    row = SystemConfig.query.filter_by(key=key).first()
    if row:
        row.value = value
    else:
        db.session.add(SystemConfig(key=key, value=value))


def ensure_vapid_keys() -> tuple[str, str] | None:
    """Return (public_b64url, private_pem). Generates and stores once.

    Private key disimpan terenkripsi (encrypt_field — pola yang sama dengan
    SNMP community / bot token).
    """
    from models import encrypt_field, decrypt_field
    from models import db

    pub = _cfg_get(PUB_KEY)
    priv_enc = _cfg_get(PRIV_KEY)
    if pub and priv_enc:
        return pub, decrypt_field(priv_enc) or priv_enc

    try:
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization
        key = ec.generate_private_key(ec.SECP256R1())
        priv_pem = key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode('ascii')
        pub_raw = key.public_key().public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint,
        )
        pub_b64 = _b64url(pub_raw)
    except Exception as e:
        logger.error(f'[PUSH] VAPID keygen failed: {e}')
        return None

    _cfg_set(PUB_KEY, pub_b64)
    _cfg_set(PRIV_KEY, encrypt_field(priv_pem) or priv_pem)
    db.session.commit()
    logger.info('[PUSH] Generated new VAPID keypair')
    return pub_b64, priv_pem


def get_vapid_public_key() -> str | None:
    keys = ensure_vapid_keys()
    return keys[0] if keys else None


def _vapid_claims() -> dict:
    from models import SystemConfig
    cfg = {r.key: r.value for r in SystemConfig.query.filter(
        SystemConfig.key.in_(['base_url', 'company_email'])).all()}
    base = (cfg.get('base_url') or '').strip()
    if base.startswith('http'):
        return {'sub': base.rstrip('/')}
    email = (cfg.get('company_email') or '').strip()
    host = urlparse(base).netloc or 'localhost'
    return {'sub': f'mailto:{email or ("admin@" + host)}'}


def send_push_to_all(payload: dict, user_id: int | None = None) -> dict:
    """Kirim payload JSON ke semua (atau satu user's) push subscriptions.

    Returns {'sent': n, 'failed': n, 'removed': n}. Subscriptions yang
    return 404/410 dihapus — endpoint expired permanen.
    """
    from models import db
    from models import PushSubscription, decrypt_field

    keys = ensure_vapid_keys()
    if not keys:
        return {'sent': 0, 'failed': 0, 'removed': 0}
    _, priv_pem = keys
    priv_pem = decrypt_field(_cfg_get(PRIV_KEY)) or priv_pem

    q = PushSubscription.query
    if user_id is not None:
        q = q.filter(PushSubscription.user_id == user_id)
    subs = q.all()
    if not subs:
        return {'sent': 0, 'failed': 0, 'removed': 0}

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.error('[PUSH] pywebpush not installed — pip install pywebpush')
        return {'sent': 0, 'failed': len(subs), 'removed': 0}

    data = json.dumps(payload)
    claims = _vapid_claims()
    sent = failed = removed = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    'endpoint': sub.endpoint,
                    'keys': {'p256dh': sub.p256dh, 'auth': sub.auth},
                },
                data=data,
                vapid_private_key=priv_pem,
                vapid_claims=claims,
            )
            sent += 1
        except WebPushException as e:
            status = getattr(getattr(e, 'response', None), 'status_code', None)
            if status in (404, 410):
                db.session.delete(sub)
                removed += 1
            else:
                failed += 1
                logger.warning(f'[PUSH] send failed ({status}): {e}')
        except Exception as e:
            failed += 1
            logger.warning(f'[PUSH] send error: {e}')
    if removed:
        db.session.commit()
        logger.info(f'[PUSH] removed {removed} expired subscription(s)')
    return {'sent': sent, 'failed': failed, 'removed': removed}


def send_push_alerts(alerts: list[dict]) -> dict:
    """Kirim alert batch sebagai notifikasi Web Push.

    Dipanggil dari alerts._send_external_alerts ketika rule.notify_push on.
    Setiap alert jadi satu notifikasi dengan deep-link (Fase 2).
    """
    from alerts import _deep_link_url
    total = {'sent': 0, 'failed': 0, 'removed': 0}
    for a in alerts:
        url = _deep_link_url(a.get('target_type'), a.get('target_id')) or '/'
        payload = {
            'title': a.get('title') or 'Salfanet NMS Alert',
            'body': (a.get('message') or '')[:220],
            'url': url,
            'tag': f"alert-{a.get('alert_type') or 'general'}-{a.get('target_id') or 0}",
        }
        r = send_push_to_all(payload)
        for k in total:
            total[k] += r[k]
    return total
