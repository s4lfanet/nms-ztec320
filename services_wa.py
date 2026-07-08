"""WhatsApp notification service.

Extracted from app.py. Handles all WhatsApp notification sending:
- Registration notifications
- Payment notifications (invoice created, payment success)
- Subscription expiry notifications (7d, 3d, 1d, expired)
"""
import urllib.request
import json

from models import db, SystemConfig, BotConfig, Tenant, Subscription, SubscriptionNotification, Invoice
from extensions import logger


def get_nms_branding():
    """Get NMS branding config from SystemConfig."""
    cfg = {c.key: c.value for c in SystemConfig.query.all()}
    return {
        'nms_name': cfg.get('nms_name', 'Salfanet NMS'),
        'nms_url': cfg.get('base_url', 'https://salfanet.id'),
        'nms_phone': cfg.get('admin_service_phone', '6285121111220'),
    }


def _build_tenant_url(tenant, brand):
    subdomain = tenant.subdomain.strip()
    if '.' in subdomain:
        return f"https://{subdomain}"
    # Strip the first subdomain part from base_url since tenant.subdomain
    # already includes the nms prefix (e.g., "tenant-nms" → "tenant-nms.salfa.my.id")
    base_domain = brand['nms_url'].replace('https://', '').replace('http://', '').rstrip('/')
    parts = base_domain.split('.')
    if len(parts) > 2:
        base_domain = '.'.join(parts[1:])
    return f"https://{subdomain}.{base_domain}"


def _send_wa_message(phone, msg):
    """Send a WhatsApp message via the super admin's WA native gateway (port 3000)."""
    wa_config = BotConfig.query.filter_by(
        bot_type='whatsapp_native', enabled=True, tenant_id=None
    ).first()
    if not wa_config or not wa_config.phone_number:
        return False
    try:
        gateway_url = 'http://localhost:3000/send'
        payload = json.dumps({'phone': phone, 'message': msg}).encode('utf-8')
        req = urllib.request.Request(gateway_url, data=payload, headers={'Content-Type': 'application/json'})
        resp = urllib.request.urlopen(req, timeout=15)
        if resp.status in (200, 201):
            return True
        return False
    except Exception as e:
        logger.error(f"[WA] Send failed: {e}")
        return False


def send_payment_notification(tenant, pkg, notif_type, order_id, amount, new_end_date=None):
    """Send WA notification for payment events (invoice created, payment success).
    Uses super admin's WA native gateway (port 3000) since these are SaaS-level notifications."""
    wa_config = BotConfig.query.filter_by(
        bot_type='whatsapp_native', enabled=True, tenant_id=None
    ).first()
    if not wa_config:
        logger.info(f"[PAY-NOTIF] No WA native gateway — skipping {notif_type}")
        return False

    phone = tenant.contact_phone or wa_config.phone_number
    if not phone:
        return False

    brand = get_nms_branding()
    nms_name = brand['nms_name']
    nms_phone = brand['nms_phone']
    tenant_url = _build_tenant_url(tenant, brand)
    amount_str = f"Rp {amount:,}".replace(',', '.')

    if notif_type == 'invoice_created':
        msg = (
            f"_*{nms_name} • Invoice Pembayaran*_\n"
            f"_*Bapak/Ibu {tenant.contact_name or tenant.name} Yth,*_\n"
            f"_*Invoice pembayaran telah dibuat*_\n\n"
            f"*Layanan* : *{nms_name}*\n"
            f"*Paket* : *{pkg.name}*\n"
            f"*Durasi* : *{pkg.duration_days} Hari*\n"
            f"*Business* : *{tenant.name}*\n"
            f"*Jumlah* : *{amount_str}*\n"
            f"*Order ID* : {order_id}\n\n"
            f"Silakan selesaikan pembayaran sebelum waktu habis.\n"
            f"🌐 {tenant_url}\n"
            f"⏰ _*Solusi Monitoring OLT Internet Provider*_\n"
            f"☎️ _*Layanan Pelanggan : {nms_phone}*_"
        )
    elif notif_type == 'payment_success':
        end_str = new_end_date.strftime('%d/%m/%Y') if new_end_date else '-'
        msg = (
            f"_*{nms_name} • Pembayaran Berhasil*_\n"
            f"_*Bapak/Ibu {tenant.contact_name or tenant.name} Yth,*_\n"
            f"_*Pembayaran telah berhasil diterima*_\n\n"
            f"*Layanan* : *{nms_name}*\n"
            f"*Paket* : *{pkg.name}*\n"
            f"*Durasi* : *{pkg.duration_days} Hari*\n"
            f"*Business* : *{tenant.name}*\n"
            f"*Jumlah* : *{amount_str}*\n"
            f"*Status* : *Lunas*\n"
            f"*Berlaku Sampai* : *{end_str}*\n\n"
            f"Layanan Anda telah diperpanjang. Terima kasih.\n"
            f"🌐 {tenant_url}\n"
            f"⏰ _*Solusi Monitoring OLT Internet Provider*_\n"
            f"☎️ _*Layanan Pelanggan : {nms_phone}*_"
        )
    else:
        return False

    try:
        gateway_url = 'http://localhost:3000/send'
        payload = json.dumps({'phone': phone, 'message': msg}).encode('utf-8')
        req = urllib.request.Request(gateway_url, data=payload, headers={'Content-Type': 'application/json'})
        resp = urllib.request.urlopen(req, timeout=15)
        if resp.status in (200, 201):
            logger.info(f"[PAY-NOTIF] WA sent: tenant={tenant.name}, type={notif_type}, phone={phone}")
            return True
        return False
    except Exception as e:
        logger.error(f"[PAY-NOTIF] WA send failed: {e}")
        return False


def send_registration_notification(tenant, pkg, sub, admin_username, admin_password, cf_success):
    """Send WA notification to tenant after successful registration.
    Uses super admin's WA native gateway (port 3000)."""
    wa_config = BotConfig.query.filter_by(
        bot_type='whatsapp_native', enabled=True, tenant_id=None
    ).first()
    if not wa_config:
        logger.info("[REG-NOTIF] No WA native gateway — skipping registration notification")
        return False

    phone = tenant.contact_phone or ''
    if not phone:
        logger.info(f"[REG-NOTIF] No phone number for tenant {tenant.name} — skipping")
        return False

    brand = get_nms_branding()
    nms_name = brand['nms_name']
    nms_phone = brand['nms_phone']
    tenant_url = _build_tenant_url(tenant, brand)
    trial_end_str = sub.end_date.strftime('%d/%m/%Y') if sub.end_date else '-'
    cf_status_str = 'Terkonfigurasi' if cf_success else 'Manual setup diperlukan'

    msg = (
        f"_*{nms_name} • Registrasi Berhasil*_\n"
        f"_*Bapak/Ibu {tenant.contact_name or tenant.name} Yth,*_\n\n"
        f"*Selamat! Akun tenant Anda telah aktif.*\n\n"
        f"*Layanan* : *{nms_name}*\n"
        f"*Business* : *{tenant.name}*\n"
        f"*Paket* : *{pkg.name}*\n"
        f"*Max OLT* : *{pkg.max_olts} unit*\n"
        f"*Status* : *Trial 30 Hari Gratis*\n"
        f"*Berakhir* : *{trial_end_str}*\n\n"
        f"*Detail Login Dashboard:*\n"
        f"*URL* : {tenant_url}/spa/login\n"
        f"*Username* : `{admin_username}`\n"
        f"*Password* : `{admin_password}`\n\n"
        f"*Subdomain* : {tenant.subdomain}\n"
        f"*DNS Status* : {cf_status_str}\n\n"
        f"Silakan login untuk mulai mengelola jaringan OLT Anda.\n"
        f"Tambahkan OLT di menu *Settings > OLT Settings*.\n\n"
        f"⏰ _*Solusi Monitoring OLT Internet Provider*_\n"
        f"☎️ _*Layanan Pelanggan : {nms_phone}*_"
    )

    try:
        gateway_url = 'http://localhost:3000/send'
        payload = json.dumps({'phone': phone, 'message': msg}).encode('utf-8')
        req = urllib.request.Request(gateway_url, data=payload, headers={'Content-Type': 'application/json'})
        resp = urllib.request.urlopen(req, timeout=15)
        if resp.status in (200, 201):
            logger.info(f"[REG-NOTIF] WA sent: tenant={tenant.name}, phone={phone}")
            return True
        return False
    except Exception as e:
        logger.error(f"[REG-NOTIF] WA send failed: {e}")
        return False


def send_subscription_notification(tenant, sub, notif_type, days_remaining):
    """Send WhatsApp notification to tenant about subscription expiry.
    Uses super admin's WA native gateway (port 3000)."""
    wa_config = BotConfig.query.filter_by(
        bot_type='whatsapp_native', enabled=True, tenant_id=None
    ).first()
    if not wa_config:
        logger.info(f"[SUB-NOTIF] No WA native gateway configured (super admin) — skipping {notif_type}")
        return False

    phone = tenant.contact_phone or wa_config.phone_number
    if not phone:
        logger.info(f"[SUB-NOTIF] No phone number for tenant {tenant.name} — skipping {notif_type}")
        return False

    brand = get_nms_branding()
    nms_name = brand['nms_name']
    nms_phone = brand['nms_phone']
    tenant_url = _build_tenant_url(tenant, brand)

    pkg_name = sub.package.name if sub.package else 'Unknown'
    pkg_max_olts = sub.package.max_olts if sub.package else 0
    end_str = sub.end_date.strftime('%d/%m/%Y') if sub.end_date else '-'
    contact_name = tenant.contact_name or tenant.name

    if notif_type == 'expired':
        status_text = 'Expired'
        status_emoji = '🚫'
    elif days_remaining == 1:
        status_text = 'Akan Expired Besok'
        status_emoji = '⏰'
    elif days_remaining <= 3:
        status_text = f'Akan Expired {days_remaining} Hari Lagi'
        status_emoji = '⏰'
    elif days_remaining <= 7:
        status_text = f'Akan Expired {days_remaining} Hari Lagi'
        status_emoji = '🔔'
    else:
        status_text = f'Sisa {days_remaining} Hari'
        status_emoji = '📋'

    ref_code = f"T{sub.id}{tenant.id:04d}SUB"
    renewal_link = f"{tenant_url}/subscription/extension?ref={ref_code}"

    msg = (
        f"_*{nms_name} • Subscription Monitoring OLT*_\n"
        f"_*Bapak/Ibu {contact_name} Yth,*_\n"
        f"_*Ini adalah pengingat subscription monitoring olt*_ : {tenant_url}\n"
        f"*Layanan* : *{nms_name}*\n"
        f"*Paket* : *{pkg_max_olts} OLT*\n"
        f"*Business* : *{tenant.name}*\n"
        f"*Status* : *{status_emoji} {status_text}*\n"
        f"*Link Renewal* :\n{renewal_link}\n"
        f"Harap diperpanjang sebelum _*{end_str}*_ untuk menghindari penangguhan layanan.\n"
        f"🌐 {tenant_url}\n"
        f"⏰ _*Solusi Monitoring OLT Internet Provider*_\n"
        f"☎️ _*Layanan Pelanggan : {nms_phone}*_"
    )

    try:
        gateway_url = 'http://localhost:3000/send'
        payload = json.dumps({'phone': phone, 'message': msg}).encode('utf-8')
        req = urllib.request.Request(gateway_url, data=payload, headers={'Content-Type': 'application/json'})
        resp = urllib.request.urlopen(req, timeout=15)
        if resp.status in (200, 201):
            logger.info(f"[SUB-NOTIF] WA sent: tenant={tenant.name}, type={notif_type}, phone={phone}")
            return True
        else:
            logger.error(f"[SUB-NOTIF] WA error: status={resp.status}, tenant={tenant.name}")
            return False
    except Exception as e:
        logger.error(f"[SUB-NOTIF] WA send failed: {e}, tenant={tenant.name}, phone={phone}")
        return False
