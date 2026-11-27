"""Deteksi anomali Trafik Aplikasi: pelanggan yang trafiknya melonjak jauh di atas kebiasaannya.

Dipanggil dari siklus alert (`alerts`). Hanya membaca `FlowClientHour` (ringkasan per pelanggan per
jam, disimpan 7 hari). Untuk jam berjalan dibandingkan dengan rata-rata per jam pelanggan itu pada
jam-jam sebelumnya. Alert muncul bila KEDUANYA terpenuhi:
  • volume jam ini ≥ `flow_anomaly_min_gb` (supaya pelanggan kecil tak berisik), dan
  • volume jam ini ≥ `flow_anomaly_factor` × rata-rata per jam biasanya.
Unggah besar mendadak biasanya tanda perangkat terinfeksi / sumber serangan; unduh besar bisa torrent
atau update massal. Pulih otomatis saat jam berikutnya kembali normal. Pelanggan baru tanpa riwayat
cukup (`MIN_HISTORY_HOURS`) tidak dinilai.
"""
import ipaddress
import logging
from datetime import timedelta
from types import SimpleNamespace

from sqlalchemy import func

from models import db, SystemConfig, FlowClientHour, SnmpDevice, MikrotikDevice
from snmp_alerts import _Ctx

logger = logging.getLogger(__name__)

CATEGORY = 'flow_anomaly'
MIN_HISTORY_HOURS = 6
DEFAULTS = {'flow_anomaly_enabled': 1, 'flow_anomaly_min_gb': 2.0, 'flow_anomaly_factor': 5.0}
LIMITS = {'flow_anomaly_min_gb': (0.1, 1000), 'flow_anomaly_factor': (2, 1000)}
DIRS = (('up', 'unggah'), ('down', 'unduh'))


def get_settings():
    rows = {r.key: r.value for r in SystemConfig.query.filter(SystemConfig.key.in_(list(DEFAULTS))).all()}
    out = {}
    for k, d in DEFAULTS.items():
        try:
            v = float(rows[k]) if rows.get(k) not in (None, '') else d
        except (TypeError, ValueError):
            v = d
        if k in LIMITS:
            v = min(max(v, LIMITS[k][0]), LIMITS[k][1])
        out[k] = v
    out['flow_anomaly_enabled'] = int(out['flow_anomaly_enabled'])
    return out


def _target_id(ip, direction):
    """ID numerik stabil per (IP, arah) untuk dedupe notifikasi (kolom target_id = Integer)."""
    try:
        base = int(ipaddress.ip_address(ip)) % (2 ** 30)
    except ValueError:
        base = abs(hash(ip)) % (2 ** 30)
    return base * 2 + (1 if direction == 'down' else 0)


def _exporter_dev(ip):
    d = SnmpDevice.query.filter((SnmpDevice.flow_ip == ip) | (SnmpDevice.host == ip)).first()
    if d:
        return SimpleNamespace(name=d.name, host=d.host, location=d.location or '')
    m = MikrotikDevice.query.filter_by(host=ip).first()
    return SimpleNamespace(name=m.name if m else ip, host=ip, location='')


def _gb(n):
    return f'{n / 1e9:.1f} GB' if n >= 1e8 else f'{n / 1e6:.0f} MB'


def _label(ip):
    try:
        from routes_flow import _client_labels
        u = _client_labels([ip]).get(ip, {}).get('user')
        return f'{u} ({ip})' if u else ip
    except Exception:
        return ip


def find_anomalies(now, cfg):
    """→ {(ip, dir): {exporter, now_bytes, base_bytes, factor}} untuk jam berjalan."""
    hour = now.replace(minute=0, second=0, microsecond=0, tzinfo=None)
    min_bytes = cfg['flow_anomaly_min_gb'] * 1e9
    factor = cfg['flow_anomaly_factor']
    found = {}
    for key, _name in DIRS:
        col = FlowClientHour.up_bytes if key == 'up' else FlowClientHour.down_bytes
        cur = (db.session.query(FlowClientHour.exporter, FlowClientHour.client_ip, func.sum(col))
               .filter(FlowClientHour.ts == hour).group_by(FlowClientHour.exporter, FlowClientHour.client_ip)
               .having(func.sum(col) >= min_bytes).all())
        for exporter, ip, total in cur:
            hist = (db.session.query(FlowClientHour.ts, func.sum(col))
                    .filter(FlowClientHour.exporter == exporter, FlowClientHour.client_ip == ip,
                            FlowClientHour.ts < hour, FlowClientHour.ts >= hour - timedelta(days=7))
                    .group_by(FlowClientHour.ts).all())
            if len(hist) < MIN_HISTORY_HOURS:
                continue
            base = sum(float(v or 0) for _t, v in hist) / len(hist)
            if total >= factor * max(base, 1.0):
                found[(ip, key)] = {'exporter': exporter, 'now': float(total), 'base': base,
                                    'ratio': float(total) / max(base, 1.0)}
    return found


def check_flow_anomalies(now, notifications_to_create, alerts_to_send):
    cfg = get_settings()
    if not cfg['flow_anomaly_enabled']:
        return
    c = _Ctx(now, notifications_to_create, alerts_to_send)
    c.hold = 0
    found = find_anomalies(now, cfg)
    names = dict(DIRS)
    active_ids = set()
    for (ip, key), a in found.items():
        tid = _target_id(ip, key)
        active_ids.add(tid)
        who = _label(ip)
        title = f'Trafik {names[key]} tidak wajar: {who}'
        msg = (f'{title}\n\nPelanggan: {who}\nRouter: {_exporter_dev(a["exporter"]).name}\n'
               f'Jam ini: {_gb(a["now"])} {names[key]} (±{a["ratio"]:.0f}× dari biasanya {_gb(a["base"])}/jam)\n'
               + ('Unggah besar mendadak bisa tanda perangkat terinfeksi/sumber serangan atau sedang backup besar.'
                  if key == 'up' else 'Unduh besar mendadak bisa torrent, update massal, atau streaming banyak perangkat.')
               + '\nLihat rincian layanan di Trafik Aplikasi.')
        c.toggle(_exporter_dev(a['exporter']), CATEGORY, 'flow_client', tid, True, 'warning', title, msg,
                 f'Trafik {names[key]} pelanggan kembali normal: {who}',
                 f'Trafik {names[key]} pelanggan kembali normal: {who}')
    # tutup alert yang sudah normal
    stub = SimpleNamespace(name='Trafik Aplikasi', host='-', location='')
    for (cat, ttype, tid), n in list(c.open.items()):
        if cat == CATEGORY and n is not True and tid not in active_ids:
            c.toggle(stub, CATEGORY, ttype, tid, False, 'warning', '', '',
                     'Trafik pelanggan kembali normal', 'Trafik pelanggan kembali normal')
