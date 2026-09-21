"""Auto Provisioning (ZTP) settings + log viewer API.

The actual auto-registration logic runs in auto_provision.py as a
background thread (started in run_server.py) — this module is only the
settings CRUD (persisted in SystemConfig, same store other per-feature
settings pages use) and a small endpoint to tail its log file.
"""
from flask import Blueprint, request, jsonify
import os

from models import db, OLT, SystemConfig
from helpers import permission_required
from auto_provision import _ztp_log_path

bp = Blueprint('auto_provision', __name__)

_ZTP_KEYS = ['ztp_enabled', 'ztp_vlan', 'ztp_vlan_mode', 'ztp_profile',
             'ztp_traffic_profile', 'ztp_epon_sla', 'ztp_allowed_olts']


@bp.route('/api/ztp-config', methods=['GET'])
@permission_required('settings_ip_olts')
def get_ztp_config():
    configs = {c.key: c.value for c in SystemConfig.query.filter(SystemConfig.key.in_(_ZTP_KEYS)).all()}
    allowed_str = configs.get('ztp_allowed_olts', '')
    allowed_ids = [int(x) for x in allowed_str.split(',') if x.strip().isdigit()]
    olts = [{'id': o.id, 'name': o.name} for o in OLT.query.order_by(OLT.name).all()]
    return jsonify({
        'success': True,
        'config': {
            'ztp_enabled': configs.get('ztp_enabled') == 'true',
            'ztp_vlan': configs.get('ztp_vlan') or '150',
            'ztp_vlan_mode': configs.get('ztp_vlan_mode') or 'tag',
            'ztp_profile': configs.get('ztp_profile') or 'UP-1G',
            'ztp_traffic_profile': configs.get('ztp_traffic_profile') or 'DOWN-1G',
            'ztp_epon_sla': configs.get('ztp_epon_sla') or 'UP-1G',
            'ztp_allowed_olts': allowed_ids,
        },
        'olts': olts,
    })


@bp.route('/api/ztp-config', methods=['POST'])
@permission_required('settings_ip_olts')
def save_ztp_config():
    data = request.get_json() or {}
    allowed_ids = data.get('ztp_allowed_olts', [])
    settings = {
        'ztp_enabled': 'true' if data.get('ztp_enabled') else 'false',
        'ztp_vlan': str(data.get('ztp_vlan', '150')),
        'ztp_vlan_mode': 'untag' if data.get('ztp_vlan_mode') == 'untag' else 'tag',
        'ztp_profile': str(data.get('ztp_profile', 'UP-1G')),
        'ztp_traffic_profile': str(data.get('ztp_traffic_profile', 'DOWN-1G')),
        'ztp_epon_sla': str(data.get('ztp_epon_sla', 'UP-1G')),
        'ztp_allowed_olts': ','.join(str(int(x)) for x in allowed_ids if str(x).lstrip('-').isdigit()),
    }
    for key, value in settings.items():
        cfg = SystemConfig.query.filter_by(key=key).first()
        if cfg:
            cfg.value = value
        else:
            db.session.add(SystemConfig(key=key, value=value))
    db.session.commit()
    return jsonify({'success': True, 'message': 'Pengaturan ZTP disimpan'})


@bp.route('/api/ztp-logs', methods=['GET'])
@permission_required('settings_ip_olts')
def get_ztp_logs():
    from flask import current_app
    path = _ztp_log_path(current_app)
    if not os.path.exists(path):
        return jsonify({'success': True, 'logs': 'Belum ada log auto-provisioning.'})
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()
    return jsonify({'success': True, 'logs': ''.join(lines[-200:])})
