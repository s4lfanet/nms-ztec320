"""Ringkasan mingguan pemantauan SNMP → Telegram/WhatsApp (kanal alert yang sama).

Hanya membaca SnmpEvent/SnmpDevice/SnmpPort. Dijadwalkan dari poller SNMP; dikendalikan
SystemConfig: snmp_digest_enabled (0/1, bawaan 0), snmp_digest_day (0=Senin…6), snmp_digest_hour (0–23, zona NMS)."""
import logging
from datetime import datetime, timedelta, timezone

from models import db, SystemConfig, SnmpDevice, SnmpEvent, SnmpPort

logger = logging.getLogger(__name__)
LAST_KEY = 'snmp_digest_last'


def _cfg(key, default):
    r = SystemConfig.query.filter_by(key=key).first()
    return r.value if r and r.value not in (None, '') else default


def settings():
    def i(k, d, lo, hi):
        try:
            return min(max(int(_cfg(k, d)), lo), hi)
        except (TypeError, ValueError):
            return d
    return {'snmp_digest_enabled': i('snmp_digest_enabled', 0, 0, 1),
            'snmp_digest_day': i('snmp_digest_day', 0, 0, 6),
            'snmp_digest_hour': i('snmp_digest_hour', 7, 0, 23),
            'snmp_digest_pdf': i('snmp_digest_pdf', 0, 0, 1)}


def save_settings(data):
    changed = []
    for k, (lo, hi) in {'snmp_digest_enabled': (0, 1), 'snmp_digest_day': (0, 6), 'snmp_digest_hour': (0, 23),
                         'snmp_digest_pdf': (0, 1)}.items():
        if k in data:
            try:
                v = min(max(int(data[k]), lo), hi)
            except (TypeError, ValueError):
                continue
            r = SystemConfig.query.filter_by(key=k).first()
            if r:
                r.value = str(v)
            else:
                db.session.add(SystemConfig(key=k, value=str(v)))
            changed.append(k)
    return changed


def downtime_seconds(events, start, end):
    """Murni: total detik 'turun' dari event device_down/device_up (urut waktu) di [start,end].
    Turun yang belum pulih dihitung sampai `end`; turun sebelum `start` dianggap dari `start`
    bila event pertama di jendela adalah 'device_up'."""
    total, down_at = 0, None
    evs = sorted(events, key=lambda e: e[1])
    if evs and evs[0][0] == 'device_up':
        down_at = start
    for kind, at in evs:
        if kind == 'device_down' and down_at is None:
            down_at = at
        elif kind == 'device_up' and down_at is not None:
            total += max(0, (at - down_at).total_seconds())
            down_at = None
    if down_at is not None:
        total += max(0, (end - down_at).total_seconds())
    return int(total)


def _fmt_dur(sec):
    if sec < 60:
        return f'{sec} dtk'
    m = sec // 60
    if m < 60:
        return f'{m} mnt'
    return f'{m // 60} j {m % 60} mnt'


def build(now=None, days=7):
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    start = now - timedelta(days=days)
    devs = SnmpDevice.query.filter_by(enabled=True).all()
    if not devs:
        return None
    evs = SnmpEvent.query.filter(SnmpEvent.created_at >= start,
                                 SnmpEvent.kind.in_(('device_down', 'device_up'))).all()
    by_dev = {}
    for e in evs:
        by_dev.setdefault(e.device_id, []).append((e.kind, e.created_at))
    span = days * 86400
    rows = []
    for d in devs:
        down = downtime_seconds(by_dev.get(d.id, []), start, now)
        n_down = sum(1 for k, _ in by_dev.get(d.id, []) if k == 'device_down')
        rows.append((d, down, n_down, max(0.0, 100 - down / span * 100)))
    avg = sum(r[3] for r in rows) / len(rows)
    bad = sorted((r for r in rows if r[2] or r[1]), key=lambda r: (-r[1], -r[2]))[:5]
    flaps = {}
    for e in SnmpEvent.query.filter(SnmpEvent.created_at >= start, SnmpEvent.kind == 'port_down',
                                    SnmpEvent.port_id.isnot(None)).all():
        flaps[e.port_id] = flaps.get(e.port_id, 0) + 1
    top_ports = sorted(flaps.items(), key=lambda kv: -kv[1])[:3]
    port_names = {}
    if top_ports:
        by_dev_name = {d.id: d.name for d in devs}
        for p in SnmpPort.query.filter(SnmpPort.id.in_([k for k, _ in top_ports])).all():
            port_names[p.id] = f'{by_dev_name.get(p.device_id, "?")} {p.name}'
    busy = []
    for p in SnmpPort.query.filter_by(watched=True, ignored=False, deleted=False).all():
        if p.speed_mbps and p.oper_status == 'up':
            u = max(p.in_bps or 0, p.out_bps or 0) / (p.speed_mbps * 1e6) * 100
            busy.append((u, p))
    busy.sort(key=lambda x: -x[0])
    names = {d.id: d.name for d in devs}

    lines = [f'📊 RINGKASAN MINGGUAN SNMP ({days} hari)', '',
             f'Perangkat dipantau: {len(devs)}', f'Rata-rata ketersediaan: {avg:.2f}%']
    if bad:
        lines += ['', '🔻 Paling sering/lama turun:']
        for d, down, n, up in bad:
            lines.append(f'• {d.name}: {n}× turun, total {_fmt_dur(down)} ({up:.2f}%)')
    else:
        lines += ['', '✅ Tidak ada perangkat yang turun minggu ini.']
    if top_ports:
        lines += ['', '🔁 Port paling sering naik-turun:']
        lines += [f'• {port_names.get(pid, pid)}: {n}×' for pid, n in top_ports]
    if busy and busy[0][0] >= 1:
        lines += ['', '📈 Port dipantau paling padat saat ini:']
        lines += [f'• {names.get(p.device_id, "?")} {p.name}: {u:.0f}%' for u, p in busy[:3]]
    return '\n'.join(lines)


def send(now=None):
    """Bangun & kirim ringkasan. → True bila terkirim."""
    text = build(now)
    if not text:
        return False
    from alerts import _send_external_alerts
    from models import AlertRule
    _send_external_alerts([{'olt_id': None, 'olt_name': 'SNMP', 'olt_ip': '', 'type': 'snmp_digest',
                            'severity': 'info', 'is_recovery': False,
                            'title': '📊 Ringkasan mingguan SNMP', 'message': text}], AlertRule.query.first())
    if settings()['snmp_digest_pdf']:
        try:
            import snmp_report
            snmp_report.send_pdf(now)
        except Exception as e:
            logger.warning('snmp digest pdf failed: %s', e)
    return True


def maybe_send():
    """Dipanggil tiap siklus poller; kirim paling banyak sekali per hari terjadwal."""
    cfg = settings()
    if not cfg['snmp_digest_enabled']:
        return False
    from alerts import _get_tz
    local = datetime.now(timezone.utc).astimezone(_get_tz())
    if local.weekday() != cfg['snmp_digest_day'] or local.hour < cfg['snmp_digest_hour']:
        return False
    stamp = local.strftime('%Y-%m-%d')
    if _cfg(LAST_KEY, '') == stamp:
        return False
    r = SystemConfig.query.filter_by(key=LAST_KEY).first()
    if r:
        r.value = stamp
    else:
        db.session.add(SystemConfig(key=LAST_KEY, value=stamp))
    db.session.commit()   # tandai dulu: gagal kirim tidak diulang tiap siklus
    try:
        return send()
    except Exception as e:
        logger.warning('snmp digest send failed: %s', e)
        return False
