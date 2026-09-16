"""WhatsApp notification service for alert system."""
import urllib.request
import json

from models import db, SystemConfig, BotConfig
from extensions import logger


def get_nms_branding():
    """Get NMS branding config from SystemConfig."""
    cfg = {c.key: c.value for c in SystemConfig.query.all()}
    return {
        'nms_name': cfg.get('nms_name', 'Salfanet NMS'),
        'nms_url': cfg.get('base_url', 'https://salfanet.id'),
        'nms_phone': cfg.get('admin_service_phone', '6285121111220'),
    }


def _send_wa_message(phone, msg):
    """Send a WhatsApp message via WA native gateway (port 3000)."""
    wa_config = BotConfig.query.filter_by(
        bot_type='whatsapp_native', enabled=True
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
