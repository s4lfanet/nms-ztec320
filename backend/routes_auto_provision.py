"""Auto Provisioning (ZTP) settings + log viewer API.

The actual auto-registration logic runs in auto_provision.py as a
background thread (started in run_server.py) — this module is only the
settings CRUD (persisted in SystemConfig, same store other per-feature
settings pages use), an endpoint to tail its log file, and an endpoint
that returns the actual VLANs and speed profiles available on the
allowed OLTs so the settings page can populate its dropdowns from real
OLT data instead of asking the user to type profile names by hand.
"""
from flask import Blueprint, request, jsonify
import os

from models import db, OLT, ONUVlan, SpeedProfile, SystemConfig
from helpers import permission_required
from auto_provision import _ztp_log_path

bp = Blueprint('auto_provision', __name__)

_ZTP_KEYS = ['ztp_enabled', 'ztp_vlans', 'ztp_vlan_mode', 'ztp_profile',
             'ztp_traffic_profile', 'ztp_epon_sla', 'ztp_allowed_olts']


@bp.route('/api/ztp-config', methods=['GET'])
@permission_required('settings_ip_olts')
def get_ztp_config():
    configs = {c.key: c.value for c in SystemConfig.query.filter(SystemConfig.key.in_(_ZTP_KEYS)).all()}
    allowed_str = configs.get('ztp_allowed_olts', '')
    allowed_ids = [int(x) for x in allowed_str.split(',') if x.strip().isdigit()]
    vlans_str = configs.get('ztp_vlans', '')
    vlan_ids = [int(x) for x in vlans_str.split(',') if x.strip().isdigit()]
    olts = [{'id': o.id, 'name': o.name} for o in OLT.query.order_by(OLT.name).all()]
    return jsonify({
        'success': True,
        'config': {
            'ztp_enabled': configs.get('ztp_enabled') == 'true',
            'ztp_vlans': vlan_ids,
            'ztp_vlan_mode': configs.get('ztp_vlan_mode') or 'tag',
            'ztp_profile': configs.get('ztp_profile') or '',
            'ztp_traffic_profile': configs.get('ztp_traffic_profile') or '',
            'ztp_epon_sla': configs.get('ztp_epon_sla') or '',
            'ztp_allowed_olts': allowed_ids,
        },
        'olts': olts,
    })


@bp.route('/api/ztp-config', methods=['POST'])
@permission_required('settings_ip_olts')
def save_ztp_config():
    data = request.get_json() or {}
    allowed_ids = data.get('ztp_allowed_olts', [])
    vlan_ids = data.get('ztp_vlans', [])
    settings = {
        'ztp_enabled': 'true' if data.get('ztp_enabled') else 'false',
        'ztp_vlans': ','.join(str(int(x)) for x in vlan_ids if str(x).lstrip('-').isdigit()),
        'ztp_vlan_mode': 'untag' if data.get('ztp_vlan_mode') == 'untag' else 'tag',
        'ztp_profile': str(data.get('ztp_profile', '')),
        'ztp_traffic_profile': str(data.get('ztp_traffic_profile', '')),
        'ztp_epon_sla': str(data.get('ztp_epon_sla', '')),
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


@bp.route('/api/ztp-options', methods=['GET'])
@permission_required('settings_ip_olts')
def get_ztp_options():
    """Return the actual VLANs and speed profiles available across all
    allowed OLTs, so the settings page can populate its dropdowns from
    real OLT data instead of asking the user to type profile names by
    hand.

    Reads from the DB tables populated during sync (ONUVlan, SpeedProfile)
    — no live CLI round-trip, so this is fast and never blocks on a
    unreachable OLT. If an OLT hasn't been synced yet its contribution is
    simply empty; the user can sync it from the OLT Settings page first.
    """
    configs = {c.key: c.value for c in SystemConfig.query.filter(SystemConfig.key.in_(['ztp_allowed_olts'])).all()}
    allowed_str = configs.get('ztp_allowed_olts', '')
    allowed_ids = [int(x) for x in allowed_str.split(',') if x.strip().isdigit()]

    vlans_by_id = {}  # deduplicate by vlan_id across OLTs
    tcont_set = set()
    traffic_set = set()
    sla_set = set()

    for olt_id in allowed_ids:
        for v in ONUVlan.query.filter_by(olt_id=olt_id).order_by(ONUVlan.vlan_id).all():
            if v.vlan_id not in vlans_by_id:
                vlans_by_id[v.vlan_id] = {'vlan_id': v.vlan_id, 'name': v.vlan_name or ''}
        for p in SpeedProfile.query.filter_by(olt_id=olt_id).all():
            if p.profile_type == 'tcont':
                tcont_set.add(p.name)
            elif p.profile_type == 'traffic':
                traffic_set.add(p.name)
            elif p.profile_type == 'sla':
                sla_set.add(p.name)

    vlans = sorted(vlans_by_id.values(), key=lambda v: v['vlan_id'])
    return jsonify({
        'success': True,
        'vlans': vlans,
        'tcont_profiles': sorted(tcont_set),
        'traffic_profiles': sorted(traffic_set),
        'sla_profiles': sorted(sla_set),
    })


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
