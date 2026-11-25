"""Status backup untuk halaman Sistem + siklus salinan luar server (dipanggil cron db_backup).

Keadaan salinan luar disimpan di SystemConfig: db_backup_remote_last (tanggal sukses 'YYYY-MM-DD'),
db_backup_remote_status ('ok' / 'failed'), db_backup_remote_error."""
import logging
import os
import shutil
import time
from datetime import datetime, timezone

import db_backup

logger = logging.getLogger(__name__)
PREFIX = 'nms_db_backup_'


def _cfg(key, default=''):
    from models import SystemConfig
    r = SystemConfig.query.filter_by(key=key).first()
    return r.value if r and r.value is not None else default


def _set(key, value):
    from models import db, SystemConfig
    r = SystemConfig.query.filter_by(key=key).first()
    if r:
        r.value = str(value)
    else:
        db.session.add(SystemConfig(key=key, value=str(value)))


def safe_backup_path(filename, directory=None):
    """Path file backup bila namanya sah dan ada; selain itu None (cegah path traversal)."""
    directory = directory or db_backup.DEFAULT_BACKUP_DIR
    if not filename or filename != os.path.basename(filename) or not filename.startswith(PREFIX):
        return None
    p = os.path.join(directory, filename)
    return p if os.path.isfile(p) else None


def db_backups(directory=None, now_ts=None):
    directory = directory or db_backup.DEFAULT_BACKUP_DIR
    now_ts = now_ts or time.time()
    items = []
    if os.path.isdir(directory):
        for f in os.listdir(directory):
            if f.startswith(PREFIX):
                st = os.stat(os.path.join(directory, f))
                items.append({'name': f, 'size': st.st_size, 'age_seconds': int(now_ts - st.st_mtime),
                              'mtime': st.st_mtime})
    items.sort(key=lambda x: -x['mtime'])
    return items


def olt_backups(now=None):
    """Per OLT dengan auto-backup: umur backup sukses terakhir; 'stale' bila > 2× interval."""
    from models import OLT
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    out = []
    for o in OLT.query.filter_by(auto_backup_enabled=True).order_by(OLT.name).all():
        hours = (o.auto_backup_interval or 24) * (24 if (o.auto_backup_unit or 'hours') == 'days' else 1)
        last = o.last_backup_at.replace(tzinfo=None) if o.last_backup_at else None
        age_h = (now - last).total_seconds() / 3600 if last else None
        out.append({'olt_id': o.id, 'name': o.name, 'interval_hours': hours,
                    'last_backup_at': last.isoformat() if last else None,
                    'age_hours': round(age_h, 1) if age_h is not None else None,
                    'stale': age_h is None or age_h > hours * 2})
    return out


def status(directory=None):
    directory = directory or db_backup.DEFAULT_BACKUP_DIR
    items = db_backups(directory)
    try:
        du = shutil.disk_usage(directory if os.path.isdir(directory) else os.path.dirname(directory))
        disk = {'free_pct': round(du.free / du.total * 100, 1), 'free_bytes': du.free}
    except Exception:
        disk = None
    return {'db': {'count': len(items), 'latest': items[0] if items else None,
                   'files': [{k: v for k, v in i.items() if k != 'mtime'} for i in items[:30]]},
            'remote': {'configured': bool(db_backup.remote_target()),
                       'target': _mask(db_backup.remote_target()),
                       'last_ok': _cfg('db_backup_remote_last') or None,
                       'status': _cfg('db_backup_remote_status') or None,
                       'error': _cfg('db_backup_remote_error') or None},
            'olt': olt_backups(), 'disk': disk}


def _mask(target):
    """Tampilkan host:path tanpa nama pengguna."""
    return target.split('@', 1)[-1] if target else ''


def remote_cycle(path, today=None):
    """Dipanggil cron per jam setelah backup sukses: unggah SEKALI per hari (coba lagi tiap jam
    bila gagal) dan kabari lewat Telegram/WA SEKALI saat mulai gagal / saat pulih."""
    if not db_backup.remote_target():
        return 'off'
    from models import db, AlertRule
    today = today or datetime.now().strftime('%Y-%m-%d')
    if _cfg('db_backup_remote_last') == today:
        return 'done'
    ok, err = db_backup.upload_remote(path)
    prev = _cfg('db_backup_remote_status')
    if ok:
        _set('db_backup_remote_last', today)
        _set('db_backup_remote_status', 'ok')
        _set('db_backup_remote_error', '')
    else:
        _set('db_backup_remote_status', 'failed')
        _set('db_backup_remote_error', err)
    db.session.commit()
    if (not ok and prev != 'failed') or (ok and prev == 'failed'):
        try:
            from alerts import _send_external_alerts
            if ok:
                title, msg, sev = '✅ Salinan backup luar server pulih', 'Backup DB harian berhasil disalin ke server tujuan lagi.', 'info'
            else:
                title, msg, sev = ('⚠️ Salinan backup luar server GAGAL',
                                   f'⚠️ Backup DB gagal disalin ke {_mask(db_backup.remote_target())}.\n{err}\n'
                                   'Cek kunci SSH, known_hosts, dan ruang disk di server tujuan.', 'critical')
            _send_external_alerts([{'olt_id': None, 'olt_name': 'Backup', 'olt_ip': '', 'type': 'backup_remote',
                                    'severity': sev, 'title': title, 'message': msg, 'is_recovery': ok}],
                                  AlertRule.query.first())
        except Exception as e:
            logger.warning('remote backup alert failed: %s', e)
    return 'ok' if ok else 'failed'
