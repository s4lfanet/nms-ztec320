"""Pemantau "job mati": tiap job latar belakang mencatat detak (SystemConfig
`job_beat_<nama>` = epoch detik). `check()` membandingkan umur detak dengan batas
tiap job dan mengirim alert (bel + Telegram/WA) SEKALI saat macet, lalu pesan
pulih saat berjalan lagi.

Alert monitor memeriksa job lain; poller SNMP memeriksa alert monitor (satu-satunya
yang tidak bisa mendeteksi dirinya sendiri). Hanya membaca/menulis SystemConfig."""
import logging
import time
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

CATEGORY = 'job_stale'
PREFIX_BEAT = 'job_beat_'
PREFIX_FLAG = 'job_stale_'

# nama → (judul, batas umur detik, perlu_perangkat, perlu_perangkat_kunci)
# perlu: job hanya dianggap aktif bila ada perangkat yang dipantau (idle = wajar).
JOBS = {
    'alert-monitor': ('Alert monitor', 15 * 60, None),
    'link-poller': ('Poller MikroTik/PPPoE', 15 * 60, 'mikrotik'),
    'snmp-poller': ('Poller perangkat SNMP', 30 * 60, 'snmp'),
    'traffic-poller': ('Poller trafik (cron 5 menit)', 45 * 60, 'olt'),
    'db-backup': ('Backup database (cron per jam)', 4 * 3600, None),
    'auto-backup': ('Backup konfigurasi OLT (cron per jam)', 4 * 3600, 'olt_backup'),
}


def _get(db, SystemConfig, key):
    row = SystemConfig.query.filter_by(key=key).first()
    return row


def _set(db, SystemConfig, key, value):
    row = _get(db, SystemConfig, key)
    if row:
        row.value = str(value)
        row.updated_at = datetime.now(timezone.utc)
    else:
        db.session.add(SystemConfig(key=key, value=str(value)))


def beat(name):
    """Catat bahwa job `name` masih hidup. Aman dipanggil dari mana saja; tak pernah melempar."""
    try:
        from models import db, SystemConfig
        _set(db, SystemConfig, PREFIX_BEAT + name, int(time.time()))
        db.session.commit()
    except Exception as e:
        try:
            from models import db
            db.session.rollback()
        except Exception:
            pass
        logger.debug('job beat %s failed: %s', name, e)


def _applicable(kind):
    """Apakah ada perangkat untuk job jenis `kind`? None = selalu aktif."""
    if kind is None:
        return True
    try:
        if kind == 'mikrotik':
            from models import MikrotikDevice
            return MikrotikDevice.query.filter_by(enabled=True).count() > 0
        if kind == 'snmp':
            from models import SnmpDevice
            return SnmpDevice.query.count() > 0
        if kind == 'olt_backup':
            from models import OLT
            return OLT.query.filter_by(auto_backup_enabled=True).count() > 0
        if kind == 'olt':
            from models import OLT
            return OLT.query.filter_by(monitoring_enabled=True).count() > 0
    except Exception:
        return False
    return False


def evaluate(now_ts, beats, flags, skip=()):
    """Murni: kembalikan daftar (nama, judul, umur_detik, status) dengan status
    'stale' (baru macet), 'recovered' (baru pulih). `beats`/`flags` = dict nama→nilai.
    Job tanpa detak sama sekali dilewati (belum pernah jalan / baru dipasang)."""
    out = []
    for name, (title, limit, _kind) in JOBS.items():
        if name in skip:
            continue
        raw = beats.get(name)
        try:
            age = now_ts - int(raw)
        except (TypeError, ValueError):
            continue
        flagged = bool(flags.get(name))
        if age > limit and not flagged:
            out.append((name, title, age, 'stale'))
        elif age <= limit and flagged:
            out.append((name, title, age, 'recovered'))
    return out


def check(skip=()):
    """Periksa semua job (kecuali `skip`) dan kirim alert untuk perubahan status."""
    try:
        from models import db, SystemConfig, Notification, AlertRule
        now_ts = int(time.time())
        rows = {r.key: r.value for r in SystemConfig.query.filter(
            SystemConfig.key.like(PREFIX_BEAT + '%') | SystemConfig.key.like(PREFIX_FLAG + '%')).all()}
        beats = {k[len(PREFIX_BEAT):]: v for k, v in rows.items() if k.startswith(PREFIX_BEAT)}
        flags = {k[len(PREFIX_FLAG):]: v for k, v in rows.items() if k.startswith(PREFIX_FLAG) and v == '1'}
        alerts = []
        for name, title, age, status in evaluate(now_ts, beats, flags, skip):
            if status == 'stale' and not _applicable(JOBS[name][2]):
                continue
            mins = max(1, age // 60)
            if status == 'stale':
                _set(db, SystemConfig, PREFIX_FLAG + name, '1')
                msg = (f'⚠️ JOB TERHENTI ⚠️\n\n{title} tidak berdetak {mins} menit.\n'
                       f'Pemantauan terkait (alert/sinkron) mungkin tidak berjalan.\n'
                       f'⚠️ Cek: systemctl status salfanet-nms, journalctl -u salfanet-nms -n 100, dan crontab -l.')
                sev, ttl, rec = 'critical', f'⚠️ Job terhenti: {title}', False
            else:
                _set(db, SystemConfig, PREFIX_FLAG + name, '0')
                msg = f'✅ JOB PULIH\n\n{title} berjalan lagi.'
                sev, ttl, rec = 'info', f'✅ Job pulih: {title}', True
            if rec:  # tutup notifikasi macet sebelumnya, tanpa bel baru
                now = datetime.now(timezone.utc).replace(tzinfo=None)
                for n in Notification.query.filter_by(category=CATEGORY, resolved=False,
                                                      title=f'⚠️ Job terhenti: {title}').all():
                    n.resolved, n.resolved_at, n.is_read = True, now, True
            else:
                db.session.add(Notification(olt_id=None, onu_id=None, severity=sev, category=CATEGORY,
                                            title=ttl, message=msg, target_roles=''))
            alerts.append({'olt_id': None, 'olt_name': title, 'olt_ip': '', 'type': CATEGORY,
                           'severity': sev, 'title': ttl, 'message': msg, 'is_recovery': rec})
        db.session.commit()
        if alerts:
            from alerts import _send_external_alerts
            _send_external_alerts(alerts, AlertRule.query.first())
        return len(alerts)
    except Exception as e:
        try:
            from models import db
            db.session.rollback()
        except Exception:
            pass
        logger.warning('job health check failed: %s', e)
        return 0


def status():
    """Untuk API: umur detak tiap job."""
    from models import SystemConfig
    now_ts = int(time.time())
    rows = {r.key: r.value for r in SystemConfig.query.filter(SystemConfig.key.like(PREFIX_BEAT + '%')).all()}
    res = []
    for name, (title, limit, kind) in JOBS.items():
        raw = rows.get(PREFIX_BEAT + name)
        try:
            age = now_ts - int(raw)
        except (TypeError, ValueError):
            age = None
        res.append({'name': name, 'title': title, 'age_seconds': age, 'limit_seconds': limit,
                    'ok': age is not None and age <= limit})
    return res
