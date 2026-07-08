"""Per-vendor SNMP OID mappings.

All OIDs are relative to the enterprise prefix unless they start with '.1.3.6.1.2.1.'
(standard MIBs). The adapter prepends the enterprise OID when building full OID paths.
"""

VENDOR_OIDS = {
    # ── ZTE (C300, C320, C300 Mini) ──────────────────────────────────
    'zte': {
        'enterprise': '.1.3.6.1.4.1.3902',
        # Card / Board Health (index: slot)
        'card_type':     '.3902.1082.10.1.2.4.1.4.1.1',
        'card_status':   '.3902.1082.10.1.2.4.1.5.1.1',
        'card_cpu':      '.3902.1082.10.1.2.4.1.9.1.1',
        'card_memory':   '.3902.1082.10.1.2.4.1.11.1.1',
        'card_role':     '.3902.1082.10.1.2.4.1.13.1.1',
        'card_temp':     '.3902.1082.10.10.2.1.6.1.2.1.1',
        'fan_speed':     '.3902.1082.10.10.2.1.6.1.5.1.1',
        'psu_voltage':   '.3902.1082.10.10.2.3.11.1.2.1.1',
        # ONT Data (index: ifIndex.onuId) — Tree .3902.1082
        'onu_sn':        '.3902.1082.500.10.2.3.3.1.18',
        'onu_sn_hex':    '.3902.1082.500.10.2.3.3.1.6',
        'onu_desc':      '.3902.1082.500.10.2.3.3.1.2',
        'onu_name':      '.3902.1082.500.10.2.3.3.1.3',
        'onu_model':     '.3902.1082.500.20.2.1.2.1.8',
        'onu_status':    '.3902.1082.500.10.2.3.8.1.4',
        'onu_distance':  '.3902.1082.500.10.2.3.10.1.2',
        'pon_port_name': '.3902.1082.500.10.2.2.3.1.1',
        # ONU-side Optical (index: ifIndex.onuId.1) — Tree .3902.1082.500.20
        'onu_rx_down':   '.3902.1082.500.20.2.2.2.1.10',
        'onu_tx_up':     '.3902.1082.500.20.2.2.2.1.14',
        # OLT-side Optical (index: ponIndex.onuId) — Tree .3902.1015
        'olt_rx':        '.3902.1015.1010.11.2.1.2',
        'onu_tx':        '.3902.1015.1010.11.2.1.3',
        # SFP / PON Port Diagnostics (index: diagIndex) — Tree .3902.1015.3.1.13.1
        'sfp_olt_rx':    '.3902.1015.3.1.13.1.1',
        'sfp_tx_power':  '.3902.1015.3.1.13.1.4',
        'sfp_bias':      '.3902.1015.3.1.13.1.9',
        'sfp_voltage':   '.3902.1015.3.1.13.1.10',
        'sfp_wavelength': '.3902.1015.3.1.13.1.11',
        'sfp_temp':      '.3902.1015.3.1.13.1.12',
        'sfp_model':     '.3902.1015.3.1.13.1.13',
        'sfp_vendor':    '.3902.1015.3.1.13.1.14',
        # Standard MIBs
        'if_descr':      '.1.3.6.1.2.1.2.2.1.2',
        'if_oper_status': '.1.3.6.1.2.1.2.2.1.8',
        'if_admin_status': '.1.3.6.1.2.1.2.2.1.7',
        'if_in_octets':  '.1.3.6.1.2.1.31.1.1.1.6',
        'if_out_octets': '.1.3.6.1.2.1.31.1.1.1.10',
        'sys_uptime':    '.1.3.6.1.2.1.1.3.0',
        'sys_descr':     '.1.3.6.1.2.1.1.1.0',
    },

    # ── HSGQ (XE04ID, EPON) ──────────────────────────────────────────
    'hsgq': {
        'enterprise': '.1.3.6.1.4.1.50224',
        # ONU Info (index: onuIndex = slot<<24 | port<<8 | ont_id)
        'onu_name':       '.50224.3.3.2.1.2',
        'onu_status':     '.50224.3.3.2.1.8',
        'onu_mac':        '.50224.3.3.2.1.7',
        'onu_llid':       '.50224.3.3.2.1.16',
        'onu_distance':   '.50224.3.3.2.1.15',
        'onu_chip':       '.50224.3.3.2.1.26',
        # Optical Table (index: onuIndex.0.0 or portIndex.65535.65535)
        'olt_rx':         '.50224.3.3.3.1.4',
        'sfp_tx_power':   '.50224.3.3.3.1.5',
        'sfp_bias':       '.50224.3.3.3.1.6',
        'sfp_voltage':    '.50224.3.3.3.1.7',
        'sfp_temp':       '.50224.3.3.3.1.8',
        # PON Port Table (index: portIndex = slot<<24 | port<<16)
        'pon_port_name':  '.50224.3.2.1.1.2',
        'pon_port_status': '.50224.3.2.1.1.9',
        # System Health (scalar)
        'cpu_usage':      '.50224.3.1.1.17.0',
        'mem_usage':      '.50224.3.1.1.18.0',
        # Standard MIBs
        'if_descr':       '.1.3.6.1.2.1.2.2.1.2',
        'if_oper_status': '.1.3.6.1.2.1.2.2.1.8',
        'if_admin_status': '.1.3.6.1.2.1.2.2.1.7',
        'if_in_octets':   '.1.3.6.1.2.1.31.1.1.1.6',
        'if_out_octets':  '.1.3.6.1.2.1.31.1.1.1.10',
        'sys_uptime':     '.1.3.6.1.2.1.1.3.0',
    },

    # ── Raisecom (ISCOM6820-GP, ISCOM5800E) ──────────────────────────
    'raisecom': {
        'enterprise': '.1.3.6.1.4.1.8886',
        # ONT Table (index: type2id = 0b0001<<28 | slot<<23 | port<<16 | onu)
        'onu_sn':         '.8886.18.3.1.3.1.1.2',
        'onu_status':     '.8886.18.3.1.3.1.1.17',
        'onu_desc':       '.8886.18.3.1.3.1.1.20',
        'onu_distance':   '.8886.18.3.1.3.1.1.16',
        'onu_active':     '.8886.18.3.1.3.1.1.18',
        'onu_offline_reason': '.8886.18.3.1.3.1.1.15',
        # OLT-side RX Power (index: type2id)
        'olt_rx':         '.8886.18.3.1.3.3.1.1',
        # ONU-side Optical (index: index2 = slot*10000000 + port*100000 + onu*1000 + 1)
        'onu_rx_down':    '.8886.18.3.6.3.1.1.16',
        'onu_tx_up':      '.8886.18.3.6.3.1.1.17',
        # Board Health
        'chassis_temp':   '.8886.1.27.2.1.1.10.0',
        'card_cpu':       '.8886.18.1.7.1.1.1.4',
        'card_mem_total': '.8886.18.1.7.3.1.1.1',
        'card_mem_avail': '.8886.18.1.7.3.1.1.2',
        'card_type':      '.8886.1.27.3.1.1.5',
        'card_status':    '.8886.1.27.3.1.1.11',
        'fan_speed':      '.8886.1.27.5.1.1.4',
        # SFP Info (index: col.ifIndex)
        'sfp_vendor':     '.8886.1.18.2.1.1.1.3',
        'sfp_model':      '.8886.1.18.2.1.1.1.4',
        'sfp_serial':     '.8886.1.18.2.1.1.1.5',
        'sfp_wavelength': '.8886.1.18.2.1.1.1.16',
        # SFP DDM (index: ifIndex.param)
        'sfp_ddm_temp':   '.8886.1.18.2.2.1.1.2',   # param=1, /1000
        'sfp_ddm_bias':   '.8886.1.18.2.2.1.1.2',   # param=2, /1000
        'sfp_ddm_tx':     '.8886.1.18.2.2.1.1.2',   # param=3, µW
        'sfp_ddm_rx':     '.8886.1.18.2.2.1.1.2',   # param=4, millidBm /1000
        'sfp_ddm_voltage': '.8886.1.18.2.2.1.1.2',  # param=7, /1000
        # Standard MIBs
        'if_descr':       '.1.3.6.1.2.1.2.2.1.2',
        'if_oper_status': '.1.3.6.1.2.1.2.2.1.8',
        'if_admin_status': '.1.3.6.1.2.1.2.2.1.7',
        'if_in_octets':   '.1.3.6.1.2.1.31.1.1.1.6',
        'if_out_octets':  '.1.3.6.1.2.1.31.1.1.1.10',
        'sys_uptime':     '.1.3.6.1.2.1.1.3.0',
    },

    # ── Standalone EPON (BDCOM, C-Data, VSOL, generic) ───────────────
    'standalone_epon': {
        # Uses standard IF-MIB primarily
        'if_descr':       '.1.3.6.1.2.1.2.2.1.2',
        'if_oper_status': '.1.3.6.1.2.1.2.2.1.8',
        'if_admin_status': '.1.3.6.1.2.1.2.2.1.7',
        'if_in_octets':   '.1.3.6.1.2.1.31.1.1.1.6',
        'if_out_octets':  '.1.3.6.1.2.1.31.1.1.1.10',
        'sys_uptime':     '.1.3.6.1.2.1.1.3.0',
        'sys_descr':      '.1.3.6.1.2.1.1.1.0',
    },

    # ── BDCOM (GP3600 / P3310C / P3608) ──────────────────────────────
    'bdcom': {
        'enterprise':     '.1.3.6.1.4.1.3320',
        'onu_sn':         '.3320.101.10.1.1.3',
        'onu_status':     '.3320.101.10.1.1.26',
        'olt_rx':         '.3320.101.10.5.1.5',
        'onu_desc':       '.3320.101.10.1.1.8',
        # Standard MIBs
        'if_descr':       '.1.3.6.1.2.1.2.2.1.2',
        'if_oper_status': '.1.3.6.1.2.1.2.2.1.8',
        'if_admin_status': '.1.3.6.1.2.1.2.2.1.7',
        'if_in_octets':   '.1.3.6.1.2.1.31.1.1.1.6',
        'if_out_octets':  '.1.3.6.1.2.1.31.1.1.1.10',
        'sys_uptime':     '.1.3.6.1.2.1.1.3.0',
        'sys_descr':      '.1.3.6.1.2.1.1.1.0',
    },

    # ── C-Data (FD1104B / FD1108S / FD1216S / FD1608GS) ──────────────
    'c-data': {
        'enterprise':     '.1.3.6.1.4.1.34592',
        'onu_sn':         '.34592.1.3.4.1.2.1.1.3',
        'onu_status':     '.34592.1.3.4.1.2.1.1.10',
        'olt_rx':         '.34592.1.3.4.1.5.1.1.2',
        'onu_desc':       '.34592.1.3.4.1.2.1.1.7',
        # Standard MIBs
        'if_descr':       '.1.3.6.1.2.1.2.2.1.2',
        'if_oper_status': '.1.3.6.1.2.1.2.2.1.8',
        'if_admin_status': '.1.3.6.1.2.1.2.2.1.7',
        'if_in_octets':   '.1.3.6.1.2.1.31.1.1.1.6',
        'if_out_octets':  '.1.3.6.1.2.1.31.1.1.1.10',
        'sys_uptime':     '.1.3.6.1.2.1.1.3.0',
        'sys_descr':      '.1.3.6.1.2.1.1.1.0',
    },

    # ── VSOL (V1600G / V1600D) ───────────────────────────────────────
    'vsol': {
        'enterprise':     '.1.3.6.1.4.1.37950',
        'onu_sn':         '.37950.1.1.5.12.1.1.1.1',
        'onu_status':     '.37950.1.1.5.12.1.1.1.2',
        'olt_rx':         '.37950.1.1.5.12.1.3.1.2',
        # Standard MIBs
        'if_descr':       '.1.3.6.1.2.1.2.2.1.2',
        'if_oper_status': '.1.3.6.1.2.1.2.2.1.8',
        'if_admin_status': '.1.3.6.1.2.1.2.2.1.7',
        'if_in_octets':   '.1.3.6.1.2.1.31.1.1.1.6',
        'if_out_octets':  '.1.3.6.1.2.1.31.1.1.1.10',
        'sys_uptime':     '.1.3.6.1.2.1.1.3.0',
        'sys_descr':      '.1.3.6.1.2.1.1.1.0',
    },

    # ── Huawei (MA5680T / MA5683T / MA5608T) ─────────────────────────
    'huawei': {
        'enterprise':     '.1.3.6.1.4.1.2011',
        'onu_sn':         '.2011.6.128.1.1.2.43.1.3',
        'onu_status':     '.2011.6.128.1.1.2.46.1.15',
        'olt_rx':         '.2011.6.128.1.1.2.51.1.4',
        'onu_distance':   '.2011.6.128.1.1.2.46.1.20',
        'onu_desc':       '.2011.6.128.1.1.2.43.1.9',
        # Board Health (index: slot)
        'card_temp':      '.2011.6.128.1.1.1.6.1.1',
        'card_cpu':       '.2011.6.128.1.1.1.6.1.5',
        'card_memory':    '.2011.6.128.1.1.1.6.1.7',
        # Standard MIBs
        'if_descr':       '.1.3.6.1.2.1.2.2.1.2',
        'if_oper_status': '.1.3.6.1.2.1.2.2.1.8',
        'if_admin_status': '.1.3.6.1.2.1.2.2.1.7',
        'if_in_octets':   '.1.3.6.1.2.1.31.1.1.1.6',
        'if_out_octets':  '.1.3.6.1.2.1.31.1.1.1.10',
        'sys_uptime':     '.1.3.6.1.2.1.1.3.0',
        'sys_descr':      '.1.3.6.1.2.1.1.1.0',
    },

    # ── FiberHome (AN5516-01 / AN5516-04 / AN5516-06) ────────────────
    'fiberhome': {
        'enterprise':     '.1.3.6.1.4.1.5765',
        'onu_sn':         '.5765.1.33.1.2.1.1.2',
        'onu_status':     '.5765.1.33.1.2.1.1.3',
        'olt_rx':         '.5765.1.33.1.2.3.1.4',
        'onu_desc':       '.5765.1.33.1.2.1.1.6',
        # Board Health (index: slot)
        'card_temp':      '.5765.1.33.1.1.2.1.3',
        # Standard MIBs
        'if_descr':       '.1.3.6.1.2.1.2.2.1.2',
        'if_oper_status': '.1.3.6.1.2.1.2.2.1.8',
        'if_admin_status': '.1.3.6.1.2.1.2.2.1.7',
        'if_in_octets':   '.1.3.6.1.2.1.31.1.1.1.6',
        'if_out_octets':  '.1.3.6.1.2.1.31.1.1.1.10',
        'sys_uptime':     '.1.3.6.1.2.1.1.3.0',
        'sys_descr':      '.1.3.6.1.2.1.1.1.0',
    },

    # ── Dasan / DZS (V5812G / V5824G / V6424) ────────────────────────
    'dasan': {
        'enterprise':     '.1.3.6.1.4.1.6296',
        'onu_sn':         '.6296.101.23.3.1.1.4',
        'onu_status':     '.6296.101.23.3.1.1.12',
        'olt_rx':         '.6296.101.23.3.5.1.2',
        'onu_desc':       '.6296.101.23.3.1.1.8',
        # Standard MIBs
        'if_descr':       '.1.3.6.1.2.1.2.2.1.2',
        'if_oper_status': '.1.3.6.1.2.1.2.2.1.8',
        'if_admin_status': '.1.3.6.1.2.1.2.2.1.7',
        'if_in_octets':   '.1.3.6.1.2.1.31.1.1.1.6',
        'if_out_octets':  '.1.3.6.1.2.1.31.1.1.1.10',
        'sys_uptime':     '.1.3.6.1.2.1.1.3.0',
        'sys_descr':      '.1.3.6.1.2.1.1.1.0',
    },
}


# ── CLI Command Templates per Vendor ────────────────────────────────

VENDOR_CLI = {
    'zte': {
        'show_card':       'show card',
        'show_fan':        'show fan',
        'onu_state':       'show gpon onu state gpon-olt_{frame}/{slot}/{port}',
        'onu_baseinfo':    'show gpon onu baseinfo gpon-olt_{frame}/{slot}/{port}',
        'onu_detail':      'show gpon onu detail-info gpon-onu_{frame}/{slot}/{port}:{onu_id}',
        'onu_equip':       'show gpon remote-onu equip gpon-onu_{frame}/{slot}/{port}:{onu_id}',
        'onu_optical':     'show pon power attenuation gpon-onu_{frame}/{slot}/{port}:{onu_id}',
        'onu_reboot':      'pon-onu-mng gpon-onu_{frame}/{slot}/{port}:{onu_id}',
        'optical_module':  'show interface optical-module-info {port_name}',
        'running_config':  'show running-config',
    },
    'hsgq': {
        # HSGQ uses Telnet with similar but different commands
        'show_onu':        'show epon onu-info interface EPON0/{slot}:{onu_id}',
        'onu_optical':     'show epon optical-info interface EPON0/{slot}:{onu_id}',
        'onu_reboot':      'epon onu {onu_id} reset',
    },
    'raisecom': {
        'onu_state':       'show gpon onu state slot {slot} port {port}',
        'onu_detail':      'show gpon onu info slot {slot} port {port} onu {onu_id}',
        'onu_optical':     'show gpon onu optical-info slot {slot} port {port} onu {onu_id}',
        'onu_reboot':      'gpon-onu {slot}/{port}/{onu_id}',
        'onu_delete':      'no create gpon-onu {onu_id}',
        'set_onu_desc':    'description {desc}',
        'set_port_desc':   'description {desc}',
    },
    'bdcom': {
        'onu_detail':      'show epon onu-info interface EPON0/{slot}:{onu_id}',
        'onu_optical':     'show epon optical-info interface EPON0/{slot}:{onu_id}',
        'onu_state':       'show epon onu-info interface EPON0/{slot}',
        'onu_reboot':      'epon onu {onu_id} reset',
    },
    'c-data': {
        'onu_detail':      'show onu running config gpon-olt_{slot}/{port} onu {onu_id}',
        'onu_optical':     'show pon onu optical-info gpon-olt_{slot}/{port} onu {onu_id}',
        'onu_state':       'show gpon onu state gpon-olt_{slot}/{port}',
        'onu_reboot':      'pon-onu-mng gpon-onu_{slot}/{port}:{onu_id}',
    },
    'vsol': {
        'onu_detail':      'show onu info gpon {slot}/{port} onu {onu_id}',
        'onu_optical':     'show onu optical-info gpon {slot}/{port} onu {onu_id}',
        'onu_state':       'show onu state gpon {slot}/{port}',
        'onu_reboot':      'onu reset gpon {slot}/{port} onu {onu_id}',
    },
    'huawei': {
        'onu_detail':      'display ont info {frame} {slot} {port} {onu_id}',
        'onu_optical':     'display ont optical-info {frame} {slot} {port} {onu_id}',
        'onu_service':     'display service-port port {frame}/{slot}/{port} ont {onu_id}',
        'onu_state':       'display ont info {frame} {slot} {port} all',
        'onu_optical_all': 'display ont optical-info {frame} {slot} {port} all',
        'onu_reboot':      'ont reset {port} {onu_id}',
        'onu_add':         'ont add {port} {onu_id} sn-auth {sn} omci ont-lineprofile-id 1 ont-srvprofile-id 1 desc "{desc}"',
        'onu_delete':      'ont delete {port} {onu_id}',
        'running_config':  'display current-configuration',
    },
    'fiberhome': {
        'onu_detail':      'show gpon onu detail {slot}/{port}/{onu_id}',
        'onu_optical':     'show gpon onu optical-info {slot}/{port}/{onu_id}',
        'onu_service':     'show gpon onu service {slot}/{port}/{onu_id}',
        'onu_state':       'show gpon onu state {slot}/{port}',
        'onu_reboot':      'gpon onu reset {slot}/{port}/{onu_id}',
        'onu_add':         'onu {onu_id} sn {sn} desc "{desc}"',
        'onu_delete':      'no onu {onu_id}',
        'running_config':  'show running-config',
    },
    'dasan': {
        'onu_detail':      'show onu detail {slot}/{port}.{onu_id}',
        'onu_optical':     'show onu optical-transceiver {slot}/{port}.{onu_id}',
        'onu_state':       'show onu status {slot}/{port}',
        'onu_reboot':      'onu reset {slot}/{port}.{onu_id}',
    },
}
