"""Operasi massal TR-069 via GenieACS — selalu: pratinjau → konfirmasi jumlah → eksekusi
bertahap di latar belakang → status per modem + audit log.

Target dipilih dengan filter (gabungan AND): olt_id, model (ONU.actual_type/onu_type),
FTTH node (node_type + node_id → semua ONU hilirnya), status ONU (default: online saja),
atau daftar onu_ids. Hanya ONU yang terpetakan ke perangkat GenieACS yang ikut.

Aksi: refresh | reboot | inform_interval {seconds} | firmware {file} | set_param {path, value, type}.
"""
import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import genieacs_client as gc
from models import db, ONU, OLT, GenieacsDeviceMap, AcsBulkJob, AcsBulkJobItem

logger = logging.getLogger(__name__)

MAX_TARGETS = 500
WORKERS = 4          # paralel kecil: GenieACS & modem tidak dibanjiri
PAUSE_S = 0.2        # jeda antar perintah per worker
ACTIONS = ('refresh', 'reboot', 'inform_interval', 'firmware', 'set_param')
_cancel = set()
_threads = {}  # job_id -> Thread (hanya di proses ini)


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def select_targets(f):
    """→ list (ONU, GenieacsDeviceMap) sesuai filter, urut nama."""
    q = db.session.query(ONU, GenieacsDeviceMap).join(GenieacsDeviceMap, GenieacsDeviceMap.onu_id == ONU.id)
    if f.get('onu_ids'):
        q = q.filter(ONU.id.in_([int(i) for i in f['onu_ids']]))
    if f.get('olt_id'):
        q = q.filter(ONU.olt_id == int(f['olt_id']))
    if f.get('model'):
        m = str(f['model'])
        q = q.filter(db.or_(ONU.actual_type == m, db.and_(db.or_(ONU.actual_type.is_(None), ONU.actual_type == ''),
                                                          ONU.onu_type == m)))
    status = f.get('status', 'online')
    if status and status != 'all':
        q = q.filter(ONU.status == status)
    rows = q.order_by(ONU.name).all()
    if f.get('node_type') and f.get('node_id'):
        from ftth_topology import collect_downstream_onus
        ids = {o.id for o in collect_downstream_onus(f['node_type'], int(f['node_id']))}
        rows = [r for r in rows if r[0].id in ids]
    return rows


def preview(f, stale_hours=24):
    rows = select_targets(f)
    from datetime import timedelta
    cutoff = _now() - timedelta(hours=stale_hours)
    olts = {o.id: o.name for o in OLT.query.all()}
    items = [{'onu_id': o.id, 'name': o.name, 'olt': olts.get(o.olt_id), 'model': o.actual_type or o.onu_type,
              'device_id': m.device_id,
              'last_inform': m.last_inform.isoformat() + 'Z' if m.last_inform else None,
              'stale': bool(m.last_inform and m.last_inform < cutoff)} for o, m in rows]
    return {'count': len(items), 'stale': sum(1 for i in items if i['stale']),
            'too_many': len(items) > MAX_TARGETS, 'max': MAX_TARGETS, 'items': items[:200]}


def validate_action(action, params):
    if action not in ACTIONS:
        return 'Aksi tidak dikenal'
    if action == 'inform_interval':
        try:
            sec = int(params.get('seconds'))
        except (TypeError, ValueError):
            return 'Interval (detik) wajib angka'
        if not 60 <= sec <= 86400:
            return 'Interval harus 60–86400 detik'
    if action == 'firmware' and not str(params.get('file') or '').strip():
        return 'Pilih file firmware dari GenieACS'
    if action == 'set_param':
        path = str(params.get('path') or '').strip()
        if not path.startswith(('InternetGatewayDevice.', 'Device.')) or path.endswith('.'):
            return 'Path parameter harus lengkap, diawali InternetGatewayDevice. atau Device.'
        if params.get('type', 'xsd:string') not in ('xsd:string', 'xsd:unsignedInt', 'xsd:int', 'xsd:boolean'):
            return 'Tipe parameter tidak valid'
    return None


def _apply(action, params, device_id):
    """Satu perintah ke satu modem → (status, pesan)."""
    if action == 'refresh':
        ok, msg = gc.refresh_params(device_id)
    elif action == 'reboot':
        ok, msg = gc.reboot_device(device_id)
    elif action == 'inform_interval':
        root = 'Device' if gc.data_model(device_id) == 'tr181' else 'InternetGatewayDevice'
        ok, msg = gc._post_task(device_id, {'name': 'setParameterValues', 'parameterValues': [
            [f'{root}.ManagementServer.PeriodicInformEnable', True, 'xsd:boolean'],
            [f'{root}.ManagementServer.PeriodicInformInterval', int(params['seconds']), 'xsd:unsignedInt']]})
    elif action == 'firmware':
        ok, msg = gc._post_task(device_id, {'name': 'download', 'fileType': '1 Firmware Upgrade Image',
                                            'fileName': params['file']})
    else:  # set_param
        val, typ = params.get('value', ''), params.get('type', 'xsd:string')
        if typ == 'xsd:boolean':
            val = str(val).lower() in ('1', 'true', 'yes')
        elif typ in ('xsd:unsignedInt', 'xsd:int'):
            val = int(val)
        ok, msg = gc._post_task(device_id, {'name': 'setParameterValues',
                                            'parameterValues': [[params['path'], val, typ]]})
    if not ok:
        return 'failed', msg
    return ('queued', msg) if msg == gc.QUEUED_MSG else ('done', '')


def create_job(f, action, params, username):
    rows = select_targets(f)
    job = AcsBulkJob(action=action, params=json.dumps(params), filters=json.dumps(f), total=len(rows),
                     created_by=username or '')
    db.session.add(job)
    db.session.flush()
    for o, m in rows:
        db.session.add(AcsBulkJobItem(job_id=job.id, onu_id=o.id, onu_name=o.name or '', device_id=m.device_id))
    db.session.commit()
    return job


def run_job(app, job_id):
    """Eksekusi (dipanggil di thread latar belakang). Aman dipanggil langsung di test."""
    with app.app_context():
        job = db.session.get(AcsBulkJob, job_id)
        params = json.loads(job.params or '{}')
        items = [(i.id, i.device_id) for i in AcsBulkJobItem.query.filter_by(job_id=job_id, status='pending').all()]
        action = job.action

    def work(item):
        iid, dev = item
        if job_id in _cancel:
            return iid, 'skipped', 'dibatalkan'
        with app.app_context():
            try:
                st, msg = _apply(action, params, dev)
            except Exception as e:  # satu modem gagal tidak menghentikan pekerjaan
                st, msg = 'failed', str(e)[:200]
        time.sleep(PAUSE_S)
        return iid, st, msg

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for iid, st, msg in ex.map(work, items):
            with app.app_context():
                it = db.session.get(AcsBulkJobItem, iid)
                it.status, it.message = st, (msg or '')[:300]
                j = db.session.get(AcsBulkJob, job_id)
                if st in ('done', 'queued', 'failed'):
                    setattr(j, st, (getattr(j, st) or 0) + 1)
                db.session.commit()
    with app.app_context():
        j = db.session.get(AcsBulkJob, job_id)
        j.status = 'cancelled' if job_id in _cancel else 'finished'
        j.finished_at = _now()
        db.session.commit()
        _cancel.discard(job_id)
        logger.info('acs bulk job %s %s: done=%s queued=%s failed=%s', job_id, j.status, j.done, j.queued, j.failed)


def start_job(app, job_id):
    t = threading.Thread(target=run_job, args=(app, job_id), daemon=True, name=f'acs-bulk-{job_id}')
    _threads[job_id] = t
    t.start()
    return t


def running_job():
    """Job yang benar-benar masih berjalan. Job 'running' tanpa thread hidup
    (server direstart di tengah jalan) ditandai 'cancelled' agar tidak mengunci."""
    for j in AcsBulkJob.query.filter_by(status='running').all():
        t = _threads.get(j.id)
        if t and t.is_alive():
            return j
        j.status, j.finished_at = 'cancelled', _now()
        AcsBulkJobItem.query.filter_by(job_id=j.id, status='pending').update(
            {'status': 'skipped', 'message': 'terhenti (server direstart)'})
        db.session.commit()
    return None


def cancel_job(job_id):
    _cancel.add(job_id)


def job_dict(j, with_items=False):
    d = {'id': j.id, 'action': j.action, 'params': json.loads(j.params or '{}'),
         'filters': json.loads(j.filters or '{}'), 'total': j.total, 'done': j.done, 'queued': j.queued,
         'failed': j.failed, 'status': j.status, 'created_by': j.created_by,
         'created_at': j.created_at.isoformat() + 'Z' if j.created_at else None,
         'finished_at': j.finished_at.isoformat() + 'Z' if j.finished_at else None}
    if with_items:
        d['items'] = [{'onu_id': i.onu_id, 'name': i.onu_name, 'status': i.status, 'message': i.message}
                      for i in AcsBulkJobItem.query.filter_by(job_id=j.id).order_by(AcsBulkJobItem.id).all()]
    return d


def list_files():
    """File di GenieACS (untuk firmware): nama, tipe, OUI/productClass/versi bila ada."""
    url, user, pwd = gc._nbi_config()
    if not url:
        return []
    try:
        r = gc.httpx.get(f'{url}/files', auth=gc._auth(user, pwd), timeout=gc._TIMEOUT)
        rows = r.json() if r.status_code == 200 else []
    except Exception as e:
        logger.warning('genieacs list files failed: %s', e)
        return []
    out = []
    for f in rows if isinstance(rows, list) else []:
        meta = f.get('metadata') or {}
        out.append({'name': f.get('_id') or f.get('filename', ''), 'type': meta.get('fileType', ''),
                    'oui': meta.get('oui', ''), 'product_class': meta.get('productClass', ''),
                    'version': meta.get('version', ''), 'size': f.get('length')})
    return out
