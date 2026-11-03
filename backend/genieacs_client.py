"""GenieACS NBI client — queries the GenieACS North-Bound Interface (default :7557).
Uses httpx (already in requirements). All calls have timeout + retry.
Config keys (SystemConfig): genieacs_nbi_url, genieacs_nbi_user, genieacs_nbi_password.
"""
import logging
import re
from datetime import datetime, timezone

import httpx
import json

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
            # Fallback: parse identity dari _id "OUI-ProductClass-SerialHex".
            # Segmen serial 16-hex: 4 byte ASCII + 4 byte hex → '4857544390D5ADAA' = 'HWTC90D5ADAA'.
            did = d.get('_id', '')
            if not serial and did:
                seg = did.rsplit('-', 1)[-1]
                if re.fullmatch(r'[0-9A-Fa-f]{16}', seg):
                    raw = bytes.fromhex(seg)
                    if all(32 <= b < 127 for b in raw[:4]):
                        serial = raw[:4].decode('ascii') + raw[4:].hex().upper()
                    else:
                        serial = seg
                else:
                    serial = seg
            if not model and did:
                parts = did.split('-')
                if len(parts) >= 2:
                    model = parts[1]
            if not vendor and did:
                vendor = did.split('-', 1)[0]
            devices.append({
                '_id': did,
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


def _param(tree, path):
    """Walk nested GenieACS device doc (InternetGatewayDevice.*) and return _value."""
    node = tree
    for part in path.split('.'):
        if not isinstance(node, dict):
            return None
        node = node.get(part)
    if isinstance(node, dict):
        return node.get('_value')
    return node


def _collect(tree, path=''):
    """Yield (path, value) untuk semua leaf ber-_value di device doc."""
    if isinstance(tree, dict):
        if '_value' in tree:
            yield path, tree['_value']
        else:
            for k, v in tree.items():
                if not k.startswith('_') and isinstance(v, dict):
                    yield from _collect(v, f'{path}.{k}' if path else k)


def get_device_params(device_id):
    """Fetch full device parameters from GenieACS for ViewOnu panel.
    Returns dict with last_inform, software_version, wan_ip, pppoe_username,
    ssid_24g, ssid_5g, wifi_clients, etc."""
    url, user, pwd = _nbi_config()
    if not url or not device_id:
        return None
    try:
        # NBI tidak punya GET /devices/{id} (405) — filter via query param.
        r = httpx.get(f'{url}/devices',
                      params={'query': json.dumps({'_id': device_id})},
                      auth=_auth(user, pwd), timeout=_TIMEOUT)
        if r.status_code != 200:
            return None
        arr = r.json()
        if not isinstance(arr, list) or not arr:
            return None
        d = arr[0]
        # Fallback model/vendor dari _id (OUI-ProductClass-...) bila param
        # TR-069 belum ada nilainya (umum di device yang belum full refresh).
        model = _param(d, 'InternetGatewayDevice.DeviceInfo.ModelName')
        vendor = _param(d, 'InternetGatewayDevice.DeviceInfo.Manufacturer')
        id_parts = (device_id or '').split('-')
        if not model and len(id_parts) >= 2:
            model = id_parts[1]
        if not vendor and id_parts:
            vendor = id_parts[0]
        # Jumlah klien WiFi dari Hosts table
        hosts = _param(d, 'InternetGatewayDevice.LANDevice.1.Hosts.Host') or {}
        wifi_clients = len(hosts) if isinstance(hosts, dict) else 0
        uptime_s = _param(d, 'InternetGatewayDevice.DeviceInfo.UpTime')

        # Kumpulkan semua leaf sekaligus — PPPoE/WAN IP bisa di index
        # WANConnectionDevice/WAN*Connection manapun, jangan hardcode .1
        leaves = dict(_collect(d))
        def _first(pattern):
            for p, v in leaves.items():
                if re.search(pattern, p) and v not in (None, ''):
                    return str(v)
            return ''
        wan_ip = _first(r'WANIPConnection\.\d+\.ExternalIPAddress$') \
            or _first(r'WANPPPConnection\.\d+\.ExternalIPAddress$')
        pppoe = _first(r'WANPPPConnection\.\d+\.Username$')
        # Semua WAN connection instances (PPPoE & IP) per index
        wan_conns = {}
        for p, v in leaves.items():
            m = re.search(r'(WAN(?:PPP|IP)Connection)\.(\d+)\.(\w+)$', p)
            if not m:
                continue
            kind, idx, leaf = m.groups()
            c = wan_conns.setdefault(f'{kind}.{idx}', {'index': int(idx),
                                                       'type': 'pppoe' if 'PPP' in kind else 'ip'})
            c[leaf.lower()] = v
        wan_list = []
        for key, c in sorted(wan_conns.items()):
            wan_list.append({
                'key': key,
                'index': c['index'],
                'type': c['type'],
                'username': str(c.get('username') or ''),
                'ip': str(c.get('externalipaddress') or ''),
                'status': str(c.get('connectionstatus') or ''),
                'enabled': bool(c.get('enable')) if 'enable' in c else None,
                'service': str(c.get('serviceList') or c.get('servicelist') or ''),
            })
        # Semua SSID + status aktif (Enable + advertisement).
        # _param() baca _value; root WLAN adalah object node → walk mentah.
        wlan_root = d
        for part in 'InternetGatewayDevice.LANDevice.1.WLANConfiguration'.split('.'):
            wlan_root = wlan_root.get(part) if isinstance(wlan_root, dict) else None
        ssid_list = []
        if isinstance(wlan_root, dict):
            for idx, cfg in sorted(wlan_root.items(), key=lambda kv: kv[0]):
                if not idx.isdigit() or not isinstance(cfg, dict):
                    continue
                ssid = _param(cfg, 'SSID')
                if not ssid:
                    continue
                enabled = bool(_param(cfg, 'Enable')) and bool(
                    _param(cfg, 'SSIDAdvertisementEnabled'))
                ssid_list.append({'ssid': str(ssid), 'band': '5g' if int(idx) > 1 else '2.4g',
                                  'active': enabled, 'index': int(idx)})
        return {
            '_id': device_id,
            'last_inform': str(d.get('_lastInform') or _param(d, 'LastInform') or ''),
            'software_version': str(_param(d, 'InternetGatewayDevice.DeviceInfo.SoftwareVersion') or ''),
            'hardware_version': str(_param(d, 'InternetGatewayDevice.DeviceInfo.HardwareVersion') or ''),
            'uptime': str(uptime_s or ''),
            'model': str(model or ''),
            'vendor': str(vendor or ''),
            'wifi_clients': wifi_clients,
            'wan_ip': wan_ip,
            'pppoe_username': pppoe,
            'ssids': ssid_list,
            'wan_conns': wan_list,
            'ssid_24g': str(next((s['ssid'] for s in ssid_list if s['band'] == '2.4g'), '')),
            'ssid_5g': str(next((s['ssid'] for s in ssid_list if s['band'] == '5g'), '')),
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
        r = httpx.post(f'{url}/devices/{device_id}/tasks?connection_request',
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
        r = httpx.post(f'{url}/devices/{device_id}/tasks?connection_request',
                       json={'name': 'refreshObject',
                             'objectName': 'InternetGatewayDevice.'},
                       auth=_auth(user, pwd), timeout=_TIMEOUT)
        if r.status_code in (200, 202, 204):
            return True, ''
        return False, f'HTTP {r.status_code}'
    except Exception as e:
        return False, str(e)[:200]


def set_wifi_ssid(device_id, ssid, password=None, band='2.4g', index=None):
    """Set WiFi SSID (and optionally password) via GenieACS NBI task.
    index = nomor instance WLANConfiguration (prioritas atas band)."""
    url, user, pwd = _nbi_config()
    if not url or not device_id:
        return False, 'NBI not configured'
    idx = str(index) if index else ('1' if band == '2.4g' else '2')
    base = f'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{idx}'
    params = {f'{base}.SSID': ssid, f'{base}.Enable': True,
              f'{base}.SSIDAdvertisementEnabled': True}
    if password:
        params[f'{base}.KeyPassphrase'] = password
    try:
        # parameterValues harus list [path, value, type] per GenieACS NBI
        pv = [[k, v, 'xsd:string'] for k, v in params.items()]
        r = httpx.post(f'{url}/devices/{device_id}/tasks?connection_request',
                       json={'name': 'setParameterValues', 'parameterValues': pv},
                       auth=_auth(user, pwd), timeout=_TIMEOUT)
        if r.status_code in (200, 202, 204):
            return True, ''
        return False, f'HTTP {r.status_code}'
    except Exception as e:
        return False, str(e)[:200]


def set_params(device_id, pairs):
    """Generic setParameterValues task. pairs = {tr069_path: value}."""
    url, user, pwd = _nbi_config()
    if not url or not device_id:
        return False, 'NBI not configured'
    pv = [[k, v, 'xsd:string'] for k, v in pairs.items()]
    try:
        r = httpx.post(f'{url}/devices/{device_id}/tasks?connection_request',
                       json={'name': 'setParameterValues', 'parameterValues': pv},
                       auth=_auth(user, pwd), timeout=_TIMEOUT)
        if r.status_code in (200, 202, 204):
            return True, ''
        return False, f'HTTP {r.status_code}'
    except Exception as e:
        return False, str(e)[:200]


def set_pppoe(device_id, username, password):
    """Set PPPoE credentials — temukan prefix WANPPPConnection dari device doc."""
    url, user, pwd = _nbi_config()
    if not url or not device_id:
        return False, 'NBI not configured'
    try:
        r = httpx.get(f'{url}/devices',
                      params={'query': json.dumps({'_id': device_id})},
                      auth=_auth(user, pwd), timeout=_TIMEOUT)
        arr = r.json()
        if not arr:
            return False, 'device not found'
        # cari path Username aktif di WANPPPConnection index manapun
        prefix = None
        for p, _ in _collect(arr[0]):
            m = re.search(r'(WANPPPConnection\.\d+)\.Username$', p)
            if m:
                prefix = m.group(1)
                break
        if not prefix:
            return False, 'no WANPPPConnection on device'
        pairs = {f'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.{prefix}.Username': username}
        if password:
            pairs[f'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.{prefix}.Password'] = password
        return set_params(device_id, pairs)
    except Exception as e:
        return False, str(e)[:200]


def factory_reset(device_id):
    """Factory reset via GenieACS task."""
    url, user, pwd = _nbi_config()
    if not url or not device_id:
        return False, 'NBI not configured'
    try:
        r = httpx.post(f'{url}/devices/{device_id}/tasks?connection_request',
                       json={'name': 'factoryReset'},
                       auth=_auth(user, pwd), timeout=_TIMEOUT)
        if r.status_code in (200, 202, 204):
            return True, ''
        return False, f'HTTP {r.status_code}'
    except Exception as e:
        return False, str(e)[:200]


def fetch_tasks(device_id, limit=10):
    """Recent GenieACS tasks untuk device (status pending/running di _expiry)."""
    url, user, pwd = _nbi_config()
    if not url or not device_id:
        return []
    try:
        r = httpx.get(f'{url}/tasks',
                      params={'query': json.dumps({'device': device_id})},
                      auth=_auth(user, pwd), timeout=_TIMEOUT)
        if r.status_code != 200 or not isinstance(r.json(), list):
            return []
        out = []
        for t in r.json()[-limit:]:
            out.append({
                '_id': t.get('_id', ''),
                'name': t.get('name', ''),
                'timestamp': str(t.get('_timestamp', '')),
                'retries': t.get('retries', 0),
            })
        return out
    except Exception:
        return []


def add_object(device_id, object_name):
    """AddObject task (trailing '.' = instance baru). Return (ok, instance_or_err)."""
    url, user, pwd = _nbi_config()
    if not url or not device_id:
        return False, 'NBI not configured'
    try:
        r = httpx.post(f'{url}/devices/{device_id}/tasks?connection_request',
                       json={'name': 'addObject', 'objectName': object_name},
                       auth=_auth(user, pwd), timeout=_TIMEOUT)
        if r.status_code in (200, 202, 204):
            try:
                return True, str(r.json().get('instance', ''))
            except Exception:
                return True, ''
        return False, f'HTTP {r.status_code}'
    except Exception as e:
        return False, str(e)[:200]


def delete_object(device_id, object_name):
    """DeleteObject task (object_name = instance path, mis. '...WLANConfiguration.3.')."""
    url, user, pwd = _nbi_config()
    if not url or not device_id:
        return False, 'NBI not configured'
    try:
        r = httpx.post(f'{url}/devices/{device_id}/tasks?connection_request',
                       json={'name': 'deleteObject', 'objectName': object_name},
                       auth=_auth(user, pwd), timeout=_TIMEOUT)
        if r.status_code in (200, 202, 204):
            return True, ''
        return False, f'HTTP {r.status_code}'
    except Exception as e:
        return False, str(e)[:200]


def _vlan_param_name(leaves):
    """Cari nama param VLAN bind yang dipakai device ini dari leaf WAN.
    Return (parent_kind, leaf_name) mis. ('WANConnectionDevice', 'VLANID')."""
    for p, _ in leaves.items():
        m = re.search(r'(WAN(?:ConnectionDevice|PPPConnection|IPConnection))\.\d+\.(\w*VLAN\w*)$', p)
        if m:
            return m.group(1), m.group(2)
    return None, None


def add_wan(device_id, conn_type='pppoe', vlan_id='', username='', password='',
            service='INTERNET', nat=True, addressing='DHCP'):
    """Tambah WAN connection lengkap: addObject + setParameterValues (vlan/nat/user).
    conn_type: 'pppoe' | 'ip'. Return (ok, msg_or_instance)."""
    url, user, pwd = _nbi_config()
    if not url or not device_id:
        return False, 'NBI not configured'
    leaf = 'WANPPPConnection' if conn_type == 'pppoe' else 'WANIPConnection'
    parent = f'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.{leaf}'
    ok, info = add_object(device_id, parent + '.')
    if not ok:
        return False, info
    instance = str(info or '').strip()
    if not instance.isdigit():
        # NBI lama tidak mengembalikan instance — cari index tertinggi
        try:
            r = httpx.get(f'{url}/devices', params={'query': json.dumps({'_id': device_id})},
                          auth=_auth(user, pwd), timeout=_TIMEOUT)
            idxs = [int(m.group(1)) for p, _ in _collect(r.json()[0])
                    for m in [re.search(rf'{leaf}\.(\d+)\.', p)] if m]
            instance = str(max(idxs)) if idxs else '1'
        except Exception:
            instance = '1'
    base = f'{parent}.{instance}'
    pairs = {
        f'{base}.Enable': True,
        f'{base}.ConnectionType': 'IP_Routed',
        f'{base}.ServiceList': service or 'INTERNET',
        f'{base}.NATEnabled': nat,
    }
    if conn_type == 'pppoe':
        if username:
            pairs[f'{base}.Username'] = username
        if password:
            pairs[f'{base}.Password'] = password
    else:
        pairs[f'{base}.AddressingType'] = addressing or 'DHCP'
    # VLAN bind — temukan nama param asli dari device doc
    if str(vlan_id).strip():
        try:
            r = httpx.get(f'{url}/devices', params={'query': json.dumps({'_id': device_id})},
                          auth=_auth(user, pwd), timeout=_TIMEOUT)
            parent_kind, leaf_name = _vlan_param_name(_collect(r.json()[0]))
        except Exception:
            parent_kind, leaf_name = None, None
        if leaf_name:
            vlan_path = f'{base}.{leaf_name}' if parent_kind != 'WANConnectionDevice' \
                else f'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.{leaf_name}'
        else:
            vlan_path = f'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.VLANID'
        pairs[vlan_path] = str(vlan_id).strip()
    ok2, err2 = set_params(device_id, pairs)
    return (True, instance) if ok2 else (False, err2)


def bind_wan_vlan(device_id, conn_key, vlan_id):
    """Bind VLAN ke WAN instance existing. conn_key = 'WANPPPConnection.3'."""
    url, user, pwd = _nbi_config()
    if not url or not device_id:
        return False, 'NBI not configured'
    try:
        r = httpx.get(f'{url}/devices', params={'query': json.dumps({'_id': device_id})},
                      auth=_auth(user, pwd), timeout=_TIMEOUT)
        arr = r.json()
        if not arr:
            return False, 'device not found'
        parent_kind, leaf_name = _vlan_param_name(_collect(arr[0]))
        kind, idx = conn_key.rsplit('.', 1)
        if leaf_name:
            base = f'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.{kind}.{idx}'
            path = f'{base}.{leaf_name}' if parent_kind != 'WANConnectionDevice' \
                else f'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{idx}.{leaf_name}'
        else:
            path = f'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{idx}.VLANID'
        return set_params(device_id, {path: str(vlan_id)})
    except Exception as e:
        return False, str(e)[:200]
