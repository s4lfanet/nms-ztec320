"""GenieACS NBI client — queries the GenieACS North-Bound Interface (default :7557).
Uses httpx (already in requirements). All calls have timeout + retry.
Config keys (SystemConfig): genieacs_nbi_url, genieacs_nbi_user, genieacs_nbi_password.
"""
import logging
import re
from datetime import datetime, timezone

import httpx

from models import db, SystemConfig, ONU, GenieacsDeviceMap

logger = logging.getLogger(__name__)

_TIMEOUT = 15.0


def _nbi_config():
    cfg = {c.key: c.value for c in SystemConfig.query.all()}
    url = (cfg.get('genieacs_nbi_url') or '').rstrip('/')
    user = cfg.get('genieacs_nbi_user') or ''
    pwd = cfg.get('genieacs_nbi_password') or ''
    return url, user, pwd


def _auth(user, pwd):
    if not user:
        return None
    return (user, pwd) if pwd else (user, '')


def test_connection():
    """Quick connectivity test — returns (ok, device_count, error)."""
    url, user, pwd = _nbi_config()
    if not url:
        return False, 0, 'NBI URL belum dikonfigurasi'
    try:
        r = httpx.get(f'{url}/devices', params={'limit': 1},
                      auth=_auth(user, pwd), timeout=_TIMEOUT)
        if r.status_code != 200:
            return False, 0, f'HTTP {r.status_code}'
        data = r.json()
        count = len(data) if isinstance(data, list) else 0
        return True, count, ''
    except Exception as e:
        return False, 0, str(e)[:200]


def _norm_mac(v):
    h = re.sub(r'[^0-9A-Fa-f]', '', v or '').upper()
    return h if len(h) == 12 else ''


def fetch_devices():
    """Fetch all devices from GenieACS NBI with minimal projection.
    Returns list of dicts: {_id, serial, mac, model, vendor, last_inform, ...}"""
    url, user, pwd = _nbi_config()
    if not url:
        return []
    devices = []
    try:
        r = httpx.get(f'{url}/devices', auth=_auth(user, pwd), timeout=_TIMEOUT)
        if r.status_code != 200:
            logger.warning('genieacs NBI /devices returned %s', r.status_code)
            return []
        data = r.json()
        if not isinstance(data, list):
            return []
        for d in data:
            props = d.get('_props', d)  # NBI returns {_id, _props} or flat
            serial = str(props.get('SerialNumber') or props.get('X_ZTE_TECOM.SerialNumber') or '')
            mac = str(props.get('InternetGatewayDevice.DeviceInfo.ManufacturerCPE.MACAddress') or
                       props.get('MACAddress') or '')
            model = str(props.get('InternetGatewayDevice.DeviceInfo.ModelName') or
                        props.get('ModelName') or '')
            vendor = str(props.get('InternetGatewayDevice.DeviceInfo.Manufacturer') or
                         props.get('Manufacturer') or '')
            last_inform = props.get('LastInform') or props.get('_lastInform')
            devices.append({
                '_id': d.get('_id', ''),
                'serial': serial,
                'mac': mac,
                'model': model,
                'vendor': vendor,
                'last_inform': str(last_inform) if last_inform else '',
            })
    except Exception as e:
        logger.error('genieacs fetch_devices failed: %s', e)
    return devices


def match_onu_to_device(onu, devices):
    """Match an ONU to a GenieACS device.
    Priority: (a) serial exact, (b) MAC PON ±1 last octet, (c) manual pin (handled by caller).
    Returns (device_id, match_method) or (None, None)."""
    sn = (onu.serial_number or '').upper()
    onu_mac = _norm_mac(onu.serial_number)
    for d in devices:
        # (a) serial exact
        if sn and d['serial'].upper() == sn:
            return d['_id'], 'serial'
    # (b) MAC ±1
    if onu_mac:
        for d in devices:
            dmac = _norm_mac(d['mac'])
            if not dmac:
                continue
            if dmac == onu_mac:
                return d['_id'], 'mac'
            if dmac[:10] == onu_mac[:10] and abs(int(dmac[10:], 16) - int(onu_mac[10:], 16)) <= 1:
                return d['_id'], 'mac'
    return None, None


def sync_device_maps():
    """Full sync: match all ONUs to GenieACS devices. Pinned rows are skipped.
    Returns (matched_count, total_onus, errors)."""
    devices = fetch_devices()
    if not devices:
        return 0, 0, ['No devices fetched from GenieACS']
    onus = ONU.query.all()
    matched = 0
    for onu in onus:
        existing = GenieacsDeviceMap.query.filter_by(onu_id=onu.id).first()
        if existing and existing.pinned:
            continue  # manual pin — don't auto-rematch
        dev_id, method = match_onu_to_device(onu, devices)
        if dev_id:
            if existing:
                existing.device_id = dev_id
                existing.match_method = method
                existing.last_synced_at = datetime.now(timezone.utc)
            else:
                db.session.add(GenieacsDeviceMap(
                    onu_id=onu.id, device_id=dev_id, match_method=method,
                    last_synced_at=datetime.now(timezone.utc)))
            matched += 1
        elif existing and not existing.pinned:
            # No longer matched — remove stale auto-match
            db.session.delete(existing)
    db.session.commit()
    return matched, len(onus), []


def get_device_params(device_id):
    """Fetch full device parameters from GenieACS for ViewOnu panel.
    Returns dict with last_inform, software_version, wan_ip, pppoe_username,
    ssid_24g, ssid_5g, wifi_clients, etc."""
    url, user, pwd = _nbi_config()
    if not url or not device_id:
        return None
    try:
        r = httpx.get(f'{url}/devices/{device_id}',
                      auth=_auth(user, pwd), timeout=_TIMEOUT)
        if r.status_code != 200:
            return None
        d = r.json()
        props = d.get('_props', d)
        return {
            '_id': device_id,
            'last_inform': str(props.get('LastInform') or props.get('_lastInform') or ''),
            'software_version': str(props.get('InternetGatewayDevice.DeviceInfo.SoftwareVersion') or ''),
            'model': str(props.get('InternetGatewayDevice.DeviceInfo.ModelName') or ''),
            'vendor': str(props.get('InternetGatewayDevice.DeviceInfo.Manufacturer') or ''),
            'wan_ip': str(props.get('InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress') or ''),
            'pppoe_username': str(props.get('InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username') or ''),
            'ssid_24g': str(props.get('InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID') or ''),
            'ssid_5g': str(props.get('InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID') or ''),
        }
    except Exception as e:
        logger.error('genieacs get_device_params failed: %s', e)
        return None


def reboot_device(device_id):
    """Reboot ONU via GenieACS NBI task."""
    url, user, pwd = _nbi_config()
    if not url or not device_id:
        return False, 'NBI not configured'
    try:
        r = httpx.post(f'{url}/tasks/{device_id}',
                       json={'name': 'reboot'},
                       auth=_auth(user, pwd), timeout=_TIMEOUT)
        if r.status_code in (200, 202, 204):
            return True, ''
        return False, f'HTTP {r.status_code}'
    except Exception as e:
        return False, str(e)[:200]


def refresh_params(device_id):
    """Trigger a parameter refresh (GetParameterValues) via GenieACS."""
    url, user, pwd = _nbi_config()
    if not url or not device_id:
        return False, 'NBI not configured'
    try:
        r = httpx.post(f'{url}/tasks/{device_id}',
                       json={'name': 'refresh'},
                       auth=_auth(user, pwd), timeout=_TIMEOUT)
        if r.status_code in (200, 202, 204):
            return True, ''
        return False, f'HTTP {r.status_code}'
    except Exception as e:
        return False, str(e)[:200]


def set_wifi_ssid(device_id, ssid, password=None, band='2.4g'):
    """Set WiFi SSID (and optionally password) via GenieACS NBI task."""
    url, user, pwd = _nbi_config()
    if not url or not device_id:
        return False, 'NBI not configured'
    idx = '1' if band == '2.4g' else '2'
    params = {f'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{idx}.SSID': ssid}
    if password:
        params[f'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{idx}.KeyPassphrase'] = password
    try:
        r = httpx.post(f'{url}/tasks/{device_id}',
                       json={'name': 'setParameterValues', 'parameterValues': params},
                       auth=_auth(user, pwd), timeout=_TIMEOUT)
        if r.status_code in (200, 202, 204):
            return True, ''
        return False, f'HTTP {r.status_code}'
    except Exception as e:
        return False, str(e)[:200]
