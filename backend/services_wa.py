"""WhatsApp notification service for alert system (Native Baileys + Multi-Gateway)."""
import base64
import json
import urllib.error
import urllib.parse
import urllib.request

from models import db, SystemConfig, BotConfig
from extensions import logger

DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; SalfanetNMS/3.0; +https://salfanet.id)'


def get_nms_branding():
    """Get NMS branding config from SystemConfig."""
    cfg = {c.key: c.value for c in SystemConfig.query.all()}
    return {
        'nms_name': cfg.get('nms_name', 'Salfanet NMS'),
        'nms_url': cfg.get('base_url', 'https://salfanet.id'),
        'nms_phone': cfg.get('admin_service_phone', '6285121111220'),
    }


def normalize_wa_phone(phone: str) -> str:
    """Normalize a single phone/group target for Indonesian & international WA gateways.

    Preserves group IDs (e.g. '1203630...@g.us'), JIDs ('...@s.whatsapp.net', '...@c.us'),
    and 'whatsapp:+...' prefixes. Converts leading '08...' to '628...' and strips
    leading '+' and formatting characters for standard phone numbers.
    """
    if not phone:
        return ''
    p = phone.strip()
    if '@' in p or p.lower().startswith('whatsapp:'):
        return p
    cleaned = ''.join(ch for ch in p if ch.isdigit() or ch == '+')
    if cleaned.startswith('+'):
        cleaned = cleaned[1:]
    if cleaned.startswith('08'):
        cleaned = '62' + cleaned[1:]
    return cleaned


def detect_wa_provider(api_url: str, provider_hint: str = '') -> str:
    """Detect WA gateway provider key from explicit hint or API URL."""
    hint = (provider_hint or '').strip().lower()
    if hint and hint not in ('auto', ''):
        return hint
    u = (api_url or '').strip().lower()
    if 'fonnte.com' in u:
        return 'fonnte'
    if 'wablas.com' in u:
        return 'wablas'
    if 'starsender' in u:
        return 'starsender'
    if 'onesender' in u or '/api/v1/messages' in u:
        return 'onesender'
    if 'ruangwa' in u:
        return 'ruangwa'
    if 'whacenter' in u:
        return 'whacenter'
    if 'dripsender' in u:
        return 'dripsender'
    if 'notifapi.com' in u or 'woowa' in u or 'woo-wa' in u:
        return 'woowa'
    if 'kirimi.id' in u:
        return 'kirimi'
    if 'zenziva' in u:
        return 'zenziva'
    if 'callmebot.com' in u:
        return 'callmebot'
    if 'green-api.com' in u:
        return 'greenapi'
    if 'graph.facebook.com' in u:
        return 'meta'
    if 'twilio.com' in u:
        return 'twilio'
    if 'ultramsg.com' in u:
        return 'ultramsg'
    if '360dialog.io' in u:
        return '360dialog'
    if 'wati.io' in u:
        return 'wati'
    if '/api/sendtext' in u:
        return 'waha'
    if '/send/message' in u:
        return 'gowa'
    if '/send-message' in u:
        return 'mpwa'
    return 'custom'


def _parse_gateway_response(resp_status: int, resp_body: str, provider: str) -> tuple[bool, str]:
    """Check HTTP status AND JSON body for gateway-level errors (e.g. Fonnte returns 200 with status=false)."""
    if resp_status not in (200, 201, 202):
        return False, f'HTTP {resp_status}: {resp_body[:200]}'
    body_str = (resp_body or '').strip()
    if not body_str:
        return True, 'OK'
    try:
        data = json.loads(body_str)
        if isinstance(data, dict):
            # Fonnte / Wablas / MPWA / Starsender / RuangWA convention: status: False or success: False
            if data.get('status') is False or str(data.get('status', '')).lower() == 'false':
                reason = data.get('reason') or data.get('message') or data.get('msg') or body_str[:200]
                return False, f'{provider}: {reason}'
            if data.get('success') is False:
                reason = data.get('message') or data.get('error') or data.get('reason') or body_str[:200]
                return False, f'{provider}: {reason}'
            if data.get('error') and not data.get('id') and not data.get('status'):
                err = data.get('error')
                if isinstance(err, dict):
                    err = err.get('message') or str(err)
                return False, f'{provider}: {err}'
            msg = data.get('detail') or data.get('message') or data.get('reason') or 'OK'
            return True, str(msg)
    except Exception:
        pass
    return True, body_str[:120]


def _send_single_target(url: str, provider: str, api_key: str, sender: str, target: str, message: str) -> tuple[bool, str]:
    """Send a WhatsApp message to a single target (or comma-joined target for Fonnte)."""
    headers = {'User-Agent': DEFAULT_USER_AGENT}
    payload = None
    req_url = url.strip()
    method = 'POST'

    norm_target = ','.join(normalize_wa_phone(t) for t in target.split(',') if t.strip()) if ',' in target else normalize_wa_phone(target)

    if provider == 'fonnte':
        form_data = {'target': norm_target, 'message': message, 'countryCode': '62'}
        if sender:
            form_data['device'] = sender
        payload = urllib.parse.urlencode(form_data).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        headers['Authorization'] = api_key

    elif provider == 'wablas':
        payload = json.dumps({'phone': norm_target, 'message': message}).encode('utf-8')
        headers['Content-Type'] = 'application/json'
        if api_key:
            # Wablas v2 supports token.secret_key if secret_key is provided in sender/chat_id
            auth_val = f'{api_key}.{sender}' if (sender and '.' not in api_key) else api_key
            headers['Authorization'] = auth_val

    elif provider == 'mpwa':
        # M-Pedia / MPWA Gateway (supports JSON or form with api_key, sender, number, message)
        body = {
            'api_key': api_key,
            'sender': sender,
            'number': norm_target,
            'phone': norm_target,
            'message': message,
        }
        payload = json.dumps(body).encode('utf-8')
        headers['Content-Type'] = 'application/json'
        if api_key:
            headers['Authorization'] = f'Bearer {api_key}'

    elif provider == 'starsender':
        payload = json.dumps({
            'messageType': 'text',
            'to': norm_target,
            'body': message,
            'message': message,
        }).encode('utf-8')
        headers['Content-Type'] = 'application/json'
        if api_key:
            headers['Authorization'] = api_key
            headers['apikey'] = api_key

    elif provider == 'onesender':
        payload = json.dumps({
            'recipient_type': 'group' if '@g.us' in norm_target else 'individual',
            'to': norm_target,
            'type': 'text',
            'text': {'body': message},
        }).encode('utf-8')
        headers['Content-Type'] = 'application/json'
        if api_key:
            headers['Authorization'] = api_key if api_key.lower().startswith('bearer ') else f'Bearer {api_key}'

    elif provider == 'ruangwa':
        payload = urllib.parse.urlencode({
            'token': api_key,
            'number': norm_target,
            'message': message,
        }).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded'

    elif provider == 'whacenter':
        payload = urllib.parse.urlencode({
            'device_id': sender or api_key,
            'number': norm_target,
            'message': message,
        }).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded'

    elif provider == 'dripsender':
        payload = json.dumps({
            'api_key': api_key,
            'phone': norm_target,
            'text': message,
        }).encode('utf-8')
        headers['Content-Type'] = 'application/json'

    elif provider == 'woowa':
        payload = json.dumps({
            'phone_no': norm_target,
            'key': api_key,
            'message': message,
        }).encode('utf-8')
        headers['Content-Type'] = 'application/json'

    elif provider == 'kirimi':
        # Kirimi.id: sender can hold "user_code:device_id" or just user_code
        user_code, device_id = (sender.split(':', 1) + [''])[:2] if sender else ('', '')
        payload = json.dumps({
            'user_code': user_code,
            'device_id': device_id,
            'secret': api_key,
            'receiver': norm_target,
            'message': message,
        }).encode('utf-8')
        headers['Content-Type'] = 'application/json'

    elif provider == 'zenziva':
        userkey = sender
        passkey = api_key
        if not userkey and ':' in api_key:
            userkey, passkey = api_key.split(':', 1)
        payload = urllib.parse.urlencode({
            'userkey': userkey,
            'passkey': passkey,
            'to': norm_target,
            'message': message,
        }).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded'

    elif provider == 'waha':
        chat_id = norm_target if '@' in norm_target else f'{norm_target}@c.us'
        payload = json.dumps({
            'chatId': chat_id,
            'text': message,
            'session': sender or 'default',
        }).encode('utf-8')
        headers['Content-Type'] = 'application/json'
        if api_key:
            headers['X-Api-Key'] = api_key
            headers['Authorization'] = f'Bearer {api_key}'

    elif provider == 'gowa':
        phone_jid = norm_target if '@' in norm_target else f'{norm_target}@s.whatsapp.net'
        payload = json.dumps({
            'phone': phone_jid,
            'message': message,
        }).encode('utf-8')
        headers['Content-Type'] = 'application/json'
        if api_key:
            if ':' in api_key:
                b64 = base64.b64encode(api_key.encode('utf-8')).decode('ascii')
                headers['Authorization'] = f'Basic {b64}'
            else:
                headers['Authorization'] = f'Bearer {api_key}'

    elif provider == 'callmebot':
        sep = '&' if '?' in req_url else '?'
        req_url = f'{req_url}{sep}phone={urllib.parse.quote(norm_target)}&text={urllib.parse.quote(message)}&apikey={urllib.parse.quote(api_key)}'
        method = 'GET'

    elif provider == 'greenapi':
        chat_id = norm_target if '@' in norm_target else f'{norm_target}@c.us'
        payload = json.dumps({'chatId': chat_id, 'message': message}).encode('utf-8')
        headers['Content-Type'] = 'application/json'

    elif provider == 'meta':
        payload = json.dumps({
            'messaging_product': 'whatsapp',
            'to': norm_target,
            'type': 'text',
            'text': {'body': message},
        }).encode('utf-8')
        headers['Content-Type'] = 'application/json'
        if api_key:
            headers['Authorization'] = api_key if api_key.lower().startswith('bearer ') else f'Bearer {api_key}'

    elif provider == '360dialog':
        payload = json.dumps({
            'messaging_product': 'whatsapp',
            'recipient_type': 'individual',
            'to': norm_target,
            'type': 'text',
            'text': {'body': message},
        }).encode('utf-8')
        headers['Content-Type'] = 'application/json'
        if api_key:
            headers['D360-API-KEY'] = api_key

    elif provider == 'wati':
        sep = '&' if '?' in req_url else '?'
        if not req_url.rstrip('/').endswith(norm_target):
            req_url = f"{req_url.rstrip('/')}/{norm_target}{sep}messageText={urllib.parse.quote(message)}"
        payload = urllib.parse.urlencode({'messageText': message}).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        if api_key:
            headers['Authorization'] = api_key if api_key.lower().startswith('bearer ') else f'Bearer {api_key}'

    elif provider == 'twilio':
        to_fmt = norm_target if norm_target.startswith('whatsapp:') else f'whatsapp:+{norm_target}'
        from_num = sender or '+14155238886'
        from_fmt = from_num if from_num.startswith('whatsapp:') else f'whatsapp:{from_num if from_num.startswith("+") else "+" + from_num}'
        payload = urllib.parse.urlencode({'To': to_fmt, 'From': from_fmt, 'Body': message}).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        if api_key:
            creds = api_key if ':' in api_key else f'{sender}:{api_key}'
            b64 = base64.b64encode(creds.encode('utf-8')).decode('ascii')
            headers['Authorization'] = f'Basic {b64}'

    elif provider == 'ultramsg':
        payload = urllib.parse.urlencode({
            'token': api_key,
            'to': norm_target,
            'body': message,
        }).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded'

    else:
        # Generic / Custom self-hosted WA gateway (Baileys / Express / Webhook)
        body = {
            'phone': norm_target,
            'number': norm_target,
            'target': norm_target,
            'to': norm_target,
            'chatId': norm_target,
            'message': message,
            'text': message,
            'body': message,
        }
        if api_key:
            body['api_key'] = api_key
            body['token'] = api_key
            headers['Authorization'] = api_key if api_key.lower().startswith('bearer ') else f'Bearer {api_key}'
            headers['X-Api-Key'] = api_key
        if sender:
            body['sender'] = sender
            body['device'] = sender
        payload = json.dumps(body).encode('utf-8')
        headers['Content-Type'] = 'application/json'

    try:
        req = urllib.request.Request(req_url, data=payload, headers=headers, method=method)
        resp = urllib.request.urlopen(req, timeout=15)
        resp_body = resp.read().decode('utf-8', errors='replace')
        return _parse_gateway_response(resp.status, resp_body, provider)
    except urllib.error.HTTPError as e:
        err_body = ''
        try:
            err_body = e.read().decode('utf-8', errors='replace')
        except Exception:
            err_body = str(e)
        return False, f'HTTP {e.code}: {err_body[:200]}'
    except Exception as e:
        return False, str(e)


def send_whatsapp_gateway(config, message: str, phone_override: str = None) -> tuple[bool, str]:
    """Send a WhatsApp message using a BotConfig(bot_type='whatsapp') instance or dict.

    Supports Fonnte, Wablas, MPWA, Starsender, OneSender, RuangWA, Whacenter,
    Dripsender, Woowa, Kirimi.id, Zenziva, WAHA, GOWA, Ultramsg, CallMeBot,
    Green API, Meta Cloud API, 360Dialog, WATI, Twilio, and custom webhooks.
    """
    if isinstance(config, dict):
        api_url = (config.get('api_url') or '').strip()
        api_key = (config.get('api_key') or '').strip()
        phone = (phone_override or config.get('phone_number') or '').strip()
        sender = (config.get('chat_id') or config.get('sender') or '').strip()
        provider_hint = (config.get('bot_token') or config.get('provider') or '').strip()
    else:
        api_url = (getattr(config, 'api_url', '') or '').strip()
        api_key = (getattr(config, 'api_key', '') or '').strip()
        phone = (phone_override or getattr(config, 'phone_number', '') or '').strip()
        sender = (getattr(config, 'chat_id', '') or '').strip()
        provider_hint = (getattr(config, 'bot_token', '') or '').strip()

    if not api_url:
        return False, 'API URL belum diisi'
    if not phone:
        return False, 'Nomor telepon tujuan belum diisi'

    provider = detect_wa_provider(api_url, provider_hint)

    # Fonnte supports comma-separated targets natively in one request;
    # for other gateways, split by comma and send to each recipient.
    targets = [t.strip() for t in phone.split(',') if t.strip()]
    if not targets:
        return False, 'Nomor telepon tujuan tidak valid'

    if provider == 'fonnte' or len(targets) == 1:
        return _send_single_target(api_url, provider, api_key, sender, phone, message)

    ok_count = 0
    last_err = ''
    for t in targets:
        ok, detail = _send_single_target(api_url, provider, api_key, sender, t, message)
        if ok:
            ok_count += 1
        else:
            last_err = detail
    if ok_count > 0:
        return True, f'Terkirim ke {ok_count}/{len(targets)} nomor'
    return False, last_err or 'Gagal mengirim pesan'


def _send_wa_message(phone, msg):
    """Send a WhatsApp message via configured WA Gateway (third-party) or WA Native (port 3000)."""
    # Try external WA Gateway first if enabled
    gw_config = BotConfig.query.filter_by(bot_type='whatsapp', enabled=True).first()
    if gw_config and gw_config.api_url:
        ok, detail = send_whatsapp_gateway(gw_config, msg, phone_override=phone)
        if ok:
            return True
        logger.warning(f"[WA] Gateway send failed ({detail}), checking native fallback...")

    # Fallback to WA Native gateway (port 3000)
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
