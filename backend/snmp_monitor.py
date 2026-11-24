"""Pemantauan perangkat jaringan lewat SNMP — konsep ala Observium/LibreNMS,
kode sendiri (bukan salinan).

Dua jenis kerja, seperti Observium:
- **discovery** (saat ditambah, manual, dan tiap DISCOVERY_HOURS): siapa perangkat
  ini (sysDescr/sysObjectID → vendor/OS/model/versi/serial) + daftar interface.
- **poll** (tiap `snmp_poll_interval` detik, default 300): status naik/turun,
  uptime (deteksi reboot), status & counter tiap port → laju bit/s & error/s,
  CPU, memori, sensor (suhu/tegangan/kipas/daya).

Pengambilan data jaringan (`collect_*`) murni — tanpa DB, aman dijalankan
paralel di thread. Penulisan ke DB (`apply_*`) dilakukan berurutan di thread
poller. SNMP hanya GET/WALK (baca saja), v1/v2c/v3.
"""
import asyncio
import logging
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

DISCOVERY_HOURS = 6
EVENT_RETENTION_DAYS = 90
MAX_WORKERS = 8
_poll_lock = threading.Lock()

# ─── OID ───
SYS = '1.3.6.1.2.1.1'
OID_SYS = {'descr': SYS + '.1.0', 'object_id': SYS + '.2.0', 'uptime': SYS + '.3.0',
           'contact': SYS + '.4.0', 'name': SYS + '.5.0', 'location': SYS + '.6.0'}
IF = '1.3.6.1.2.1.2.2.1'
IFX = '1.3.6.1.2.1.31.1.1.1'
IF_COLS = {'descr': IF + '.2', 'type': IF + '.3', 'speed': IF + '.5', 'mac': IF + '.6',
           'admin': IF + '.7', 'oper': IF + '.8', 'in32': IF + '.10', 'in_err': IF + '.14',
           'out32': IF + '.16', 'out_err': IF + '.20',
           'name': IFX + '.1', 'in64': IFX + '.6', 'out64': IFX + '.10', 'hspeed': IFX + '.15', 'alias': IFX + '.18'}
HR_CPU_LOAD = '1.3.6.1.2.1.25.3.3.1.2'
HR_STORAGE = '1.3.6.1.2.1.25.2.3.1'          # .2 type .3 descr .4 units .5 size .6 used
HR_STORAGE_RAM = '1.3.6.1.2.1.25.2.1.2'
UCD_CPU_IDLE = '1.3.6.1.4.1.2021.11.11.0'
ENT_PHYS = '1.3.6.1.2.1.47.1.1.1.1'           # .10 softwareRev .11 serial .13 modelName
MT = '1.3.6.1.4.1.14988.1.1'
MT_HEALTH = MT + '.3'
MT_GAUGE = MT_HEALTH + '.100.1'               # .2 name .3 value .4 unit
MT_SERIAL = MT + '.7.3.0'
MT_FIRMWARE = MT + '.7.4.0'
MT_VERSION = MT + '.4.4.0'
MT_SCALARS = {  # RouterOS v6 (nilai ×10)
    '10': ('temperature', 'Suhu', 'C', 10), '11': ('temperature', 'Suhu prosesor', 'C', 10),
    '6': ('temperature', 'Suhu CPU', 'C', 10), '7': ('temperature', 'Suhu board', 'C', 10),
    '8': ('voltage', 'Tegangan', 'V', 10), '12': ('power', 'Daya', 'W', 10), '13': ('current', 'Arus', 'A', 1000),
    '17': ('fan', 'Kipas 1', 'rpm', 1), '18': ('fan', 'Kipas 2', 'rpm', 1),
}
MT_GAUGE_UNIT = {1: ('temperature', 'C', 1), 2: ('fan', 'rpm', 1), 3: ('voltage', 'V', 10),
                 4: ('current', 'A', 10), 5: ('power', 'W', 10), 6: ('status', '', 1)}

# Enterprise number (sysObjectID 1.3.6.1.4.1.<n>) → (vendor, os)
ENTERPRISES = {
    '14988': ('MikroTik', 'routeros'), '9': ('Cisco', 'ios'), '2011': ('Huawei', 'vrp'), '3902': ('ZTE', 'zxros'),
    '8072': ('Net-SNMP', 'linux'), '311': ('Microsoft', 'windows'), '41112': ('Ubiquiti', 'airos'),
    '4413': ('Ubiquiti', 'edgeswitch'), '25506': ('H3C', 'comware'), '2636': ('Juniper', 'junos'),
    '30065': ('Arista', 'eos'), '318': ('APC', 'apc'), '6574': ('Synology', 'dsm'), '17713': ('Cambium', 'cambium'),
    '4526': ('Netgear', 'netgear'), '11': ('HP', 'hp'), '11863': ('TP-Link', 'tplink'), '171': ('D-Link', 'dlink'),
    '12356': ('Fortinet', 'fortios'), '25461': ('Palo Alto', 'panos'), '674': ('Dell', 'dell'), '2620': ('Check Point', 'gaia'),
    '50224': ('HSGQ', 'hsgq'), '8886': ('Raisecom', 'raisecom'), '3320': ('BDCOM', 'bdcom'), '34592': ('C-Data', 'cdata'),
    '37950': ('V-SOL', 'vsol'), '5875': ('FiberHome', 'fiberhome'), '6296': ('Dasan', 'dasan'), '10002': ('Ubiquiti', 'airos'),
}

OPER = {1: 'up', 2: 'down', 3: 'testing', 4: 'unknown', 5: 'dormant', 6: 'notPresent', 7: 'lowerLayerDown'}
ADMIN = {1: 'up', 2: 'down', 3: 'testing'}


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ─── Klien SNMP ───

def _to_py(v):
    """Ubah nilai pysnmp jadi tipe Python (None untuk noSuch*/endOfMib)."""
    cls = type(v).__name__
    if cls in ('NoSuchObject', 'NoSuchInstance', 'EndOfMibView', 'Null'):
        return None
    if hasattr(v, 'asOctets'):
        return bytes(v.asOctets())
    if hasattr(v, 'asTuple'):  # OID → selalu angka (bukan nama MIB hasil prettyPrint)
        return '.'.join(str(x) for x in v.asTuple())
    try:
        return int(v)
    except (TypeError, ValueError):
        return str(v.prettyPrint()) if hasattr(v, 'prettyPrint') else str(v)


def _text(b):
    if b is None:
        return ''
    if isinstance(b, bytes):
        return b.decode('utf-8', 'replace').replace('\x00', '').strip()
    return str(b).strip()


def _mac(b):
    if isinstance(b, bytes) and len(b) == 6:
        return ':'.join(f'{x:02x}' for x in b)
    return ''


class SnmpClient:
    """Satu sesi SNMP untuk satu perangkat (dibuat per collect)."""

    def __init__(self, params, timeout=3, retries=1):
        self.p = params
        self.timeout, self.retries = timeout, retries

    async def _setup(self):
        from pysnmp.hlapi.v3arch.asyncio import (
            SnmpEngine, CommunityData, UsmUserData, UdpTransportTarget, ContextData,
            usmHMACMD5AuthProtocol, usmHMACSHAAuthProtocol, usmHMAC192SHA256AuthProtocol,
            usmDESPrivProtocol, usmAesCfb128Protocol, usmAesCfb256Protocol, usmNoAuthProtocol, usmNoPrivProtocol)
        p = self.p
        self.engine = SnmpEngine()
        if p['version'] == '3':
            auth = {'MD5': usmHMACMD5AuthProtocol, 'SHA': usmHMACSHAAuthProtocol,
                    'SHA256': usmHMAC192SHA256AuthProtocol}.get(p.get('auth_proto') or 'SHA', usmHMACSHAAuthProtocol)
            priv = {'DES': usmDESPrivProtocol, 'AES': usmAesCfb128Protocol,
                    'AES256': usmAesCfb256Protocol}.get(p.get('priv_proto') or 'AES', usmAesCfb128Protocol)
            level = p.get('level') or 'authPriv'
            if level == 'noAuthNoPriv':
                self.auth = UsmUserData(p['user'], authProtocol=usmNoAuthProtocol, privProtocol=usmNoPrivProtocol)
            elif level == 'authNoPriv':
                self.auth = UsmUserData(p['user'], p.get('auth_pass') or '', authProtocol=auth, privProtocol=usmNoPrivProtocol)
            else:
                self.auth = UsmUserData(p['user'], p.get('auth_pass') or '', p.get('priv_pass') or '',
                                        authProtocol=auth, privProtocol=priv)
        else:
            self.auth = CommunityData(p.get('community') or 'public', mpModel=0 if p['version'] == '1' else 1)
        self.target = await UdpTransportTarget.create((p['host'], int(p.get('port') or 161)),
                                                      timeout=self.timeout, retries=self.retries)
        self.ctx = ContextData()

    async def get(self, oids):
        from pysnmp.hlapi.v3arch.asyncio import ObjectType, ObjectIdentity, get_cmd
        out = {}
        for i in range(0, len(oids), 10):  # beberapa agen menolak PDU besar
            chunk = oids[i:i + 10]
            ei, es, _ix, vbs = await get_cmd(self.engine, self.auth, self.target, self.ctx,
                                             *[ObjectType(ObjectIdentity(o)) for o in chunk])
            if ei:
                raise RuntimeError(str(ei))
            if es:
                # noSuchName di v1 untuk satu OID → ambil satu per satu
                for o in chunk:
                    ei2, es2, _i2, vb2 = await get_cmd(self.engine, self.auth, self.target, self.ctx, ObjectType(ObjectIdentity(o)))
                    if ei2:
                        raise RuntimeError(str(ei2))
                    out[o] = None if es2 else _to_py(vb2[0][1])
                continue
            for name, val in vbs:
                out[str(name)] = _to_py(val)
        return {o: out.get(o) for o in oids}

    async def walk(self, oid, max_rows=5000):
        """→ {sufiks indeks: nilai}."""
        from pysnmp.hlapi.v3arch.asyncio import ObjectType, ObjectIdentity, bulk_walk_cmd, walk_cmd
        base = oid.strip('.')
        res = {}
        if self.p['version'] == '1':
            gen = walk_cmd(self.engine, self.auth, self.target, self.ctx, ObjectType(ObjectIdentity(base)), lexicographicMode=False)
        else:
            gen = bulk_walk_cmd(self.engine, self.auth, self.target, self.ctx, 0, 25, ObjectType(ObjectIdentity(base)), lexicographicMode=False)
        async for ei, es, _ix, vbs in gen:
            if ei:
                raise RuntimeError(str(ei))
            if es:
                break
            for name, val in vbs:
                n = str(name)
                if not n.startswith(base + '.'):
                    return res
                res[n[len(base) + 1:]] = _to_py(val)
                if len(res) >= max_rows:
                    return res
        return res

    def close(self):
        try:
            self.engine.close_dispatcher()
        except Exception:
            pass


def _run(coro_fn, params, timeout=3, retries=1):
    """Jalankan fungsi async dengan klien baru di event loop sendiri (aman di thread)."""
    async def main():
        c = SnmpClient(params, timeout, retries)
        await c._setup()
        try:
            return await coro_fn(c)
        finally:
            c.close()
    return asyncio.run(main())


def device_params(dev):
    return {'id': dev.id, 'host': dev.host, 'port': dev.port or 161, 'version': dev.snmp_version or '2c',
            'community': dev.community, 'user': dev.v3_user or '', 'level': dev.v3_level,
            'auth_proto': dev.v3_auth_proto, 'auth_pass': dev.v3_auth_pass,
            'priv_proto': dev.v3_priv_proto, 'priv_pass': dev.v3_priv_pass}


# ─── Identifikasi perangkat ───

def identify(sys_descr, sys_object_id):
    """(vendor, os, hardware, version) dari sysDescr + sysObjectID."""
    oid = (sys_object_id or '').lstrip('.')
    vendor, os_name = '', ''
    m = re.match(r'1\.3\.6\.1\.4\.1\.(\d+)', oid)
    if m and m.group(1) in ENTERPRISES:
        vendor, os_name = ENTERPRISES[m.group(1)]
    d = sys_descr or ''
    hardware, version = '', ''
    if os_name == 'routeros' or d.startswith('RouterOS'):
        vendor, os_name = 'MikroTik', 'routeros'
        hardware = d.replace('RouterOS', '', 1).strip()
    elif d.startswith('Linux') and not vendor:
        vendor, os_name = 'Linux', 'linux'
        parts = d.split()
        version = parts[2] if len(parts) > 2 else ''
    elif 'Cisco' in d:
        vendor, os_name = 'Cisco', os_name or 'ios'
        m2 = re.search(r'Version ([\w.()]+)', d)
        version = m2.group(1) if m2 else ''
    elif 'Windows' in d:
        vendor, os_name = 'Microsoft', 'windows'
    if not version:
        m3 = re.search(r'\b[Vv]ersion[: ]+([\w.\-()]+)', d)
        version = m3.group(1) if m3 else ''
    return vendor or 'Generic', os_name or 'generic', hardware[:150], version[:100]


# ─── Collect (jaringan saja, tanpa DB) ───

def test_connection(params):
    """Uji kredensial: → {ok, sys_name, sys_descr, ms} / {ok: False, error}."""
    t0 = time.time()

    async def fn(c):
        return await c.get([OID_SYS['name'], OID_SYS['descr'], OID_SYS['object_id']])
    try:
        r = _run(fn, params, timeout=3, retries=1)
    except Exception as e:
        return {'ok': False, 'error': _friendly(e)}
    if r.get(OID_SYS['descr']) is None and r.get(OID_SYS['name']) is None:
        return {'ok': False, 'error': 'Perangkat menjawab tapi tidak memberi data sistem (cek view/ACL SNMP)'}
    vendor, os_name, hw, ver = identify(_text(r.get(OID_SYS['descr'])), _text(r.get(OID_SYS['object_id'])))
    return {'ok': True, 'sys_name': _text(r.get(OID_SYS['name'])), 'sys_descr': _text(r.get(OID_SYS['descr']))[:300],
            'vendor': vendor, 'os': os_name, 'ms': int((time.time() - t0) * 1000)}


def _friendly(e):
    s = str(e)
    if 'timeout' in s.lower() or 'No SNMP response' in s:
        return 'Tidak ada jawaban SNMP (timeout) — cek IP, port 161/UDP, community/user, dan firewall/akses SNMP di perangkat'
    if 'unknownUserName' in s or 'wrongDigest' in s or 'decryption' in s.lower():
        return f'Autentikasi SNMPv3 ditolak ({s}) — cek user, protokol, dan password'
    return s[:200]


def collect_discovery(params):
    async def fn(c):
        sysv = await c.get(list(OID_SYS.values()))
        out = {k: sysv.get(o) for k, o in OID_SYS.items()}
        ports = {}
        for col in ('descr', 'name', 'alias', 'type', 'speed', 'hspeed', 'mac', 'admin', 'oper'):
            try:
                for idx, v in (await c.walk(IF_COLS[col])).items():
                    if idx.isdigit():
                        ports.setdefault(int(idx), {})[col] = v
            except RuntimeError:
                if col in ('descr', 'oper'):
                    raise
        out['ports'] = ports
        ent = {}
        for k, sub in (('sw', '10'), ('serial', '11'), ('model', '13')):
            try:
                vals = [v for v in (await c.walk(f'{ENT_PHYS}.{sub}', max_rows=50)).values() if _text(v)]
                ent[k] = _text(vals[0]) if vals else ''
            except RuntimeError:
                ent[k] = ''
        out['entity'] = ent
        if (_text(sysv.get(OID_SYS['object_id'])) or '').lstrip('.').startswith('1.3.6.1.4.1.14988'):
            mt = await c.get([MT_SERIAL, MT_FIRMWARE, MT_VERSION])
            out['mikrotik'] = {'serial': _text(mt.get(MT_SERIAL)), 'firmware': _text(mt.get(MT_FIRMWARE)),
                               'version': _text(mt.get(MT_VERSION))}
        return out
    return _run(fn, params, timeout=4, retries=1)


def collect_poll(params, mikrotik=False):
    async def fn(c):
        out = {'uptime': (await c.get([OID_SYS['uptime']])).get(OID_SYS['uptime'])}
        if out['uptime'] is None:
            raise RuntimeError('sysUpTime kosong')
        ports = {}
        hc_ok = True
        for col in ('admin', 'oper', 'in64', 'out64', 'in_err', 'out_err'):
            try:
                vals = await c.walk(IF_COLS[col])
            except RuntimeError:
                vals = {}
            if col == 'in64' and not vals:
                hc_ok = False
                vals = await c.walk(IF_COLS['in32'])
            if col == 'out64' and not hc_ok:
                vals = await c.walk(IF_COLS['out32'])
            for idx, v in vals.items():
                if idx.isdigit():
                    ports.setdefault(int(idx), {})[col] = v
        out['ports'], out['hc'] = ports, hc_ok
        # CPU
        try:
            loads = [v for v in (await c.walk(HR_CPU_LOAD)).values() if isinstance(v, int)]
        except RuntimeError:
            loads = []
        if loads:
            out['cpu'] = round(sum(loads) / len(loads), 1)
            out['cpu_cores'] = len(loads)
        else:
            idle = (await c.get([UCD_CPU_IDLE])).get(UCD_CPU_IDLE)
            out['cpu'] = (100 - idle) if isinstance(idle, int) else None
        # Memori & penyimpanan (HOST-RESOURCES)
        try:
            st = await c.walk(HR_STORAGE, max_rows=600)
        except RuntimeError:
            st = {}
        storages = {}
        for k, v in st.items():
            col, _, idx = k.partition('.')
            storages.setdefault(idx, {})[col] = v
        out['storage'] = storages
        # Sensor MikroTik
        sensors = []
        if mikrotik:
            try:
                g = await c.walk(MT_GAUGE)
            except RuntimeError:
                g = {}
            rows = {}
            for k, v in g.items():
                col, _, idx = k.partition('.')
                rows.setdefault(idx, {})[col] = v
            for idx, r in rows.items():
                unit = MT_GAUGE_UNIT.get(r.get('4'))
                if unit and isinstance(r.get('3'), int):
                    kind, u, div = unit
                    sensors.append({'kind': kind, 'key': f'mtg.{idx}', 'name': _text(r.get('2')) or kind,
                                    'value': r['3'] / div, 'unit': u})
            if not sensors:  # RouterOS v6: OID tunggal
                oids = [f'{MT_HEALTH}.{k}.0' for k in MT_SCALARS]
                sv = await c.get(oids)
                for k, (kind, name, u, div) in MT_SCALARS.items():
                    v = sv.get(f'{MT_HEALTH}.{k}.0')
                    if isinstance(v, int) and v not in (0,) and abs(v) < 10_000_000:
                        sensors.append({'kind': kind, 'key': f'mts.{k}', 'name': name, 'value': v / div, 'unit': u})
        out['sensors'] = sensors
        return out
    return _run(fn, params, timeout=3, retries=1)


def ping(host):
    try:
        from link_state_poller import ping_from_vps
        r = ping_from_vps(host, count=2, timeout_s=1)
        return r if r and r.get('received') else None
    except Exception:
        return None


# ─── Apply (DB) ───

def _event(dev, kind, message, severity='info', port_id=None):
    from models import db, SnmpEvent
    db.session.add(SnmpEvent(device_id=dev.id, kind=kind, message=message[:500], severity=severity, port_id=port_id))


def apply_discovery(dev, data):
    from models import db, SnmpPort
    descr = _text(data.get('descr'))
    oid = _text(data.get('object_id'))
    vendor, os_name, hw, ver = identify(descr, oid)
    ent = data.get('entity') or {}
    mt = data.get('mikrotik') or {}
    dev.sys_descr, dev.sys_object_id = descr[:2000], oid[:255]
    dev.sys_name = _text(data.get('name'))[:255]
    dev.sys_location, dev.sys_contact = _text(data.get('location'))[:255], _text(data.get('contact'))[:255]
    dev.vendor, dev.os_name = vendor, os_name
    dev.hardware = (hw or ent.get('model') or '')[:150]
    dev.os_version = (mt.get('version') or ver or ent.get('sw') or '')[:100]
    dev.serial = (mt.get('serial') or ent.get('serial') or '')[:100]
    dev.discovered_at = _now()
    existing = {p.if_index: p for p in SnmpPort.query.filter_by(device_id=dev.id).all()}
    seen = set()
    for idx, r in (data.get('ports') or {}).items():
        seen.add(idx)
        p = existing.get(idx) or SnmpPort(device_id=dev.id, if_index=idx)
        p.descr = _text(r.get('descr'))[:255]
        p.name = (_text(r.get('name')) or p.descr)[:100]
        p.alias = _text(r.get('alias'))[:255]
        p.if_type = r.get('type') if isinstance(r.get('type'), int) else None
        hs = r.get('hspeed')
        sp = r.get('speed')
        p.speed_mbps = hs if isinstance(hs, int) and hs > 0 else (sp // 1_000_000 if isinstance(sp, int) and sp else None)
        p.mac = _mac(r.get('mac'))
        p.admin_status = ADMIN.get(r.get('admin'), p.admin_status or '')
        if not p.oper_status:
            p.oper_status = OPER.get(r.get('oper'), '')
        p.deleted = False
        if p.id is None:
            db.session.add(p)
    for idx, p in existing.items():
        if idx not in seen and not p.deleted:
            p.deleted = True
    _event(dev, 'discovery', f'Discovery: {len(seen)} interface, {vendor} {dev.hardware or ""} {dev.os_version or ""}'.strip())


def _rate(new, old, seconds, bits64):
    if new is None or old is None or seconds <= 0:
        return None
    d = new - old
    if d < 0:
        if bits64:
            return None  # counter reset
        d += 2 ** 32
    return d / seconds


def apply_poll(dev, data, now=None):
    """Tulis hasil poll sukses. Kembalikan daftar perubahan port (untuk event)."""
    from models import db, SnmpPort, SnmpSensor
    now = now or _now()
    uptime_s = int(data['uptime']) // 100 if isinstance(data.get('uptime'), int) else None
    rebooted = dev.uptime_s is not None and uptime_s is not None and uptime_s + 60 < dev.uptime_s
    if rebooted:
        _event(dev, 'reboot', f'Perangkat reboot (uptime turun ke {uptime_s // 60} menit)', 'warning')
    dev.uptime_s = uptime_s
    ports = {p.if_index: p for p in SnmpPort.query.filter_by(device_id=dev.id).all()}
    hc = data.get('hc', True)
    for idx, r in (data.get('ports') or {}).items():
        p = ports.get(idx)
        if not p:
            continue  # port baru → ikut discovery berikutnya
        admin = ADMIN.get(r.get('admin'), p.admin_status)
        oper = OPER.get(r.get('oper'), p.oper_status)
        if p.oper_status and oper != p.oper_status:
            p.status_changed_at = now
            if not p.ignored and admin == 'up' and {p.oper_status, oper} & {'up'}:
                kind = 'port_up' if oper == 'up' else 'port_down'
                label = p.name + (f' ({p.alias})' if p.alias else '')
                _event(dev, kind, f'Port {label}: {p.oper_status} → {oper}', 'info' if oper == 'up' else 'warning', p.id)
        p.admin_status, p.oper_status = admin, oper
        secs = (now - p.counter_at).total_seconds() if p.counter_at else 0
        if rebooted:
            secs = 0
        rin = _rate(r.get('in64'), p.in_octets, secs, hc)
        rout = _rate(r.get('out64'), p.out_octets, secs, hc)
        cap = (p.speed_mbps or 0) * 1_000_000 * 1.2 / 8
        p.in_bps = round(rin * 8, 1) if rin is not None and (not cap or rin <= cap) else (None if secs else p.in_bps)
        p.out_bps = round(rout * 8, 1) if rout is not None and (not cap or rout <= cap) else (None if secs else p.out_bps)
        ein = _rate(r.get('in_err'), p.in_errors, secs, False)
        eout = _rate(r.get('out_err'), p.out_errors, secs, False)
        p.in_err_rate = round(ein, 3) if ein is not None else p.in_err_rate
        p.out_err_rate = round(eout, 3) if eout is not None else p.out_err_rate
        p.in_octets = r.get('in64') if isinstance(r.get('in64'), int) else p.in_octets
        p.out_octets = r.get('out64') if isinstance(r.get('out64'), int) else p.out_octets
        p.in_errors = r.get('in_err') if isinstance(r.get('in_err'), int) else p.in_errors
        p.out_errors = r.get('out_err') if isinstance(r.get('out_err'), int) else p.out_errors
        p.counter_at = now
    # CPU / memori / penyimpanan
    dev.cpu_pct = data.get('cpu')
    sensors = list(data.get('sensors') or [])
    mem = None
    for idx, s in (data.get('storage') or {}).items():
        size, used, units = s.get('5'), s.get('6'), s.get('4') or 1
        if not isinstance(size, int) or not isinstance(used, int) or size <= 0:
            continue
        typ = str(s.get('2') or '').lstrip('.')
        pct = round(used / size * 100, 1)
        name = _text(s.get('3')) or f'storage {idx}'
        if typ == HR_STORAGE_RAM or name.lower() in ('physical memory', 'main memory', 'memory', 'ram'):
            mem = pct if mem is None else mem
            sensors.append({'kind': 'memory', 'key': f'hr.{idx}', 'name': name, 'value': pct, 'unit': '%'})
        elif typ.endswith('.25.2.1.4'):  # hrStorageFixedDisk
            sensors.append({'kind': 'storage', 'key': f'hr.{idx}', 'name': f'{name} ({round(size * units / 1e9, 1)} GB)',
                            'value': pct, 'unit': '%'})
    dev.mem_pct = mem
    if dev.cpu_pct is not None:
        sensors.append({'kind': 'cpu', 'key': 'cpu', 'name': f"CPU ({data.get('cpu_cores', 1)} core)", 'value': dev.cpu_pct, 'unit': '%'})
    temps = [s['value'] for s in sensors if s['kind'] == 'temperature']
    dev.temperature = max(temps) if temps else None
    existing = {(s.kind, s.key): s for s in SnmpSensor.query.filter_by(device_id=dev.id).all()}
    for s in sensors:
        row = existing.get((s['kind'], s['key']))
        if not row:
            row = SnmpSensor(device_id=dev.id, kind=s['kind'], key=s['key'])
            db.session.add(row)
        row.name, row.value, row.unit, row.updated_at = s['name'][:150], s['value'], s['unit'], now
    # Riwayat untuk grafik
    samples = []
    for p in ports.values():
        if p.deleted or p.counter_at != now:
            continue
        for metric, v in (('in', p.in_bps), ('out', p.out_bps), ('in_err', p.in_err_rate), ('out_err', p.out_err_rate)):
            if v is not None:
                samples.append((p.id, metric, v))
    for s in sensors:
        if s['value'] is not None and s['kind'] != 'status':
            samples.append((None, f"{s['kind']}:{s['key']}", float(s['value'])))
    record_samples(dev.id, samples, now)


def _hour(ts):
    return ts.replace(minute=0, second=0, microsecond=0)


def record_samples(device_id, samples, now):
    """Simpan sampel mentah + perbarui ringkasan jam berjalan (satu query baca)."""
    from models import db, SnmpSample, SnmpSampleHourly
    if not samples:
        return
    hour = _hour(now)
    rows = {(r.port_id, r.metric): r for r in
            SnmpSampleHourly.query.filter_by(device_id=device_id, hour=hour).all()}
    for port_id, metric, v in samples:
        db.session.add(SnmpSample(device_id=device_id, port_id=port_id, metric=metric, ts=now, value=v))
        r = rows.get((port_id, metric))
        if not r:
            r = SnmpSampleHourly(device_id=device_id, port_id=port_id, metric=metric, hour=hour,
                                 total=0.0, count=0, vmax=v, vmin=v)
            db.session.add(r)
            rows[(port_id, metric)] = r
        r.total = (r.total or 0) + v
        r.count = (r.count or 0) + 1
        r.vmax = v if r.vmax is None else max(r.vmax, v)
        r.vmin = v if r.vmin is None else min(r.vmin, v)


def set_status(dev, status, reason='', now=None):
    now = now or _now()
    if dev.status != status:
        prev = dev.status
        dev.status, dev.status_changed_at = status, now
        if prev != 'unknown' or status == 'down':
            label = {'up': 'naik', 'down': 'TURUN', 'warn': 'SNMP tidak menjawab (ping OK)'}[status]
            _event(dev, 'device_up' if status == 'up' else 'device_down',
                   f'Perangkat {label}' + (f': {reason}' if reason and status != 'up' else ''),
                   'info' if status == 'up' else ('critical' if status == 'down' else 'warning'))
    dev.status_reason = reason[:255]


# ─── Siklus ───

def _poll_one(params, mikrotik):
    t0 = time.time()
    try:
        return ('ok', collect_poll(params, mikrotik), int((time.time() - t0) * 1000), None)
    except Exception as e:
        pr = ping(params['host'])
        return ('warn' if pr else 'down', None, int((time.time() - t0) * 1000), (_friendly(e), pr))


def discover_device(dev):
    """Discovery sinkron untuk satu perangkat (dipanggil di thread latar)."""
    from models import db
    try:
        data = collect_discovery(device_params(dev))
        apply_discovery(dev, data)
        db.session.commit()
        return True, ''
    except Exception as e:
        db.session.rollback()
        msg = _friendly(e)
        _event(dev, 'discovery', f'Discovery gagal: {msg}', 'warning')
        db.session.commit()
        return False, msg


def poll_all(devices=None):
    """Satu siklus: discovery bila perlu, lalu poll semua perangkat aktif paralel."""
    from models import db, SnmpDevice
    devs = devices if devices is not None else SnmpDevice.query.filter_by(enabled=True).all()
    if not devs:
        return 0
    now = _now()
    for d in devs:
        if not d.discovered_at or now - d.discovered_at > timedelta(hours=DISCOVERY_HOURS):
            discover_device(d)
    jobs = {d.id: (device_params(d), (d.os_name == 'routeros')) for d in devs}
    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(jobs))) as ex:
        futs = {did: ex.submit(_poll_one, *args) for did, args in jobs.items()}
        results = {did: f.result() for did, f in futs.items()}
    now = _now()
    for d in devs:
        state, data, ms, err = results[d.id]
        d.last_poll_at, d.poll_ms = now, ms
        if state == 'ok':
            try:
                apply_poll(d, data, now)
                d.last_ok_at = now
                set_status(d, 'up', '', now)
            except Exception as e:
                logger.warning('snmp apply %s failed: %s', d.host, e)
        else:
            msg, pr = err
            d.ping_ms = pr.get('avg_rtt_ms') if pr else None
            set_status(d, state, msg, now)
        db.session.commit()
    return len(devs)


RAW_RETENTION_HOURS = 48
HOURLY_RETENTION_DAYS = 400


def prune_events():
    from models import db, SnmpEvent, SnmpSample, SnmpSampleHourly
    now = _now()
    SnmpEvent.query.filter(SnmpEvent.created_at < now - timedelta(days=EVENT_RETENTION_DAYS)).delete()
    SnmpSample.query.filter(SnmpSample.ts < now - timedelta(hours=RAW_RETENTION_HOURS)).delete()
    SnmpSampleHourly.query.filter(SnmpSampleHourly.hour < now - timedelta(days=HOURLY_RETENTION_DAYS)).delete()
    db.session.commit()


def _cfg_int(key, default, lo, hi):
    from models import SystemConfig
    row = SystemConfig.query.filter_by(key=key).first()
    try:
        v = int(row.value) if row and row.value else default
    except (TypeError, ValueError):
        v = default
    return max(lo, min(hi, v))


def run_snmp_poller(app):
    """Thread latar (run_server.py). Idle sampai ada perangkat."""
    from models import db
    with app.app_context():
        logger.info('snmp device poller started')
        last_prune = 0.0
        while True:
            interval = _cfg_int('snmp_poll_interval', 300, 60, 3600)
            t0 = time.time()
            try:
                if _poll_lock.acquire(blocking=False):
                    try:
                        poll_all()
                    finally:
                        _poll_lock.release()
                if time.time() - last_prune > 3600:
                    prune_events()
                    last_prune = time.time()
            except Exception as e:
                db.session.rollback()
                logger.error('snmp poller cycle failed: %s', e)
            time.sleep(max(5, interval - (time.time() - t0)))
