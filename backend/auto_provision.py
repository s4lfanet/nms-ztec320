"""Zero-Touch Provisioning (ZTP) — background auto-registration of
unconfigured ONUs (GPON and EPON).

Ported from a feature that was live on production (backup-nms-2026-09-03)
but never committed to git — this is a clean re-implementation against the
current codebase's models/helpers, not a copy of the old script. Runs as
an in-process background thread (started in run_server.py, same pattern as
alerts.run_alert_monitor) instead of the original's external cron job, so
there's nothing to set up outside the app itself.

Settings are stored in SystemConfig under the 'ztp_*' keys and edited from
the Auto Provision page (routes_auto_provision.py). Disabled by default —
the monitor loop is a no-op until 'ztp_enabled' is turned on.
"""
import os
import time
from datetime import datetime, timezone

from extensions import logger

_CHECK_INTERVAL_SECONDS = 60


def _cfg(key, default=''):
    from models import SystemConfig
    row = SystemConfig.query.filter_by(key=key).first()
    return row.value if row and row.value not in (None, '') else default


def _ztp_log_path(app):
    path = os.path.join(app.instance_path, 'ztp.log')
    os.makedirs(app.instance_path, exist_ok=True)
    return path


def _log(app, message):
    """Record one ZTP activity line — both to the app logger (journalctl)
    and to a small tailable file the Auto Provision page's log viewer
    reads, mirroring the pattern other per-feature log viewers in this app
    use for surfacing background-thread activity in the UI."""
    logger.info(f"[ZTP] {message}")
    try:
        ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
        with open(_ztp_log_path(app), 'a', encoding='utf-8') as f:
            f.write(f'[{ts}] {message}\n')
    except Exception as e:
        logger.warning(f"[ZTP] could not write log file: {e}")


def _pick_gpon_onu_type(olt_id, model):
    """Match a scanned GPON model string to a registered ONU type, same
    spirit as routes_onu.scan_unconfigured's match_onu_type but simplified
    for the single-candidate case an auto-provision bot needs (no ranked
    list to show a human) — falls back to the universal 'All' type."""
    from models import ONUType
    reg_types = [t.type_name for t in ONUType.query.filter_by(olt_id=olt_id, pon_type='gpon').all() if t.type_name]
    if not reg_types:
        return 'All'
    ml = (model or '').upper()
    if ml:
        for rt in reg_types:
            if rt.upper() == ml or ml.startswith(rt.upper()) or rt.upper() in ml:
                return rt
    return 'All' if 'ALL' in [rt.upper() for rt in reg_types] else reg_types[0]


def _run_ztp_pass(app):
    from models import db, OLT, ONU
    from routes_onu import _auto_sync_olt, _auto_write_config, _sanitize_provisioning_input
    from cli_sanitize import CliValidationError
    from snmp_collector import create_cli_collector

    if _cfg('ztp_enabled') != 'true':
        return

    allowed_ids = {int(x) for x in _cfg('ztp_allowed_olts').split(',') if x.strip().isdigit()}
    if not allowed_ids:
        return

    vlan_mode = _cfg('ztp_vlan_mode', 'tag')
    default_vlan = _cfg('ztp_vlan', '150')
    tcont_profile = _cfg('ztp_profile', 'UP-1G')
    traffic_profile = _cfg('ztp_traffic_profile', 'DOWN-1G')
    epon_sla = _cfg('ztp_epon_sla', 'UP-1G')

    olts = OLT.query.filter(OLT.id.in_(allowed_ids), OLT.monitoring_enabled == True).all()  # noqa: E712
    for olt in olts:
        if not olt.cli_enabled or not olt.cli_username:
            continue
        try:
            tc = create_cli_collector(olt)
            unconfigured = tc.collect_unregistered_onus()
        except Exception as e:
            _log(app, f"Gagal koneksi ke OLT {olt.name}: {e}")
            continue

        for entry in unconfigured or []:
            sn = (entry.get('sn') or '').strip()
            pon_port = entry.get('pon_port', '')
            is_epon = bool(entry.get('is_epon'))
            if not sn or sn.upper() in ('IDLE', 'N/A') or len(sn) < 8:
                continue
            parts = pon_port.split('/')
            if len(parts) != 3:
                continue
            try:
                frame, slot, port = int(parts[0]), int(parts[1]), int(parts[2])
            except ValueError:
                continue

            # Already has a DB row somewhere (this OLT or another) — not this
            # bot's job to reconcile that, skip quietly. Covers both "already
            # auto-registered by an earlier pass" and genuine conflicts.
            if ONU.query.filter_by(serial_number=sn).first():
                continue

            onu_type = 'ALL-EPON' if is_epon else _pick_gpon_onu_type(olt.id, entry.get('model', ''))
            mode_label = 'EPON' if is_epon else 'GPON'

            try:
                new_id = tc.get_next_available_onu_id(frame, slot, port, is_epon=is_epon)
            except Exception as e:
                _log(app, f"Gagal cek ONU ID kosong di {pon_port} ({olt.name}): {e}")
                continue
            if not new_id:
                _log(app, f"Gagal: tidak ada ONU ID kosong di {pon_port} ({olt.name})")
                continue

            name = f"AutoReg_{sn[-4:]}"
            services = [{'service_type': 'internet', 'vlan': default_vlan, 'wan_mode': 'bridge', 'vlan_mode': vlan_mode}]
            try:
                clean = _sanitize_provisioning_input(
                    name=name, description='Auto Provisioned (ZTP)',
                    tcont_profile=tcont_profile, traffic_profile=traffic_profile,
                    sla_profile=epon_sla, services=services, serial=sn, onu_type=onu_type,
                    vlan=int(default_vlan) if str(default_vlan).isdigit() else 100,
                )
            except CliValidationError as e:
                _log(app, f"Dilewati: data ONU {mode_label} SN={sn} tidak valid ({e})")
                continue

            _log(app, f"Mendeteksi ONU {mode_label} baru: SN={sn} @ {pon_port} (OLT {olt.name}) — mendaftarkan...")

            try:
                success, msg = tc.register_unified(
                    frame=frame, slot=slot, port=port, onu_id=new_id,
                    serial=clean['serial'], onu_type=clean['onu_type'],
                    tcont_profile=clean['tcont_profile'], traffic_profile=clean['traffic_profile'],
                    sla_profile=clean['sla_profile'], services=clean['services'],
                    is_epon=is_epon, name=clean['name'], description=clean['description'],
                )
            except Exception as e:
                _log(app, f"Error registrasi {mode_label} SN={sn}: {e}")
                continue

            if not success:
                _log(app, f"Gagal registrasi {mode_label} SN={sn}: {msg}")
                continue

            computed_index = frame * 100000 + slot * 10000 + port * 100 + new_id
            existing = ONU.query.filter_by(olt_id=olt.id, frame=frame, slot=slot, port=port, onu_id=new_id).first()
            if not existing:
                db.session.add(ONU(
                    olt_id=olt.id, frame=frame, slot=slot, port=port, onu_id=new_id,
                    serial_number=clean['serial'], onu_index=computed_index,
                    name=clean['name'], description=clean['description'],
                    status='offline', actual_type=clean['onu_type'], onu_type=clean['onu_type'],
                    card='epon' if is_epon else '',
                ))
                db.session.commit()

            _auto_sync_olt(olt.id)
            _auto_write_config(olt.id)
            _log(app, f"Sukses: ONU {mode_label} {pon_port}:{new_id} (SN={sn}) terdaftar sebagai {clean['onu_type']}")


def run_ztp_monitor(app):
    """Background thread entry point — see module docstring."""
    logger.info("[ZTP] Auto-provision monitor started")
    time.sleep(15)
    while True:
        try:
            with app.app_context():
                _run_ztp_pass(app)
        except Exception as e:
            logger.error(f"[ZTP] monitor pass error: {e}")
        time.sleep(_CHECK_INTERVAL_SECONDS)
