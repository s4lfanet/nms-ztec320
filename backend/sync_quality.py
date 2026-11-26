"""Penjaga kualitas sinkronisasi OLT (auto_sync).

Celah yang ditutup: OLT masih menjawab ping SNMP, tetapi tabel ONU kosong/sebagian atau sinkron
terus gagal. Sync tetap "selesai" (completed_at terbarui) sehingga alert `sync_stale` diam, padahal
status/RX/TX semua ONU membeku. Di sini tiap sinkron dinilai: BURUK bila gagal, atau ONU yang terbaca
< 50% dari yang dikenal (OLT ≥ 5 ONU). Setelah 3 sinkron buruk berturut-turut (~15 menit) → alert
sekali; pulih (satu sinkron baik) → pesan pulih. OLT yang sedang offline tidak dihitung (sudah ada
alert OLT offline)."""
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

CATEGORY = 'sync_partial'
MIN_KNOWN = 5
LOW_RATIO = 0.5
STREAK = 3
KEY_STREAK = 'sync_bad_'
KEY_ALERTED = 'sync_bad_alerted_'


def light_sync_due(polling_interval, last_sync, now):
    """Murni: apakah OLT sudah waktunya disinkron ringan. polling_interval ≤ 330 dtk (≈ siklus cron 5 menit)
    → selalu ya; lebih lama → tunggu sampai (interval − 60 dtk) sejak sinkron terakhir."""
    if not polling_interval or polling_interval <= 330 or last_sync is None:
        return True
    if last_sync.tzinfo is None:
        last_sync = last_sync.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return (now - last_sync).total_seconds() >= polling_interval - 60


def is_bad(got, known, failed):
    """Murni: apakah satu sinkron dianggap buruk."""
    if failed:
        return True
    return known >= MIN_KNOWN and got < known * LOW_RATIO


def next_state(streak, alerted, bad):
    """Murni: (streak_baru, alerted_baru, aksi) dengan aksi None | 'alert' | 'recover'."""
    if bad:
        streak += 1
        if streak >= STREAK and not alerted:
            return streak, True, 'alert'
        return streak, alerted, None
    if alerted:
        return 0, False, 'recover'
    return 0, False, None


def _cfg(SystemConfig, key):
    r = SystemConfig.query.filter_by(key=key).first()
    return r.value if r else None


def _set(db, SystemConfig, key, value):
    r = SystemConfig.query.filter_by(key=key).first()
    if r:
        r.value = str(value)
    else:
        db.session.add(SystemConfig(key=key, value=str(value)))


def record(olt, got, known, failed, detail=''):
    """Catat hasil satu sinkron `olt`. Tidak pernah melempar. → aksi ('alert'/'recover'/None)."""
    try:
        from models import db, SystemConfig, Notification, AlertRule
        if olt.is_online is False:
            return None                      # offline: sudah ditangani alert OLT offline
        bad = is_bad(got, known, failed)
        try:
            streak = int(_cfg(SystemConfig, KEY_STREAK + str(olt.id)) or 0)
        except ValueError:
            streak = 0
        alerted = _cfg(SystemConfig, KEY_ALERTED + str(olt.id)) == '1'
        streak, alerted_new, action = next_state(streak, alerted, bad)
        _set(db, SystemConfig, KEY_STREAK + str(olt.id), streak)
        _set(db, SystemConfig, KEY_ALERTED + str(olt.id), '1' if alerted_new else '0')
        alerts = []
        title_open = f'⚠️ Data sinkron tidak lengkap: {olt.name}'
        if action == 'alert':
            why = (f'Sinkron gagal: {detail}' if failed else f'Hanya {got} dari {known} ONU yang terbaca')
            msg = (f'⚠️ DATA OLT TIDAK TERBARUI ⚠️\n\nOLT: {olt.name} ({olt.ip_address})\n{why} '
                   f'pada {streak} sinkron berturut-turut.\n'
                   f'OLT masih menjawab SNMP, tetapi status/RX/TX ONU mungkin membeku.\n'
                   f'⚠️ Cek: komunitas SNMP, ACL SNMP di OLT, beban CPU OLT, dan /var/log/salfanet-sync.log')
            db.session.add(Notification(olt_id=olt.id, onu_id=None, severity='warning', category=CATEGORY,
                                        title=title_open, message=msg, target_roles=''))
            alerts.append({'olt_id': olt.id, 'olt_name': olt.name, 'olt_ip': olt.ip_address, 'type': CATEGORY,
                           'severity': 'warning', 'title': title_open, 'message': msg, 'is_recovery': False})
        elif action == 'recover':
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            for n in Notification.query.filter_by(category=CATEGORY, olt_id=olt.id, resolved=False).all():
                n.resolved, n.resolved_at, n.is_read = True, now, True
            msg = f'✅ Data sinkron OLT {olt.name} kembali lengkap ({got} ONU).'
            alerts.append({'olt_id': olt.id, 'olt_name': olt.name, 'olt_ip': olt.ip_address, 'type': CATEGORY,
                           'severity': 'info', 'title': f'✅ Sinkron pulih: {olt.name}', 'message': msg,
                           'is_recovery': True})
        db.session.commit()
        if alerts:
            from alerts import _send_external_alerts
            _send_external_alerts(alerts, AlertRule.query.first())
        return action
    except Exception as e:
        try:
            from models import db
            db.session.rollback()
        except Exception:
            pass
        logger.warning('sync quality record failed: %s', e)
        return None
