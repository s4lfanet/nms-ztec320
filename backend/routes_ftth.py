"""Auto-extracted from app.py monolith split (blueprint: ftth).
Behavior-preserving move: route bodies are unchanged from the original app.py.
"""
from flask import Blueprint, request, jsonify, g, session, redirect
from flask_login import login_required, current_user
from datetime import datetime, timezone, timedelta
from functools import wraps
import logging, re, threading, os, json, time, hashlib, shutil, hmac

from sqlalchemy import or_
from sqlalchemy.orm import joinedload

from models import (
    db, User, Role, OLT, ONU, Template, TR069Profile, ONUCustomColumn, Fan,
    OLTSyncStatus, OLTCard, OLTUplink, ONUVlan, ONUType, SpeedProfile,
    WanIpProfile, OLTPort, AVAILABLE_PERMISSIONS, Notification, AlertRule,
    AlertHistory, BotConfig, FTTHOTB, FTTHOTBPort, FTTHODC, FTTHODP, FTTHODPPort,
    FTTHPonPort, FTTHFiberPath, FTTHJC, FTTHJCSplice, SystemConfig, ActionLog,
    MetricHistory, TrafficLog, TrafficLogHourly, OLTConfigBackup,
)
from extensions import logger
from helpers import (
    utc_iso, log_action, permission_required, super_admin_required,
    check_rate_limit as _check_rate_limit,
    record_failed_login as _record_failed_login,
    clear_failed_logins as _clear_failed_logins,
)
from services_wa import get_nms_branding as _get_nms_branding
from services_sync import start_single_sync, start_sync_all

bp = Blueprint('ftth', __name__)

@bp.route('/api/ftth/stats', methods=['GET'])
@login_required
def ftth_stats():
    """FTTH Overview stats: aggregate ONU status counts, per-OLT/PON breakdown, infrastructure summary, orphans."""
    olts = OLT.query.all()
    onu_q = ONU.query

    # Aggregate ONU status counts
    onus = onu_q.all()
    status_counts = {'online': 0, 'offline': 0, 'los': 0, 'dyinggasp': 0, 'unregister': 0}
    for o in onus:
        s = (o.status or 'offline').lower()
        if s in status_counts:
            status_counts[s] += 1
        else:
            status_counts['offline'] += 1
    total_onu = len(onus)

    # Per-OLT breakdown
    per_olt = []
    for olt in olts:
        olt_onus = [o for o in onus if o.olt_id == olt.id]
        olt_counts = {'online': 0, 'offline': 0, 'los': 0, 'dyinggasp': 0, 'unregister': 0}
        for o in olt_onus:
            s = (o.status or 'offline').lower()
            if s in olt_counts:
                olt_counts[s] += 1
            else:
                olt_counts['offline'] += 1
        per_olt.append({
            'olt_id': olt.id, 'olt_name': olt.name,
            'total': len(olt_onus), **olt_counts,
            'is_online': olt.is_online,
        })

    # Per-PON port breakdown (from OLTPort table)
    pon_ports_db = OLTPort.query.all()
    pon_olt_map = {p.id: p.olt_id for p in pon_ports_db}
    per_pon = []
    for pp in pon_ports_db:
        parts = (pp.port_name or '').replace('gpon-olt_', '').replace('gpon-onu_', '').split('/')
        if len(parts) >= 3:
            try:
                frame, slot, port = int(parts[0]), int(parts[1]), int(parts[2])
                pon_onus = [o for o in onus if o.olt_id == pp.olt_id and o.frame == frame and o.slot == slot and o.port == port]
                online_cnt = sum(1 for o in pon_onus if (o.status or '').lower() == 'online')
                per_pon.append({
                    'port_id': pp.id, 'port_name': pp.port_name or f'{frame}/{slot}/{port}',
                    'olt_id': pp.olt_id, 'olt_name': next((olt.name for olt in olts if olt.id == pp.olt_id), ''),
                    'total': len(pon_onus), 'online': online_cnt,
                    'offline': len(pon_onus) - online_cnt,
                    'admin_status': pp.admin_status,
                })
            except (ValueError, IndexError):
                continue

    # Infrastructure summary
    otbs = FTTHOTB.query.all()
    otb_ids = [o.id for o in otbs]
    odcs = FTTHODC.query.all()
    odc_ids = [o.id for o in odcs]
    odps = FTTHODP.query.all()
    odp_ids = [o.id for o in odps]
    odp_ports_q = FTTHODPPort.query

    total_otb = len(otbs)
    total_odc = len(odcs)
    total_odp = len(odps)
    all_odp_ports = odp_ports_q.all()
    total_odp_ports = len(all_odp_ports)
    used_odp_ports = sum(1 for p in all_odp_ports if p.status == 'used')

    # Orphan detection
    orphan_onus = sum(1 for o in onus if not any(p.onu_id == o.id for p in all_odp_ports))
    orphan_odps = sum(1 for odp in odps if not (odp.jc_id if odp.feed_source == 'jc' else odp.odc_id))
    orphan_odcs = sum(1 for odc in odcs if not (odc.jc_id if odc.feed_source == 'jc' else odc.otb_id))
    orphan_otbs = sum(1 for otb in otbs if not ((otb.jc_id if otb.feed_source == 'jc' else otb.olt_id)))
    # Data completeness checks
    onus_without_technician = sum(1 for o in onus if not o.technician_id)
    onus_without_coordinates = sum(1 for o in onus if o.latitude is None or o.longitude is None)
    total_orphans = orphan_onus + orphan_odps + orphan_odcs + orphan_otbs

    return jsonify({
        'success': True,
        'onu_stats': {
            'total': total_onu,
            **status_counts,
        },
        'per_olt': per_olt,
        'per_pon': per_pon,
        'infrastructure': {
            'total_otb': total_otb,
            'total_odc': total_odc,
            'total_odp': total_odp,
            'total_odp_ports': total_odp_ports,
            'used_odp_ports': used_odp_ports,
            'available_odp_ports': total_odp_ports - used_odp_ports,
        },
        'orphans': {
            'total': total_orphans,
            'onus_without_odp': orphan_onus,
            'odps_without_odc': orphan_odps,
            'odcs_without_otb': orphan_odcs,
            'otbs_without_olt': orphan_otbs,
            'onus_without_technician': onus_without_technician,
            'onus_without_coordinates': onus_without_coordinates,
        },
    })


def _otb_to_dict(o):
    odc_count = FTTHODC.query.filter_by(otb_id=o.id).count()
    total_cores = o.total_cores or 0
    jc = db.session.get(FTTHJC, o.jc_id) if o.jc_id else None
    return {
        'id': o.id, 'name': o.name, 'type': o.type, 'model': o.model,
        'location': o.location, 'latitude': o.latitude, 'longitude': o.longitude,
        'olt_id': o.olt_id, 'olt_name': o.olt.name if o.olt else '',
        'pon_port': o.pon_port, 'total_cores': total_cores,
        'fibers_per_tube': o.fibers_per_tube or 12,
        'feed_source': o.feed_source or 'pon',
        'jc_id': o.jc_id, 'jc_name': jc.name if jc else '',
        'jc_core_number': o.jc_core_number,
        'description': o.description or '',
        'odc_count': odc_count,
        'used_cores': odc_count,
        'available_cores': max(0, total_cores - odc_count),
        'is_active': odc_count > 0,
    }


def _odc_to_dict(o):
    odp_count = FTTHODP.query.filter_by(odc_id=o.id).count()
    total_cores = o.total_cores or 0
    jc = db.session.get(FTTHJC, o.jc_id) if o.jc_id else None
    return {
        'id': o.id, 'name': o.name, 'model': o.model,
        'location': o.location, 'latitude': o.latitude, 'longitude': o.longitude,
        'otb_id': o.otb_id, 'otb_name': o.otb.name if o.otb else '',
        'otb_core_number': o.otb_core_number,
        'feed_source': o.feed_source or 'otb',
        'jc_id': o.jc_id, 'jc_name': jc.name if jc else '',
        'jc_core_number': o.jc_core_number,
        'total_cores': total_cores, 'fibers_per_tube': o.fibers_per_tube or 12,
        'splitter_model': o.splitter_model,
        'description': o.description or '',
        'odp_count': odp_count,
        'used_cores': odp_count,
        'available_cores': max(0, total_cores - odp_count),
        'is_active': odp_count > 0,
    }


def _odp_to_dict(o):
    used_ports_count = FTTHODPPort.query.filter_by(odp_id=o.id, status='used').count()
    total_ports = o.total_ports or 0
    jc = db.session.get(FTTHJC, o.jc_id) if o.jc_id else None
    return {
        'id': o.id, 'name': o.name, 'model': o.model,
        'location': o.location, 'latitude': o.latitude, 'longitude': o.longitude,
        'odc_id': o.odc_id, 'odc_name': o.odc.name if o.odc else '',
        'odc_core_number': o.odc_core_number,
        'feed_source': o.feed_source or 'odc',
        'jc_id': o.jc_id, 'jc_name': jc.name if jc else '',
        'jc_core_number': o.jc_core_number,
        'total_ports': total_ports, 'splitter_model': o.splitter_model,
        'description': o.description or '',
        'used_ports': used_ports_count,
        'available_ports': max(0, total_ports - used_ports_count),
        'is_active': used_ports_count > 0,
    }


def _jc_to_dict(j):
    parent_name = ''
    if j.parent_type and j.parent_id:
        if j.parent_type == 'pon':
            p = db.session.get(FTTHPonPort, j.parent_id)
            parent_name = (p.pon_name or f'{p.frame}/{p.slot}/{p.port}') if p else ''
        elif j.parent_type == 'odp_port':
            p = db.session.get(FTTHODPPort, j.parent_id)
            parent_name = f'{p.odp.name} Port {p.port_number}' if p and p.odp else ''
        else:
            parent_model = {'otb': FTTHOTB, 'odc': FTTHODC, 'jc': FTTHJC}.get(j.parent_type)
            if parent_model:
                p = db.session.get(parent_model, j.parent_id)
                parent_name = p.name if p else ''
    splices = FTTHJCSplice.query.filter_by(jc_id=j.id).order_by(FTTHJCSplice.core_out).all()
    return {
        'id': j.id, 'name': j.name, 'closure_type': j.closure_type or 'inline',
        'location': j.location or '', 'latitude': j.latitude, 'longitude': j.longitude,
        'total_cores': j.total_cores or 0, 'fibers_per_tube': j.fibers_per_tube or 12,
        'parent_type': j.parent_type, 'parent_id': j.parent_id, 'parent_name': parent_name,
        'description': j.description or '',
        'splice_count': len(splices),
        'splices': [_jc_splice_to_dict(s) for s in splices],
    }


def _jc_splice_to_dict(s):
    return {
        'id': s.id, 'jc_id': s.jc_id, 'core_in': s.core_in, 'core_out': s.core_out, 'label': s.label or '',
        'tube_in_label': s.tube_in_label or '', 'tube_out_label': s.tube_out_label or '',
    }


def _jc_creates_cycle(jc_id, start_parent_type, start_parent_id, _max_depth=25):
    """Would setting jc_id's parent to (start_parent_type, start_parent_id)
    create a JC->JC cycle? Walk up the proposed parent chain looking for jc_id."""
    t, i, depth = start_parent_type, start_parent_id, 0
    while t == 'jc' and i and depth < _max_depth:
        if i == jc_id:
            return True
        parent = db.session.get(FTTHJC, i)
        if not parent:
            break
        t, i = parent.parent_type, parent.parent_id
        depth += 1
    return depth >= _max_depth


def _odp_port_to_dict(p):
    onu = ONU.query.get(p.onu_id) if p.onu_id else None
    jc = db.session.get(FTTHJC, p.jc_id) if p.jc_id else None
    return {
        'id': p.id, 'odp_id': p.odp_id, 'port_number': p.port_number,
        'onu_id': p.onu_id, 'status': p.status,
        'customer_name': p.customer_name, 'customer_phone': p.customer_phone,
        'description': p.description or '',
        'feed_source': p.feed_source or 'direct',
        'jc_id': p.jc_id, 'jc_name': jc.name if jc else '',
        'jc_core_number': p.jc_core_number,
        'onu_name': onu.name if onu else '',
        'onu_serial': onu.serial_number if onu else '',
        'onu_status': onu.status if onu else '',
        'onu_id_str': onu.onu_id_str if onu else '',
    }


def _otb_port_to_dict(p):
    odc = FTTHODC.query.filter_by(otb_id=p.otb_id, otb_core_number=p.port_number).first()
    return {
        'id': p.id, 'otb_id': p.otb_id, 'port_number': p.port_number,
        'label': p.label or '', 'description': p.description or '',
        'status': 'used' if odc else 'available',
        'odc_id': odc.id if odc else None,
        'odc_name': odc.name if odc else '',
    }


def _ensure_otb_ports(otb):
    """Create any missing FTTHOTBPort rows up to otb.total_cores (idempotent)."""
    existing = {p.port_number for p in FTTHOTBPort.query.filter_by(otb_id=otb.id).all()}
    for i in range(1, (otb.total_cores or 0) + 1):
        if i not in existing:
            db.session.add(FTTHOTBPort(otb_id=otb.id, port_number=i))


@bp.route('/api/ftth/otb', methods=['GET'])
@login_required
def ftth_otb_list():
    items = FTTHOTB.query.order_by(FTTHOTB.name).all()
    return jsonify({'success': True, 'items': [_otb_to_dict(o) for o in items]})


@bp.route('/api/ftth/otb', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_otb_create():
    d = request.get_json() or {}
    feed_source = d.get('feed_source', 'pon')
    o = FTTHOTB(
        name=d.get('name', ''), type=d.get('type', 'otb'), model=d.get('model', ''),
        location=d.get('location', ''), latitude=d.get('latitude'), longitude=d.get('longitude'),
        olt_id=d.get('olt_id') if feed_source == 'pon' else None,
        pon_port=d.get('pon_port', '') if feed_source == 'pon' else '',
        total_cores=d.get('total_cores', 12), fibers_per_tube=d.get('fibers_per_tube', 12),
        feed_source=feed_source,
        jc_id=d.get('jc_id') if feed_source == 'jc' else None,
        jc_core_number=d.get('jc_core_number') if feed_source == 'jc' else None,
        description=d.get('description', ''),
    )
    db.session.add(o)
    db.session.flush()
    _ensure_otb_ports(o)
    db.session.commit()
    return jsonify({'success': True, 'item': _otb_to_dict(o)})


@bp.route('/api/ftth/otb/<int:otb_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def ftth_otb_update(otb_id):
    o = db.session.get(FTTHOTB, otb_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    d = request.get_json() or {}
    for k in ['name', 'type', 'model', 'location', 'pon_port', 'description']:
        if k in d: setattr(o, k, d[k])
    for k in ['latitude', 'longitude']:
        if k in d: setattr(o, k, d[k])
    for k in ['total_cores', 'fibers_per_tube']:
        if k in d: setattr(o, k, d[k])
    if 'feed_source' in d:
        o.feed_source = d['feed_source']
        if o.feed_source == 'pon':
            o.jc_id = None; o.jc_core_number = None
            if 'olt_id' in d: o.olt_id = d['olt_id']
        elif o.feed_source == 'jc':
            o.olt_id = None
            if 'jc_id' in d: o.jc_id = d['jc_id']
            if 'jc_core_number' in d: o.jc_core_number = d['jc_core_number']
    else:
        if 'olt_id' in d: o.olt_id = d['olt_id']
        if 'jc_id' in d: o.jc_id = d['jc_id']
        if 'jc_core_number' in d: o.jc_core_number = d['jc_core_number']
    if 'total_cores' in d:
        _ensure_otb_ports(o)
    db.session.commit()
    return jsonify({'success': True, 'item': _otb_to_dict(o)})


@bp.route('/api/ftth/otb/<int:otb_id>/ports', methods=['GET'])
@login_required
def ftth_otb_ports(otb_id):
    o = db.session.get(FTTHOTB, otb_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    # Backfill: OTBs created before per-port naming existed have no port rows yet.
    _ensure_otb_ports(o)
    db.session.commit()
    ports = FTTHOTBPort.query.filter_by(otb_id=otb_id).order_by(FTTHOTBPort.port_number).all()
    return jsonify({'success': True, 'ports': [_otb_port_to_dict(p) for p in ports]})


@bp.route('/api/ftth/otb-port/<int:port_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def ftth_otb_port_update(port_id):
    p = db.session.get(FTTHOTBPort, port_id)
    if not p: return jsonify({'success': False, 'message': 'Not found'}), 404
    d = request.get_json() or {}
    for k in ['label', 'description']:
        if k in d: setattr(p, k, d[k])
    db.session.commit()
    return jsonify({'success': True, 'port': _otb_port_to_dict(p)})


@bp.route('/api/ftth/otb/<int:otb_id>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def ftth_otb_delete(otb_id):
    o = db.session.get(FTTHOTB, otb_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    for jc in FTTHJC.query.filter_by(parent_type='otb', parent_id=otb_id).all():
        jc.parent_type = None; jc.parent_id = None
    db.session.delete(o)
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/ftth/odc', methods=['GET'])
@login_required
def ftth_odc_list():
    otb_id = request.args.get('otb_id', type=int)
    q = FTTHODC.query
    if otb_id: q = q.filter_by(otb_id=otb_id)
    items = q.order_by(FTTHODC.name).all()
    return jsonify({'success': True, 'items': [_odc_to_dict(o) for o in items]})


@bp.route('/api/ftth/odc', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odc_create():
    d = request.get_json() or {}
    feed_source = d.get('feed_source', 'otb')
    o = FTTHODC(
        name=d.get('name', ''), model=d.get('model', ''),
        location=d.get('location', ''), latitude=d.get('latitude'), longitude=d.get('longitude'),
        otb_id=d.get('otb_id') if feed_source == 'otb' else None,
        otb_core_number=d.get('otb_core_number', 1),
        feed_source=feed_source,
        jc_id=d.get('jc_id') if feed_source == 'jc' else None,
        jc_core_number=d.get('jc_core_number') if feed_source == 'jc' else None,
        total_cores=d.get('total_cores', 8), fibers_per_tube=d.get('fibers_per_tube', 12),
        splitter_model=d.get('splitter_model', ''),
        description=d.get('description', ''),
    )
    db.session.add(o)
    db.session.commit()
    return jsonify({'success': True, 'item': _odc_to_dict(o)})


@bp.route('/api/ftth/odc/<int:odc_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odc_update(odc_id):
    o = db.session.get(FTTHODC, odc_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    d = request.get_json() or {}
    for k in ['name', 'model', 'location', 'splitter_model', 'description']:
        if k in d: setattr(o, k, d[k])
    for k in ['latitude', 'longitude']:
        if k in d: setattr(o, k, d[k])
    for k in ['otb_core_number', 'total_cores', 'fibers_per_tube']:
        if k in d: setattr(o, k, d[k])
    if 'feed_source' in d:
        o.feed_source = d['feed_source']
        if o.feed_source == 'otb':
            o.jc_id = None; o.jc_core_number = None
            if 'otb_id' in d: o.otb_id = d['otb_id']
        elif o.feed_source == 'jc':
            o.otb_id = None
            if 'jc_id' in d: o.jc_id = d['jc_id']
            if 'jc_core_number' in d: o.jc_core_number = d['jc_core_number']
    else:
        if 'otb_id' in d: o.otb_id = d['otb_id']
        if 'jc_id' in d: o.jc_id = d['jc_id']
        if 'jc_core_number' in d: o.jc_core_number = d['jc_core_number']
    db.session.commit()
    return jsonify({'success': True, 'item': _odc_to_dict(o)})


@bp.route('/api/ftth/odc/<int:odc_id>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odc_delete(odc_id):
    o = db.session.get(FTTHODC, odc_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    for jc in FTTHJC.query.filter_by(parent_type='odc', parent_id=odc_id).all():
        jc.parent_type = None; jc.parent_id = None
    db.session.delete(o)
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/ftth/odp', methods=['GET'])
@login_required
def ftth_odp_list():
    odc_id = request.args.get('odc_id', type=int)
    q = FTTHODP.query
    if odc_id: q = q.filter_by(odc_id=odc_id)
    items = q.order_by(FTTHODP.name).all()
    return jsonify({'success': True, 'items': [_odp_to_dict(o) for o in items]})


@bp.route('/api/ftth/odp', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odp_create():
    d = request.get_json() or {}
    feed_source = d.get('feed_source', 'odc')
    o = FTTHODP(
        name=d.get('name', ''), model=d.get('model', ''),
        location=d.get('location', ''), latitude=d.get('latitude'), longitude=d.get('longitude'),
        odc_id=d.get('odc_id') if feed_source == 'odc' else None,
        odc_core_number=d.get('odc_core_number', 1),
        feed_source=feed_source,
        jc_id=d.get('jc_id') if feed_source == 'jc' else None,
        jc_core_number=d.get('jc_core_number') if feed_source == 'jc' else None,
        total_ports=d.get('total_ports', 8), splitter_model=d.get('splitter_model', ''),
        description=d.get('description', ''),
    )
    db.session.add(o)
    db.session.commit()
    # Auto-create ports
    for i in range(1, o.total_ports + 1):
        db.session.add(FTTHODPPort(odp_id=o.id, port_number=i, status='available'))
    db.session.commit()
    return jsonify({'success': True, 'item': _odp_to_dict(o)})


@bp.route('/api/ftth/odp/<int:odp_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odp_update(odp_id):
    o = db.session.get(FTTHODP, odp_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    d = request.get_json() or {}
    for k in ['name', 'model', 'location', 'splitter_model', 'description']:
        if k in d: setattr(o, k, d[k])
    for k in ['latitude', 'longitude']:
        if k in d: setattr(o, k, d[k])
    for k in ['odc_core_number', 'total_ports']:
        if k in d: setattr(o, k, d[k])
    if 'feed_source' in d:
        o.feed_source = d['feed_source']
        if o.feed_source == 'odc':
            o.jc_id = None; o.jc_core_number = None
            if 'odc_id' in d: o.odc_id = d['odc_id']
        elif o.feed_source == 'jc':
            o.odc_id = None
            if 'jc_id' in d: o.jc_id = d['jc_id']
            if 'jc_core_number' in d: o.jc_core_number = d['jc_core_number']
    else:
        if 'odc_id' in d: o.odc_id = d['odc_id']
        if 'jc_id' in d: o.jc_id = d['jc_id']
        if 'jc_core_number' in d: o.jc_core_number = d['jc_core_number']
    # Auto-create missing ports if total_ports increased
    if 'total_ports' in d:
        existing = FTTHODPPort.query.filter_by(odp_id=o.id).count()
        for i in range(existing + 1, o.total_ports + 1):
            db.session.add(FTTHODPPort(odp_id=o.id, port_number=i, status='available'))
    db.session.commit()
    return jsonify({'success': True, 'item': _odp_to_dict(o)})


@bp.route('/api/ftth/odp/<int:odp_id>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odp_delete(odp_id):
    o = db.session.get(FTTHODP, odp_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    db.session.delete(o)
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/ftth/odp/<int:odp_id>/ports', methods=['GET'])
@login_required
def ftth_odp_ports(odp_id):
    ports = FTTHODPPort.query.filter_by(odp_id=odp_id).order_by(FTTHODPPort.port_number).all()
    return jsonify({'success': True, 'ports': [_odp_port_to_dict(p) for p in ports]})


@bp.route('/api/ftth/odp-port/<int:port_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odp_port_update(port_id):
    p = db.session.get(FTTHODPPort, port_id)
    if not p: return jsonify({'success': False, 'message': 'Not found'}), 404
    d = request.get_json() or {}
    for k in ['port_number', 'onu_id', 'status', 'customer_name', 'customer_phone', 'description']:
        if k in d: setattr(p, k, d[k])
    if 'feed_source' in d:
        p.feed_source = d['feed_source']
        if p.feed_source == 'jc':
            if 'jc_id' in d: p.jc_id = d['jc_id']
            if 'jc_core_number' in d: p.jc_core_number = d['jc_core_number']
        else:
            p.jc_id = None; p.jc_core_number = None
    else:
        if 'jc_id' in d: p.jc_id = d['jc_id']
        if 'jc_core_number' in d: p.jc_core_number = d['jc_core_number']
    if p.onu_id:
        p.status = 'used'
    elif p.status == 'used':
        p.status = 'available'
    db.session.commit()
    return jsonify({'success': True, 'port': _odp_port_to_dict(p)})


@bp.route('/api/ftth/odp-port/<int:port_id>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odp_port_delete(port_id):
    p = db.session.get(FTTHODPPort, port_id)
    if not p: return jsonify({'success': False, 'message': 'Not found'}), 404
    for jc in FTTHJC.query.filter_by(parent_type='odp_port', parent_id=port_id).all():
        jc.parent_type = None; jc.parent_id = None
    db.session.delete(p)
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/ftth/jc', methods=['GET'])
@login_required
def ftth_jc_list():
    items = FTTHJC.query.order_by(FTTHJC.name).all()
    return jsonify({'success': True, 'items': [_jc_to_dict(j) for j in items]})


@bp.route('/api/ftth/jc', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_jc_create():
    d = request.get_json() or {}
    j = FTTHJC(
        name=d.get('name', ''), closure_type=d.get('closure_type', 'inline'),
        location=d.get('location', ''), latitude=d.get('latitude'), longitude=d.get('longitude'),
        total_cores=d.get('total_cores', 12), fibers_per_tube=d.get('fibers_per_tube', 12),
        parent_type=d.get('parent_type'), parent_id=d.get('parent_id'),
        description=d.get('description', ''),
    )
    db.session.add(j)
    db.session.commit()
    return jsonify({'success': True, 'item': _jc_to_dict(j)})


@bp.route('/api/ftth/jc/<int:jc_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def ftth_jc_update(jc_id):
    j = db.session.get(FTTHJC, jc_id)
    if not j: return jsonify({'success': False, 'message': 'Not found'}), 404
    d = request.get_json() or {}
    new_parent_type = d.get('parent_type', j.parent_type)
    new_parent_id = d.get('parent_id', j.parent_id)
    if new_parent_type == 'jc' and new_parent_id:
        if new_parent_id == j.id or _jc_creates_cycle(j.id, new_parent_type, new_parent_id):
            return jsonify({'success': False, 'message': 'This would create a circular JC chain'}), 400
    for k in ['name', 'closure_type', 'location', 'description']:
        if k in d: setattr(j, k, d[k])
    for k in ['latitude', 'longitude']:
        if k in d: setattr(j, k, d[k])
    for k in ['total_cores', 'fibers_per_tube', 'parent_type', 'parent_id']:
        if k in d: setattr(j, k, d[k])
    db.session.commit()
    return jsonify({'success': True, 'item': _jc_to_dict(j)})


@bp.route('/api/ftth/jc/<int:jc_id>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def ftth_jc_delete(jc_id):
    j = db.session.get(FTTHJC, jc_id)
    if not j: return jsonify({'success': False, 'message': 'Not found'}), 404
    # Detach (don't cascade-delete) anything fed from this closure — losing
    # the JC waypoint shouldn't take out real infrastructure downstream.
    for odc in FTTHODC.query.filter_by(feed_source='jc', jc_id=j.id).all():
        odc.jc_id = None; odc.jc_core_number = None
    for odp in FTTHODP.query.filter_by(feed_source='jc', jc_id=j.id).all():
        odp.jc_id = None; odp.jc_core_number = None
    for otb in FTTHOTB.query.filter_by(feed_source='jc', jc_id=j.id).all():
        otb.jc_id = None; otb.jc_core_number = None
    for port in FTTHODPPort.query.filter_by(feed_source='jc', jc_id=j.id).all():
        port.jc_id = None; port.jc_core_number = None
    for child in FTTHJC.query.filter_by(parent_type='jc', parent_id=j.id).all():
        child.parent_type = None; child.parent_id = None
    db.session.delete(j)
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/ftth/jc/<int:jc_id>/splice', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_jc_splice_create(jc_id):
    j = db.session.get(FTTHJC, jc_id)
    if not j: return jsonify({'success': False, 'message': 'JC not found'}), 404
    d = request.get_json() or {}
    if not d.get('core_in') or not d.get('core_out'):
        return jsonify({'success': False, 'message': 'core_in and core_out are required'}), 400
    if FTTHJCSplice.query.filter_by(jc_id=jc_id, core_out=d['core_out']).first():
        return jsonify({'success': False, 'message': f"Core out {d['core_out']} is already used by another splice in this JC"}), 400
    s = FTTHJCSplice(jc_id=jc_id, core_in=d['core_in'], core_out=d['core_out'], label=d.get('label', ''),
                      tube_in_label=d.get('tube_in_label', ''), tube_out_label=d.get('tube_out_label', ''))
    db.session.add(s)
    db.session.commit()
    return jsonify({'success': True, 'splice': _jc_splice_to_dict(s)})


@bp.route('/api/ftth/jc/<int:jc_id>/splice/<int:splice_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def ftth_jc_splice_update(jc_id, splice_id):
    s = db.session.get(FTTHJCSplice, splice_id)
    if not s or s.jc_id != jc_id: return jsonify({'success': False, 'message': 'Not found'}), 404
    d = request.get_json() or {}
    if 'core_out' in d and d['core_out'] != s.core_out:
        if FTTHJCSplice.query.filter_by(jc_id=jc_id, core_out=d['core_out']).first():
            return jsonify({'success': False, 'message': f"Core out {d['core_out']} is already used by another splice in this JC"}), 400
    for k in ['core_in', 'core_out', 'label', 'tube_in_label', 'tube_out_label']:
        if k in d: setattr(s, k, d[k])
    db.session.commit()
    return jsonify({'success': True, 'splice': _jc_splice_to_dict(s)})


@bp.route('/api/ftth/jc/<int:jc_id>/splice/<int:splice_id>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def ftth_jc_splice_delete(jc_id, splice_id):
    s = db.session.get(FTTHJCSplice, splice_id)
    if not s or s.jc_id != jc_id: return jsonify({'success': False, 'message': 'Not found'}), 404
    # Detach anything downstream that was fed from exactly this spliced-out core
    for odc in FTTHODC.query.filter_by(feed_source='jc', jc_id=jc_id, jc_core_number=s.core_out).all():
        odc.jc_id = None; odc.jc_core_number = None
    for odp in FTTHODP.query.filter_by(feed_source='jc', jc_id=jc_id, jc_core_number=s.core_out).all():
        odp.jc_id = None; odp.jc_core_number = None
    for otb in FTTHOTB.query.filter_by(feed_source='jc', jc_id=jc_id, jc_core_number=s.core_out).all():
        otb.jc_id = None; otb.jc_core_number = None
    for port in FTTHODPPort.query.filter_by(feed_source='jc', jc_id=jc_id, jc_core_number=s.core_out).all():
        port.jc_id = None; port.jc_core_number = None
    db.session.delete(s)
    db.session.commit()
    return jsonify({'success': True})


def _build_odp_dict_full(odp):
    d = _odp_to_dict(odp)
    ports = FTTHODPPort.query.filter_by(odp_id=odp.id).order_by(FTTHODPPort.port_number).all()
    d['ports'] = [_odp_port_to_dict(p) for p in ports]
    return d


def _build_odc_dict_full(odc, _depth=0):
    d = _odc_to_dict(odc)
    d['odps'] = [_build_odp_dict_full(odp) for odp in FTTHODP.query.filter_by(feed_source='odc', odc_id=odc.id).order_by(FTTHODP.name).all()]
    d['jcs'] = [_build_jc_dict_full(jc, _depth + 1) for jc in FTTHJC.query.filter_by(parent_type='odc', parent_id=odc.id).order_by(FTTHJC.name).all()] if _depth < 20 else []
    return d


def _build_jc_dict_full(jc, _depth=0):
    d = _jc_to_dict(jc)  # already includes 'splices'
    if _depth > 20:  # guard against a pathological/cyclic chain
        d['odcs'], d['odps'], d['jcs'] = [], [], []
        return d
    d['odcs'] = [_build_odc_dict_full(odc, _depth + 1) for odc in FTTHODC.query.filter_by(feed_source='jc', jc_id=jc.id).order_by(FTTHODC.name).all()]
    d['odps'] = [_build_odp_dict_full(odp) for odp in FTTHODP.query.filter_by(feed_source='jc', jc_id=jc.id).order_by(FTTHODP.name).all()]
    d['jcs'] = [_build_jc_dict_full(child, _depth + 1) for child in FTTHJC.query.filter_by(parent_type='jc', parent_id=jc.id).order_by(FTTHJC.name).all()]
    return d


@bp.route('/api/ftth/tree', methods=['GET'])
@login_required
def ftth_tree():
    otbs = FTTHOTB.query.order_by(FTTHOTB.name).all()
    result = []
    for otb in otbs:
        otb_d = _otb_to_dict(otb)
        otb_d['odcs'] = [_build_odc_dict_full(odc) for odc in FTTHODC.query.filter_by(feed_source='otb', otb_id=otb.id).order_by(FTTHODC.name).all()]
        otb_d['jcs'] = [_build_jc_dict_full(jc) for jc in FTTHJC.query.filter_by(parent_type='otb', parent_id=otb.id).order_by(FTTHJC.name).all()]
        result.append(otb_d)
    return jsonify({'success': True, 'tree': result})


def _trace_upstream_from_odp(odp, _depth=0):
    """Walk from an ODP up through its feed (ODC or JC — possibly several JC
    hops) to the root OTB and the OLT PON port that lights it, returning
    hops ordered OLT-first / ODP-last. A break in the chain (a node whose
    feed isn't set) stops the climb and adds a 'gap' hop instead of raising,
    since an incomplete chain is itself useful troubleshooting information —
    it points at exactly which piece of data entry is missing."""
    hops = []

    def climb(node_type, node_id, core_number, depth):
        if depth > 25 or not node_type or not node_id:
            return
        if node_type == 'otb':
            otb = db.session.get(FTTHOTB, node_id)
            if not otb:
                return
            hops.insert(0, {'type': 'otb', 'id': otb.id, 'name': otb.name, 'core': core_number})
            if otb.feed_source == 'jc' and otb.jc_id:
                climb('jc', otb.jc_id, otb.jc_core_number, depth + 1)
            else:
                pon = FTTHPonPort.query.filter_by(otb_id=otb.id).first()
                if pon:
                    olt = db.session.get(OLT, pon.olt_id) if pon.olt_id else None
                    hops.insert(0, {'type': 'olt', 'id': pon.olt_id, 'name': (olt.name if olt else pon.olt_name) or '', 'detail': pon.pon_name or f'{pon.frame}/{pon.slot}/{pon.port}'})
                elif otb.olt_id:
                    olt = db.session.get(OLT, otb.olt_id)
                    hops.insert(0, {'type': 'olt', 'id': otb.olt_id, 'name': olt.name if olt else '', 'detail': otb.pon_port or ''})
            return
        if node_type == 'pon':
            pon = db.session.get(FTTHPonPort, node_id)
            if not pon:
                return
            olt = db.session.get(OLT, pon.olt_id) if pon.olt_id else None
            hops.insert(0, {'type': 'olt', 'id': pon.olt_id, 'name': (olt.name if olt else pon.olt_name) or '', 'detail': pon.pon_name or f'{pon.frame}/{pon.slot}/{pon.port}'})
            return
        if node_type == 'odc':
            odc = db.session.get(FTTHODC, node_id)
            if not odc:
                return
            hops.insert(0, {'type': 'odc', 'id': odc.id, 'name': odc.name, 'core': core_number})
            if odc.feed_source == 'otb' and odc.otb_id:
                climb('otb', odc.otb_id, odc.otb_core_number, depth + 1)
            elif odc.feed_source == 'jc' and odc.jc_id:
                climb('jc', odc.jc_id, odc.jc_core_number, depth + 1)
            else:
                hops.insert(0, {'type': 'gap', 'message': f'{odc.name} belum tersambung ke OTB/JC manapun'})
            return
        if node_type == 'jc':
            jc = db.session.get(FTTHJC, node_id)
            if not jc:
                return
            splice = FTTHJCSplice.query.filter_by(jc_id=jc.id, core_out=core_number).first() if core_number else None
            hops.insert(0, {
                'type': 'jc', 'id': jc.id, 'name': jc.name,
                'core_out': core_number, 'core_in': splice.core_in if splice else None,
                'splice_label': splice.label if splice else '',
            })
            if not splice:
                hops.insert(0, {'type': 'gap', 'message': f'{jc.name} tidak punya splice untuk core {core_number}'})
                return
            if jc.parent_type and jc.parent_id:
                climb(jc.parent_type, jc.parent_id, splice.core_in, depth + 1)
            else:
                hops.insert(0, {'type': 'gap', 'message': f'{jc.name} belum ada "Fed From" (parent)'})
            return

    hops.append({'type': 'odp', 'id': odp.id, 'name': odp.name, 'port': None})
    if odp.feed_source == 'odc' and odp.odc_id:
        climb('odc', odp.odc_id, odp.odc_core_number, _depth)
    elif odp.feed_source == 'jc' and odp.jc_id:
        climb('jc', odp.jc_id, odp.jc_core_number, _depth)
    else:
        hops.insert(0, {'type': 'gap', 'message': f'{odp.name} belum tersambung ke ODC/JC manapun'})
    return hops


@bp.route('/api/ftth/trace/onu/<int:onu_id>', methods=['GET'])
@login_required
def ftth_trace_onu(onu_id):
    """Full upstream path for one ONU/customer: OLT -> PON -> OTB(core) ->
    [JC splices] -> ODC(core) -> [JC splices] -> ODP(port) -> customer.
    Used by the ONU detail page so staff can see exactly which physical
    segment a customer sits on without manually browsing the Tree view."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    port = onu.odp_port
    if not port:
        return jsonify({'success': True, 'complete': False, 'hops': [], 'message': 'ONU ini belum di-assign ke port ODP manapun'})
    odp = db.session.get(FTTHODP, port.odp_id)
    hops = _trace_upstream_from_odp(odp) if odp else [{'type': 'gap', 'message': 'ODP untuk port ini tidak ditemukan'}]
    if hops and hops[-1].get('type') == 'odp':
        hops[-1]['port'] = port.port_number
    if port.feed_source == 'jc' and port.jc_id:
        jc = db.session.get(FTTHJC, port.jc_id)
        if jc:
            splice = FTTHJCSplice.query.filter_by(jc_id=jc.id, core_out=port.jc_core_number).first() if port.jc_core_number else None
            hops.append({
                'type': 'jc', 'id': jc.id, 'name': jc.name,
                'core_out': port.jc_core_number, 'core_in': splice.core_in if splice else None,
                'splice_label': splice.label if splice else '',
            })
            if not splice:
                hops.append({'type': 'gap', 'message': f'{jc.name} tidak punya splice untuk core {port.jc_core_number}'})
        else:
            hops.append({'type': 'gap', 'message': 'JC drop cable untuk port ini tidak ditemukan'})
    hops.append({'type': 'onu', 'id': onu.id, 'name': onu.name or onu.serial_number or '', 'serial': onu.serial_number or '', 'status': onu.status or ''})
    complete = not any(h.get('type') == 'gap' for h in hops)
    return jsonify({'success': True, 'complete': complete, 'hops': hops})


def _collect_downstream_onus(node_type, node_id, _depth=0, _seen=None):
    """Recursively collect every ONU reachable downstream of a node (OTB,
    JC, ODC, or ODP) — used to answer "if this breaks, who's affected"."""
    if _seen is None:
        _seen = set()
    key = (node_type, node_id)
    if _depth > 25 or key in _seen:
        return []
    _seen.add(key)
    onus = []
    if node_type == 'odp':
        for p in FTTHODPPort.query.filter_by(odp_id=node_id).all():
            if p.onu_id:
                onu = db.session.get(ONU, p.onu_id)
                if onu:
                    onus.append(onu)
    elif node_type == 'odc':
        for odp in FTTHODP.query.filter_by(feed_source='odc', odc_id=node_id).all():
            onus.extend(_collect_downstream_onus('odp', odp.id, _depth + 1, _seen))
        for jc in FTTHJC.query.filter_by(parent_type='odc', parent_id=node_id).all():
            onus.extend(_collect_downstream_onus('jc', jc.id, _depth + 1, _seen))
    elif node_type == 'otb':
        for odc in FTTHODC.query.filter_by(feed_source='otb', otb_id=node_id).all():
            onus.extend(_collect_downstream_onus('odc', odc.id, _depth + 1, _seen))
        for jc in FTTHJC.query.filter_by(parent_type='otb', parent_id=node_id).all():
            onus.extend(_collect_downstream_onus('jc', jc.id, _depth + 1, _seen))
    elif node_type == 'jc':
        for otb in FTTHOTB.query.filter_by(feed_source='jc', jc_id=node_id).all():
            onus.extend(_collect_downstream_onus('otb', otb.id, _depth + 1, _seen))
        for odc in FTTHODC.query.filter_by(feed_source='jc', jc_id=node_id).all():
            onus.extend(_collect_downstream_onus('odc', odc.id, _depth + 1, _seen))
        for odp in FTTHODP.query.filter_by(feed_source='jc', jc_id=node_id).all():
            onus.extend(_collect_downstream_onus('odp', odp.id, _depth + 1, _seen))
        for port in FTTHODPPort.query.filter_by(feed_source='jc', jc_id=node_id).all():
            if port.onu_id:
                onu = db.session.get(ONU, port.onu_id)
                if onu:
                    onus.append(onu)
        for child in FTTHJC.query.filter_by(parent_type='jc', parent_id=node_id).all():
            onus.extend(_collect_downstream_onus('jc', child.id, _depth + 1, _seen))
    return onus


@bp.route('/api/ftth/impact/<node_type>/<int:node_id>', methods=['GET'])
@login_required
def ftth_impact(node_type, node_id):
    """How many customers sit downstream of this OTB/JC/ODC/ODP — for
    triaging a cut trunk cable: which node's break affects the most people."""
    if node_type not in ('otb', 'jc', 'odc', 'odp'):
        return jsonify({'success': False, 'message': 'Invalid node_type'}), 400
    model = {'otb': FTTHOTB, 'jc': FTTHJC, 'odc': FTTHODC, 'odp': FTTHODP}[node_type]
    node = db.session.get(model, node_id)
    if not node:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    onus = _collect_downstream_onus(node_type, node_id)
    online = sum(1 for u in onus if (u.status or '').lower() == 'online')
    return jsonify({
        'success': True, 'total': len(onus), 'online': online, 'offline': len(onus) - online,
        'customers': [{'id': u.id, 'name': u.name or u.serial_number or '', 'serial': u.serial_number or '', 'status': u.status or ''} for u in onus[:200]],
        'truncated': len(onus) > 200,
    })


@bp.route('/api/ftth/map', methods=['GET'])
@login_required
def ftth_map():
    markers = []
    # Build OLT name lookup
    olts = OLT.query.all()
    olt_name_map = {o.id: o.name for o in olts}

    for o in FTTHOTB.query.all():
        if o.latitude and o.longitude:
            markers.append({'type': 'otb', 'id': o.id, 'name': o.name, 'lat': o.latitude, 'lng': o.longitude, 'subtype': o.type})
    odc_list = FTTHODC.query.all()
    odc_ids = [o.id for o in odc_list]
    for o in odc_list:
        if o.latitude and o.longitude:
            markers.append({'type': 'odc', 'id': o.id, 'name': o.name, 'lat': o.latitude, 'lng': o.longitude})
    odp_list = FTTHODP.query.all()
    odp_ids = [o.id for o in odp_list]
    for o in odp_list:
        if o.latitude and o.longitude:
            markers.append({'type': 'odp', 'id': o.id, 'name': o.name, 'lat': o.latitude, 'lng': o.longitude})
    jc_list = FTTHJC.query.all()
    for j in jc_list:
        if j.latitude and j.longitude:
            markers.append({'type': 'jc', 'id': j.id, 'name': j.name, 'lat': j.latitude, 'lng': j.longitude, 'subtype': j.closure_type})
    # ONU markers with status and details
    onu_query = ONU.query
    for o in onu_query.all():
        if o.latitude and o.longitude:
            markers.append({'type': 'onu', 'id': o.id, 'name': o.name or o.serial_number or f'ONU {o.onu_id_str}',
                            'lat': o.latitude, 'lng': o.longitude, 'status': o.status,
                            'serial': o.serial_number, 'olt_id': o.olt_id,
                            'olt_name': olt_name_map.get(o.olt_id, ''),
                            'onu_id_str': o.onu_id_str,
                            'rx_power': o.rx_power, 'tx_power': o.tx_power,
                            'onu_rx_power': o.onu_rx_power})
    # Build connections (lines) with from_id/to_id for path highlighting
    def _node_latlng(ntype, nid):
        model = {'otb': FTTHOTB, 'odc': FTTHODC, 'odp': FTTHODP, 'jc': FTTHJC}.get(ntype)
        if not model or not nid:
            return None
        n = db.session.get(model, nid)
        return (n.latitude, n.longitude) if n and n.latitude and n.longitude else None

    lines = []
    for otb in FTTHOTB.query.all():
        if otb.feed_source == 'jc' and otb.jc_id and otb.latitude:
            j_ll = _node_latlng('jc', otb.jc_id)
            if j_ll:
                lines.append({'from_lat': j_ll[0], 'from_lng': j_ll[1], 'to_lat': otb.latitude, 'to_lng': otb.longitude, 'from_type': 'jc', 'to_type': 'otb', 'from_id': otb.jc_id, 'to_id': otb.id, 'label': f'Core {otb.jc_core_number}'})
    for odc in odc_list:
        if odc.feed_source == 'otb' and odc.otb_id:
            otb = db.session.get(FTTHOTB, odc.otb_id)
            if otb and otb.latitude and odc.latitude:
                lines.append({'from_lat': otb.latitude, 'from_lng': otb.longitude, 'to_lat': odc.latitude, 'to_lng': odc.longitude, 'from_type': 'otb', 'to_type': 'odc', 'from_id': otb.id, 'to_id': odc.id, 'label': f'Core {odc.otb_core_number}'})
        elif odc.feed_source == 'jc' and odc.jc_id:
            j_ll = _node_latlng('jc', odc.jc_id)
            if j_ll and odc.latitude:
                lines.append({'from_lat': j_ll[0], 'from_lng': j_ll[1], 'to_lat': odc.latitude, 'to_lng': odc.longitude, 'from_type': 'jc', 'to_type': 'odc', 'from_id': odc.jc_id, 'to_id': odc.id, 'label': f'Core {odc.jc_core_number}'})
    for odp in odp_list:
        if odp.feed_source == 'odc' and odp.odc_id:
            odc = db.session.get(FTTHODC, odp.odc_id)
            if odc and odc.latitude and odp.latitude:
                lines.append({'from_lat': odc.latitude, 'from_lng': odc.longitude, 'to_lat': odp.latitude, 'to_lng': odp.longitude, 'from_type': 'odc', 'to_type': 'odp', 'from_id': odc.id, 'to_id': odp.id, 'label': f'Core {odp.odc_core_number}'})
        elif odp.feed_source == 'jc' and odp.jc_id:
            j_ll = _node_latlng('jc', odp.jc_id)
            if j_ll and odp.latitude:
                lines.append({'from_lat': j_ll[0], 'from_lng': j_ll[1], 'to_lat': odp.latitude, 'to_lng': odp.longitude, 'from_type': 'jc', 'to_type': 'odp', 'from_id': odp.jc_id, 'to_id': odp.id, 'label': f'Core {odp.jc_core_number}'})
    # JC ← parent (otb/odc/jc) connection lines
    for j in jc_list:
        if j.parent_type and j.parent_id:
            j_ll = _node_latlng('jc', j.id)
            p_ll = _node_latlng(j.parent_type, j.parent_id)
            if j_ll and p_ll:
                lines.append({'from_lat': p_ll[0], 'from_lng': p_ll[1], 'to_lat': j_ll[0], 'to_lng': j_ll[1], 'from_type': j.parent_type, 'to_type': 'jc', 'from_id': j.parent_id, 'to_id': j.id, 'label': j.name})
    # ODP → ONU connection lines (or JC → ONU when the drop cable routes through a JC)
    for odp in odp_list:
        if odp.latitude and (odp.odc_id or odp.jc_id):
            for port in odp.ports:
                if port.onu_id:
                    onu = db.session.get(ONU, port.onu_id)
                    if not (onu and onu.latitude):
                        continue
                    if port.feed_source == 'jc' and port.jc_id:
                        j_ll = _node_latlng('jc', port.jc_id)
                        if j_ll:
                            lines.append({'from_lat': j_ll[0], 'from_lng': j_ll[1],
                                          'to_lat': onu.latitude, 'to_lng': onu.longitude,
                                          'from_type': 'jc', 'to_type': 'onu',
                                          'from_id': port.jc_id, 'to_id': onu.id,
                                          'label': f'Core {port.jc_core_number}'})
                            continue
                    lines.append({'from_lat': odp.latitude, 'from_lng': odp.longitude,
                                  'to_lat': onu.latitude, 'to_lng': onu.longitude,
                                  'from_type': 'odp', 'to_type': 'onu',
                                  'from_id': odp.id, 'to_id': onu.id,
                                  'label': f'Port {port.port_number}'})
    return jsonify({'success': True, 'markers': markers, 'lines': lines})


@bp.route('/api/ftth/paths', methods=['GET'])
@login_required
def ftth_paths_list():
    paths = FTTHFiberPath.query.all()
    return jsonify({'success': True, 'paths': [{
        'id': p.id, 'from_type': p.from_type, 'from_id': p.from_id,
        'to_type': p.to_type, 'to_id': p.to_id,
        'coordinates': json.loads(p.coordinates) if p.coordinates else [],
        'path_type': p.path_type,
    } for p in paths]})


@bp.route('/api/ftth/paths', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_paths_create():
    data = request.get_json()
    path = FTTHFiberPath(
        from_type=data['from_type'], from_id=data['from_id'],
        to_type=data['to_type'], to_id=data['to_id'],
        coordinates=json.dumps(data.get('coordinates', [])),
        path_type=data.get('path_type', 'manual'),
    )
    db.session.add(path)
    db.session.commit()
    return jsonify({'success': True, 'id': path.id})


@bp.route('/api/ftth/paths/<int:path_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def ftth_paths_update(path_id):
    path = db.session.get(FTTHFiberPath, path_id)
    if not path:
        return jsonify({'success': False, 'message': 'Path not found'}), 404
    data = request.get_json()
    if 'coordinates' in data:
        path.coordinates = json.dumps(data['coordinates'])
    if 'path_type' in data:
        path.path_type = data['path_type']
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/ftth/paths/<int:path_id>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def ftth_paths_delete(path_id):
    path = db.session.get(FTTHFiberPath, path_id)
    if not path:
        return jsonify({'success': False, 'message': 'Path not found'}), 404
    db.session.delete(path)
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/ftth/auto-route', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_auto_route():
    """Auto-route between two coordinates using OSRM public API."""
    data = request.get_json()
    from_lat, from_lng = data['from_lat'], data['from_lng']
    to_lat, to_lng = data['to_lat'], data['to_lng']
    from_type, from_id = data.get('from_type', ''), data.get('from_id', 0)
    to_type, to_id = data.get('to_type', ''), data.get('to_id', 0)

    import urllib.request
    import urllib.error
    osrm_url = f'https://router.project-osrm.org/route/v1/driving/{from_lng},{from_lat};{to_lng},{to_lat}?overview=full&geometries=geojson'
    try:
        req = urllib.request.Request(osrm_url, headers={'User-Agent': 'Salfanet-NMS/1.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            osrm_data = json.loads(resp.read().decode())
        if osrm_data.get('code') != 'Ok' or not osrm_data.get('routes'):
            return jsonify({'success': False, 'message': 'OSRM routing failed'}), 400
        coords = osrm_data['routes'][0]['geometry']['coordinates']  # [[lng, lat], ...]
        # Convert to [lat, lng] for Leaflet
        latlng_coords = [[c[1], c[0]] for c in coords]
        # Save to DB
        path = FTTHFiberPath(
            from_type=from_type, from_id=from_id,
            to_type=to_type, to_id=to_id,
            coordinates=json.dumps(latlng_coords),
            path_type='auto',
        )
        db.session.add(path)
        db.session.commit()
        return jsonify({'success': True, 'id': path.id, 'coordinates': latlng_coords})
    except urllib.error.URLError as e:
        return jsonify({'success': False, 'message': f'OSRM request failed: {str(e)}'}), 502
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@bp.route('/api/ftth/available-onus', methods=['GET'])
@login_required
def ftth_available_onus():
    olt_id = request.args.get('olt_id', type=int)
    q = ONU.query.filter(~ONU.id.in_(db.session.query(FTTHODPPort.onu_id).filter(FTTHODPPort.onu_id.isnot(None))))
    if olt_id:
        q = q.filter_by(olt_id=olt_id)
    onus = q.order_by(ONU.name).limit(200).all()
    return jsonify({'success': True, 'onus': [{'id': o.id, 'name': o.name, 'serial': o.serial_number, 'onu_id_str': o.onu_id_str, 'olt_id': o.olt_id, 'olt_name': o.olt.name if o.olt else ''} for o in onus]})


def _pon_to_dict(p):
    # Count ONUs on this PON port
    onu_q = ONU.query.filter_by(olt_id=p.olt_id, frame=p.frame, slot=p.slot, port=p.port) if p.olt_id else ONU.query.filter_by(frame=p.frame, slot=p.slot, port=p.port)
    onus = onu_q.all()
    total_onu = len(onus)
    online_onu = sum(1 for o in onus if (o.status or '').lower() == 'online')
    return {
        'id': p.id, 'olt_id': p.olt_id, 'olt_name': p.olt_name,
        'frame': p.frame, 'slot': p.slot, 'port': p.port,
        'pon_name': p.pon_name,
        'otb_id': p.otb_id, 'otb_name': p.otb.name if p.otb else '',
        'otb_core_number': p.otb_core_number,
        'description': p.description or '',
        'total_onu': total_onu,
        'online_onu': online_onu,
        'offline_onu': total_onu - online_onu,
    }


@bp.route('/api/ftth/pon/real/<int:olt_id>', methods=['GET'])
@login_required
def ftth_pon_real_ports(olt_id):
    """Real PON ports already discovered from this OLT (via SNMP/telnet sync,
    stored in OLTPort) — used to populate the "Add PON Port" picker instead
    of making staff type frame/slot/port by hand. Only ports not yet mapped
    into FTTHPonPort are flagged as `already_mapped: false`."""
    import re as _re
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    mapped_names = {p.pon_name for p in FTTHPonPort.query.filter_by(olt_id=olt_id).all() if p.pon_name}
    ports = OLTPort.query.filter_by(olt_id=olt_id).order_by(OLTPort.port_number).all()
    result = []
    for p in ports:
        m = _re.match(r'(?:gpon|epon)-olt_(\d+)/(\d+)/(\d+)', p.port_name or '')
        frame, slot, port = (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else (1, 1, p.port_number)
        result.append({
            'port_name': p.port_name or f'gpon-olt_{frame}/{slot}/{port}',
            'frame': frame, 'slot': slot, 'port': port,
            'onu_count': p.onu_count or 0, 'onu_online': p.onu_online or 0,
            'already_mapped': (p.port_name or '') in mapped_names,
        })
    return jsonify({'success': True, 'olt_name': olt.name, 'ports': result})


@bp.route('/api/ftth/pon', methods=['GET'])
@login_required
def ftth_pon_list():
    q = FTTHPonPort.query
    items = q.order_by(FTTHPonPort.pon_name).all()
    return jsonify({'success': True, 'items': [_pon_to_dict(p) for p in items]})


@bp.route('/api/ftth/pon', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_pon_create():
    d = request.get_json() or {}
    o = FTTHPonPort(
        olt_id=d.get('olt_id'), olt_name=d.get('olt_name', ''),
        frame=d.get('frame', 1), slot=d.get('slot', 1), port=d.get('port', 1),
        pon_name=d.get('pon_name', ''),
        otb_id=d.get('otb_id'), otb_core_number=d.get('otb_core_number', 1),
        description=d.get('description', ''),
    )
    db.session.add(o)
    db.session.commit()
    return jsonify({'success': True, 'item': _pon_to_dict(o)})


@bp.route('/api/ftth/pon/<int:pon_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def ftth_pon_update(pon_id):
    o = db.session.get(FTTHPonPort, pon_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    d = request.get_json() or {}
    for k in ['olt_name', 'pon_name', 'description']:
        if k in d: setattr(o, k, d[k])
    for k in ['frame', 'slot', 'port', 'otb_core_number']:
        if k in d: setattr(o, k, int(d[k]))
    for k in ['olt_id', 'otb_id']:
        if k in d: setattr(o, k, d[k] if d[k] else None)
    db.session.commit()
    return jsonify({'success': True, 'item': _pon_to_dict(o)})


@bp.route('/api/ftth/pon/<int:pon_id>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def ftth_pon_delete(pon_id):
    o = db.session.get(FTTHPonPort, pon_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    for jc in FTTHJC.query.filter_by(parent_type='pon', parent_id=pon_id).all():
        jc.parent_type = None; jc.parent_id = None
    db.session.delete(o)
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/ftth/export', methods=['GET'])
@login_required
def ftth_export():
    data = {
        'pon_ports': [], 'otbs': [], 'odcs': [], 'odps': [], 'odp_ports': [],
    }
    for p in FTTHPonPort.query.all():
        data['pon_ports'].append(_pon_to_dict(p))
    for o in FTTHOTB.query.all():
        data['otbs'].append(_otb_to_dict(o))
    for o in FTTHODC.query.all():
        data['odcs'].append(_odc_to_dict(o))
    for o in FTTHODP.query.all():
        data['odps'].append(_odp_to_dict(o))
    for p in FTTHODPPort.query.all():
        data['odp_ports'].append(_odp_port_to_dict(p))
    from io import StringIO
    import csv
    si = StringIO()
    writer = csv.writer(si)
    # Write as structured CSV with sections
    writer.writerow(['=== PON PORTS ==='])
    writer.writerow(['id', 'olt_name', 'frame', 'slot', 'port', 'pon_name', 'otb_name', 'otb_core_number', 'description'])
    for p in data['pon_ports']:
        writer.writerow([p['id'], p['olt_name'], p['frame'], p['slot'], p['port'], p['pon_name'], p['otb_name'], p['otb_core_number'], p['description']])
    writer.writerow([])
    writer.writerow(['=== OTB/ODF ==='])
    writer.writerow(['id', 'name', 'type', 'model', 'location', 'latitude', 'longitude', 'total_cores', 'description'])
    for o in data['otbs']:
        writer.writerow([o['id'], o['name'], o['type'], o['model'], o['location'], o['latitude'], o['longitude'], o['total_cores'], o['description']])
    writer.writerow([])
    writer.writerow(['=== ODC ==='])
    writer.writerow(['id', 'name', 'model', 'location', 'latitude', 'longitude', 'otb_name', 'otb_core_number', 'total_cores', 'splitter_model', 'description'])
    for o in data['odcs']:
        writer.writerow([o['id'], o['name'], o['model'], o['location'], o['latitude'], o['longitude'], o['otb_name'], o['otb_core_number'], o['total_cores'], o['splitter_model'], o['description']])
    writer.writerow([])
    writer.writerow(['=== ODP ==='])
    writer.writerow(['id', 'name', 'model', 'location', 'latitude', 'longitude', 'odc_name', 'odc_core_number', 'total_ports', 'splitter_model', 'description'])
    for o in data['odps']:
        writer.writerow([o['id'], o['name'], o['model'], o['location'], o['latitude'], o['longitude'], o['odc_name'], o['odc_core_number'], o['total_ports'], o['splitter_model'], o['description']])
    writer.writerow([])
    writer.writerow(['=== ODP PORTS ==='])
    writer.writerow(['id', 'odp_id', 'port_number', 'status', 'customer_name', 'customer_phone', 'onu_name', 'onu_serial', 'description'])
    for p in data['odp_ports']:
        writer.writerow([p['id'], p['odp_id'], p['port_number'], p['status'], p['customer_name'], p['customer_phone'], p['onu_name'], p['onu_serial'], p['description']])
    from flask import Response
    resp = Response(si.getvalue(), mimetype='text/csv')
    resp.headers['Content-Disposition'] = 'attachment; filename=ftth_infrastructure.csv'
    return resp


@bp.route('/api/ftth/import', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_import():
    import csv as csv_mod
    from io import StringIO
    file = request.files.get('file')
    if not file:
        return jsonify({'success': False, 'message': 'No file uploaded'}), 400
    content = file.read().decode('utf-8')
    reader = csv_mod.reader(StringIO(content))
    rows = list(reader)
    section = None
    imported = {'pon_ports': 0, 'otbs': 0, 'odcs': 0, 'odps': 0, 'odp_ports': 0}
    # Build name→id maps for linking
    otb_map = {o.name: o.id for o in FTTHOTB.query.all()}
    odc_map = {o.name: o.id for o in FTTHODC.query.all()}
    odp_map = {o.name: o.id for o in FTTHODP.query.all()}
    i = 0
    while i < len(rows):
        row = rows[i]
        if not row:
            i += 1
            continue
        if row[0].startswith('==='):
            section = row[0].strip('= ').strip()
            i += 1  # skip header row
            i += 1  # skip column names row
            continue
        try:
            if section == 'PON PORTS' and len(row) >= 9:
                o = FTTHPonPort(olt_name=row[1], frame=int(row[2] or 1), slot=int(row[3] or 1),
                                port=int(row[4] or 1), pon_name=row[5],
                                otb_id=otb_map.get(row[6]), otb_core_number=int(row[7] or 1),
                                description=row[8])
                db.session.add(o)
                imported['pon_ports'] += 1
            elif section == 'OTB/ODF' and len(row) >= 9:
                o = FTTHOTB(name=row[1], type=row[2] or 'otb', model=row[3], location=row[4],
                            latitude=float(row[5]) if row[5] and row[5] != 'None' else None,
                            longitude=float(row[6]) if row[6] and row[6] != 'None' else None,
                            total_cores=int(row[7] or 12), description=row[8])
                db.session.add(o)
                db.session.flush()
                otb_map[o.name] = o.id
                imported['otbs'] += 1
            elif section == 'ODC' and len(row) >= 11:
                o = FTTHODC(name=row[1], model=row[2], location=row[3],
                            latitude=float(row[4]) if row[4] and row[4] != 'None' else None,
                            longitude=float(row[5]) if row[5] and row[5] != 'None' else None,
                            otb_id=otb_map.get(row[6]), otb_core_number=int(row[7] or 1),
                            total_cores=int(row[8] or 8), splitter_model=row[9], description=row[10])
                db.session.add(o)
                db.session.flush()
                odc_map[o.name] = o.id
                imported['odcs'] += 1
            elif section == 'ODP' and len(row) >= 11:
                o = FTTHODP(name=row[1], model=row[2], location=row[3],
                            latitude=float(row[4]) if row[4] and row[4] != 'None' else None,
                            longitude=float(row[5]) if row[5] and row[5] != 'None' else None,
                            odc_id=odc_map.get(row[6]), odc_core_number=int(row[7] or 1),
                            total_ports=int(row[8] or 8), splitter_model=row[9], description=row[10])
                db.session.add(o)
                db.session.flush()
                odp_map[o.name] = o.id
                # Auto-create ports
                for pi in range(1, o.total_ports + 1):
                    db.session.add(FTTHODPPort(odp_id=o.id, port_number=pi, status='available'))
                imported['odps'] += 1
            elif section == 'ODP PORTS' and len(row) >= 9:
                # Only import if odp_id resolves
                odp_id = int(row[1]) if row[1] and row[1].isdigit() else None
                if odp_id:
                    p = FTTHODPPort(odp_id=odp_id, port_number=int(row[2] or 1),
                                    status=row[3] or 'available', customer_name=row[4],
                                    customer_phone=row[5], description=row[8])
                    db.session.add(p)
                    imported['odp_ports'] += 1
        except Exception as ex:
            logger.warning(f"Import row error: {ex}, row: {row}")
        i += 1
    db.session.commit()
    return jsonify({'success': True, 'imported': imported})
