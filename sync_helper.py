"""Shared sync helper — saves poll_olt results to DB.
Used by app.py (manual sync, auto-sync after ONU action) and auto_sync.py (cronjob)."""
import re
import logging
from datetime import datetime, timezone
from models import (db, OLT, ONU, OLTSyncStatus, OLTCard, OLTPort, OLTUplink,
                    ONUVlan, ONUType, SpeedProfile, WanIpProfile, Fan,
                    Notification)

logger = logging.getLogger(__name__)

# Vendor names that should not be stored as actual_type (they are vendor names, not model types)
_VENDOR_NAMES = {'zte', 'huawei', 'fiberhome', 'alcatel-lucent', 'eci', 'unknown', 'all'}


def save_sync_result(olt, result, sync, light=False):
    """Save poll_olt result to DB — system, chassis, config, ONUs.
    
    When light=True: Only update ONU dynamic fields (status, rx_power, tx_power, 
    onu_rx_power, oper_state, name, serial, last_seen). Skip config tables 
    (VLANs, profiles, uplinks, chassis, PON ports). Don't delete stale ONUs 
    (SNMP might miss some in a single pass).
    """
    sys_info = result.get('system', {})
    olt.uptime = sys_info.get('uptime', 0)
    olt.is_online = True
    olt.connection_status = 'connected'
    desc = sys_info.get('description', '')
    if desc:
        ver_match = re.search(r'Version\s+([\w.]+)', desc)
        if ver_match:
            olt.firmware_version = ver_match.group(1)
        else:
            olt.firmware_version = desc[:100]

    # ─── Config data: skip in light mode (only update during full sync) ───
    if not light:
        chassis = result.get('chassis', {})
        if chassis.get('temperature') is not None:
            olt.temperature = chassis['temperature']

        if chassis.get('fans'):
            Fan.query.filter_by(olt_id=olt.id).delete()
            for fd in chassis['fans']:
                fan = Fan(olt_id=olt.id, fan_number=fd['number'],
                          status=fd['status'], rpm=fd['rpm'],
                          speed_level=fd['speed_level'])
                db.session.add(fan)
            olt.total_fan = len(chassis['fans'])

        if chassis.get('cards'):
            OLTCard.query.filter_by(olt_id=olt.id).delete()
            for cd in chassis['cards']:
                card = OLTCard(olt_id=olt.id, slot=cd.get('slot', 0),
                               card_type=cd.get('type', ''), status=cd.get('status', ''),
                               total_ports=cd.get('port_count', 0))
                db.session.add(card)

        pon_ports_data = result.get('pon_ports', [])
        if pon_ports_data:
            existing_ports = {p.port_name: p for p in OLTPort.query.filter_by(olt_id=olt.id).all()}
            seen_names = set()
            for pp in pon_ports_data:
                pname = pp.get('port_name', '')
                seen_names.add(pname)
                port = existing_ports.get(pname)
                if port:
                    port.port_number = pp['port_number']
                    port.port_interface = pname
                    port.admin_status = pp.get('admin_status', 'up')
                    port.name = pp.get('name', '')
                    port.description = pp.get('description', '')
                    port.linktrap = pp.get('linktrap', 'disable')
                    port.onu_count = pp.get('onu_count', 0)
                    port.onu_online = pp.get('onu_online', 0)
                    port.onu_offline = pp.get('onu_offline', 0)
                    port.sfp_vendor = pp.get('sfp_vendor', '')
                    port.sfp_type = pp.get('sfp_type', '')
                    port.sfp_serial = pp.get('sfp_serial', '')
                    port.sfp_wavelength = pp.get('sfp_wavelength', '')
                    port.sfp_connector = pp.get('sfp_connector', '')
                    port.sfp_distance = pp.get('sfp_distance', '')
                    port.sfp_tx_power = pp.get('sfp_tx_power', '')
                    port.sfp_rx_power = pp.get('sfp_rx_power', '')
                    port.sfp_temperature = pp.get('sfp_temperature', '')
                    port.sfp_voltage = pp.get('sfp_voltage', '')
                    port.sfp_bias_current = pp.get('sfp_bias_current', '')
                else:
                    port = OLTPort(
                        olt_id=olt.id, card_id=None,
                        port_number=pp['port_number'],
                        port_name=pname,
                        port_interface=pname,
                        admin_status=pp.get('admin_status', 'up'),
                        name=pp.get('name', ''),
                        description=pp.get('description', ''),
                        linktrap=pp.get('linktrap', 'disable'),
                        onu_count=pp.get('onu_count', 0),
                        onu_online=pp.get('onu_online', 0),
                        onu_offline=pp.get('onu_offline', 0),
                        sfp_vendor=pp.get('sfp_vendor', ''),
                        sfp_type=pp.get('sfp_type', ''),
                        sfp_serial=pp.get('sfp_serial', ''),
                        sfp_wavelength=pp.get('sfp_wavelength', ''),
                        sfp_connector=pp.get('sfp_connector', ''),
                        sfp_distance=pp.get('sfp_distance', ''),
                        sfp_tx_power=pp.get('sfp_tx_power', ''),
                        sfp_rx_power=pp.get('sfp_rx_power', ''),
                        sfp_temperature=pp.get('sfp_temperature', ''),
                        sfp_voltage=pp.get('sfp_voltage', ''),
                        sfp_bias_current=pp.get('sfp_bias_current', ''),
                    )
                    db.session.add(port)
            for pname, port in existing_ports.items():
                if pname not in seen_names:
                    db.session.delete(port)

        # Save uplinks from result (non-ZTE adapters collect uplinks via SNMP)
        uplinks_data = result.get('uplinks', [])
        if uplinks_data:
            existing_uplinks = {u.port_name: u for u in OLTUplink.query.filter_by(olt_id=olt.id).all()}
            seen_uplink_names = set()
            for i, ul in enumerate(uplinks_data):
                pname = ul.get('port_name', '')
                if not pname:
                    continue
                seen_uplink_names.add(pname)
                if pname in existing_uplinks:
                    u = existing_uplinks[pname]
                else:
                    u = OLTUplink(olt_id=olt.id, port_number=i + 1, port_name=pname)
                    db.session.add(u)
                u.speed = ul.get('speed', '')
                u.duplex = ul.get('duplex', 'full')
            for pname, u in existing_uplinks.items():
                if pname not in seen_uplink_names:
                    db.session.delete(u)

        vlans = result.get('vlans', [])
        if vlans is not None:
            ONUVlan.query.filter_by(olt_id=olt.id).delete()
            for v in vlans:
                vlan = ONUVlan(olt_id=olt.id, vlan_id=v['vlan_id'],
                               vlan_name=v.get('name', ''),
                               vlan_type=v.get('vlan_type', 'L2'),
                               onu_profiles=v.get('onu_profiles', ''),
                               tagged_ports=v.get('tagged_ports', ''),
                               untagged_ports=v.get('untagged_ports', ''))
                db.session.add(vlan)

        onu_types = result.get('onu_types', [])
        if onu_types is not None:
            ONUType.query.filter_by(olt_id=olt.id).delete()
            for ot in onu_types:
                otype = ONUType(olt_id=olt.id, type_name=ot['type_name'],
                                pon_type=ot.get('pon_type', 'gpon'),
                                description=ot.get('description', ''),
                                max_tcont=ot.get('max_tcont', 0),
                                max_gem=ot.get('max_gem', 0),
                                max_switch=ot.get('max_switch', 0),
                                max_ip_host=ot.get('max_ip_host', 0),
                                max_veip=ot.get('max_veip', 0))
                db.session.add(otype)

        speed_profiles = result.get('speed_profiles', {})
        if speed_profiles:
            SpeedProfile.query.filter_by(olt_id=olt.id).delete()
            for sp in speed_profiles.get('tcont', []):
                profile = SpeedProfile(olt_id=olt.id, profile_type='tcont',
                                       name=sp['name'], type_val=sp.get('type', ''),
                                       fixed_bandwidth=sp.get('fixed_bandwidth', '0'),
                                       assured_bandwidth=sp.get('assured_bandwidth', '0'),
                                       max_bandwidth=sp.get('max_bandwidth', '0'))
                db.session.add(profile)
            for sp in speed_profiles.get('traffic', []):
                profile = SpeedProfile(olt_id=olt.id, profile_type='traffic',
                                       name=sp['name'],
                                       sir=sp.get('sir', '0'),
                                       pir=sp.get('pir', '0'))
                db.session.add(profile)

        wan_profiles = result.get('wan_ip_profiles', [])
        if wan_profiles is not None:
            WanIpProfile.query.filter_by(olt_id=olt.id).delete()
            for wp in wan_profiles:
                profile = WanIpProfile(olt_id=olt.id, name=wp['name'],
                                       ip_address=wp.get('ip_address', ''),
                                       netmask=wp.get('netmask', ''),
                                       gateway=wp.get('gateway', ''),
                                       dns1=wp.get('dns1', ''),
                                       dns2=wp.get('dns2', ''))
                db.session.add(profile)

        uplinks = result.get('uplinks', [])
        if uplinks is not None:
            # Save IP network config before deleting (sync overwrites uplinks but IP config is user-set)
            old_uplinks = OLTUplink.query.filter_by(olt_id=olt.id).all()
            ip_config_by_port = {}
            for u in old_uplinks:
                if u.ip_address or u.ip_vlan_id:
                    ip_config_by_port[u.port_name or ''] = {
                        'ip_vlan_id': u.ip_vlan_id,
                        'ip_address': u.ip_address,
                        'ip_mask': u.ip_mask,
                        'ip_gateway': u.ip_gateway,
                    }
            OLTUplink.query.filter_by(olt_id=olt.id).delete()
            for i, up in enumerate(uplinks):
                port_name = up.get('port_name', '')
                saved_ip = ip_config_by_port.get(port_name, {})
                uplink = OLTUplink(olt_id=olt.id, port_number=i+1,
                                   port_name=port_name,
                                   speed=up.get('speed', ''),
                                   duplex=up.get('duplex', 'full'),
                                   medium=up.get('medium', ''),
                                   admin_status=up.get('admin_status', 'up'),
                                   oper_status=up.get('oper_status', 'down'),
                                   line_protocol=up.get('line_protocol', 'down'),
                                   description=up.get('description', ''),
                                   negotiation=up.get('negotiation', 'disable'),
                                   flowcontrol=up.get('flowcontrol', 'disable'),
                                   switchport_mode=up.get('switchport_mode', 'trunk'),
                                   vlans_tagged=up.get('vlans_tagged', ''),
                                   input_rate=up.get('input_rate', '0 Bps'),
                                   output_rate=up.get('output_rate', '0 Bps'),
                                   input_utilization=up.get('input_utilization', '0%'),
                                   output_utilization=up.get('output_utilization', '0%'),
                                   input_packets=up.get('input_packets', 0),
                                   output_packets=up.get('output_packets', 0),
                                   input_bytes=up.get('input_bytes', 0),
                                   output_bytes=up.get('output_bytes', 0),
                                   crc_errors=up.get('crc_errors', 0),
                                   dropped=up.get('dropped', 0),
                                   sfp_vendor=up.get('sfp_vendor', ''),
                                   sfp_serial=up.get('sfp_serial', ''),
                                   sfp_type=up.get('sfp_type', ''),
                                   sfp_wavelength=up.get('sfp_wavelength', ''),
                                   sfp_connector=up.get('sfp_connector', ''),
                                   sfp_distance=up.get('sfp_distance', ''),
                                   sfp_rx_power=up.get('sfp_rx_power', ''),
                                   sfp_tx_power=up.get('sfp_tx_power', ''),
                                   sfp_temperature=up.get('sfp_temperature', ''),
                                   sfp_voltage=up.get('sfp_voltage', ''),
                                   sfp_bias_current=up.get('sfp_bias_current', ''),
                                   phy_attribute=up.get('phy_attribute', ''),
                                   linktrap=up.get('linktrap', 'enable'),
                                   port_protect=up.get('port_protect', 'disable'),
                                   uplink_isolate=up.get('uplink_isolate', 'disable'),
                                   port_type=up.get('port_type', ''),
                                   ip_vlan_id=up.get('ip_vlan_id', 0) or saved_ip.get('ip_vlan_id', 0),
                                   ip_address=up.get('ip_address', '') or saved_ip.get('ip_address', ''),
                                   ip_mask=up.get('ip_mask', '') or saved_ip.get('ip_mask', ''),
                                   ip_gateway=up.get('ip_gateway', '') or saved_ip.get('ip_gateway', ''))
                db.session.add(uplink)

        db.session.commit()

        # Calculate ports_up / ports_down for each card
        cards_db = OLTCard.query.filter_by(olt_id=olt.id).all()
        pon_ports_db = OLTPort.query.filter_by(olt_id=olt.id).all()
        uplinks_db = OLTUplink.query.filter_by(olt_id=olt.id).all()
        for card in cards_db:
            ct = (card.card_type or '').upper()
            if ct.startswith('GTG') or ct.startswith('GTC'):
                slot_ports = [p for p in pon_ports_db if f'/{card.slot}/' in (p.port_name or '')]
                card.ports_up = sum(1 for p in slot_ports if (p.admin_status or 'up').lower() == 'up')
                card.ports_down = sum(1 for p in slot_ports if (p.admin_status or 'up').lower() != 'up')
            elif ct.startswith('SMXA') or ct in ('GICF', 'GISF'):
                slot_uplinks = [u for u in uplinks_db if f'/{card.slot}/' in (u.port_name or '')]
                card.ports_up = sum(1 for u in slot_uplinks if (u.oper_status or 'down').lower() == 'up')
                card.ports_down = sum(1 for u in slot_uplinks if (u.oper_status or 'down').lower() != 'up')
        db.session.commit()

    onus_data = result.get('onus', [])

    # Detect and remove duplicate ONU records (same onu_index) — keep oldest (lowest id)
    all_existing = ONU.query.filter_by(olt_id=olt.id).order_by(ONU.id).all()
    seen_idx_map = {}
    dup_ids = []
    for o in all_existing:
        if o.onu_index in seen_idx_map:
            dup_ids.append(o.id)
        else:
            seen_idx_map[o.onu_index] = o
    if dup_ids:
        logger.info(f"  Removing {len(dup_ids)} duplicate ONU record(s) for OLT {olt.id}: ids={dup_ids}")
        ONU.query.filter(ONU.id.in_(dup_ids)).delete(synchronize_session='fetch')
        db.session.commit()

    existing_onus = seen_idx_map
    # Serial-number fallback: match provisioned ONUs (onu_index=0) by serial
    sn_to_onu = {o.serial_number: o for o in all_existing if o.serial_number and o.onu_index == 0 and o.id not in dup_ids}
    seen_indices = set()
    online = los = dyinggasp = offline = other = 0

    for i, onu_data in enumerate(onus_data):
        idx = onu_data.get('onu_index', i)
        seen_indices.add(idx)
        if idx in existing_onus:
            onu = existing_onus[idx]
        else:
            # Try serial-number match for provisioned ONUs (onu_index=0)
            data_sn = onu_data.get('serial_number', '')
            if data_sn and data_sn in sn_to_onu:
                onu = sn_to_onu[data_sn]
                onu.onu_index = idx  # Fix the onu_index
            else:
                onu = ONU(olt_id=olt.id, onu_index=idx)
                db.session.add(onu)

        onu.frame = onu_data.get('frame', 1)
        onu.slot = onu_data.get('slot', 1)
        onu.port = onu_data.get('port', 1)
        onu.onu_id = onu_data.get('onu_id', idx)
        onu.serial_number = onu_data.get('serial_number', '')
        onu.name = onu_data.get('name', '') or onu_data.get('description', '')
        onu.description = onu_data.get('description', '')
        _prev_status = onu.status
        onu.status = onu_data.get('status', 'offline')
        onu.oper_state = onu_data.get('oper_state', 0)
        onu.reg_status = onu_data.get('reg_status', 0)

        # Push real-time WebSocket event when ONU status changes
        if _prev_status and _prev_status != onu.status and onu.id:
            try:
                from ws_bridge import ws_broadcast_onu, ws_broadcast_dashboard
                ws_broadcast_onu(olt.id, onu.id, 'status', _prev_status, onu.status)
                ws_broadcast_dashboard('onu_change', {
                    'olt_id': olt.id, 'onu_id': onu.id,
                    'field': 'status', 'old': _prev_status, 'new': onu.status,
                })
            except Exception:
                pass

        # For non-online ONUs (dyinggasp, offline, los), clear optical values
        # SNMP returns cached/last-known values for offline ONUs which is misleading
        if onu.status != 'online':
            onu.rx_power = None
            onu.tx_power = None
            onu.onu_rx_power = None
        else:
            onu.rx_power = onu_data.get('rx_power')
            _tx = onu_data.get('tx_power')
            if _tx is not None:
                onu.tx_power = _tx
            _onu_rx = onu_data.get('onu_rx_power')
            if _onu_rx is not None:
                onu.onu_rx_power = _onu_rx
        _distance = onu_data.get('distance')
        if _distance is not None:
            onu.distance = _distance
        onu.last_dereg_reason = onu_data.get('last_dereg_reason', '')
        _pppoe = onu_data.get('pppoe', '')
        if _pppoe:
            onu.pppoe = _pppoe
        _new_type = onu_data.get('actual_type', '')
        if _new_type:
            if _new_type.lower() not in _VENDOR_NAMES:
                onu.actual_type = _new_type
            elif not onu.actual_type:
                onu.actual_type = _new_type
        onu.last_seen = datetime.now(timezone.utc)

        # Track online/offline timestamps for online duration calculation
        if onu.status == 'online' and _prev_status != 'online':
            onu.last_online = datetime.now(timezone.utc)
            onu.last_offline = None
        elif onu.status != 'online' and _prev_status == 'online':
            onu.last_offline = datetime.now(timezone.utc)

        if onu.status == 'online': online += 1
        elif onu.status == 'los': los += 1
        elif onu.status == 'dyinggasp': dyinggasp += 1
        elif onu.status == 'offline': offline += 1
        else: other += 1

        if i % 10 == 0:
            db.session.commit()

    stale_count = 0
    # In light mode, don't delete stale ONUs — SNMP walk might miss some in a single pass
    if not light:
        for idx, onu in existing_onus.items():
            if idx not in seen_indices:
                db.session.delete(onu)
                stale_count += 1

    olt.total_onu = len(onus_data)
    olt.online_onu = online
    olt.los_onu = los
    olt.dyinggasp_onu = dyinggasp
    olt.offline_onu = offline
    olt.other_onu = other
    olt.last_sync = datetime.now(timezone.utc)
    # Only stamp last_full_sync on a real full sync, otherwise the 5-minute light
    # syncs would keep pushing the timestamp forward and the 6-hour full-sync
    # trigger in auto_sync.py would never fire.
    if not light:
        olt.last_full_sync = datetime.now(timezone.utc)

    # Only recount PON port stats in full mode (PON ports not updated in light mode)
    if not light:
        pon_port_objs = OLTPort.query.filter_by(olt_id=olt.id).all()
        for pp in pon_port_objs:
            m = re.search(r'(\d+)/(\d+)$', pp.port_name)
            if m:
                # ZTE-style: gpon-olt_1/2/3 → slot=2, port=3
                _slot, _port = int(m.group(1)), int(m.group(2))
                port_onus = ONU.query.filter_by(olt_id=olt.id, slot=_slot, port=_port).all()
            else:
                port_onus = []
            pp.onu_count = len(port_onus)
            pp.onu_online = sum(1 for o in port_onus if o.status == 'online')
            pp.onu_offline = sum(1 for o in port_onus if o.status != 'online')

    sync.progress = 95
    sync.status = 'saving'
    sync.message = f'Saving {len(onus_data)} ONUs...'
    sync.onu_count = len(onus_data)
    db.session.commit()

    # Invalidate dashboard cache so frontend sees fresh data
    try:
        from cache import cache_clear
        cache_clear("dashboard:*")
    except Exception:
        pass

    return len(onus_data), stale_count


def check_unregistered_onus(olt):
    """Check for unregistered ONUs and create notification if found (ZTE via Telnet CLI)."""
    from snmp_collector import create_cli_collector
    tc = create_cli_collector(olt)
    unregistered = tc.collect_unregistered_onus()
    unreg_count = len(unregistered)
    if unreg_count > 0:
        existing_notif = Notification.query.filter_by(
            olt_id=olt.id, category='unconfig', is_read=False
        ).first()
        title = f'⚠️ {unreg_count} ONU Belum Terdaftar — {olt.name}'
        message = f'{unreg_count} ONU(s) waiting for registration on OLT {olt.name}'
        if existing_notif:
            existing_notif.title = title
            existing_notif.message = message
            existing_notif.created_at = datetime.now(timezone.utc)
        else:
            n = Notification(
                olt_id=olt.id,
                title=title,
                message=message,
                severity='warning',
                category='unconfig'
            )
            db.session.add(n)
        db.session.commit()
    return unreg_count
