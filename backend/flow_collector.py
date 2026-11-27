"""Trafik Aplikasi: kolektor NetFlow v5/v9 + IPFIX dari MikroTik (Traffic Flow).

Alur: paket UDP → `parse_packet` → `Aggregator.add` (klasifikasi arah + layanan, diagregasi di
memori) → `flush` tiap menit ke `FlowBucket`/`FlowServiceHour` (+ `FlowClientHour` tiap 5 menit).
Pengenal layanan ada di `flow_names.py` (DNS cache router + reverse DNS + aturan domain).
Hanya MENERIMA data; tidak mengubah konfigurasi router.
"""
import ipaddress
import logging
import socket
import struct
import threading
import time
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

DEFAULT_LOCAL_NETS = '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,100.64.0.0/10,fc00::/7'
OTHER = 'Lainnya'
MAX_KEYS = 200_000          # batas kunci agregasi di memori (perlindungan memori)
CLIENT_MIN_BYTES = 20_000   # entri klien yang lebih kecil ditahan di memori sampai cukup besar

# ID field NetFlow v9 = IPFIX IE untuk bidang yang kita pakai
F_BYTES, F_PKTS, F_PROTO, F_SPORT, F_SRC4, F_IN_IF, F_DPORT, F_DST4, F_OUT_IF, F_SRC6, F_DST6 = \
    1, 2, 4, 7, 8, 10, 11, 12, 14, 27, 28


def _ip4(b):
    return socket.inet_ntoa(b)


def _ip6(b):
    return socket.inet_ntop(socket.AF_INET6, b)


# ─────────────────────────── parser ───────────────────────────

def _parse_v5(data):
    if len(data) < 24:
        return []
    count = struct.unpack('!H', data[2:4])[0]
    out = []
    for i in range(count):
        o = 24 + i * 48
        if o + 48 > len(data):
            break
        (src, dst, _nh, inif, outif, pkts, octets, _f, _l, sport, dport, _p, _fl, proto, _tos,
         _sa, _da, _sm, _dm, _pad) = struct.unpack('!4s4s4sHHIIIIHHBBBBHHBBH', data[o:o + 48])
        out.append({'src': _ip4(src), 'dst': _ip4(dst), 'bytes': octets, 'pkts': pkts, 'in_if': inif,
                    'out_if': outif, 'sport': sport, 'dport': dport, 'proto': proto})
    return out


def _decode_records(buf, fields):
    """buf = isi satu data flowset; fields = [(type, length)]. → list dict."""
    rec_len = sum(l for _, l in fields)
    if rec_len <= 0:
        return []
    out, o = [], 0
    while o + rec_len <= len(buf):
        r, p = {}, o
        for t, l in fields:
            raw = buf[p:p + l]
            p += l
            if t == F_BYTES:
                r['bytes'] = int.from_bytes(raw, 'big')
            elif t == F_PKTS:
                r['pkts'] = int.from_bytes(raw, 'big')
            elif t == F_SRC4 and l == 4:
                r['src'] = _ip4(raw)
            elif t == F_DST4 and l == 4:
                r['dst'] = _ip4(raw)
            elif t == F_SRC6 and l == 16:
                r['src'] = _ip6(raw)
            elif t == F_DST6 and l == 16:
                r['dst'] = _ip6(raw)
            elif t == F_IN_IF:
                r['in_if'] = int.from_bytes(raw, 'big')
            elif t == F_OUT_IF:
                r['out_if'] = int.from_bytes(raw, 'big')
            elif t == F_PROTO:
                r['proto'] = int.from_bytes(raw, 'big')
        if 'src' in r and 'dst' in r:
            out.append(r)
        o += rec_len
    return out


def _parse_templated(data, templates, exporter, ipfix):
    """NetFlow v9 (ipfix=False) atau IPFIX (ipfix=True)."""
    if ipfix:
        if len(data) < 16:
            return []
        domain, pos = struct.unpack('!I', data[12:16])[0], 16
        tmpl_ids = (2,)
    else:
        if len(data) < 20:
            return []
        domain, pos = struct.unpack('!I', data[16:20])[0], 20
        tmpl_ids = (0,)
    flows = []
    while pos + 4 <= len(data):
        set_id, length = struct.unpack('!HH', data[pos:pos + 4])
        if length < 4 or pos + length > len(data):
            break
        body = data[pos + 4:pos + length]
        if set_id in tmpl_ids:
            o = 0
            while o + 4 <= len(body):
                tid, nfields = struct.unpack('!HH', body[o:o + 4])
                o += 4
                fields, ok = [], True
                for _ in range(nfields):
                    if o + 4 > len(body):
                        ok = False
                        break
                    ftype, flen = struct.unpack('!HH', body[o:o + 4])
                    o += 4
                    if ipfix and ftype & 0x8000:      # field enterprise: 4 byte PEN menyusul
                        ftype &= 0x7FFF
                        o += 4
                        ftype = -1
                    if flen == 0xFFFF:                # panjang variabel — tidak didukung
                        ok = False
                    fields.append((ftype, flen))
                if ok and tid >= 256:
                    templates[(exporter, domain, tid)] = fields
                elif tid >= 256:
                    templates.pop((exporter, domain, tid), None)
        elif set_id >= 256:
            fields = templates.get((exporter, domain, set_id))
            if fields:
                flows.extend(_decode_records(body, fields))
        pos += length
    return flows


def parse_packet(data, templates, exporter):
    """→ (versi, [flow dict]). Paket tak dikenal/rusak → (0, [])."""
    if len(data) < 4:
        return 0, []
    ver = struct.unpack('!H', data[:2])[0]
    try:
        if ver == 5:
            return 5, _parse_v5(data)
        if ver == 9:
            return 9, _parse_templated(data, templates, exporter, ipfix=False)
        if ver == 10:
            return 10, _parse_templated(data, templates, exporter, ipfix=True)
    except Exception as e:  # paket aneh jangan menjatuhkan kolektor
        logger.debug('flow parse error from %s: %s', exporter, e)
    return 0, []


# ─────────────────────────── klasifikasi & agregasi ───────────────────────────

def parse_nets(text):
    nets = []
    for part in (text or DEFAULT_LOCAL_NETS).replace(';', ',').replace('\n', ',').split(','):
        part = part.strip()
        if not part:
            continue
        try:
            nets.append(ipaddress.ip_network(part, strict=False))
        except ValueError:
            continue
    return nets or parse_nets(DEFAULT_LOCAL_NETS)


class Aggregator:
    """Mengumpulkan flow di memori. Thread-safe (kunci sederhana)."""

    def __init__(self, nets=None, resolve=None):
        self.nets = nets or parse_nets(DEFAULT_LOCAL_NETS)
        self.resolve = resolve or (lambda ip: None)      # ip → layanan | None
        self.lock = threading.Lock()
        self.svc = {}       # (bucket_ts, exporter, if_index, service) → [down, up]
        self.cli = {}       # (hour_ts, exporter, client_ip, service) → [down, up]
        self.pending = {}   # ip tujuan belum dikenal → byte (untuk resolver)
        self.stats = {}     # exporter → {'flows': n}
        self._local = {}

    def is_local(self, ip):
        v = self._local.get(ip)
        if v is None:
            try:
                a = ipaddress.ip_address(ip)
                v = any(a in n for n in self.nets if n.version == a.version)
            except ValueError:
                v = False
            if len(self._local) > 100_000:
                self._local.clear()
            self._local[ip] = v
        return v

    def add(self, exporter, flows, now=None):
        now = now or datetime.now(timezone.utc).replace(tzinfo=None)
        bucket = now.replace(minute=now.minute - now.minute % 5, second=0, microsecond=0)
        hour = now.replace(minute=0, second=0, microsecond=0)
        n = 0
        with self.lock:
            for f in flows:
                b = f.get('bytes') or 0
                if b <= 0:
                    continue
                s_loc, d_loc = self.is_local(f['src']), self.is_local(f['dst'])
                if s_loc == d_loc:
                    continue            # lokal↔lokal atau transit: bukan trafik internet pelanggan
                if d_loc:               # download: remote → pelanggan
                    client, remote, ifx, down = f['dst'], f['src'], f.get('in_if', 0), True
                else:                   # upload: pelanggan → remote
                    client, remote, ifx, down = f['src'], f['dst'], f.get('out_if', 0), False
                service = self.resolve(remote)
                if service is None:
                    service = OTHER
                    self.pending[remote] = self.pending.get(remote, 0) + b
                k1 = (bucket, exporter, ifx, service)
                k2 = (hour, exporter, client, service)
                if (k1 not in self.svc or k2 not in self.cli) and len(self.svc) + len(self.cli) > MAX_KEYS:
                    k1 = (bucket, exporter, ifx, OTHER)
                    k2 = (hour, exporter, client, OTHER)
                for d, k in ((self.svc, k1), (self.cli, k2)):
                    v = d.get(k)
                    if v is None:
                        v = d[k] = [0, 0]
                    v[0 if down else 1] += b
                n += 1
            st = self.stats.setdefault(exporter, {'flows': 0})
            st['flows'] += n
        return n

    def take_services(self):
        with self.lock:
            out, self.svc = self.svc, {}
        return out

    def take_clients(self, force=False, current_hour=None):
        """Ambil entri klien yang cukup besar (atau semua bila jamnya sudah lewat / force)."""
        with self.lock:
            out, keep = {}, {}
            for k, v in self.cli.items():
                if force or v[0] + v[1] >= CLIENT_MIN_BYTES or (current_hour and k[0] < current_hour):
                    out[k] = v
                else:
                    keep[k] = v
            self.cli = keep
        return out

    def take_pending(self, limit=60):
        with self.lock:
            items = sorted(self.pending.items(), key=lambda kv: -kv[1])[:limit]
            self.pending = {}
        return [ip for ip, _ in items]


# ─────────────────────────── penyimpanan ───────────────────────────

def _uq_cols(model):
    for c in model.__table__.constraints:
        if getattr(c, 'name', None) and c.name.startswith('uq_'):
            return [col.name for col in c.columns]
    return None


def _upsert_add(model, rows):
    if not rows:
        return
    from sqlalchemy.dialects.sqlite import insert
    from models import db
    cols = _uq_cols(model)
    for i in range(0, len(rows), 300):
        stmt = insert(model.__table__).values(rows[i:i + 300])
        stmt = stmt.on_conflict_do_update(
            index_elements=cols,
            set_={'down_bytes': model.__table__.c.down_bytes + stmt.excluded.down_bytes,
                  'up_bytes': model.__table__.c.up_bytes + stmt.excluded.up_bytes})
        db.session.execute(stmt)
    db.session.commit()


def flush_services(agg):
    from models import FlowBucket, FlowServiceHour
    data = agg.take_services()
    if not data:
        return 0
    rows = [{'ts': ts, 'exporter': ex, 'if_index': ifx, 'service': svc, 'down_bytes': v[0], 'up_bytes': v[1]}
            for (ts, ex, ifx, svc), v in data.items()]
    hourly = {}
    for r in rows:
        k = (r['ts'].replace(minute=0), r['exporter'], r['if_index'], r['service'])
        h = hourly.setdefault(k, [0, 0])
        h[0] += r['down_bytes']
        h[1] += r['up_bytes']
    hrows = [{'ts': ts, 'exporter': ex, 'if_index': ifx, 'service': svc, 'down_bytes': v[0], 'up_bytes': v[1]}
             for (ts, ex, ifx, svc), v in hourly.items()]
    _upsert_add(FlowBucket, rows)
    _upsert_add(FlowServiceHour, hrows)
    return len(rows)


def flush_clients(agg, force=False):
    from models import FlowClientHour
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    data = agg.take_clients(force=force, current_hour=now.replace(minute=0, second=0, microsecond=0))
    rows = [{'ts': ts, 'exporter': ex, 'client_ip': ip, 'service': svc, 'down_bytes': v[0], 'up_bytes': v[1]}
            for (ts, ex, ip, svc), v in data.items()]
    _upsert_add(FlowClientHour, rows)
    return len(rows)


def prune(now=None):
    from models import db, FlowBucket, FlowServiceHour, FlowClientHour, FlowIpName
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    cfg = get_settings()
    FlowBucket.query.filter(FlowBucket.ts < now - timedelta(days=cfg['flow_bucket_days'])).delete()
    FlowServiceHour.query.filter(FlowServiceHour.ts < now - timedelta(days=cfg['flow_hour_days'])).delete()
    FlowClientHour.query.filter(FlowClientHour.ts < now - timedelta(days=cfg['flow_client_days'])).delete()
    FlowIpName.query.filter(FlowIpName.resolved_at < now - timedelta(days=14)).delete()
    db.session.commit()


# ─────────────────────────── pengaturan ───────────────────────────

DEFAULTS = {'flow_enabled': 0, 'flow_port': 2055, 'flow_local_nets': DEFAULT_LOCAL_NETS,
            'flow_bucket_days': 3, 'flow_hour_days': 60, 'flow_client_days': 7, 'flow_dns_minutes': 5}
LIMITS = {'flow_port': (1024, 65535), 'flow_bucket_days': (1, 14), 'flow_hour_days': (7, 365),
          'flow_client_days': (1, 60), 'flow_dns_minutes': (1, 60), 'flow_enabled': (0, 1)}


def get_settings():
    from models import SystemConfig
    rows = {r.key: r.value for r in SystemConfig.query.filter(SystemConfig.key.in_(list(DEFAULTS))).all()}
    out = {}
    for k, d in DEFAULTS.items():
        v = rows.get(k)
        if k == 'flow_local_nets':
            out[k] = v if v else d
            continue
        try:
            n = int(v) if v not in (None, '') else d
        except (TypeError, ValueError):
            n = d
        lo, hi = LIMITS[k]
        out[k] = max(lo, min(hi, n))
    return out


def save_settings(data):
    from models import db, SystemConfig
    changed = []
    for k, d in DEFAULTS.items():
        if k not in data:
            continue
        if k == 'flow_local_nets':
            nets = parse_nets(str(data[k]))
            txt = ','.join(str(n) for n in nets)
        else:
            try:
                n = int(data[k])
            except (TypeError, ValueError):
                continue
            lo, hi = LIMITS[k]
            txt = str(max(lo, min(hi, n)))
        row = SystemConfig.query.filter_by(key=k).first()
        if row:
            if row.value != txt:
                row.value = txt
                changed.append(k)
        else:
            db.session.add(SystemConfig(key=k, value=txt))
            changed.append(k)
    db.session.commit()
    return changed


# ─────────────────────────── thread latar ───────────────────────────

_agg = Aggregator()
_exporters_dirty = {}   # ip → {'version','packets','flows'} yang belum ditulis


def get_aggregator():
    return _agg


def _note_exporter(ip, ver, nflows):
    e = _exporters_dirty.setdefault(ip, {'version': ver, 'packets': 0, 'flows': 0})
    e['version'] = ver or e['version']
    e['packets'] += 1
    e['flows'] += nflows


def _write_exporters():
    from models import db, FlowExporter
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    items = list(_exporters_dirty.items())
    _exporters_dirty.clear()
    for ip, e in items:
        row = db.session.get(FlowExporter, ip) or FlowExporter(ip=ip, packets=0, flows=0)
        row.last_seen, row.version = now, e['version']
        row.packets = (row.packets or 0) + e['packets']
        row.flows = (row.flows or 0) + e['flows']
        db.session.add(row)
    db.session.commit()


def run_flow_collector(app):
    """Thread latar (run_server.py). Idle sampai diaktifkan di Monitoring SNMP → Trafik Aplikasi."""
    from models import db
    import flow_names
    with app.app_context():
        logger.info('flow collector thread started')
        threading.Thread(target=flow_names.run_resolver, args=(app, _agg), daemon=True, name='flow-resolver').start()
        sock, bound, templates = None, None, {}
        last_flush = last_client = last_prune = last_cfg = time.time()
        cfg = {}
        while True:
            try:
                now = time.time()
                if sock is None or now - last_cfg > 30:
                    last_cfg = now
                    cfg = get_settings()
                    _agg.nets = parse_nets(cfg['flow_local_nets'])
                    _agg._local.clear()
                    want = cfg['flow_port'] if cfg['flow_enabled'] else None
                    if want != bound:
                        if sock:
                            sock.close()
                            sock = None
                        bound = want
                        if want:
                            try:
                                sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                                sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4 * 1024 * 1024)
                                sock.bind(('0.0.0.0', want))
                                sock.settimeout(1.0)
                                logger.info('flow collector listening on udp/%s', want)
                            except OSError as e:
                                logger.error('flow collector cannot bind udp/%s: %s', want, e)
                                sock, bound = None, None
                if sock is None:
                    time.sleep(5)
                    continue
                try:
                    data, addr = sock.recvfrom(65535)
                    ver, flows = parse_packet(data, templates, addr[0])
                    if ver:
                        n = _agg.add(addr[0], flows)
                        _note_exporter(addr[0], ver, n)
                except socket.timeout:
                    pass
                now = time.time()
                if now - last_flush >= 60:
                    last_flush = now
                    flush_services(_agg)
                    _write_exporters()
                if now - last_client >= 300:
                    last_client = now
                    flush_clients(_agg)
                if now - last_prune >= 3600:
                    last_prune = now
                    prune()
            except Exception as e:
                db.session.rollback()
                logger.error('flow collector error: %s', e)
                time.sleep(2)
