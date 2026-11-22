"""GenieACS TR-069 bridge routes — settings, sync, device actions."""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import db, SystemConfig, ONU, GenieacsDeviceMap
from helpers import permission_required, log_action, utc_iso
from extensions import logger
import genieacs_client
import json

bp = Blueprint('genieacs', __name__)

_PERM = 'genieacs_manage'



def _task_resp(ok, err):
    """queued=True: GenieACS menerima perintah tetapi modem belum merespons
    (dijalankan saat inform berikutnya) — UI menampilkannya berbeda dari 'terkirim'."""
    return jsonify({'success': ok, 'message': err,
                    'queued': bool(ok and err == genieacs_client.QUEUED_MSG)})


@bp.route('/api/genieacs/settings', methods=['GET'])
@login_required
def get_settings():
    cfg = {c.key: c.value for c in SystemConfig.query.all()}
    return jsonify({
        'nbi_url': cfg.get('genieacs_nbi_url', ''),
        'nbi_user': cfg.get('genieacs_nbi_user', ''),
        'has_password': bool(cfg.get('genieacs_nbi_password')),
    })


@bp.route('/api/genieacs/settings', methods=['POST'])
@login_required
@permission_required(_PERM)
def save_settings():
    data = request.get_json() or {}
    for key, val in [('genieacs_nbi_url', data.get('nbi_url', '')),
                    ('genieacs_nbi_user', data.get('nbi_user', ''))]:
        row = SystemConfig.query.filter_by(key=key).first()
        if row:
            row.value = val
        else:
            db.session.add(SystemConfig(key=key, value=val))
    if data.get('nbi_password'):
        from models import encrypt_field
        enc = encrypt_field(data['nbi_password']) or data['nbi_password']
        row = SystemConfig.query.filter_by(key='genieacs_nbi_password').first()
        if row:
            row.value = enc
        else:
            db.session.add(SystemConfig(key='genieacs_nbi_password', value=enc))
    db.session.commit()
    log_action('genieacs_settings', 'settings', detail='Updated GenieACS NBI settings')
    return jsonify({'success': True})


@bp.route('/api/genieacs/test', methods=['POST'])
@login_required
@permission_required(_PERM)
def test_conn():
    ok, count, err = genieacs_client.test_connection()
    return jsonify({'success': ok, 'device_count': count, 'error': err})


@bp.route('/api/genieacs/sync', methods=['POST'])
@login_required
@permission_required(_PERM)
def sync():
    matched, total, errors = genieacs_client.sync_device_maps()
    log_action('genieacs_sync', 'settings', detail=f'matched {matched}/{total}')
    return jsonify({'success': True, 'matched': matched, 'total': total, 'errors': errors})


@bp.route('/api/onu/<int:onu_id>/tr069', methods=['GET'])
@login_required
def get_tr069(onu_id):
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    mapping = GenieacsDeviceMap.query.filter_by(onu_id=onu_id).first()
    if not mapping:
        return jsonify({'success': True, 'connected': False, 'params': None})
    params = genieacs_client.get_device_params(mapping.device_id)
    return jsonify({
        'success': True, 'connected': params is not None,
        'match_method': mapping.match_method, 'pinned': mapping.pinned,
        'last_synced': utc_iso(mapping.last_synced_at),
        'params': params,
        'faults': genieacs_client.fetch_faults(mapping.device_id, limit=20) if params is not None else [],
    })


@bp.route('/api/onu/<int:onu_id>/tr069/reboot', methods=['POST'])
@login_required
@permission_required(_PERM)
def tr069_reboot(onu_id):
    mapping = GenieacsDeviceMap.query.filter_by(onu_id=onu_id).first()
    if not mapping:
        return jsonify({'success': False, 'message': 'No TR-069 mapping'}), 404
    ok, err = genieacs_client.reboot_device(mapping.device_id)
    log_action('tr069_reboot', 'onu', target=str(onu_id), detail=f'ok={ok} {err}')
    return _task_resp(ok, err)


@bp.route('/api/onu/<int:onu_id>/tr069/refresh', methods=['POST'])
@login_required
@permission_required(_PERM)
def tr069_refresh(onu_id):
    mapping = GenieacsDeviceMap.query.filter_by(onu_id=onu_id).first()
    if not mapping:
        return jsonify({'success': False, 'message': 'No TR-069 mapping'}), 404
    ok, err = genieacs_client.refresh_params(mapping.device_id)
    log_action('tr069_refresh', 'onu', target=str(onu_id), detail=f'ok={ok} {err}')
    return _task_resp(ok, err)


@bp.route('/api/onu/<int:onu_id>/tr069/wifi', methods=['POST'])
@login_required
@permission_required(_PERM)
def tr069_set_wifi(onu_id):
    mapping = GenieacsDeviceMap.query.filter_by(onu_id=onu_id).first()
    if not mapping:
        return jsonify({'success': False, 'message': 'No TR-069 mapping'}), 404
    data = request.get_json() or {}
    ok, err = genieacs_client.set_wifi_ssid(
        mapping.device_id, data.get('ssid', ''), data.get('password'),
        data.get('band', '2.4g'), data.get('index'))
    log_action('tr069_set_wifi', 'onu', target=str(onu_id),
               detail=f'ssid={data.get("ssid","")} band={data.get("band","")} ok={ok}')
    return _task_resp(ok, err)


@bp.route('/api/onu/<int:onu_id>/tr069/pin', methods=['POST'])
@login_required
@permission_required(_PERM)
def tr069_pin(onu_id):
    """Manually pin an ONU to a GenieACS device_id."""
    data = request.get_json() or {}
    device_id = data.get('device_id', '')
    if not device_id:
        return jsonify({'success': False, 'message': 'device_id required'}), 400
    mapping = GenieacsDeviceMap.query.filter_by(onu_id=onu_id).first()
    if mapping:
        mapping.device_id = device_id
        mapping.match_method = 'manual'
        mapping.pinned = True
    else:
        mapping = GenieacsDeviceMap(onu_id=onu_id, device_id=device_id,
                                    match_method='manual', pinned=True)
        db.session.add(mapping)
    db.session.commit()
    log_action('tr069_pin', 'onu', target=str(onu_id), detail=f'device={device_id}')
    return jsonify({'success': True})


@bp.route('/api/onu/<int:onu_id>/tr069/unpin', methods=['POST'])
@login_required
@permission_required(_PERM)
def tr069_unpin(onu_id):
    mapping = GenieacsDeviceMap.query.filter_by(onu_id=onu_id).first()
    if mapping:
        mapping.pinned = False
        db.session.commit()
    return jsonify({'success': True})


def _mapped(onu_id):
    return GenieacsDeviceMap.query.filter_by(onu_id=onu_id).first()


@bp.route('/api/onu/<int:onu_id>/tr069/params', methods=['POST'])
@login_required
@permission_required(_PERM)
def tr069_set_params(onu_id):
    """Set arbitrary TR-069 parameters: {params: {path: value}}."""
    mapping = _mapped(onu_id)
    if not mapping:
        return jsonify({'success': False, 'message': 'No TR-069 mapping'}), 404
    pairs = (request.get_json() or {}).get('params') or {}
    if not isinstance(pairs, dict) or not pairs:
        return jsonify({'success': False, 'message': 'params required'}), 400
    ok, err = genieacs_client.set_params(mapping.device_id, pairs)
    log_action('tr069_set_params', 'onu', target=str(onu_id),
               detail=f'{len(pairs)} params ok={ok}')
    return _task_resp(ok, err)


@bp.route('/api/onu/<int:onu_id>/tr069/pppoe', methods=['POST'])
@login_required
@permission_required(_PERM)
def tr069_set_pppoe(onu_id):
    mapping = _mapped(onu_id)
    if not mapping:
        return jsonify({'success': False, 'message': 'No TR-069 mapping'}), 404
    data = request.get_json() or {}
    ok, err = genieacs_client.set_pppoe(
        mapping.device_id, data.get('username', ''), data.get('password'))
    log_action('tr069_set_pppoe', 'onu', target=str(onu_id),
               detail=f'user={data.get("username","")} ok={ok} {err}')
    return _task_resp(ok, err)


@bp.route('/api/onu/<int:onu_id>/tr069/factory-reset', methods=['POST'])
@login_required
@permission_required(_PERM)
def tr069_factory_reset(onu_id):
    mapping = _mapped(onu_id)
    if not mapping:
        return jsonify({'success': False, 'message': 'No TR-069 mapping'}), 404
    ok, err = genieacs_client.factory_reset(mapping.device_id)
    log_action('tr069_factory_reset', 'onu', target=str(onu_id), detail=f'ok={ok}')
    return _task_resp(ok, err)


@bp.route('/api/onu/<int:onu_id>/tr069/tasks', methods=['GET'])
@login_required
def tr069_tasks(onu_id):
    mapping = _mapped(onu_id)
    if not mapping:
        return jsonify({'success': True, 'tasks': []})
    return jsonify({'success': True, 'tasks': genieacs_client.fetch_tasks(mapping.device_id)})


@bp.route('/api/onu/<int:onu_id>/tr069/add-object', methods=['POST'])
@login_required
@permission_required(_PERM)
def tr069_add_object(onu_id):
    """AddObject task: {object_name} — instance baru (trailing '.')."""
    mapping = _mapped(onu_id)
    if not mapping:
        return jsonify({'success': False, 'message': 'No TR-069 mapping'}), 404
    obj = (request.get_json() or {}).get('object_name', '')
    if not obj:
        return jsonify({'success': False, 'message': 'object_name required'}), 400
    ok, info = genieacs_client.add_object(mapping.device_id, obj)
    log_action('tr069_add_object', 'onu', target=str(onu_id),
               detail=f'{obj} ok={ok} inst={info}')
    return jsonify({'success': ok, 'instance': info if ok else '', 'message': '' if ok else info})


@bp.route('/api/onu/<int:onu_id>/tr069/del-object', methods=['POST'])
@login_required
@permission_required(_PERM)
def tr069_del_object(onu_id):
    """DeleteObject task: {object_name} — instance path (trailing '.')."""
    mapping = _mapped(onu_id)
    if not mapping:
        return jsonify({'success': False, 'message': 'No TR-069 mapping'}), 404
    obj = (request.get_json() or {}).get('object_name', '')
    if not obj:
        return jsonify({'success': False, 'message': 'object_name required'}), 400
    ok, err = genieacs_client.delete_object(mapping.device_id, obj)
    log_action('tr069_del_object', 'onu', target=str(onu_id), detail=f'{obj} ok={ok}')
    return _task_resp(ok, err)


@bp.route('/api/onu/<int:onu_id>/tr069/add-wan', methods=['POST'])
@login_required
@permission_required(_PERM)
def tr069_add_wan(onu_id):
    """Tambah WAN connection lengkap: {type: pppoe|ip, vlan_id, username, password, service, nat, addressing}."""
    mapping = _mapped(onu_id)
    if not mapping:
        return jsonify({'success': False, 'message': 'No TR-069 mapping'}), 404
    d = request.get_json() or {}
    ok, info = genieacs_client.add_wan(
        mapping.device_id, d.get('type', 'pppoe'), d.get('vlan_id', ''),
        d.get('username', ''), d.get('password'), d.get('service', 'INTERNET'),
        d.get('nat', True), d.get('addressing', 'DHCP'))
    log_action('tr069_add_wan', 'onu', target=str(onu_id),
               detail=f'type={d.get("type")} vlan={d.get("vlan_id")} ok={ok}')
    return jsonify({'success': ok, 'instance': info if ok else '', 'message': '' if ok else info})


@bp.route('/api/onu/<int:onu_id>/tr069/wan-bind', methods=['POST'])
@login_required
@permission_required(_PERM)
def tr069_wan_bind(onu_id):
    """Bind VLAN ke WAN instance existing: {conn_key: 'WANPPPConnection.3', vlan_id}."""
    mapping = _mapped(onu_id)
    if not mapping:
        return jsonify({'success': False, 'message': 'No TR-069 mapping'}), 404
    d = request.get_json() or {}
    if not d.get('conn_key') or not d.get('vlan_id'):
        return jsonify({'success': False, 'message': 'conn_key & vlan_id required'}), 400
    ok, err = genieacs_client.bind_wan_vlan(mapping.device_id, d['conn_key'], d['vlan_id'])
    log_action('tr069_wan_bind', 'onu', target=str(onu_id),
               detail=f'{d["conn_key"]} vlan={d["vlan_id"]} ok={ok}')
    return _task_resp(ok, err)


@bp.route('/api/genieacs/faults', methods=['GET'])
@login_required
def list_faults():
    """Fault GenieACS + ONU yang terpetakan ke device-nya."""
    faults = genieacs_client.fetch_faults()
    dev_ids = {f['device'] for f in faults}
    onu_by_dev = {}
    if dev_ids:
        for m, o in (db.session.query(GenieacsDeviceMap, ONU).join(ONU, GenieacsDeviceMap.onu_id == ONU.id)
                     .filter(GenieacsDeviceMap.device_id.in_(dev_ids)).all()):
            onu_by_dev[m.device_id] = {'onu_id': o.id, 'onu_name': o.name}
    for f in faults:
        f.update(onu_by_dev.get(f['device'], {'onu_id': None, 'onu_name': None}))
    return jsonify({'success': True, 'faults': faults})


@bp.route('/api/genieacs/faults/<path:fault_id>', methods=['DELETE'])
@login_required
@permission_required(_PERM)
def remove_fault(fault_id):
    ok, err = genieacs_client.delete_fault(fault_id)
    log_action('tr069_fault_delete', 'settings', target=fault_id[:120], detail=f'ok={ok} {err}')
    return jsonify({'success': ok, 'message': err})


@bp.route('/api/genieacs/stale', methods=['GET'])
@login_required
def list_stale():
    hours = request.args.get('hours', type=int)
    hours, rows = genieacs_client.stale_devices(hours)
    return jsonify({'success': True, 'hours': hours, 'devices': rows})


# ─── Operasi massal (acs_bulk.py) ───

@bp.route('/api/genieacs/bulk/options', methods=['GET'])
@login_required
@permission_required(_PERM)
def bulk_options():
    import acs_bulk
    from models import OLT
    from ftth_topology import NODE_MODELS
    models = sorted({(o.actual_type or o.onu_type or '').strip()
                     for o, _m in db.session.query(ONU, GenieacsDeviceMap)
                     .join(GenieacsDeviceMap, GenieacsDeviceMap.onu_id == ONU.id).all()} - {''})
    nodes = [{'type': t, 'id': n.id, 'name': n.name}
             for t, m in NODE_MODELS.items() for n in m.query.order_by(m.name).all()]
    return jsonify({'success': True, 'olts': [{'id': o.id, 'name': o.name} for o in OLT.query.order_by(OLT.name)],
                    'models': models, 'nodes': nodes, 'files': acs_bulk.list_files(),
                    'max': acs_bulk.MAX_TARGETS})


@bp.route('/api/genieacs/bulk/preview', methods=['POST'])
@login_required
@permission_required(_PERM)
def bulk_preview():
    import acs_bulk
    f = (request.get_json() or {}).get('filters') or {}
    return jsonify({'success': True, **acs_bulk.preview(f)})


@bp.route('/api/genieacs/bulk/run', methods=['POST'])
@login_required
@permission_required(_PERM)
def bulk_run():
    import acs_bulk
    from flask import current_app
    data = request.get_json() or {}
    f, action, params = data.get('filters') or {}, data.get('action'), data.get('params') or {}
    err = acs_bulk.validate_action(action, params)
    if err:
        return jsonify({'success': False, 'message': err}), 400
    busy = acs_bulk.running_job()
    if busy:
        return jsonify({'success': False, 'message': f'Masih ada operasi massal berjalan (#{busy.id}).'}), 409
    count = len(acs_bulk.select_targets(f))
    if count == 0:
        return jsonify({'success': False, 'message': 'Tidak ada modem yang cocok dengan filter.'}), 400
    if count > acs_bulk.MAX_TARGETS:
        return jsonify({'success': False, 'message': f'Maksimal {acs_bulk.MAX_TARGETS} modem per operasi '
                                                     f'(filter ini {count}). Persempit filter.'}), 400
    if int(data.get('confirm_count') or -1) != count:
        return jsonify({'success': False, 'message': f'Jumlah target berubah sejak pratinjau (sekarang {count}). '
                                                     'Pratinjau ulang lalu konfirmasi.'}), 409
    job = acs_bulk.create_job(f, action, params, getattr(current_user, 'username', ''))
    log_action('tr069_bulk', 'onu', target=f'job#{job.id}',
               detail=f'{action} {json.dumps(params)[:150]} → {count} modem; filter {json.dumps(f)[:200]}')
    acs_bulk.start_job(current_app._get_current_object(), job.id)
    return jsonify({'success': True, 'job': acs_bulk.job_dict(job)})


@bp.route('/api/genieacs/bulk/jobs', methods=['GET'])
@login_required
@permission_required(_PERM)
def bulk_jobs():
    import acs_bulk
    from models import AcsBulkJob
    acs_bulk.running_job()  # rapikan job yatim setelah restart
    rows = AcsBulkJob.query.order_by(AcsBulkJob.id.desc()).limit(20).all()
    return jsonify({'success': True, 'jobs': [acs_bulk.job_dict(j) for j in rows]})


@bp.route('/api/genieacs/bulk/jobs/<int:job_id>', methods=['GET'])
@login_required
@permission_required(_PERM)
def bulk_job(job_id):
    import acs_bulk
    from models import AcsBulkJob
    j = db.session.get(AcsBulkJob, job_id)
    if not j:
        return jsonify({'success': False, 'message': 'Job tidak ditemukan'}), 404
    return jsonify({'success': True, 'job': acs_bulk.job_dict(j, with_items=True)})


@bp.route('/api/genieacs/bulk/jobs/<int:job_id>/cancel', methods=['POST'])
@login_required
@permission_required(_PERM)
def bulk_cancel(job_id):
    import acs_bulk
    acs_bulk.cancel_job(job_id)
    log_action('tr069_bulk_cancel', 'onu', target=f'job#{job_id}')
    return jsonify({'success': True})
