"""Sensor kustom bergaya PRTG: ambang bertingkat OK / Warning / Down per metrik SNMP.

Evaluasi murni dari sampel yang sudah ada (SnmpSample) — tidak menyentuh perangkat.
Level dihitung dari SEMUA sampel dalam jendela `minutes`: satu lonjakan tidak memicu alert."""
from datetime import timedelta

from models import db, SnmpSample, SnmpSensor, SnmpPort, SnmpSensorRule

PORT_METRICS = ('in', 'out', 'in_err', 'out_err')
LEVELS = ('ok', 'warning', 'down')
MIN_MINUTES, MAX_MINUTES = 1, 1440


def breach(v, op, threshold):
    return v > threshold if op == 'gt' else v < threshold


def level_for(values, op, warn, crit):
    """Murni. `values` = sampel dalam jendela. → 'ok' | 'warning' | 'down'."""
    if not values:
        return 'ok'
    if crit is not None and all(breach(v, op, crit) for v in values):
        return 'down'
    if warn is not None and all(breach(v, op, warn) for v in values):
        return 'warning'
    return 'ok'


def needed_samples(minutes, poll_seconds=300):
    """Sampel minimal agar jendela dianggap terisi (jendela panjang boleh kehilangan satu sampel)."""
    n = max(1, round(minutes * 60 / max(60, poll_seconds)))
    return n - 1 if n >= 4 else n


def evaluate(rule, now, poll_seconds=300):
    """→ (level | None, nilai_terakhir). None = data belum cukup (status tidak berubah)."""
    since = now - timedelta(seconds=rule.minutes * 60 + poll_seconds // 2)  # +½ interval: sampel di tepi jendela ikut
    q = SnmpSample.query.filter(SnmpSample.device_id == rule.device_id, SnmpSample.metric == rule.metric,
                                SnmpSample.ts >= since)
    q = q.filter(SnmpSample.port_id == rule.port_id) if rule.port_id else q.filter(SnmpSample.port_id.is_(None))
    vals = [r.value for r in q.order_by(SnmpSample.ts.desc()).all()]
    if len(vals) < needed_samples(rule.minutes, poll_seconds):
        return None, (vals[0] if vals else None)
    return level_for(vals, rule.op, rule.warn, rule.crit), vals[0]


def validate(device_id, data, rule=None):
    """→ (dict nilai bersih, pesan_error | None)."""
    out = {}
    metric = (data.get('metric', rule.metric if rule else '') or '').strip()
    port_id = data.get('port_id', rule.port_id if rule else None)
    port_id = int(port_id) if port_id not in (None, '', 0, '0') else None
    if port_id:
        p = db.session.get(SnmpPort, port_id)
        if not p or p.device_id != device_id:
            return None, 'Port tidak ditemukan di perangkat ini'
        if metric not in PORT_METRICS:
            return None, 'Metrik port tidak valid'
    else:
        ok = any(f'{s.kind}:{s.key}' == metric for s in SnmpSensor.query.filter_by(device_id=device_id).all())
        if not ok:
            return None, 'Sensor perangkat tidak ditemukan (jalankan discovery dulu)'
    out['metric'], out['port_id'] = metric, port_id
    op = data.get('op', rule.op if rule else 'gt')
    if op not in ('gt', 'lt'):
        return None, 'Operator tidak valid'
    out['op'] = op

    def num(k):
        if k not in data:
            return getattr(rule, k) if rule else None
        v = data.get(k)
        if v in (None, ''):
            return None
        return float(v)
    try:
        out['warn'], out['crit'] = num('warn'), num('crit')
        out['minutes'] = int(data.get('minutes', rule.minutes if rule else 10))
    except (TypeError, ValueError):
        return None, 'Angka tidak valid'
    if out['warn'] is None and out['crit'] is None:
        return None, 'Isi minimal satu ambang (Warning atau Down)'
    if out['warn'] is not None and out['crit'] is not None:
        if (op == 'gt' and out['crit'] < out['warn']) or (op == 'lt' and out['crit'] > out['warn']):
            return None, 'Ambang Down harus lebih parah dari Warning'
    if not MIN_MINUTES <= out['minutes'] <= MAX_MINUTES:
        return None, f'Durasi {MIN_MINUTES}–{MAX_MINUTES} menit'
    out['name'] = (data.get('name', rule.name if rule else '') or '').strip()[:120] or metric
    if 'enabled' in data:
        out['enabled'] = bool(data['enabled'])
    return out, None


def rule_dict(r):
    return {'id': r.id, 'device_id': r.device_id, 'port_id': r.port_id, 'metric': r.metric, 'name': r.name,
            'op': r.op, 'warn': r.warn, 'crit': r.crit, 'minutes': r.minutes, 'enabled': bool(r.enabled),
            'status': r.status if r.enabled else 'unknown', 'last_value': r.last_value,
            'status_since': r.status_since.isoformat() + 'Z' if r.status_since else None}
