"""Per-vendor SNMP OID mappings and CLI templates.

All OIDs are relative to the enterprise prefix unless they start with '.1.3.6.1.2.1.'
(standard MIBs). SNMPCollector._walk_async auto-prepends '1.3.6.1.4.1' for relative OIDs.
"""

VENDOR_OIDS = {
    # ── ZTE (C300, C320, C300 Mini, C600, C650) ──────────────────────
    'zte': {
        'enterprise': '.1.3.6.1.4.1.3902',
        'card_type':     '.3902.1082.10.1.2.4.1.4.1.1',
        'card_status':   '.3902.1082.10.1.2.4.1.5.1.1',
        'card_cpu':      '.3902.1082.10.1.2.4.1.9.1.1',
        'card_memory':   '.3902.1082.10.1.2.4.1.11.1.1',
        'card_role':     '.3902.1082.10.1.2.4.1.13.1.1',
        'card_temp':     '.3902.1082.10.10.2.1.6.1.2.1.1',
        'fan_speed':     '.3902.1082.10.10.2.1.6.1.5.1.1',
        'psu_voltage':   '.3902.1082.10.10.2.3.11.1.2.1.1',
        'onu_sn':        '.3902.1082.500.10.2.3.3.1.18',
        'onu_sn_hex':    '.3902.1082.500.10.2.3.3.1.6',
        'onu_desc':      '.3902.1082.500.10.2.3.3.1.2',
        'onu_name':      '.3902.1082.500.10.2.3.3.1.3',
        'onu_model':     '.3902.1082.500.20.2.1.2.1.8',
        'onu_status':    '.3902.1082.500.10.2.3.8.1.4',
        'onu_distance':  '.3902.1082.500.10.2.3.10.1.2',
        'pon_port_name': '.3902.1082.500.10.2.2.3.1.1',
        'onu_rx_down':   '.3902.1082.500.20.2.2.2.1.10',
        'onu_tx_up':     '.3902.1082.500.20.2.2.2.1.14',
        'olt_rx':        '.3902.1015.1010.11.2.1.2',
        'onu_tx':        '.3902.1015.1010.11.2.1.3',
        'sfp_olt_rx':    '.3902.1015.3.1.13.1.1',
        'sfp_tx_power':  '.3902.1015.3.1.13.1.4',
        'sfp_bias':      '.3902.1015.3.1.13.1.9',
        'sfp_voltage':   '.3902.1015.3.1.13.1.10',
        'sfp_wavelength': '.3902.1015.3.1.13.1.11',
        'sfp_temp':      '.3902.1015.3.1.13.1.12',
        'sfp_model':     '.3902.1015.3.1.13.1.13',
        'sfp_vendor':    '.3902.1015.3.1.13.1.14',
        'if_descr':      '.1.3.6.1.2.1.2.2.1.2',
        'if_oper_status': '.1.3.6.1.2.1.2.2.1.8',
        'if_admin_status': '.1.3.6.1.2.1.2.2.1.7',
        'if_in_octets':  '.1.3.6.1.2.1.31.1.1.1.6',
        'if_out_octets': '.1.3.6.1.2.1.31.1.1.1.10',
        'sys_uptime':    '.1.3.6.1.2.1.1.3.0',
        'sys_descr':     '.1.3.6.1.2.1.1.1.0',
    },

    # ── HiOSO EPON (HA7302CS, HA7304, HA7304V, HA7304C, HA7308) ──────
    # Index format: {board}.{pon}.{onu_id}
    # Rx/Tx are float strings already in dBm (or integer 0.01 dBm on some firmwares)
    'hioso_epon': {
        'enterprise':       '.1.3.6.1.4.1.25355',
        'onu_name':         '.25355.3.2.6.3.2.1.37',
        'onu_sn':           '.25355.3.2.6.3.2.1.11',
        'onu_mac':          '.25355.3.2.6.3.2.1.12',
        'onu_status':       '.25355.3.2.6.3.2.1.39',
        'onu_port_count':   '.25355.3.2.6.3.2.1.13',  # LAN port count/type code (5=4GE+1POTS etc.)
        'onu_distance':     '.25355.3.2.6.3.2.1.25',
        'onu_rx':           '.25355.3.2.6.14.2.1.8',  # RX power (negative dBm)
        'onu_tx':           '.25355.3.2.6.14.2.1.4',  # TX power (positive dBm)
        'onu_temp':         '.25355.3.2.6.14.2.1.7',
        'chassis_temp':     '.25355.3.2.1.1.1.2.0',
        'chassis_temp_alt': '.25355.3.1.8.1.1.9',     # HA7304C centi-degrees
        'hr_cpu':           '.1.3.6.1.2.1.25.3.3.1.2.768',
        'hr_mem_total':     '.1.3.6.1.2.1.25.2.3.1.5.1',
        'hr_mem_used':      '.1.3.6.1.2.1.25.2.3.1.6.1',
    },

    # ── HiOSO GPON (HA7402, HA7404, HA7408 — MIB tree .25355.3.3.1) ──
    'hioso_gpon': {
        'enterprise':    '.1.3.6.1.4.1.25355',
        'onu_name':      '.25355.3.3.1.1.1.2',
        'onu_sn':        '.25355.3.3.1.1.1.5',
        'onu_status':    '.25355.3.3.1.1.1.11',
        'onu_rx':        '.25355.3.3.1.1.4.1.1',
        'onu_tx':        '.25355.3.3.1.1.4.1.2',
        'onu_distance':  '.25355.3.3.1.1.1.9',
        'chassis_temp':  '.25355.3.3.1.2.1.1.2.0',
    },

    # ── HiOSO BDCOM Clone (Enterprise .3320) ─────────────────────────
    'hioso_bdcom': {
        'enterprise':    '.1.3.6.1.4.1.3320',
        'onu_name':      '.3320.101.10.1.1.79',
        'onu_sn':        '.3320.101.10.1.1.3',
        'onu_status':    '.3320.101.10.1.1.26',
        'olt_rx':        '.3320.101.10.5.1.6',
        'onu_tx':        '.3320.101.10.5.1.5',
        'onu_distance':  '.3320.101.10.1.1.38',
        'chassis_temp':  '.3320.10.1.1.1.2.0',
    },

    # ── HSGQ (Enterprise .50224) ─────────────────────────────────────
    'hsgq': {
        'enterprise':      '.1.3.6.1.4.1.50224',
        'onu_name':        '.50224.3.3.2.1.2',
        'onu_status':      '.50224.3.3.2.1.8',
        'onu_mac':         '.50224.3.3.2.1.7',
        'onu_llid':        '.50224.3.3.2.1.16',
        'onu_distance':    '.50224.3.3.2.1.15',
        'onu_chip':        '.50224.3.3.2.1.26',
        'olt_rx':          '.50224.3.3.3.1.4',
        'sfp_tx_power':    '.50224.3.3.3.1.5',
        'sfp_bias':        '.50224.3.3.3.1.6',
        'sfp_voltage':     '.50224.3.3.3.1.7',
        'sfp_temp':        '.50224.3.3.3.1.8',
        'pon_port_name':   '.50224.3.2.1.1.2',
        'pon_port_status': '.50224.3.2.1.1.9',
        'cpu_usage':       '.50224.3.1.1.17.0',
        'mem_usage':       '.50224.3.1.1.18.0',
    },

    # ── BDCOM (Enterprise .3320) ─────────────────────────────────────
    'bdcom': {
        'enterprise':   '.1.3.6.1.4.1.3320',
        'onu_sn':       '.3320.101.10.1.1.3',
        'onu_status':   '.3320.101.10.1.1.26',
        'olt_rx':       '.3320.101.10.5.1.5',
        'onu_desc':     '.3320.101.10.1.1.8',
        'onu_distance': '.3320.101.10.1.1.27',
    },

    # ── C-Data (Enterprise .34592) ───────────────────────────────────
    'cdata': {
        'enterprise':   '.1.3.6.1.4.1.34592',
        'onu_sn':       '.34592.1.3.4.1.2.1.1.3',
        'onu_status':   '.34592.1.3.4.1.2.1.1.10',
        'olt_rx':       '.34592.1.3.4.1.5.1.1.2',
        'onu_desc':     '.34592.1.3.4.1.2.1.1.7',
    },
    'c-data': {
        'enterprise':   '.1.3.6.1.4.1.34592',
        'onu_sn':       '.34592.1.3.4.1.2.1.1.3',
        'onu_status':   '.34592.1.3.4.1.2.1.1.10',
        'olt_rx':       '.34592.1.3.4.1.5.1.1.2',
        'onu_desc':     '.34592.1.3.4.1.2.1.1.7',
    },

    # ── VSOL (Enterprise .37950) ─────────────────────────────────────
    'vsol': {
        'enterprise':   '.1.3.6.1.4.1.37950',
        'onu_sn':       '.37950.1.1.5.12.1.1.1.1',
        'onu_status':   '.37950.1.1.5.12.1.1.1.2',
        'olt_rx':       '.37950.1.1.5.12.1.3.1.2',
        'onu_desc':     '.37950.1.1.5.12.1.1.1.6',
    },

    # ── Huawei (Enterprise .2011) ────────────────────────────────────
    'huawei': {
        'enterprise':   '.1.3.6.1.4.1.2011',
        'onu_sn':       '.2011.6.128.1.1.2.43.1.3',
        'onu_status':   '.2011.6.128.1.1.2.46.1.15',
        'olt_rx':       '.2011.6.128.1.1.2.51.1.4',
        'onu_distance': '.2011.6.128.1.1.2.46.1.20',
        'onu_desc':     '.2011.6.128.1.1.2.43.1.9',
        'card_temp':    '.2011.6.128.1.1.1.6.1.1',
        'card_cpu':     '.2011.6.128.1.1.1.6.1.5',
        'card_memory':  '.2011.6.128.1.1.1.6.1.7',
    },

    # ── FiberHome (Enterprise .5765) ─────────────────────────────────
    'fiberhome': {
        'enterprise':   '.1.3.6.1.4.1.5765',
        'onu_sn':       '.5765.1.33.1.2.1.1.2',
        'onu_status':   '.5765.1.33.1.2.1.1.3',
        'olt_rx':       '.5765.1.33.1.2.3.1.4',
        'onu_desc':     '.5765.1.33.1.2.1.1.6',
        'card_temp':    '.5765.1.33.1.1.2.1.3',
    },

    # ── Raisecom (Enterprise .8886) ──────────────────────────────────
    'raisecom': {
        'enterprise':   '.1.3.6.1.4.1.8886',
        'onu_sn':       '.8886.18.3.1.3.1.1.2',
        'onu_status':   '.8886.18.3.1.3.1.1.17',
        'onu_desc':     '.8886.18.3.1.3.1.1.20',
        'onu_distance': '.8886.18.3.1.3.1.1.16',
        'olt_rx':       '.8886.18.3.1.3.3.1.1',
    },

    # ── Dasan (Enterprise .6296) ─────────────────────────────────────
    'dasan': {
        'enterprise':   '.1.3.6.1.4.1.6296',
        'onu_sn':       '.6296.101.23.3.1.1.4',
        'onu_status':   '.6296.101.23.3.1.1.12',
        'olt_rx':       '.6296.101.23.3.5.1.2',
        'onu_desc':     '.6296.101.23.3.1.1.8',
    },
}


# ── CLI Command Templates ────────────────────────────────────────────

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
    'hioso': {
        'onu_state':       'show onu info epon 0/{port} all',
        'onu_detail':      'show onu detail epon 0/{port} {onu_id}',
        'onu_optical':     'show onu optical-ddm epon 0/{port} {onu_id}',
        'onu_reboot':      'epon onu {onu_id} reset',
        'show_cpu':        'show process cpu',
        'show_memory':     'show memory',
        'show_system':     'show system',
    },
}
