"""Pemantauan integrasi (dipanggil dari siklus alert `alerts._check_onus_for_tenant`):
kesehatan router MikroTik — tidak terjangkau, CPU tinggi berkelanjutan, suhu tinggi.

Hanya membaca kolom yang diisi poller (`link_state_poller.read_health`); tidak
menghubungi router sendiri. Notifikasi di-dedupe per (category, target_type='mikrotik',
target_id) yang belum resolved; saat pulih → resolved + pesan pulih.

SystemConfig: mikrotik_cpu_threshold (85), mikrotik_temp_threshold (70),
mikrotik_down_minutes (5), mikrotik_cpu_cycles (3).
"""
import logging
from datetime import timedelta

from models import db, MikrotikDevice, Notification, SystemConfig

logger = logging.getLogger(__name__)


def _cfg_num(key, default):
    row = SystemConfig.query.filter_by(key=key).first()
    try:
        return float(row.value) if row and row.value not in (None, '') else default
    except (TypeError, ValueError):
        return default


def _open_notif(category, dev_id):
    return Notification.query.filter_by(category=category, target_type='mikrotik',
                                        target_id=dev_id, resolved=False).first()


def _toggle(dev, now, category, active, severity, title, message, recovery_title, recovery_msg,
            notifications_to_create, alerts_to_send):
    notif = _open_notif(category, dev.id)
    base = {'olt_id': None, 'olt_name': dev.name, 'olt_ip': dev.host, 'target_type': 'mikrotik',
            'target_id': dev.id}
    if active and not notif:
        notifications_to_create.append({'olt_id': None, 'onu_id': None, 'severity': severity,
                                        'category': category, 'title': title, 'message': message,
                                        'target_roles': '', 'target_type': 'mikrotik', 'target_id': dev.id})
        alerts_to_send.append(dict(base, type=category, severity=severity, title=title,
                                   message=message, is_recovery=False))
    elif not active and notif:
        notif.resolved, notif.resolved_at, notif.is_read = True, now, True
        alerts_to_send.append(dict(base, type=category + '_recovery', severity='info', title=recovery_title,
                                   message=recovery_msg, is_recovery=True))


def check_mikrotik_health(now, notifications_to_create, alerts_to_send):
    cpu_th = _cfg_num('mikrotik_cpu_threshold', 85)
    temp_th = _cfg_num('mikrotik_temp_threshold', 70)
    down_after = timedelta(minutes=_cfg_num('mikrotik_down_minutes', 5))
    cpu_cycles = int(_cfg_num('mikrotik_cpu_cycles', 3))
    for dev in MikrotikDevice.query.filter_by(enabled=True).all():
        since_ok = (now - dev.last_ok_at) if dev.last_ok_at else None
        down = bool(dev.last_polled_at) and not dev.last_ok and (since_ok is None or since_ok >= down_after)
        mins = int(since_ok.total_seconds() // 60) if since_ok else None
        _toggle(dev, now, 'mikrotik_down', down, 'critical',
                f'🔴 MikroTik tidak terjangkau: {dev.name}',
                f'🔴 MIKROTIK TIDAK TERJANGKAU\n\nRouter: {dev.name} ({dev.host})\n'
                f'Terakhir OK: {mins if mins is not None else "-"} menit lalu\n'
                f'Error: {dev.last_error or "-"}\n\n'
                f'⚠️ Status PPPoE/ping pelanggan di router ini tidak diperbarui sampai router terjangkau lagi.',
                f'✅ MikroTik pulih: {dev.name}', f'✅ MikroTik {dev.name} ({dev.host}) kembali terjangkau.',
                notifications_to_create, alerts_to_send)
        if down:
            continue
        if dev.cpu_load is not None and dev.cpu_load >= cpu_th:
            dev.cpu_high_cycles = (dev.cpu_high_cycles or 0) + 1
        else:
            dev.cpu_high_cycles = 0
        _toggle(dev, now, 'mikrotik_cpu', dev.cpu_high_cycles >= cpu_cycles, 'warning',
                f'🟠 CPU MikroTik tinggi: {dev.name} ({dev.cpu_load}%)',
                f'🟠 CPU MIKROTIK TINGGI\n\nRouter: {dev.name} ({dev.host})\nCPU: {dev.cpu_load}% '
                f'(batas {int(cpu_th)}%, {dev.cpu_high_cycles} cek berturut-turut)\n'
                f'RAM terpakai: {dev.mem_used_pct if dev.mem_used_pct is not None else "-"}%\n\n'
                f'⚠️ Pelanggan bisa merasakan lambat/PPPoE gagal login. Cek trafik, queue, dan firewall.',
                f'✅ CPU MikroTik normal: {dev.name}', f'✅ CPU {dev.name} kembali normal ({dev.cpu_load}%).',
                notifications_to_create, alerts_to_send)
        hot = dev.temperature is not None and dev.temperature >= temp_th
        _toggle(dev, now, 'mikrotik_temp', hot, 'warning',
                f'🌡️ Suhu MikroTik tinggi: {dev.name} ({dev.temperature}°C)',
                f'🌡️ SUHU MIKROTIK TINGGI\n\nRouter: {dev.name} ({dev.host})\nSuhu: {dev.temperature}°C '
                f'(batas {int(temp_th)}°C)\n\n⚠️ Cek pendingin ruang/rak dan kipas router.',
                f'✅ Suhu MikroTik normal: {dev.name}', f'✅ Suhu {dev.name} kembali normal ({dev.temperature}°C).',
                notifications_to_create, alerts_to_send)


def check_snmp_devices(now, notifications_to_create, alerts_to_send):
    """Perangkat SNMP (snmp_monitor) turun ≥ `snmp_down_minutes` (default 4) → alert;
    pulih → resolved + pesan pulih. 'warn' (ping OK, SNMP diam) tidak dialert."""
    from models import SnmpDevice
    down_after = timedelta(minutes=_cfg_num('snmp_down_minutes', 4))
    from snmp_depend import Scope
    scope = Scope(now)
    for dev in SnmpDevice.query.filter_by(enabled=True).all():
        since = (now - dev.status_changed_at) if dev.status_changed_at else None
        down = dev.status == 'down' and since is not None and since >= down_after
        notif = Notification.query.filter_by(category='snmp_down', target_type='snmp',
                                             target_id=dev.id, resolved=False).first()
        base = {'olt_id': None, 'olt_name': dev.name, 'olt_ip': dev.host, 'target_type': 'snmp', 'target_id': dev.id}
        label = ' '.join(x for x in (dev.vendor, dev.hardware) if x and x != 'Generic')
        if down and not notif:
            held, _why = scope.suppressed(dev)
            if held:
                continue  # pemeliharaan, atau induknya turun (alert induk sudah mewakili)
            mins = int(since.total_seconds() // 60)
            title = f'🔴 Perangkat turun: {dev.name}'
            msg = (f'🔴 PERANGKAT TIDAK TERJANGKAU\n\nPerangkat: {dev.name} ({dev.host})'
                   + (f'\nJenis: {label}' if label else '')
                   + (f'\nLokasi: {dev.location}' if dev.location else '')
                   + f'\nTurun sejak: {mins} menit lalu\nSebab: {dev.status_reason or "-"}')
            kids = scope.affected_children(dev)
            if kids:
                names = ', '.join(k.name for k in kids[:8]) + (f' (+{len(kids) - 8} lagi)' if len(kids) > 8 else '')
                msg += f'\n\n⛓️ {len(kids)} perangkat di bawahnya ikut tak terjangkau: {names}\n(alert terpisah untuk perangkat itu ditahan)'
            notifications_to_create.append({'olt_id': None, 'onu_id': None, 'severity': 'critical',
                                            'category': 'snmp_down', 'title': title, 'message': msg,
                                            'target_roles': '', 'target_type': 'snmp', 'target_id': dev.id})
            from snmp_alerts import stamp, fmt_duration
            alerts_to_send.append(dict(base, type='snmp_down', severity='critical', title=title,
                                       message=stamp(msg, now), is_recovery=False))
        elif notif and dev.status == 'up':
            from snmp_alerts import stamp, fmt_duration
            notif.resolved, notif.resolved_at, notif.is_read = True, now, True
            alerts_to_send.append(dict(base, type='snmp_down_recovery', severity='info',
                                       title=f'✅ Perangkat pulih: {dev.name}',
                                       message=stamp(f'✅ Perangkat {dev.name} ({dev.host}) kembali terjangkau.'
                                                     + (f'\nLama tidak terjangkau: {fmt_duration(now - (notif.created_at.replace(tzinfo=None) if notif.created_at else now))}'
                                                        if notif.created_at else ''), now),
                                       is_recovery=True))
