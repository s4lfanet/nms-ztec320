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
    from models import decrypt_field
    pwd = decrypt_field(cfg.get('genieacs_nbi_password') or '')  # plaintext lama tetap terbaca
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


QUEUED_MSG = ('Perintah antre di GenieACS: modem belum merespons connection request, '
              'perintah dijalankan saat modem lapor (inform) berikutnya.')

# device_id -> 'tr098' | 'tr181' (diisi saat fetch/get params; cukup per proses)
_DM_CACHE = {}
_PROJECTION = ','.join([
    '_id', '_lastInform',
    'InternetGatewayDevice.DeviceInfo.ModelName', 'InternetGatewayDevice.DeviceInfo.Manufacturer',
    'Device.DeviceInfo.ModelName', 'Device.DeviceInfo.Manufacturer',
])
_PAGE = 500


def _dm_of_doc(d):
    if isinstance(d, dict) and 'Device' in d and 'InternetGatewayDevice' not in d:
        return 'tr181'
    return 'tr098'


def data_model(device_id):
    """'tr098' (InternetGatewayDevice.*) atau 'tr181' (Device.*) untuk device ini."""
    if device_id in _DM_CACHE:
        return _DM_CACHE[device_id]
    url, user, pwd = _nbi_config()
    dm = 'tr098'
    if url and device_id:
        try:
            r = httpx.get(f'{url}/devices', params={'query': json.dumps({'_id': device_id}),
                                                    'projection': 'InternetGatewayDevice.DeviceInfo.ModelName,'
                                                                  'Device.DeviceInfo.ModelName'},
                          auth=_auth(user, pwd), timeout=_TIMEOUT)
            arr = r.json() if r.status_code == 200 else []
            if isinstance(arr, list) and arr:
                dm = _dm_of_doc(arr[0])
        except Exception:
            pass
    _DM_CACHE[device_id] = dm
    return dm


def _post_task(device_id, body):
    """Kirim task ke GenieACS. 200 = dijalankan modem; 202 = antre (modem tidak
    merespons connection request). Return (ok, pesan) — pesan QUEUED_MSG bila antre."""
    url, user, pwd = _nbi_config()
    if not url or not device_id:
        return False, 'NBI not configured'
    try:
        r = httpx.post(f'{url}/devices/{device_id}/tasks?connection_request',
                       json=body, auth=_auth(user, pwd), timeout=_TIMEOUT)
    except Exception as e:
        return False, str(e)[:200]
    if r.status_code == 202:
        return True, QUEUED_MSG
    if r.status_code in (200, 204):
        return True, ''
    return False, f'HTTP {r.status_code}'


TR181_UNSUPPORTED = ('Belum didukung untuk modem TR-181 (Device.*) — atur langsung dari GenieACS.')


def fetch_devices():
    """Fetch all devices from GenieACS NBI with minimal projection.
    Returns list of dicts: {_id, serial, mac, model, vendor, last_inform, ...}"""
    url, user, pwd = _nbi_config()
    if not url:
        return []
    devices = []
    try:
        data, skip = [], 0
        # Hanya kolom yang dipakai untuk pencocokan (projection) dan per halaman —
        # tanpa ini NBI mengirim seluruh pohon parameter semua modem (berat/timeout).
        for _ in range(200):
            r = httpx.get(f'{url}/devices', params={'projection': _PROJECTION, 'limit': _PAGE, 'skip': skip},
                          auth=_auth(user, pwd), timeout=_TIMEOUT)
            if r.status_code != 200:
                logger.warning('genieacs NBI /devices returned %s', r.status_code)
                return devices
            page = r.json()
            if not isinstance(page, list):
                break
            data.extend(page)
            if len(page) < _PAGE:
                break
            skip += _PAGE
        for d in data:
            props = d.get('_props', d)  # NBI returns {_id, _props} or flat
            serial = str(props.get('SerialNumber') or props.get('X_ZTE_TECOM.SerialNumber') or '')
            mac = str(props.get('InternetGatewayDevice.DeviceInfo.ManufacturerCPE.MACAddress') or
                       props.get('MACAddress') or '')
            dm = _dm_of_doc(d)
            root = 'Device' if dm == 'tr181' else 'InternetGatewayDevice'
            model = str(props.get('InternetGatewayDevice.DeviceInfo.ModelName') or
                        props.get('ModelName') or _param(d, f'{root}.DeviceInfo.ModelName') or '')
            vendor = str(props.get('InternetGatewayDevice.DeviceInfo.Manufacturer') or
                         props.get('Manufacturer') or _param(d, f'{root}.DeviceInfo.Manufacturer') or '')
            last_inform = props.get('LastInform') or props.get('_lastInform')
            # Fallback: parse identity dari _id "OUI-ProductClass-SerialHex".
            # Segmen serial 16-hex: 4 byte ASCII + 4 byte hex → '4857544390D5ADAA' = 'HWTC90D5ADAA'.
            did = d.get('_id', '')
            if did:
                _DM_CACHE[did] = dm
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


def _parse_ts(v):
    """ISO time GenieACS → datetime naive UTC (None bila kosong/tidak valid)."""
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(str(v).replace('Z', '+00:00'))
        return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt
    except ValueError:
        return None


def sync_device_maps():
    """Full sync: match all ONUs to GenieACS devices. Pinned rows are skipped.
    Returns (matched_count, total_onus, errors)."""
    devices = fetch_devices()
    if not devices:
        return 0, 0, ['No devices fetched from GenieACS']
    onus = ONU.query.all()
    by_id = {d['_id']: d for d in devices}
    matched = 0
    for onu in onus:
        existing = GenieacsDeviceMap.query.filter_by(onu_id=onu.id).first()
        if existing and existing.pinned:
            if existing.device_id in by_id:  # pin tetap, tapi waktu lapor diperbarui
                existing.last_inform = _parse_ts(by_id[existing.device_id].get('last_inform'))
            continue  # manual pin — don't auto-rematch
        dev_id, method = match_onu_to_device(onu, devices)
        if dev_id:
            inform = _parse_ts(by_id.get(dev_id, {}).get('last_inform'))
            if existing:
                existing.device_id = dev_id
                existing.match_method = method
                existing.last_synced_at = datetime.now(timezone.utc)
                existing.last_inform = inform
            else:
                db.session.add(GenieacsDeviceMap(
                    onu_id=onu.id, device_id=dev_id, match_method=method,
                    last_synced_at=datetime.now(timezone.utc), last_inform=inform))
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


def _node(tree, path):
    """Seperti _param, tetapi mengembalikan node objek (dict) apa adanya."""
    node = tree
    for part in path.split('.'):
        if not isinstance(node, dict):
            return None
        node = node.get(part)
    return node if isinstance(node, dict) else None


def _count_hosts(host_node):
    """Jumlah perangkat terhubung: instance Host yang Active (atau semua bila
    modem tidak melaporkan Active)."""
    if not isinstance(host_node, dict):
        return 0
    inst = [v for k, v in host_node.items() if k.isdigit() and isinstance(v, dict)]
    if any('Active' in h for h in inst):
        return sum(1 for h in inst if str(_param(h, 'Active')).lower() in ('true', '1'))
    return len(inst)


_RX_RE = re.compile(r'(RXPower|RxPower|RXOpticalPower|RxOpticalPower|OpticalSignalLevel)$')


def _to_dbm(v):
    """Normalisasi redaman yang dilaporkan modem ke dBm. Vendor berbeda satuan:
    dBm langsung (-21.5), dBm×1000 (TR-181 OpticalSignalLevel, -21500), atau
    dBm×10. Nilai di luar rentang wajar → None."""
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    for div in (1, 10, 100, 1000):
        y = x / div
        if -50 <= y <= 10:
            return round(y, 2)
    return None


def _optical_rx(d):
    for p, v in _collect(d):
        if _RX_RE.search(p) and ('WANDevice' in p or 'Optical' in p or 'PON' in p.upper()):
            dbm = _to_dbm(v)
            if dbm is not None:
                return dbm
    return None


def _host_list(host_node, tr181=False, limit=30):
    """Perangkat terhubung (Hosts.Host): nama, IP, MAC, wifi/lan, aktif."""
    out = []
    for k, h in sorted((host_node or {}).items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0):
        if not k.isdigit() or not isinstance(h, dict):
            continue
        iface = str(_param(h, 'Layer1Interface' if tr181 else 'InterfaceType') or
                    _param(h, 'Layer2Interface') or '')
        active = _param(h, 'Active')
        out.append({'name': str(_param(h, 'HostName') or ''), 'ip': str(_param(h, 'IPAddress') or ''),
                    'mac': str(_param(h, 'PhysAddress' if tr181 else 'MACAddress') or ''),
                    'via': 'wifi' if re.search(r'wi-?fi|wlan|802\.11', iface, re.I) else ('lan' if iface else ''),
                    'active': None if active is None else str(active).lower() in ('true', '1')})
        if len(out) >= limit:
            break
    return out


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
        dm = _dm_of_doc(d)
        _DM_CACHE[device_id] = dm
        if dm == 'tr181':
            return _tr181_params(device_id, d)
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
        wifi_clients = _count_hosts(_node(d, 'InternetGatewayDevice.LANDevice.1.Hosts.Host'))
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
                                  'active': enabled, 'index': int(idx),
                                  'channel': _param(cfg, 'Channel')})
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
            'data_model': 'tr098',
            'optical_rx_dbm': _optical_rx(d),
            'hosts': _host_list(_node(d, 'InternetGatewayDevice.LANDevice.1.Hosts.Host')),
        }
    except Exception as e:
        logger.error('genieacs get_device_params failed: %s', e)
        return None


def _tr181_params(device_id, d):
    """Versi get_device_params untuk modem TR-181 (root Device.*)."""
    def p(path):
        return _param(d, path)
    id_parts = (device_id or '').split('-')
    model = p('Device.DeviceInfo.ModelName') or (id_parts[1] if len(id_parts) >= 2 else '')
    vendor = p('Device.DeviceInfo.Manufacturer') or (id_parts[0] if id_parts else '')
    wan_list = []
    for idx, c in sorted((_node(d, 'Device.PPP.Interface') or {}).items(), key=lambda kv: kv[0]):
        if not idx.isdigit() or not isinstance(c, dict):
            continue
        en = _param(c, 'Enable')
        wan_list.append({'key': f'PPP.Interface.{idx}', 'index': int(idx), 'type': 'pppoe',
                         'username': str(_param(c, 'Username') or ''),
                         'ip': str(_param(c, 'IPCP.LocalIPAddress') or ''),
                         'status': str(_param(c, 'ConnectionStatus') or ''),
                         'enabled': bool(en) if en is not None else None, 'service': ''})
    wan_ip = next((w['ip'] for w in wan_list if w['ip']), '')
    if not wan_ip:
        for idx, c in (_node(d, 'Device.IP.Interface') or {}).items():
            for _, a in ((_node(c, 'IPv4Address') or {}) if isinstance(c, dict) else {}).items():
                ip = str(_param(a, 'IPAddress') or '') if isinstance(a, dict) else ''
                if ip and not ip.startswith(('127.', '192.168.', '169.254.')):
                    wan_ip = ip
                    break
            if wan_ip:
                break
    radios, channels = {}, {}
    for idx, r in (_node(d, 'Device.WiFi.Radio') or {}).items():
        if idx.isdigit() and isinstance(r, dict):
            radios[idx] = '5g' if '5' in str(_param(r, 'OperatingFrequencyBand') or '') else '2.4g'
            channels[idx] = _param(r, 'Channel')
    ap_adv = {}
    for idx, a in (_node(d, 'Device.WiFi.AccessPoint') or {}).items():
        if idx.isdigit() and isinstance(a, dict):
            v = _param(a, 'SSIDAdvertisementEnabled')
            ap_adv[idx] = True if v is None else bool(v)
    ssid_list = []
    for idx, c in sorted((_node(d, 'Device.WiFi.SSID') or {}).items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0):
        if not idx.isdigit() or not isinstance(c, dict):
            continue
        ssid = _param(c, 'SSID')
        if not ssid:
            continue
        m = re.search(r'Radio\.(\d+)', str(_param(c, 'LowerLayers') or ''))
        band = radios.get(m.group(1)) if m else ('2.4g' if int(idx) == 1 else '5g')
        ssid_list.append({'ssid': str(ssid), 'band': band or '2.4g', 'index': int(idx),
                          'active': bool(_param(c, 'Enable')) and ap_adv.get(idx, True),
                          'channel': channels.get(m.group(1)) if m else None})
    return {
        '_id': device_id,
        'last_inform': str(d.get('_lastInform') or ''),
        'software_version': str(p('Device.DeviceInfo.SoftwareVersion') or ''),
        'hardware_version': str(p('Device.DeviceInfo.HardwareVersion') or ''),
        'uptime': str(p('Device.DeviceInfo.UpTime') or ''),
        'model': str(model or ''), 'vendor': str(vendor or ''),
        'wifi_clients': _count_hosts(_node(d, 'Device.Hosts.Host')),
        'wan_ip': wan_ip,
        'pppoe_username': next((w['username'] for w in wan_list if w['username']), ''),
        'ssids': ssid_list, 'wan_conns': wan_list,
        'ssid_24g': next((x['ssid'] for x in ssid_list if x['band'] == '2.4g'), ''),
        'ssid_5g': next((x['ssid'] for x in ssid_list if x['band'] == '5g'), ''),
        'data_model': 'tr181',
        'optical_rx_dbm': _optical_rx(d),
        'hosts': _host_list(_node(d, 'Device.Hosts.Host'), tr181=True),
    }


def reboot_device(device_id):
    """Reboot ONU via GenieACS NBI task."""
    return _post_task(device_id, {'name': 'reboot'})


def refresh_params(device_id):
    """Trigger a parameter refresh (GetParameterValues) via GenieACS."""
    root = 'Device.' if data_model(device_id) == 'tr181' else 'InternetGatewayDevice.'
    return _post_task(device_id, {'name': 'refreshObject', 'objectName': root})


def set_wifi_ssid(device_id, ssid, password=None, band='2.4g', index=None):
    """Set WiFi SSID (and optionally password) via GenieACS NBI task.
    index = nomor instance WLANConfiguration / WiFi.SSID (prioritas atas band)."""
    idx = str(index) if index else ('1' if band == '2.4g' else '2')
    if data_model(device_id) == 'tr181':
        pv = [[f'Device.WiFi.SSID.{idx}.SSID', ssid, 'xsd:string'],
              [f'Device.WiFi.SSID.{idx}.Enable', True, 'xsd:boolean'],
              [f'Device.WiFi.AccessPoint.{idx}.SSIDAdvertisementEnabled', True, 'xsd:boolean']]
        if password:
            pv.append([f'Device.WiFi.AccessPoint.{idx}.Security.KeyPassphrase', password, 'xsd:string'])
        return _post_task(device_id, {'name': 'setParameterValues', 'parameterValues': pv})
    base = f'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{idx}'
    params = {f'{base}.SSID': ssid, f'{base}.Enable': True,
              f'{base}.SSIDAdvertisementEnabled': True}
    if password:
        params[f'{base}.KeyPassphrase'] = password
    # parameterValues harus list [path, value, type] per GenieACS NBI
    pv = [[k, v, 'xsd:string'] for k, v in params.items()]
    return _post_task(device_id, {'name': 'setParameterValues', 'parameterValues': pv})


def set_params(device_id, pairs):
    """Generic setParameterValues task. pairs = {tr069_path: value}."""
    pv = [[k, v, 'xsd:string'] for k, v in pairs.items()]
    return _post_task(device_id, {'name': 'setParameterValues', 'parameterValues': pv})


def set_pppoe(device_id, username, password):
    """Set PPPoE credentials pada koneksi PPP yang ada di device (TR-098:
    WANPPPConnection index mana pun; TR-181: PPP.Interface)."""
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
        # Path lengkap Username yang benar-benar ada (bukan hardcode WANConnectionDevice.1)
        base = None
        for p, _ in _collect(arr[0]):
            m = re.match(r'(.*(?:WANPPPConnection|PPP\.Interface)\.\d+)\.Username$', p)
            if m:
                base = m.group(1)
                break
        if not base:
            return False, 'no PPPoE connection on device'
        pairs = {f'{base}.Username': username}
        if password:
            pairs[f'{base}.Password'] = password
        return set_params(device_id, pairs)
    except Exception as e:
        return False, str(e)[:200]


def factory_reset(device_id):
    """Factory reset via GenieACS task."""
    return _post_task(device_id, {'name': 'factoryReset'})


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


def stale_devices(hours=None):
    """ONU online yang modemnya terpetakan tetapi tidak lapor (inform) ke GenieACS
    lebih dari N jam — ACS/VLAN manajemen/TR-069 di modem bermasalah."""
    from datetime import timedelta
    if hours is None:
        row = SystemConfig.query.filter_by(key='genieacs_stale_hours').first()
        try:
            hours = int(row.value) if row and row.value else 24
        except ValueError:
            hours = 24
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
    rows = (db.session.query(GenieacsDeviceMap, ONU).join(ONU, GenieacsDeviceMap.onu_id == ONU.id)
            .filter(ONU.status == 'online', GenieacsDeviceMap.last_inform.isnot(None),
                    GenieacsDeviceMap.last_inform < cutoff)
            .order_by(GenieacsDeviceMap.last_inform).all())
    return hours, [{'onu_id': o.id, 'name': o.name, 'device_id': m.device_id,
                    'last_inform': m.last_inform.isoformat() + 'Z'} for m, o in rows]


def fetch_faults(device_id=None, limit=200):
    """Fault GenieACS (task gagal: kredensial CR salah, parameter ditolak, timeout…).
    Fault memblokir task berikutnya di channel yang sama sampai dihapus/di-retry."""
    url, user, pwd = _nbi_config()
    if not url:
        return []
    params = {'limit': limit}
    if device_id:
        params['query'] = json.dumps({'device': device_id})
    try:
        r = httpx.get(f'{url}/faults', params=params, auth=_auth(user, pwd), timeout=_TIMEOUT)
        rows = r.json() if r.status_code == 200 else []
    except Exception as e:
        logger.warning('genieacs fetch_faults failed: %s', e)
        return []
    out = []
    for f in rows if isinstance(rows, list) else []:
        detail = f.get('detail')
        msg = f.get('message') or ''
        if not msg and isinstance(detail, dict):
            msg = detail.get('faultString') or detail.get('message') or ''
        out.append({'_id': f.get('_id', ''), 'device': f.get('device', ''), 'channel': f.get('channel', ''),
                    'code': str(f.get('code', '')), 'message': str(msg)[:300],
                    'retries': f.get('retries', 0), 'timestamp': str(f.get('timestamp', ''))})
    return out


def delete_fault(fault_id):
    """Hapus fault → GenieACS mencoba lagi task/preset di channel tsb saat inform berikutnya."""
    url, user, pwd = _nbi_config()
    if not url or not fault_id:
        return False, 'NBI not configured'
    from urllib.parse import quote
    try:
        r = httpx.delete(f'{url}/faults/{quote(fault_id, safe="")}', auth=_auth(user, pwd), timeout=_TIMEOUT)
    except Exception as e:
        return False, str(e)[:200]
    return (True, '') if r.status_code in (200, 204) else (False, f'HTTP {r.status_code}')


def add_object(device_id, object_name):
    """AddObject task (trailing '.' = instance baru). Return (ok, instance_or_err)."""
    if data_model(device_id) == 'tr181' and object_name.startswith('InternetGatewayDevice.'):
        return False, TR181_UNSUPPORTED
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
    return _post_task(device_id, {'name': 'deleteObject', 'objectName': object_name})


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
    if data_model(device_id) == 'tr181':
        return False, TR181_UNSUPPORTED
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
    if data_model(device_id) == 'tr181':
        return False, TR181_UNSUPPORTED
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
