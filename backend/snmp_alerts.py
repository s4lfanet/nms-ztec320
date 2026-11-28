"""Alert ambang batas perangkat SNMP (tahap 3) — dipanggil dari siklus alert
(`alerts._check_onus_for_tenant`) setelah `integration_health.check_snmp_devices`.

Hanya membaca tabel yang diisi poller SNMP (snmp_monitor); tidak menghubungi
perangkat. Setiap alert di-dedupe per (category, target_type, target_id) yang
belum resolved, dan punya histeresis supaya tidak naik-turun di sekitar batas.

Kategori:
  snmp_port_down  port yang DIPANTAU (watched) turun ≥ snmp_down_minutes
  snmp_port_flap  port dipantau turun ≥ snmp_flap_count kali dalam snmp_flap_minutes
  snmp_port_util  utilisasi port dipantau ≥ snmp_util_threshold % selama snmp_util_cycles poll
  snmp_port_err   error/dtk port dipantau ≥ snmp_err_threshold
  snmp_cpu        CPU perangkat ≥ snmp_cpu_threshold % selama snmp_cpu_cycles poll
  snmp_temp       suhu tertinggi perangkat ≥ snmp_temp_threshold °C

Alert port hanya untuk port bertanda "Pantau" (uplink/backbone) — port akses
pelanggan sengaja tidak dialert agar tidak berisik.
"""
import logging
from datetime import datetime, timedelta, timezone

from models import db, Notification, SystemConfig, SnmpDevice, SnmpPort, SnmpEvent, SnmpSample, SnmpSensorRule, SnmpSensor

logger = logging.getLogger(__name__)

CATEGORIES = ('snmp_port_down', 'snmp_port_flap', 'snmp_port_util', 'snmp_port_err', 'snmp_cpu', 'snmp_temp',
              'snmp_optical', 'snmp_rule', 'flow_anomaly', 'snmp_status')

DEFAULTS = {
    'snmp_down_minutes': 4,
    'snmp_cpu_threshold': 85,
    'snmp_cpu_cycles': 3,
    'snmp_temp_threshold': 70,
    'snmp_util_threshold': 90,
    'snmp_util_cycles': 3,
    'snmp_err_threshold': 1,
    'snmp_flap_count': 4,
    'snmp_flap_minutes': 30,
    'snmp_rx_low_dbm': -25,
    'snmp_hold_minutes': 3,
}
LIMITS = {
    'snmp_down_minutes': (1, 120), 'snmp_cpu_threshold': (10, 100), 'snmp_cpu_cycles': (1, 20),
    'snmp_temp_threshold': (30, 120), 'snmp_util_threshold': (10, 100), 'snmp_util_cycles': (1, 20),
    'snmp_err_threshold': (0.01, 100000), 'snmp_flap_count': (2, 50), 'snmp_flap_minutes': (5, 240),
    'snmp_rx_low_dbm': (-40, 0), 'snmp_hold_minutes': (0, 60),
}


def get_settings():
    rows = {r.key: r.value for r in SystemConfig.query.filter(SystemConfig.key.in_(list(DEFAULTS))).all()}
    out = {}
    for k, d in DEFAULTS.items():
        try:
            v = float(rows[k]) if rows.get(k) not in (None, '') else d
        except (TypeError, ValueError):
            v = d
        lo, hi = LIMITS[k]
        v = min(max(v, lo), hi)
        out[k] = int(v) if isinstance(d, int) and k not in ('snmp_err_threshold', 'snmp_rx_low_dbm') else v
    return out


def save_settings(data):
    """Simpan nilai yang valid. → daftar key yang berubah."""
    changed = []
    for k in DEFAULTS:
        if k not in data:
            continue
        try:
            v = float(data[k])
        except (TypeError, ValueError):
            continue
        lo, hi = LIMITS[k]
        v = min(max(v, lo), hi)
        txt = str(v) if k in ('snmp_err_threshold', 'snmp_rx_low_dbm') else str(int(round(v)))
        row = SystemConfig.query.filter_by(key=k).first()
        if row:
            if row.value != txt:
                row.value = txt
                changed.append(k)
        else:
            db.session.add(SystemConfig(key=k, value=txt))
            changed.append(k)
    return changed


OVR_KEY = 'snmp_group_overrides'


def _clamp(k, v):
    lo, hi = LIMITS[k]
    v = min(max(float(v), lo), hi)
    d = DEFAULTS[k]
    return int(round(v)) if isinstance(d, int) and k not in ('snmp_err_threshold', 'snmp_rx_low_dbm') else v


def clean_overrides(data):
    """{grup: {key: nilai}} → hanya key/nilai valid, dijepit LIMITS; grup kosong dibuang."""
    out = {}
    if not isinstance(data, dict):
        return out
    for g, vals in data.items():
        g = str(g).strip()[:100]
        if not g or not isinstance(vals, dict):
            continue
        clean = {}
        for k, v in vals.items():
            if k not in DEFAULTS or v in (None, ''):
                continue
            try:
                clean[k] = _clamp(k, v)
            except (TypeError, ValueError):
                continue
        if clean:
            out[g] = clean
    return out


def get_group_overrides():
    import json
    row = SystemConfig.query.filter_by(key=OVR_KEY).first()
    try:
        return clean_overrides(json.loads(row.value)) if row and row.value else {}
    except (TypeError, ValueError):
        return {}


def save_group_overrides(data):
    """Ganti seluruh override grup. → True bila berubah."""
    import json
    txt = json.dumps(clean_overrides(data), ensure_ascii=False, sort_keys=True)
    row = SystemConfig.query.filter_by(key=OVR_KEY).first()
    if row:
        if row.value == txt:
            return False
        row.value = txt
    else:
        db.session.add(SystemConfig(key=OVR_KEY, value=txt))
    return True


def cfg_for(dev, cfg, overrides):
    """Ambang efektif perangkat: global ditimpa override grupnya (bila ada)."""
    o = overrides.get((getattr(dev, 'group_name', '') or '').strip())
    return {**cfg, **o} if o else cfg


def _last_values(device_id, port_id, metric, n, since):
    q = SnmpSample.query.filter(SnmpSample.device_id == device_id, SnmpSample.metric == metric,
                                SnmpSample.ts >= since)
    q = q.filter(SnmpSample.port_id == port_id) if port_id else q.filter(SnmpSample.port_id.is_(None))
    return [r.value for r in q.order_by(SnmpSample.ts.desc()).limit(n).all()]


def _fmt_bps(v):
    v = v or 0
    for unit, div in (('Gbps', 1e9), ('Mbps', 1e6), ('Kbps', 1e3)):
        if v >= div:
            return f'{v / div:.2f} {unit}'
    return f'{v:.0f} bps'


def stamp(msg, now):
    """Tambahkan baris waktu (zona waktu sistem, mis. WIB) di akhir pesan alert."""
    try:
        from alerts import _get_tz
        dt = now.replace(tzinfo=timezone.utc) if now.tzinfo is None else now
        local = dt.astimezone(_get_tz())
        return f'{msg}\n\n🕒 Waktu: {local.strftime("%d/%m/%Y, %H.%M.%S")} {local.tzname() or ""}'.rstrip()
    except Exception:
        return msg


def fmt_duration(delta):
    """'5 menit', '2 jam 10 menit', '1 hari 3 jam' — untuk pesan pulih."""
    mins = max(int(delta.total_seconds() // 60), 0)
    if mins < 60:
        return f'{mins} menit'
    if mins < 1440:
        return f'{mins // 60} jam' + (f' {mins % 60} menit' if mins % 60 else '')
    return f'{mins // 1440} hari' + (f' {(mins % 1440) // 60} jam' if (mins % 1440) // 60 else '')


def port_label(p):
    return p.name + (f' ({p.alias})' if p.alias else '')


# Kategori tanpa persistensi bawaan (satu bacaan sudah memicu) → ditahan `snmp_hold_minutes`
# supaya WARNING lalu UP dalam hitungan menit (naik-turun sesaat) tidak membanjiri grup.
HOLD_CATS = ('snmp_temp', 'snmp_optical', 'snmp_port_err', 'snmp_status')


class _Ctx:
    hold = 0

    def __init__(self, now, notifications_to_create, alerts_to_send):
        self.now, self.notifs, self.alerts = now, notifications_to_create, alerts_to_send
        try:
            self.hold = int(get_settings()['snmp_hold_minutes'])
        except Exception:
            self.hold = 0
        self.open = {}
        for n in Notification.query.filter(Notification.category.in_(CATEGORIES),
                                           Notification.resolved.is_(False)).all():
            self.open[(n.category, n.target_type, n.target_id)] = n

    def is_open(self, category, target_type, target_id):
        return (category, target_type, target_id) in self.open

    def _held(self, category, target_id, active):
        """True bila kondisi bermasalah belum bertahan cukup lama untuk dialert.
        Waktu mulai disimpan di SystemConfig `snmp_hold_<kategori>_<id>`; hilang saat kondisi pulih."""
        k = f'snmp_hold_{category}_{target_id}'
        row = SystemConfig.query.filter_by(key=k).first()
        if not active:
            if row:
                db.session.delete(row)
            return False
        now = self.now.replace(tzinfo=None)
        if row is None:
            db.session.add(SystemConfig(key=k, value=now.isoformat()))
            return True
        try:
            since = datetime.fromisoformat(row.value)
        except ValueError:
            row.value = now.isoformat()
            return True
        if now - since >= timedelta(minutes=self.hold):
            db.session.delete(row)
            return False
        return True

    def toggle(self, dev, category, target_type, target_id, active, severity, title, message,
               recovery_title, recovery_msg, quiet_recovery=False):
        key = (category, target_type, target_id)
        notif = self.open.get(key)
        if self.hold > 0 and category in HOLD_CATS and notif is None:
            if self._held(category, target_id, active):
                return
        base = {'olt_id': None, 'olt_name': dev.name, 'olt_ip': dev.host,
                'target_type': target_type, 'target_id': target_id}
        if active and not notif:
            self.notifs.append({'olt_id': None, 'onu_id': None, 'severity': severity, 'category': category,
                                'title': title, 'message': message, 'target_roles': '',
                                'target_type': target_type, 'target_id': target_id})
            self.alerts.append(dict(base, type=category, severity=severity, title=title,
                                    message=stamp(message, self.now), is_recovery=False))
            self.open[key] = True  # cegah duplikat dalam siklus yang sama
        elif not active and notif is not None and notif is not True:
            notif.resolved, notif.resolved_at, notif.is_read = True, self.now, True
            if not quiet_recovery:  # naik/turun level (Warning ↔ Down) tidak perlu pesan "pulih"
                msg = recovery_msg
                try:  # berapa lama bermasalah (waktu notifikasi dibuat → sekarang)
                    if notif.created_at:
                        ca = notif.created_at if notif.created_at.tzinfo else notif.created_at.replace(tzinfo=timezone.utc)
                        now = self.now if self.now.tzinfo else self.now.replace(tzinfo=timezone.utc)
                        msg += f'\nPerangkat: {dev.name} ({dev.host})\nLama bermasalah: {fmt_duration(now - ca)}'
                except Exception:
                    pass
                self.alerts.append(dict(base, type=category + '_recovery', severity='info', title=recovery_title,
                                        message=stamp(msg, self.now), is_recovery=True))
            del self.open[key]


def _head(dev, title):
    return f'{title}\n\nPerangkat: {dev.name} ({dev.host})' + (f'\nLokasi: {dev.location}' if dev.location else '') \
        + (f'\nGrup: {dev.group_name}' if getattr(dev, 'group_name', '') else '')


def _check_device(c, dev, cfg):
    now = c.now
    recent = now - timedelta(minutes=30)
    # CPU tinggi berkelanjutan (dari sampel poll, bukan satu bacaan)
    th = cfg['snmp_cpu_threshold']
    vals = _last_values(dev.id, None, 'cpu:cpu', cfg['snmp_cpu_cycles'], recent)
    if c.is_open('snmp_cpu', 'snmp', dev.id):
        hot = bool(vals) and vals[0] >= th - 10   # histeresis: pulih bila turun 10 poin di bawah batas
    else:
        hot = len(vals) >= cfg['snmp_cpu_cycles'] and min(vals) >= th
    cur = f'{vals[0]:.0f}%' if vals else '-'
    c.toggle(dev, 'snmp_cpu', 'snmp', dev.id, hot, 'warning',
             f'🟠 CPU tinggi: {dev.name} ({cur})',
             _head(dev, '🟠 CPU PERANGKAT TINGGI') + f'\nCPU: {cur} (batas {th:.0f}%, '
             f'{cfg["snmp_cpu_cycles"]} poll berturut-turut)\n\n⚠️ Cek trafik, proses, dan beban perangkat.',
             f'✅ CPU normal: {dev.name}', f'✅ CPU {dev.name} kembali normal ({cur}).')
    # Suhu
    th = cfg['snmp_temp_threshold']
    t = dev.temperature
    if c.is_open('snmp_temp', 'snmp', dev.id):
        hot = t is not None and t >= th - 3
    else:
        hot = t is not None and t >= th
    c.toggle(dev, 'snmp_temp', 'snmp', dev.id, hot, 'warning',
             f'🌡️ Suhu tinggi: {dev.name} ({t}°C)',
             _head(dev, '🌡️ SUHU PERANGKAT TINGGI') + f'\nSuhu: {t}°C (batas {th:.0f}°C)\n\n'
             f'⚠️ Cek pendingin ruang/rak dan kipas perangkat.',
             f'✅ Suhu normal: {dev.name}', f'✅ Suhu {dev.name} kembali normal ({t}°C).')
    # Sensor status (PSU/kipas): nilai 1 = ok, 0 = gagal (MIKROTIK-MIB). Hanya bacaan segar yang dinilai.
    fresh = now.replace(tzinfo=None) - timedelta(minutes=30)
    for sn in SnmpSensor.query.filter_by(device_id=dev.id, kind='status').all():
        if sn.value is None or not sn.updated_at or sn.updated_at < fresh:
            continue
        bad = sn.value < 0.5
        c.toggle(dev, 'snmp_status', 'snmp_sensor', sn.id, bad, 'critical',
                 f'🔴 {sn.name} GAGAL: {dev.name}',
                 _head(dev, f'🔴 SENSOR STATUS GAGAL: {sn.name}') + f'\nStatus: FAIL\n\n'
                 f'⚠️ Cek modul/kabel power atau kipas perangkat sekarang; redundansi bisa sedang hilang.',
                 f'✅ {sn.name} normal: {dev.name}', f'✅ {sn.name} di {dev.name} kembali OK.')


def _olt_impact(port_id):
    """Baris tambahan alert port turun: OLT (dan jumlah ONU) yang terhubung lewat port ini."""
    import snmp_topology
    rows = snmp_topology.olts_behind_port(port_id)
    if not rows:
        return ''
    return '\n\n📡 OLT terdampak: ' + '; '.join(f'{n} ({tot} ONU, {on} online)' for n, tot, on in rows)


def _check_port(c, dev, p, cfg):
    now = c.now
    label = port_label(p)
    # Port turun
    down = (p.admin_status == 'up' and p.oper_status not in ('up', '') and p.status_changed_at is not None
            and now - p.status_changed_at >= timedelta(minutes=cfg['snmp_down_minutes']))
    mins = int((now - p.status_changed_at).total_seconds() // 60) if p.status_changed_at else 0
    c.toggle(dev, 'snmp_port_down', 'snmp_port', p.id, down, 'critical',
             f'🔴 Port turun: {dev.name} {label}',
             _head(dev, '🔴 PORT DIPANTAU TURUN') + f'\nPort: {label}\nSebab: ifOperStatus={p.oper_status}, ifAdminStatus={p.admin_status} '
             f'(port diaktifkan tetapi link tidak naik)'
             f'\nTurun sejak: {mins} menit lalu' + (_olt_impact(p.id) if down else ''),
             f'✅ Port naik: {dev.name} {label}', f'✅ Port {label} di {dev.name} kembali UP.')
    # Flapping: banyak port_down dalam jendela waktu
    win = now - timedelta(minutes=cfg['snmp_flap_minutes'])
    flaps = SnmpEvent.query.filter(SnmpEvent.port_id == p.id, SnmpEvent.kind == 'port_down',
                                   SnmpEvent.created_at >= win).count()
    if c.is_open('snmp_port_flap', 'snmp_port', p.id):
        flapping = flaps >= 1   # pulih setelah satu jendela penuh tanpa turun
    else:
        flapping = flaps >= cfg['snmp_flap_count']
    c.toggle(dev, 'snmp_port_flap', 'snmp_port', p.id, flapping, 'warning',
             f'🟠 Port tidak stabil: {dev.name} {label}',
             _head(dev, '🟠 PORT NAIK-TURUN (FLAPPING)') + f'\nPort: {label}\n'
             f'Turun {flaps}× dalam {cfg["snmp_flap_minutes"]} menit terakhir\n\n'
             f'⚠️ Cek kabel/SFP/patch cord, redaman, dan sisi perangkat lawan.',
             f'✅ Port stabil: {dev.name} {label}',
             f'✅ Port {label} di {dev.name} stabil lagi ({cfg["snmp_flap_minutes"]} menit tanpa turun).')
    # Utilisasi
    if p.speed_mbps:
        cap = p.speed_mbps * 1e6
        th = cfg['snmp_util_threshold']
        n = cfg['snmp_util_cycles']
        recent = now - timedelta(minutes=30)
        vin = _last_values(dev.id, p.id, 'in', n, recent)
        vout = _last_values(dev.id, p.id, 'out', n, recent)
        pct = lambda vs: [v / cap * 100 for v in vs]
        pin, pout = pct(vin), pct(vout)
        cur = max(pin[:1] + pout[:1], default=0)
        if c.is_open('snmp_port_util', 'snmp_port', p.id):
            busy = cur >= th - 10
        else:
            busy = (len(pin) >= n and min(pin) >= th) or (len(pout) >= n and min(pout) >= th)
        direction = 'masuk' if (pin[:1] or [0])[0] >= (pout[:1] or [0])[0] else 'keluar'
        c.toggle(dev, 'snmp_port_util', 'snmp_port', p.id, busy, 'warning',
                 f'🟠 Port padat: {dev.name} {label} ({cur:.0f}%)',
                 _head(dev, '🟠 UTILISASI PORT TINGGI') + f'\nPort: {label} ({p.speed_mbps} Mbps)\n'
                 f'Trafik {direction}: {cur:.0f}% (batas {th:.0f}%, {n} poll berturut-turut)\n'
                 f'Masuk {_fmt_bps(p.in_bps)} · Keluar {_fmt_bps(p.out_bps)}\n\n'
                 f'⚠️ Pelanggan di belakang port ini bisa merasakan lambat. Pertimbangkan upgrade kapasitas.',
                 f'✅ Utilisasi normal: {dev.name} {label}',
                 f'✅ Port {label} di {dev.name} kembali normal ({cur:.0f}%).')
    # Redaman SFP (optik): RX di bawah batas saat link masih UP = sinyal menurun (peringatan dini).
    # Link putus karena tidak ada cahaya sudah ditangani alert port turun — tidak dikirim dua kali.
    if p.dom_at is not None and p.dom_rx_dbm is not None and p.oper_status == 'up':
        th = cfg['snmp_rx_low_dbm']
        rx = p.dom_rx_dbm
        if c.is_open('snmp_optical', 'snmp_port', p.id):
            bad = rx < th + 1   # histeresis 1 dB
        else:
            bad = rx < th
        rx_txt = f'{rx:.2f} dBm'
        tx_txt = f'{p.dom_tx_dbm:.2f} dBm' if p.dom_tx_dbm is not None else '-'
        c.toggle(dev, 'snmp_optical', 'snmp_port', p.id, bad, 'warning',
                 f'🔦 Redaman SFP: {dev.name} {label} (RX {rx_txt})',
                 _head(dev, '🔦 REDAMAN SFP BURUK') + f'\nPort: {label}\nRX: {rx_txt} (batas {th:g} dBm)\nTX: {tx_txt}'
                 + '\n\n⚠️ Cek patch cord/konektor kotor, tekukan kabel, dan sisi perangkat lawan.',
                 f'✅ Redaman normal: {dev.name} {label}', f'✅ RX port {label} di {dev.name} normal lagi ({rx_txt}).')
    # Error
    th = cfg['snmp_err_threshold']
    err = (p.in_err_rate or 0) + (p.out_err_rate or 0)
    if c.is_open('snmp_port_err', 'snmp_port', p.id):
        bad = err >= th / 2
    else:
        bad = err >= th
    c.toggle(dev, 'snmp_port_err', 'snmp_port', p.id, bad, 'warning',
             f'🟠 Error port: {dev.name} {label} ({err:.1f}/dtk)',
             _head(dev, '🟠 ERROR PORT MENINGKAT') + f'\nPort: {label}\n'
             f'Error: masuk {p.in_err_rate or 0:.2f}/dtk, keluar {p.out_err_rate or 0:.2f}/dtk (batas {th:g}/dtk)\n\n'
             f'⚠️ Biasanya kabel/konektor/SFP kotor atau rusak, atau duplex tidak cocok.',
             f'✅ Error port normal: {dev.name} {label}', f'✅ Error di port {label} ({dev.name}) sudah berhenti.')


_UNIT = {'in': 'bit/s', 'out': 'bit/s', 'in_err': 'err/dtk', 'out_err': 'err/dtk'}


def _fmt_rule_val(metric, v):
    if v is None:
        return '-'
    return _fmt_bps(v) if metric in ('in', 'out') else f'{v:g}'


def _check_rules(c, dev, rules, poll_seconds):
    """Sensor kustom: hitung level, simpan status, kirim alert saat berubah."""
    import snmp_rules
    for r in rules:
        level, last = snmp_rules.evaluate(r, c.now, poll_seconds)
        r.last_value = last
        if level is None:
            continue  # data belum cukup — pertahankan status & alert
        if r.status != level:
            r.status, r.status_since = level, c.now
        sym = '>' if r.op == 'gt' else '<'
        thr = r.crit if level == 'down' else r.warn
        what = (f'{r.name}' + (f' ({_fmt_rule_val(r.metric, last)})' if last is not None else ''))
        body = (f'\nSensor: {r.name}\nNilai: {_fmt_rule_val(r.metric, last)}\n'
                f'Ambang {"Down" if level == "down" else "Warning"}: {sym} {_fmt_rule_val(r.metric, thr)} '
                f'selama ≥ {r.minutes} menit')
        c.toggle(dev, 'snmp_rule', 'snmp_rule_c', r.id, level == 'down', 'critical',
                 f'🔴 Sensor DOWN: {dev.name} — {r.name}', _head(dev, '🔴 SENSOR DOWN') + body,
                 f'✅ Sensor pulih: {dev.name} — {r.name}', f'✅ Sensor {what} di {dev.name} kembali normal.',
                 quiet_recovery=(level == 'warning'))
        c.toggle(dev, 'snmp_rule', 'snmp_rule_w', r.id, level == 'warning', 'warning',
                 f'🟠 Sensor WARNING: {dev.name} — {r.name}', _head(dev, '🟠 SENSOR WARNING') + body,
                 f'✅ Sensor pulih: {dev.name} — {r.name}', f'✅ Sensor {what} di {dev.name} kembali normal.',
                 quiet_recovery=(level == 'down'))


def check_snmp_thresholds(now, notifications_to_create, alerts_to_send):
    cfg = get_settings()
    ovr = get_group_overrides()
    c = _Ctx(now, notifications_to_create, alerts_to_send)
    try:
        import snmp_monitor
        poll_s = snmp_monitor._cfg_int('snmp_poll_interval', 300, 60, 3600)
    except Exception:
        poll_s = 300
    from snmp_depend import Scope
    scope = Scope(now)
    for dev in SnmpDevice.query.filter_by(enabled=True).all():
        if dev.status != 'up':
            continue  # perangkat turun ditangani snmp_down; data lama jangan memicu alert
        if scope.in_maintenance(dev):
            continue  # pemeliharaan: alert ambang ditahan (perangkat 'up' = terjangkau, induk turun tidak relevan)
        try:
            dcfg = cfg_for(dev, cfg, ovr)
            _check_device(c, dev, dcfg)
            rules = SnmpSensorRule.query.filter_by(device_id=dev.id, enabled=True).all()
            if rules:
                _check_rules(c, dev, rules, poll_s)
            for p in SnmpPort.query.filter_by(device_id=dev.id, watched=True, ignored=False, deleted=False).all():
                _check_port(c, dev, p, dcfg)
        except Exception as e:  # satu perangkat bermasalah tidak menghentikan yang lain
            logger.warning(f'[SNMP-ALERT] {dev.name}: {e}')
    # Port yang tidak lagi dipantau / perangkat dihapus → tutup alert yang masih terbuka
    for (cat, ttype, tid), n in list(c.open.items()):
        if n is True:
            continue
        if ttype in ('snmp_rule_w', 'snmp_rule_c'):  # aturan dihapus/dinonaktifkan → tutup alertnya
            r = db.session.get(SnmpSensorRule, tid)
            if not r or not r.enabled:
                n.resolved, n.resolved_at, n.is_read = True, now, True
            continue
        if ttype != 'snmp_port':
            continue
        p = db.session.get(SnmpPort, tid)
        if not p or not p.watched or p.ignored or p.deleted:
            n.resolved, n.resolved_at, n.is_read = True, now, True
