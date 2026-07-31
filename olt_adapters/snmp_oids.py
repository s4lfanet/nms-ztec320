"""Per-vendor SNMP OID mappings.

All OIDs are relative to the enterprise prefix unless they start with '.1.3.6.1.2.1.'
(standard MIBs). The adapter prepends the enterprise OID when building full OID paths.

Non-ZTE vendor OIDs are documented in OLT_NON_ZTE_REFERENCE.md for future reference.
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
}
