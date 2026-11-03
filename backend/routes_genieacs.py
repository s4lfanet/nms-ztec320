"""GenieACS TR-069 bridge routes — settings, sync, device actions."""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import db, SystemConfig, ONU, GenieacsDeviceMap
from helpers import permission_required, log_action, utc_iso
from extensions import logger
import genieacs_client

bp = Blueprint('genieacs', __name__)

_PERM = 'genieacs_manage'


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
        row = SystemConfig.query.filter_by(key='genieacs_nbi_password').first()
        if row:
            row.value = data['nbi_password']
        else:
            db.session.add(SystemConfig(key='genieacs_nbi_password', value=data['nbi_password']))
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
    return jsonify({'success': ok, 'message': err})


@bp.route('/api/onu/<int:onu_id>/tr069/refresh', methods=['POST'])
@login_required
@permission_required(_PERM)
def tr069_refresh(onu_id):
    mapping = GenieacsDeviceMap.query.filter_by(onu_id=onu_id).first()
    if not mapping:
        return jsonify({'success': False, 'message': 'No TR-069 mapping'}), 404
    ok, err = genieacs_client.refresh_params(mapping.device_id)
    log_action('tr069_refresh', 'onu', target=str(onu_id), detail=f'ok={ok} {err}')
    return jsonify({'success': ok, 'message': err})


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
    return jsonify({'success': ok, 'message': err})


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
    return jsonify({'success': ok, 'message': err})


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
    return jsonify({'success': ok, 'message': err})


@bp.route('/api/onu/<int:onu_id>/tr069/factory-reset', methods=['POST'])
@login_required
@permission_required(_PERM)
def tr069_factory_reset(onu_id):
    mapping = _mapped(onu_id)
    if not mapping:
        return jsonify({'success': False, 'message': 'No TR-069 mapping'}), 404
    ok, err = genieacs_client.factory_reset(mapping.device_id)
    log_action('tr069_factory_reset', 'onu', target=str(onu_id), detail=f'ok={ok}')
    return jsonify({'success': ok, 'message': err})


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
    return jsonify({'success': ok, 'message': err})


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
    return jsonify({'success': ok, 'message': err})
