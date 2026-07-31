# Non-ZTE OLT Vendor Reference

This document preserves all SNMP OIDs, CLI commands, and data structures for non-ZTE OLT vendors.
These are kept for future multi-vendor NMS development.

## Supported Vendors (for future reference)

| Vendor | Enterprise OID | Protocol | Models |
|--------|---------------|----------|--------|
| HSGQ | .1.3.6.1.4.1.50224 | SNMP | XE04ID, EPON-4P/8P/16P |
| Raisecom | .1.3.6.1.4.1.8886 | SNMP | ISCOM6820, ISCOM5800 |
| BDCOM | .1.3.6.1.4.1.3320 | SNMP | GP3600, P3310C, P3608 |
| C-Data | .1.3.6.1.4.1.34592 | SNMP | FD1104B, FD1108S, FD1216S, FD1608GS |
| VSOL | .1.3.6.1.4.1.37950 | SNMP | V1600G, V1600D |
| Huawei | .1.3.6.1.4.1.2011 | SNMP | MA5680T, MA5683T, MA5608T |
| FiberHome | .1.3.6.1.4.1.5765 | SNMP | AN5516-01/04/06 |
| Dasan | .1.3.6.1.4.1.6296 | SNMP | V5812G, V5824G, V6424 |
| Hioso (EPON) | .1.3.6.1.4.1.25355 | SNMP | HA7304V, HA7304C, HA7304VX |
| Hioso (GPON) | .1.3.6.1.4.1.25355 | SNMP | GPON variants |
| Hioso (BDCOM) | .1.3.6.1.4.1.3320 | SNMP | BDCOM EPON clone |

---

## SNMP OID Mappings

### HSGQ (Enterprise .50224)

```
onu_name:       .50224.3.3.2.1.2
onu_status:     .50224.3.3.2.1.8
onu_mac:        .50224.3.3.2.1.7
onu_llid:       .50224.3.3.2.1.16
onu_distance:   .50224.3.3.2.1.15
onu_chip:       .50224.3.3.2.1.26
olt_rx:         .50224.3.3.3.1.4
sfp_tx_power:   .50224.3.3.3.1.5
sfp_bias:       .50224.3.3.3.1.6
sfp_voltage:    .50224.3.3.3.1.7
sfp_temp:       .50224.3.3.3.1.8
pon_port_name:  .50224.3.2.1.1.2
pon_port_status: .50224.3.2.1.1.9
cpu_usage:      .50224.3.1.1.17.0
mem_usage:      .50224.3.1.1.18.0
```

Index format: `onuIndex = slot<<24 | port<<8 | ont_id`
Optical table index: `onuIndex.0.0` or `portIndex.65535.65535`
PON port index: `portIndex = slot<<24 | port<<16`

### Raisecom (Enterprise .8886)

```
onu_sn:         .8886.18.3.1.3.1.1.2
onu_status:     .8886.18.3.1.3.1.1.17
onu_desc:       .8886.18.3.1.3.1.1.20
onu_distance:   .8886.18.3.1.3.1.1.16
onu_active:     .8886.18.3.1.3.1.1.18
onu_offline_reason: .8886.18.3.1.3.1.1.15
olt_rx:         .8886.18.3.1.3.3.1.1
onu_rx_down:    .8886.18.3.6.3.1.1.16
onu_tx_up:      .8886.18.3.6.3.1.1.17
chassis_temp:   .8886.1.27.2.1.1.10.0
card_cpu:       .8886.18.1.7.1.1.1.4
card_mem_total: .8886.18.1.7.3.1.1.1
card_mem_avail: .8886.18.1.7.3.1.1.2
card_type:      .8886.1.27.3.1.1.5
card_status:    .8886.1.27.3.1.1.11
fan_speed:      .8886.1.27.5.1.1.4
sfp_vendor:     .8886.1.18.2.1.1.1.3
sfp_model:      .8886.1.18.2.1.1.1.4
sfp_serial:     .8886.1.18.2.1.1.1.5
sfp_wavelength: .8886.1.18.2.1.1.1.16
sfp_ddm_temp:   .8886.1.18.2.2.1.1.2  (param=1, /1000)
sfp_ddm_bias:   .8886.1.18.2.2.1.1.2  (param=2, /1000)
sfp_ddm_tx:     .8886.1.18.2.2.1.1.2  (param=3, µW)
sfp_ddm_rx:     .8886.1.18.2.2.1.1.2  (param=4, millidBm /1000)
sfp_ddm_voltage: .8886.1.18.2.2.1.1.2 (param=7, /1000)
```

Index format: `type2id = 0b0001<<28 | slot<<23 | port<<16 | onu`
ONU-side optical index: `index2 = slot*10000000 + port*100000 + onu*1000 + 1`

### BDCOM (Enterprise .3320)

```
onu_sn:         .3320.101.10.1.1.3
onu_status:     .3320.101.10.1.1.26
olt_rx:         .3320.101.10.5.1.5
onu_desc:       .3320.101.10.1.1.8
```

### C-Data (Enterprise .34592)

```
onu_sn:         .34592.1.3.4.1.2.1.1.3
onu_status:     .34592.1.3.4.1.2.1.1.10
olt_rx:         .34592.1.3.4.1.5.1.1.2
onu_desc:       .34592.1.3.4.1.2.1.1.7
```

### VSOL (Enterprise .37950)

```
onu_sn:         .37950.1.1.5.12.1.1.1.1
onu_status:     .37950.1.1.5.12.1.1.1.2
olt_rx:         .37950.1.1.5.12.1.3.1.2
```

### Huawei (Enterprise .2011)

```
onu_sn:         .2011.6.128.1.1.2.43.1.3
onu_status:     .2011.6.128.1.1.2.46.1.15
olt_rx:         .2011.6.128.1.1.2.51.1.4
onu_distance:   .2011.6.128.1.1.2.46.1.20
onu_desc:       .2011.6.128.1.1.2.43.1.9
card_temp:      .2011.6.128.1.1.1.6.1.1
card_cpu:       .2011.6.128.1.1.1.6.1.5
card_memory:    .2011.6.128.1.1.1.6.1.7
```

### FiberHome (Enterprise .5765)

```
onu_sn:         .5765.1.33.1.2.1.1.2
onu_status:     .5765.1.33.1.2.1.1.3
olt_rx:         .5765.1.33.1.2.3.1.4
onu_desc:       .5765.1.33.1.2.1.1.6
card_temp:      .5765.1.33.1.1.2.1.3
```

### Dasan (Enterprise .6296)

```
onu_sn:         .6296.101.23.3.1.1.4
onu_status:     .6296.101.23.3.1.1.12
olt_rx:         .6296.101.23.3.5.1.2
onu_desc:       .6296.101.23.3.1.1.8
```

### Hioso EPON (Enterprise .25355, MIB tree .25355.3.2.6)

Index format: `{board}.{pon}.{onu_id}`
Rx/Tx are float strings already in dBm (divider=1)

```
onu_name:       .25355.3.2.6.3.2.1.37
onu_sn:         .25355.3.2.6.3.2.1.11
onu_mac:        .25355.3.2.6.3.2.1.12
onu_status:     .25355.3.2.6.3.2.1.39
onu_down_reason: .25355.3.2.6.3.2.1.13  (5=normal, 1=power-down, 3=LOS)
onu_distance:   .25355.3.2.6.3.2.1.25
onu_rx:         .25355.3.2.6.14.2.1.8   (OLT RX power, negative dBm)
onu_tx:         .25355.3.2.6.14.2.1.4   (ONU TX power, positive dBm)
onu_temp:       .25355.3.2.6.14.2.1.7   (°C)
onu_voltage:    .25355.3.2.6.14.2.1.5   (V)
onu_bias:       .25355.3.2.6.14.2.1.6   (mA)
onu_name_set:   .25355.3.2.6.3.2.1.37
chassis_temp:   .25355.3.2.1.1.1.2.0
chassis_temp_alt1: .1.3.6.1.2.1.99.1.1.1.4  (ENTITY-SENSOR-MIB)
chassis_temp_alt2: .1.3.6.1.2.1.47.1.1.1.1.8  (ENTITY-MIB)
chassis_temp_alt3: .25355.3.1.8.1.1.9  (HA7304C, centi-degrees)
hr_cpu:         .1.3.6.1.2.1.25.3.3.1.2.768
hr_mem_total:   .1.3.6.1.2.1.25.2.3.1.5.1
hr_mem_used:    .1.3.6.1.2.1.25.2.3.1.6.1
```

Note: .5=supply voltage (3.3V), .6=bias current (mA) — NOT RX power

### Hioso GPON (MIB tree .25355.3.3.1)

Rx/Tx are integer raw values, need auto-scale by magnitude

```
onu_name:       .25355.3.3.1.1.1.2
onu_sn:         .25355.3.3.1.1.1.5
onu_status:     .25355.3.3.1.1.1.11
onu_rx:         .25355.3.3.1.1.4.1.1
onu_tx:         .25355.3.3.1.1.4.1.2
onu_distance:   .25355.3.3.1.1.1.9
onu_name_set:   .25355.3.3.1.1.1.2
chassis_temp:   .25355.3.3.1.2.1.1.2.0
```

### Hioso BDCOM (Enterprise .3320, EPON clone)

```
onu_name:       .3320.101.10.1.1.79
onu_sn:         .3320.101.10.1.1.3
onu_status:     .3320.101.10.1.1.26
onu_rx:         .3320.101.10.5.1.6
onu_tx:         .3320.101.10.5.1.5
onu_distance:   .3320.101.10.1.1.38
onu_name_set:   .3320.101.10.1.1.79
chassis_temp:   .3320.10.1.1.1.2.0
```

### Standalone EPON (BDCOM, C-Data, VSOL, generic)

Uses standard IF-MIB primarily:
```
if_descr:       .1.3.6.1.2.1.2.2.1.2
if_oper_status: .1.3.6.1.2.1.2.2.1.8
if_admin_status: .1.3.6.1.2.1.2.2.1.7
if_in_octets:   .1.3.6.1.2.1.31.1.1.1.6
if_out_octets:  .1.3.6.1.2.1.31.1.1.1.10
sys_uptime:     .1.3.6.1.2.1.1.3.0
sys_descr:      .1.3.6.1.2.1.1.1.0
```

---

## CLI Command Templates

### HSGQ
```
show_onu:       show epon onu-info interface EPON0/{slot}:{onu_id}
onu_optical:    show epon optical-info interface EPON0/{slot}:{onu_id}
onu_reboot:     epon onu {onu_id} reset
```

### Raisecom
```
onu_state:      show gpon onu state slot {slot} port {port}
onu_detail:     show gpon onu info slot {slot} port {port} onu {onu_id}
onu_optical:    show gpon onu optical-info slot {slot} port {port} onu {onu_id}
onu_reboot:     gpon-onu {slot}/{port}/{onu_id}
onu_delete:     no create gpon-onu {onu_id}
set_onu_desc:   description {desc}
set_port_desc:  description {desc}
```

### BDCOM
```
onu_detail:     show epon onu-info interface EPON0/{slot}:{onu_id}
onu_optical:    show epon optical-info interface EPON0/{slot}:{onu_id}
onu_state:      show epon onu-info interface EPON0/{slot}
onu_reboot:     epon onu {onu_id} reset
```

### C-Data
```
onu_detail:     show onu running config gpon-olt_{slot}/{port} onu {onu_id}
onu_optical:    show pon onu optical-info gpon-olt_{slot}/{port} onu {onu_id}
onu_state:      show gpon onu state gpon-olt_{slot}/{port}
onu_reboot:     pon-onu-mng gpon-onu_{slot}/{port}:{onu_id}
```

### VSOL
```
onu_detail:     show onu info gpon {slot}/{port} onu {onu_id}
onu_optical:    show onu optical-info gpon {slot}/{port} onu {onu_id}
onu_state:      show onu state gpon {slot}/{port}
onu_reboot:     onu reset gpon {slot}/{port} onu {onu_id}
```

### Huawei
```
onu_detail:     display ont info {frame} {slot} {port} {onu_id}
onu_optical:    display ont optical-info {frame} {slot} {port} {onu_id}
onu_service:    display service-port port {frame}/{slot}/{port} ont {onu_id}
onu_state:      display ont info {frame} {slot} {port} all
onu_optical_all: display ont optical-info {frame} {slot} {port} all
onu_reboot:     ont reset {port} {onu_id}
onu_add:        ont add {port} {onu_id} sn-auth {sn} omci ont-lineprofile-id 1 ont-srvprofile-id 1 desc "{desc}"
onu_delete:     ont delete {port} {onu_id}
running_config: display current-configuration
```

### FiberHome
```
onu_detail:     show gpon onu detail {slot}/{port}/{onu_id}
onu_optical:    show gpon onu optical-info {slot}/{port}/{onu_id}
onu_service:    show gpon onu service {slot}/{port}/{onu_id}
onu_state:      show gpon onu state {slot}/{port}
onu_reboot:     gpon onu reset {slot}/{port}/{onu_id}
onu_add:        onu {onu_id} sn {sn} desc "{desc}"
onu_delete:     no onu {onu_id}
running_config: show running-config
```

### Dasan
```
onu_detail:     show onu detail {slot}/{port}.{onu_id}
onu_optical:    show onu optical-transceiver {slot}/{port}.{onu_id}
onu_state:      show onu status {slot}/{port}
onu_reboot:     onu reset {slot}/{port}.{onu_id}
```

### Hioso (EPON)
```
onu_state:      show onu info epon 0/{pon} all
onu_detail:     show onu detail epon 0/{pon} {onu_id}
onu_optical:    show onu optical-ddm epon 0/{pon} {onu_id}
onu_reboot:     epon onu {onu_id} reset
onu_delete:     delete onu {onu_id}
show_cpu:       show process cpu
show_memory:    show memory
show_system:    show system
show_version:   show version
show_alarm:     show alarm active
show_alarm_hist: show alarm history
pon_statistic:  show pon {pon} statistic
pon_rate:       show epon 0/{pon} rate 1sec
```

### Hioso (GPON)
```
onu_state:      show onu info gpon 0/{pon} all
onu_detail:     show onu detail gpon 0/{pon} {onu_id}
onu_optical:    show onu optical-ddm gpon 0/{pon} {onu_id}
onu_reboot:     gpon onu {onu_id} reset
onu_delete:     delete onu {onu_id}
```

---

## Data Structure Differences

### ZTE (Current)
- ONU index: `ifIndex.onuId` (e.g. 419430401.1)
- Serial: 12-char hex with vendor prefix (ZTEG, ZICG)
- Status values: 'online', 'offline', 'los', 'dyinggasp'
- RX power: OLT-side and ONU-side separately tracked
- PON port naming: `gpon-olt_1/1/1`
- Chassis: `show card` via Telnet

### Hioso (EPON)
- ONU index: `{board}.{pon}.{onu_id}`
- Serial: MAC address (12-char hex, no vendor prefix)
- Status values: 'online', 'offline', 'dyinggasp', 'los'
- RX power: Only OLT-side RX available via SNMP
- PON port naming: `Pon-Nni1`, `Pon-Nni2`, etc.
- Uplink naming: `G1`, `G2`, `G3`, `G4`
- Chassis temp: Multiple fallback OIDs needed
- ONU name: SNMP SET on `.25355.3.2.6.3.2.1.37`

### HSGQ
- ONU index: `onuIndex = slot<<24 | port<<8 | ont_id`
- Serial: MAC address
- EPON protocol (not GPON)
- PON port index: `portIndex = slot<<24 | port<<16`

### Raisecom
- ONU index: `type2id = 0b0001<<28 | slot<<23 | port<<16 | onu`
- ONU-side optical index: `index2 = slot*10000000 + port*100000 + onu*1000 + 1`
- SFP DDM: Single OID, parameter-based (param=1 temp, param=2 bias, etc.)

---

## Adapter Architecture (for future reference)

The multi-vendor adapter pattern used:
- `olt_adapters/base.py` — `BaseOLTAdapter` abstract class
- `olt_adapters/registry.py` — `RackAdapterRegistry` maps vendor name to adapter
- `olt_adapters/normalized.py` — `RackData`, `NormalizedSlot`, `NormalizedPort`, etc.
- `olt_adapters/snmp_oids.py` — Per-vendor OID mappings + CLI templates
- `olt_adapters/zte_adapter.py` — ZTE adapter (delegates to snmp_collector)
- `olt_adapters/hsgq_adapter.py` — HSGQ EPON adapter
- `olt_adapters/raisecom_adapter.py` — Raisecom GPON adapter
- `olt_adapters/standalone_epon_adapter.py` — Generic EPON for BDCOM/C-Data/VSOL
- `olt_adapters/hioso_adapter.py` — Hioso EPON/GPON/BDCOM adapter

### Sync Dispatch Pattern (used in services_sync.py, auto_sync.py, app.py)
```python
adapter = RackAdapterRegistry.get_adapter(olt)
if adapter and hasattr(adapter, 'poll_olt'):
    result = adapter.poll_olt(progress_cb=update_progress, light=use_light)
else:
    from snmp_collector import poll_olt
    result = poll_olt(olt, progress_cb=update_progress, light=use_light)
```

### Frontend Rack Diagram Router (for future reference)
- `RackDiagramRouter` dispatches to vendor-specific components:
  - ZTE C320 → `RackDiagram` (chassis endpoint)
  - ZTE C300 → `ZteRackDiagram` (rack endpoint)
  - HSGQ → `HsgqRackDiagram`
  - Raisecom → `RaisecomRackDiagram`
  - BDCOM/C-Data/VSOL → `StandaloneEponRackDiagram`

### Serial Number Formatting
EPON vendors (hioso, hsgq, bdcom, c-data, vsol) use MAC address as serial number.
Format: `c416c809b59d` → `c4:16:c8:09:b5:9d`
Function: `formatSn(sn, vendor)` in `frontend/src/lib/utils.ts`
