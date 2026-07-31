# ZTE C320 & C300 — Complete CLI & SNMP OID Reference

> Dokumentasi lengkap semua CLI command dan SNMP OID yang **sudah berjalan** di Salfanet NMS untuk ZTE C320 dan C300 OLT.
> Sumber kode: `snmp_core.py`, `telnet_client.py`, `snmp_collector.py`

---

## Daftar Isi

1. [SNMP OID — ZTE C320](#1-snmp-oid--zte-c320)
2. [SNMP OID — ZTE C300](#2-snmp-oid--zte-c300)
3. [SNMP Decode/Parse Functions](#3-snmp-decodeparse-functions)
4. [Telnet CLI — Show Commands (Read-Only)](#4-telnet-cli--show-commands-read-only)
5. [Telnet CLI — ONU Management Actions](#5-telnet-cli--onu-management-actions)
6. [Telnet CLI — ONU Registration & Configuration](#6-telnet-cli--onu-registration--configuration)
7. [Telnet CLI — ONU Vendor Templates](#7-telnet-cli--onu-vendor-templates)
8. [Telnet CLI — Uplink Port Management](#8-telnet-cli--uplink-port-management)
9. [Telnet CLI — Uplink IP Network (VLAN SVI)](#9-telnet-cli--uplink-ip-network-vlan-svi)
10. [Telnet CLI — VLAN Management](#10-telnet-cli--vlan-management)
11. [Telnet CLI — ONU Type Management](#11-telnet-cli--onu-type-management)
12. [Telnet CLI — Profile Management (TCONT/Traffic/WAN-IP)](#12-telnet-cli--profile-management-tconttrafficwan-ip)
13. [Telnet CLI — PON Port Management](#13-telnet-cli--pon-port-management)
14. [Telnet CLI — ONU Detail & Live Data](#14-telnet-cli--onu-detail--live-data)
15. [Telnet CLI — ONU History & Traffic](#15-telnet-cli--onu-history--traffic)
16. [Telnet CLI — Unregistered ONU Discovery](#16-telnet-cli--unregistered-onu-discovery)
17. [Telnet CLI — Chassis Info](#17-telnet-cli--chassis-info)
18. [Poll Orchestration (poll_olt)](#18-poll-orchestration-poll_olt)

---

## 1. SNMP OID — ZTE C320

ZTE C320 menggunakan enterprise OID tree `.3902.1012` untuk data ONU.

### System Info

| OID | Name | Method | Penjelasan |
|-----|------|--------|------------|
| `1.3.6.1.2.1.1.1.0` | `OID_SYS_DESCR` | GET | System description (model, firmware version) |
| `1.3.6.1.2.1.1.3.0` | `OID_SYS_UPTIME` | GET | System uptime dalam centiseconds (dibagi 100 = detik) |

### cfgTable (.3.28) — ONU Config

Index: `.ponIndex.cfgId` (2 komponen). `cfgId == onuSlot` untuk C320.

| OID | Name | Method | Penjelasan |
|-----|------|--------|------------|
| `1.3.6.1.4.1.3902.1012.3.28.1.1.2` | `OID_ONU_NAME` | WALK | Nama ONU |
| `1.3.6.1.4.1.3902.1012.3.28.1.1.3` | `OID_ONU_DESCRIPTION` | WALK | Deskripsi ONU |
| `1.3.6.1.4.1.3902.1012.3.28.1.1.5` | `OID_ONU_SERIAL` | WALK | Serial number (OctetString: 4 byte ASCII vendor + hex) |

### regTable (.3.50.12) — ONU Status & Signal

Index: `.ponIndex.onuSlot.onuId` (3 komponen).

| OID | Name | Method | Penjelasan |
|-----|------|--------|------------|
| `1.3.6.1.4.1.3902.1012.3.50.12.1.1.1` | `OID_REG_STATUS` | WALK | Registration status |
| `1.3.6.1.4.1.3902.1012.3.50.12.1.1.6` | `OID_OPER_STATE` | WALK | Oper state (1=not_present, 2=inactive, 3=activating, 4/5=online, 6=dyinggasp) |
| `1.3.6.1.4.1.3902.1012.3.50.12.1.1.7` | `OID_DEREG_REASON` | WALK | Deregister reason (2=LOS, 8=AuthFail, 9=PowerOff, 12=Reboot, dll) |
| `1.3.6.1.4.1.3902.1012.3.50.12.1.1.10` | `OID_RX_POWER` | WALK | ONU RX power (downstream, OLT→ONU). Formula: `raw / 500 - 30 = dBm` |
| `1.3.6.1.4.1.3902.1012.3.50.12.1.1.11` | `OID_TX_POWER` | WALK | TX power. Formula sama: `raw / 500 - 30 = dBm` |
| `1.3.6.1.4.1.3902.1012.3.50.12.1.1.18` | `OID_OLT_RX` | WALK | OLT RX power (upstream, ONU→OLT). **Catatan: nilai salah di V2.1.0** — gunakan Telnet `show pon power attenuation` sebagai ground truth |

### PON Index Constants

| Constant | Value | Penjelasan |
|----------|-------|------------|
| `BOARD1_BASE` | `268500992` | Base ponIndex untuk board/PON card 1 |
| `BOARD2_BASE` | `268509184` | Base ponIndex untuk board/PON card 2 |
| `PON_INCREMENT` | `256` | Increment per PON port dalam ponIndex |

**Formula ponIndex:** `BOARD1_BASE + port * PON_INCREMENT` (untuk board 1)

---

## 2. SNMP OID — ZTE C300

ZTE C300 menggunakan OID tree berbeda: `.3902.1082` untuk data ONU, `.3902.1015` untuk optical power OLT-side.

### ONU Data (index: ifIndex.onuId)

| OID | Name | Method | Penjelasan |
|-----|------|--------|------------|
| `1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.18` | `C300_OID_ONU_SERIAL_FMT` | WALK | Serial (formatted string, contoh: `1,HWTC7C9A0A9B`) |
| `1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.6` | `C300_OID_ONU_SERIAL_HEX` | WALK | Serial (hex OctetString) |
| `1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.2` | `C300_OID_ONU_DESC` | WALK | Description |
| `1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.3` | `C300_OID_ONU_NAME` | WALK | ONU Name |
| `1.3.6.1.4.1.3902.1082.500.20.2.1.2.1.8` | `C300_OID_ONU_MODEL` | WALK | Actual ONU Type/Model (Equipment ID) |
| `1.3.6.1.4.1.3902.1082.500.10.2.3.8.1.4` | `C300_OID_RUN_STATUS` | WALK | Run status (1=init, 2=los, 3=ranging, 4=online, 5=dyinggasp, 6=offline, 7=authfail) |
| `1.3.6.1.4.1.3902.1082.500.10.2.3.10.1.2` | `C300_OID_DISTANCE` | WALK | Distance dalam meter |
| `1.3.6.1.4.1.3902.1082.500.10.2.2.3.1.1` | `C300_OID_PON_PORT_NAME` | WALK | PON Port Name (index: ifIndex saja) |

### ONU-side Optical Power (index: ifIndex.onuId.1)

| OID | Name | Method | Penjelasan |
|-----|------|--------|------------|
| `1.3.6.1.4.1.3902.1082.500.20.2.2.2.1.10` | `C300_OID_ONU_RX_POWER` | WALK | ONU Downstream RX (dBuW). Formula: `(signed × 0.002) - 30 = dBm` |
| `1.3.6.1.4.1.3902.1082.500.20.2.2.2.1.14` | `C300_OID_ONU_TX_POWER` | WALK | ONU Upstream TX (formula sama) |

### OLT-side Optical Power (index: ponIndex.onuId)

| OID | Name | Method | Penjelasan |
|-----|------|--------|------------|
| `1.3.6.1.4.1.3902.1015.1010.11.2.1.2` | `C300_OID_OLT_RX` | WALK | OLT RX from ONT. Formula: `signed_raw / 1000 = dBm` |
| `1.3.6.1.4.1.3902.1015.1010.11.2.1.3` | `C300_OID_ONT_TX` | WALK | ONT TX Power. Formula: `raw / 1000 = dBm` |

### Card / Board Health (index: slot)

| OID | Name | Method | Penjelasan |
|-----|------|--------|------------|
| `1.3.6.1.4.1.3902.1082.10.1.2.4.1.4.1.1` | `C300_OID_CARD_TYPE` | WALK | Card Type Name |
| `1.3.6.1.4.1.3902.1082.10.1.2.4.1.5.1.1` | `C300_OID_CARD_STATUS` | WALK | Card Status (1=inservice) |
| `1.3.6.1.4.1.3902.1082.10.1.2.4.1.9.1.1` | `C300_OID_CARD_CPU` | WALK | CPU Load % |
| `1.3.6.1.4.1.3902.1082.10.1.2.4.1.11.1.1` | `C300_OID_CARD_MEM` | WALK | Memory Usage % |
| `1.3.6.1.4.1.3902.1082.10.1.2.4.1.13.1.1` | `C300_OID_CARD_ROLE` | WALK | Role (1=main, 2=standby) |
| `1.3.6.1.4.1.3902.1082.10.10.2.1.6.1.2.1.1` | `C300_OID_CARD_TEMP` | WALK | Temperature °C |
| `1.3.6.1.4.1.3902.1082.10.10.2.1.6.1.5.1.1` | `C300_OID_FAN_SPEED` | WALK | Fan Speed RPM |
| `1.3.6.1.4.1.3902.1082.10.10.2.3.11.1.2.1.1` | `C300_OID_PSU_VOLTAGE` | WALK | PSU Input Voltage |

### C300 Index Parsing

**ifIndex format:** `0x11{slot}{00}{port}` — contoh `0x11020001` = slot 2, port 1
```python
slot = (if_index >> 16) & 0xFF
port = if_index & 0xFFFF  # jika >= 256, shift right 8
```

**ponIndex format:** `0x10{slot}{port}{00}` — contoh `0x10020100` = slot 2, port 1
```python
slot = (pon_index >> 16) & 0xFF
port = (pon_index >> 8) & 0xFF
```

---

## 3. SNMP Decode/Parse Functions

| Function | Input | Output | Penjelasan |
|----------|-------|--------|------------|
| `decode_rx_power(raw)` | int | float\|None | C320: `raw / 500 - 30 = dBm`. 0/0xFFFF = None |
| `decode_c300_onu_rx_power(raw)` | int | float\|None | C300 ONU-side: `(signed16 × 0.002) - 30 = dBm`. 0/0xFFFF = None |
| `decode_c300_olt_rx(raw)` | int | float\|None | C300 OLT-side: `signed32 / 1000 = dBm`. 0 = None |
| `decode_c300_run_status(value)` | int | str | 1→init, 2→los, 3→ranging, 4→online, 5→dyinggasp, 6→offline, 7→authfail |
| `decode_oper_state(value)` | int | str | 1→not_present, 2→inactive, 3→activating, 4/5→online, 6→dyinggasp |
| `decode_dereg_reason(value)` | int | str | 2→LOS, 3→LOSi, 4→LOFi, 5→SFi, 6→LOAi, 7→LOAMi, 8→AuthFail, 9→PowerOff, 10→DeactiveSucc, 12→Reboot, 13→Shutdown |
| `decode_distance(raw)` | int | int\|None | `raw × 0.112 = meter` |
| `parse_serial(val)` | OctetString | str | 4 byte ASCII vendor + hex serial (contoh: `ZTEG12345678`) |
| `detect_vendor_from_sn(sn)` | str | str | Deteksi vendor dari prefix SN (ZTEG→ZTE, HWTC→Huawei, FHTT→Fiberhome, dll) |
| `detect_model_from_sn(sn, vendor)` | str | str | Mapping model default per vendor (Fiberhome→HG6145D2, Huawei→HG8145V5, ZTE→F663NV3A) |
| `parse_pon_index(pon_index)` | int | (board, port) | C320: board 1 atau 2, port number |
| `parse_c300_ifindex(if_index)` | int | (slot, port) | C300 ifIndex parsing |
| `parse_c300_ponindex(pon_index)` | int | (slot, port) | C300 ponIndex parsing |
| `format_uptime(centiseconds)` | int | str | Format: `X days Y hours Z minutes` |

---

## 4. Telnet CLI — Show Commands (Read-Only)

Semua show command dijalankan dari EXEC mode (`#` prompt).

### System & Chassis

| Command | Method | Penjelasan |
|---------|--------|------------|
| `show card` | `collect_chassis_info()`, `collect_all_onus()`, `collect_uplinks()`, `collect_pon_port_stats()` | Daftar card di chassis: Rack, Shelf, Slot, CfgType, RealType, Port, HardVer, SoftVer, Status |
| `show fan` | `collect_chassis_info()` | Fan RPM & status + Environment Temperature |
| `terminal length 0` | `_connect()` | Disable pagination (dijalankan saat login) |

### ONU Discovery & Status

| Command | Method | Penjelasan |
|---------|--------|------------|
| `show gpon onu baseinfo gpon-olt_X/Y/Z` | `collect_all_onus()`, `enrich_onus_via_telnet()`, `get_next_available_onu_id()` | SN + onu_id per PON port. Format: `gpon-onu_X/Y/Z:N SN:XXXXXXXX` |
| `show gpon onu state gpon-olt_X/Y/Z` | `collect_all_onus()`, `collect_pon_port_stats()` | Status ONU: working=online, dyinggasp, los, offline |
| `show gpon onu detail-info gpon-onu_X/Y/Z:N` | `collect_onu_detail()`, `collect_all_onus()` | Name, Type, State, Serial, Description, Distance, Online Duration, RX/TX Power, History |
| `show gpon remote-onu equip gpon-onu_X/Y/Z:N` | `collect_onu_detail()`, `collect_all_onus()` | Equipment ID, Model, Vendor ID, H/W Version, S/W Version (via OMCI) |
| `show pon power attenuation gpon-onu_X/Y/Z:N` | `collect_onu_detail()`, `collect_all_onus()` | RX/TX power akurat: Up (OLT RX, ONU TX) dan Down (ONU RX, OLT TX). **Ground truth untuk power** |
| `show gpon onu bandwidth gpon-onu_X/Y/Z:N` | `collect_onu_traffic()` | DBA bandwidth: downstream/upstream |
| `show gpon onu performance gpon-onu_X/Y/Z:N` | `collect_onu_traffic()` | Fallback traffic: rx-bps, tx-bps |
| `show gpon onu history gpon-onu_X/Y/Z:N` | `collect_onu_history()` | Event history: timestamp + status (Online/Offline/DyingGasp) |
| `show gpon onu event-log gpon-onu_X/Y/Z:N` | `collect_onu_history()` | Fallback event log |

### ONU Remote Management

| Command | Method | Penjelasan |
|---------|--------|------------|
| `show gpon remote-onu veip gpon-onu_X/Y/Z:N` | `collect_onu_detail()` | VEIP admin status, IANA assigned port |
| `show gpon remote-onu tr069 gpon-onu_X/Y/Z:N` | `collect_onu_detail()` | TR-069: ACS URL, username, password, tag/vlan |
| `show gpon remote-onu ip-host gpon-onu_X/Y/Z:N` | `collect_onu_detail()` | WAN IP: Host ID, Current IP address |
| `show gpon remote-onu security-mgmt gpon-onu_X/Y/Z:N` | `collect_onu_detail()` | Remote access ACL: service list, ingress type, source IP range |

### Running Config

| Command | Method | Penjelasan |
|---------|--------|------------|
| `show running-config` | `collect_vlans()`, `collect_wan_ip_profiles()`, `collect_all_onus()` | Full running config: VLAN database, interface config, pon-onu-mng, ONU profiles |
| `show running-config interface gpon-onu_X/Y/Z:N` | `collect_onu_detail()` | Per-ONU interface config: tcont, gemport, service-port, name, description |
| `show running-config pon-onu-mng gpon-onu_X/Y/Z:N` | `collect_onu_detail()` | Per-ONU management config: service-vlan mapping, VEIP, eth, wifi, tr069, pppoe, wan-ip |
| `show running-config interface gpon-olt_X/Y/Z` | `collect_pon_port_stats()`, `collect_onu_detail()` | PON port config: shutdown, name, description, linktrap |
| `show running-config interface gei_1/S/P` | `collect_uplinks()` | Uplink 1G port config: speed, duplex, VLAN, description, negotiation, flowcontrol |
| `show running-config interface xgei_1/S/P` | `collect_uplinks()` | Uplink 10G port config (sama format) |

### Interface & Optical

| Command | Method | Penjelasan |
|---------|--------|------------|
| `show interface gei_1/S/P` / `show interface xgei_1/S/P` | `collect_uplinks()`, `get_uplinks_live_traffic()` | Oper status, line protocol, port type (optical/electrical), traffic rates, counters, CRC errors, dropped |
| `show interface optical-module-info gei_1/S/P` | `collect_uplinks()` | SFP/DDM info: vendor-name, vendor-pn, vendor-sn, wavelength, rxpower, txpower, txbias, temperature, supply-vol |
| `show interface optical-module-info xgei_1/S/P` | `collect_uplinks()` | SFP/DDM info untuk 10G uplink port |
| `show interface optical-module-info gpon-olt_1/S/P` | `collect_pon_port_stats()` | SFP/DDM info untuk PON port |
| `show interface gpon-onu_X/Y/Z:N` | `collect_onu_detail()` | ONU interface traffic counters (input/output bytes) |

### VLAN & Profiles

| Command | Method | Penjelasan |
|---------|--------|------------|
| `show vlan summary` | `collect_vlans()` | Daftar semua VLAN ID (comma-separated) |
| `show onu-type` | `collect_onu_types()` | Daftar ONU type: name, PON type, description, max-tcont/gem/switch/iphost/veip |
| `show gpon profile tcont` | `collect_speed_profiles()` | TCONT bandwidth profiles: name, type, fixed/assured/max bandwidth |
| `show gpon profile traffic` | `collect_speed_profiles()` | Traffic shaping profiles: name, SIR, PIR |
| `show gpon profile wan-ip` | `collect_wan_ip_profiles()` | WAN IP profiles: name, IP, netmask, gateway, DNS. **May return error pada beberapa firmware** — fallback ke `show running-config` parse `onu profile vlan` |

### IP Network

| Command | Method | Penjelasan |
|---------|--------|------------|
| `show ip interface brief` | `collect_uplinks()` | VLAN interface IP summary: vlan, IP, mask, status |
| `show ip route` | `collect_uplinks()` | IP routing table: default gateway (0.0.0.0 0.0.0.0 → gateway) |

---

## 5. Telnet CLI — ONU Management Actions

### Reboot ONU

```text
configure terminal
pon-onu-mng gpon-onu_X/Y/Z:N
reboot
exit
exit
exit
```
**Method:** `reset_onu(frame, slot, port, onu_id)`
**Note:** Must use `pon-onu-mng` context, NOT `interface gpon-onu` + `reset` (gives Invalid input error).

### Deregister ONU

```text
configure terminal
interface gpon-olt_X/Y/Z
no onu N
exit
exit
exit
```
**Method:** `deregister_onu(frame, slot, port, onu_id)`

### Clear ONU Config (keep registered)

```text
configure terminal
no service-port {svc_num}          ← global context, per service-port
interface gpon-onu_X/Y/Z:N
no gemport {gem_id}                ← per gemport
no tcont {tcont_id}                ← per tcont
exit
exit
exit
```
**Method:** `clear_onu_config(frame, slot, port, onu_id)`
**Catatan:** Tidak mengirim `shutdown` — ONU tetap online dan registered.

### Factory Reset ONU

```text
configure terminal
pon-onu-mng gpon-onu_X/Y/Z:N
restore factory
exit
exit
exit
```
**Method:** `factory_reset_onu(frame, slot, port, onu_id)`

### WiFi Reset ONU

```text
configure terminal
pon-onu-mng gpon-onu_X/Y/Z:N
restore wifi
exit
exit
exit
```
**Method:** `restore_wifi_onu(frame, slot, port, onu_id)`

### Disable ONU (admin shutdown)

```text
configure terminal
interface gpon-onu_X/Y/Z:N
shutdown
exit
exit
exit
```
**Method:** `disable_onu(frame, slot, port, onu_id)`
**Effect:** ONU admin state → disable, ONU goes offline. Laser stays on but ONU is administratively down.

### Enable ONU (admin up)

```text
configure terminal
interface gpon-onu_X/Y/Z:N
no shutdown
exit
exit
exit
```
**Method:** `enable_onu(frame, slot, port, onu_id)`
**Effect:** ONU admin state → enable, ONU reconnects.

### PON Port Toggle (laser on/off)

```text
configure terminal
interface gpon-olt_X/Y/Z
shutdown          ← disable port (laser off, all ONUs go offline)
no shutdown       ← enable port (laser on, ONUs reconnect)
exit
exit
exit
```
**Method:** `toggle_pon_port(port_name, enable=True/False)`
**Effect:** Controls the PON port laser. Disabling shuts down the optical signal to all ONUs on that PON port.
**API:** `POST /api/olt/<olt_id>/pon-port/<port_id>/toggle` with `{"action": "enable"}` or `{"action": "disable"}`

---

## 6. Telnet CLI — ONU Registration & Configuration

### Register ONU (Simple)

```text
configure terminal
interface gpon-olt_X/Y/Z
onu N type TYPE sn SERIAL
exit
exit
exit
```
**Method:** `register_onu(frame, slot, port, onu_id, onu_type, serial, vlan)`

### Register + Configure (Step-by-Step)

```text
end
configure terminal
interface gpon-olt_X/Y/Z
onu N type All sn SERIAL
exit
  ← sleep 2s (ONU initialization)
interface gpon-onu_X/Y/Z:N
name {name}
description {description}
tcont 1 name VLAN0030 profile {tcont_profile}
gemport 1 tcont 1
service-port 1 vport 1 user-vlan {vlan} vlan {vlan}
end
```
**Method:** `register_and_configure(frame, slot, port, onu_id, onu_type, serial, vlan, tcont_profile, name, description)`

### Configure ONU Profile (TCONT/GEM/Service-Port)

```text
configure terminal
interface gpon-onu_X/Y/Z:N
name {name}
description {description}
tcont {id} name {service_name} profile {tcont_profile}
gemport {id} tcont {tcont_id}
service-port {id} vport {vport} user-vlan {user_vlan} vlan {service_vlan}
exit
exit
```
**Method:** `configure_onu_profile(frame, slot, port, onu_id, tcont_profile, tcont_id, gemport_id, user_vlan, service_vlan, service_port, vport, name, description)`

### Get Next Available ONU ID

```text
show gpon onu baseinfo gpon-olt_X/Y/Z
```
**Method:** `get_next_available_onu_id(frame, slot, port)` — cari ID 1-128 yang belum digunakan.

---

## 7. Telnet CLI — ONU Vendor Templates

**Method:** `register_vendor_template(frame, slot, port, onu_id, serial, template, onu_type, tcont_profile, vlan, name, description, extra)`

Auto-detect VEIP mode: ZTE SN (ZTEG) → iphost mode, non-ZTE → VEIP mode.

### Template: `bridge`

```text
configure terminal
interface gpon-olt_X/Y/Z
onu N type All sn SERIAL
exit
  ← sleep 2s
interface gpon-onu_X/Y/Z:N
name {name}
description {description}
tcont 1 name VLAN0030 profile {tcont_profile}
gemport 1 tcont 1
service-port 1 vport 1 user-vlan {vlan} vlan {vlan}
end
```

### Template: `pppoe`

Interface config sama dengan bridge, lalu:
```text
exit
pon-onu-mng gpon-onu_X/Y/Z:N
service INTERNET gemport 1 vlan {vlan}
vlan port eth_0/1 mode hybrid def-vlan {vlan}
vlan port eth_0/2 mode hybrid def-vlan {vlan}
vlan port eth_0/3 mode hybrid def-vlan {vlan}
vlan port eth_0/4 mode hybrid def-vlan {vlan}
wan-ip 1 mode pppoe username {user} password {pass} vlan-profile {profile} host 1
```

### Template: `fiberhome_veip`

```text
interface gpon-onu_X/Y/Z:N
sn-bind enable sn
tcont 1 profile {tcont_profile}
gemport 1 tcont 1
gemport 1 traffic-limit downstream {traffic_profile}
tcont 2 profile {tcont_profile}
gemport 2 tcont 2
tcont 3 profile {tcont_profile}
gemport 3 tcont 3
service-port 1 vport 1 user-vlan {tr069_vlan} vlan {tr069_vlan}
service-port 2 vport 2 user-vlan {internet_vlan} vlan {internet_vlan}
service-port 3 vport 3 user-vlan {voip_vlan} vlan {voip_vlan}
exit
pon-onu-mng gpon-onu_X/Y/Z:N
service service1 gemport 1 vlan {tr069_vlan}
service 2 gemport 2 vlan {internet_vlan}
service 3 gemport 3 vlan {voip_vlan}
vlan port veip_1 mode hybrid
vlan port eth_0/1 mode tag vlan {internet_vlan}
vlan port eth_0/2 mode tag vlan {internet_vlan}
vlan port eth_0/3 mode tag vlan {internet_vlan}
vlan port eth_0/4 mode tag vlan {internet_vlan}
vlan port wifi_0/1 mode tag vlan {internet_vlan}
tr069-mgmt 1 state unlock
tr069-mgmt 1 acs {acs_url} validate basic username {acs_user} password {acs_pass}
tr069-mgmt 1 tag pri 0 vlan {tr069_vlan}
```

### Template: `zte_full` (Dual VLAN + WiFi + PPPoE + TR069)

Interface config:
```text
interface gpon-onu_X/Y/Z:N
tcont 1 name VLAN0030 profile {tcont_profile}
gemport 1 tcont 1
gemport 1 traffic-limit downstream {traffic_profile}
tcont 2 name VLAN151 profile {tcont_profile}
gemport 2 tcont 2
gemport 2 traffic-limit downstream {traffic_profile}
service-port 1 vport 1 user-vlan {primary_vlan} vlan {primary_vlan}
service-port 2 vport 2 user-vlan {secondary_vlan} vlan {secondary_vlan}
exit
```

pon-onu-mng config:
```text
pon-onu-mng gpon-onu_X/Y/Z:N
service VLAN0030 gemport 1 [iphost 1] vlan {primary_vlan}
service VLAN151 gemport 2 vlan {secondary_vlan}
[vlan port veip_1 mode hybrid]         ← jika VEIP mode
[vlan port veip_1 vlan 1]
pppoe 1 nat enable user {user} password {pass}    ← jika PPPoE
wan 1 service [tr069] internet host 1
vlan port eth_0/1 mode tag vlan {primary_vlan}
vlan port eth_0/2 mode tag vlan {primary_vlan}
vlan port eth_0/3 mode tag vlan {primary_vlan}
vlan port eth_0/4 mode tag vlan {primary_vlan}
vlan port wifi_0/1 mode tag vlan {primary_vlan}    ← 2.4GHz (non-fatal)
vlan port wifi_0/5 mode tag vlan {primary_vlan}    ← 5GHz (non-fatal)
[vlan port wifi_0/2 mode tag vlan {secondary_vlan}] ← guest SSID (jika dual SSID)
firewall enable level {level} anti-hack disable    ← jika firewall
tr069-mgmt 1 state unlock                           ← jika TR069
tr069-mgmt 1 acs {url} validate basic username {user} password {pass}
tr069-mgmt 1 tag pri 0 vlan {tr069_vlan}           ← atau tr069-mgmt 1 untag
security-mgmt 1 state enable mode forward protocol web ftp telnet ssh https snmp tr069
```

SSID config (separate session, 5s delay):
```text
end
  ← sleep 5s
configure terminal
pon-onu-mng gpon-onu_X/Y/Z:N
ssid ctrl wifi_0/1 name {ssid1_name}
ssid auth wpa wifi_0/1 wpa2-psk
ssid auth wpa wifi_0/1 encrypt aes
ssid auth wpa wifi_0/1 key {ssid1_pass}
ssid ctrl wifi_0/5 name {ssid2_name}
ssid auth wpa wifi_0/5 wpa2-psk
ssid auth wpa wifi_0/5 encrypt aes
ssid auth wpa wifi_0/5 key {ssid2_pass}
end
```

### Template: `zte_single` (Single VLAN + WiFi + PPPoE + TR069)

Mirip `zte_full` tapi 1 TCONT/GEM/service-port. ETH port mode `hybrid def-vlan` (bukan `tag`).

### Template: `huawei_full` (Dynamic Multi-VLAN + WAN DHCP via VEIP)

**Update:** VLAN list sekarang dynamic — jumlah VLAN fleksibel sesuai kebutuhan tenant (tidak lagi fix 3 VLAN Mgmt/Internet/VoIP).
Data dikirim via `extra.vlans` (array of `{vlan, label}`). Backward compatible: jika `extra.vlans` kosong, fallback ke `extra.mgmt_vlan`/`extra.internet_vlan`/`extra.voip_vlan`.

```text
interface gpon-onu_X/Y/Z:N
sn-bind enable sn
tcont 1 profile {tcont_profile}
gemport 1 tcont 1
service-port 1 vport 1 user-vlan {vlans[0].vlan} vlan {vlans[0].vlan}
service-port 2 vport 1 user-vlan {vlans[1].vlan} vlan {vlans[1].vlan}
service-port 3 vport 1 user-vlan {vlans[2].vlan} vlan {vlans[2].vlan}
...                                    ← loop sebanyak extra.vlans (dynamic, tidak fix 3)
exit
pon-onu-mng gpon-onu_X/Y/Z:N
service ServiceONU1 gemport 1
wan-ip 1 mode dhcp vlan-profile {vlan_profile} host 1
```

**Frontend UI (RegisterWizard & AddOnu):**
- Tombol **Add VLAN** untuk menambah row VLAN baru
- Setiap row: VLAN ID (number) + Label (optional text) + tombol hapus (Trash2 icon)
- Default: 3 VLAN (Mgmt 1010, Internet 30, VoIP 151) — bisa dihapus/tambah sesuai kebutuhan
- CLI preview & review/summary menampilkan dynamic VLAN list

**AddOnu.tsx routing:** Saat vendor = huawei, provisioning di-route ke `/api/pre-register` dengan `template=huawei_full` (bukan `/api/provision/ont` yang butuh `ont_provisioner.py`).

### Template: `zte_multi` (Multi-service WAN)

Per-service TCONT/GEM/service-port. Service types: internet, tr069, iptv, bridge.
WAN modes: `nat` (PPPoE NAT), `wan` (WAN-IP PPPoE/DHCP/Static), `webpage` (setup via ONT).

Key commands per service:
```text
tcont {n} name service{n} profile {upload_profile}
gemport {n} tcont {n}
gemport {n} traffic-limit downstream {download_profile}
service-port {n} vport {n} user-vlan {vlan} vlan {vlan}
```

pon-onu-mng per service:
```text
service service{n} gemport {n} [iphost {n}] vlan {vlan}
wan-ip {n} mode {pppoe|dhcp|static} [username {user} password {pass}] [ip-address {ip} mask {mask}] vlan-profile {profile} host {n}
wan-ip {n} ping-response enable traceroute-response enable
pppoe {n} nat enable user {user} password {pass}
wan {n} service internet host {n}
```

Global (jika ada non-bridge service):
```text
firewall enable level low
security-mgmt 1 state enable mode forward protocol web ftp telnet ssh https snmp tr069
```

TR069 (jika enabled):
```text
tr069-mgmt 1 state unlock
tr069-mgmt 1 acs {url} validate basic username {user} password {pass}
tr069-mgmt 1 tag pri 0 vlan {tr069_vlan}    ← atau tr069-mgmt 1 untag
```

### WiFi UNI Port Setup (sebelum SSID config)

```text
configure terminal
pon
onu-type-if {onu_type} wifi_0/1
onu-type-if {onu_type} wifi_0/2
[onu-type-if {onu_type} wifi_0/5]    ← 5GHz (zte_full, zte_multi)
[onu-type-if {onu_type} wifi_0/6]    ← 5GHz guest (zte_full, zte_multi)
exit
```

---

## 8. Telnet CLI — Uplink Port Management

### Enable Port

```text
configure terminal
interface {port_name}
no shutdown
exit
exit
exit
```
**Method:** `enable_port(port_name)`

### Disable Port

```text
configure terminal
interface {port_name}
shutdown
exit
exit
exit
```
**Method:** `disable_port(port_name)`

### Set Port Description

```text
configure terminal
interface {port_name}
description {text}       ← atau: no description
exit
exit
exit
```
**Method:** `set_port_description(port_name, description)`

### Configure Port (speed/duplex/negotiation/flowcontrol/description)

```text
configure terminal
interface {port_name}
speed {10|100|1000|10000}
duplex {full|half}
negotiation auto       ← atau: no negotiation auto
flowcontrol {enable|disable}
description {text}     ← atau: no description
exit
exit
exit
```
**Method:** `configure_port(port_name, speed, duplex, negotiation, flowcontrol, description)`

### Set VLAN Trunk

```text
configure terminal
interface {port_name}
switchport mode {trunk|access|hybrid}
show running-config                      ← baca current VLANs
no switchport vlan {current_vlans}       ← remove existing
switchport vlan {new_vlans} tag          ← add new VLANs (comma-separated)
exit
exit
exit
```
**Method:** `set_vlan_trunk(port_name, vlan_ids, mode)`

### Remove VLAN from Port

```text
configure terminal
interface {port_name}
no switchport vlan {vlan_ids}
exit
exit
exit
```
**Method:** `remove_vlan_from_port(port_name, vlan_ids)`

### Live Traffic (Uplink)

```text
show interface {port_name}
```
**Method:** `get_uplinks_live_traffic(port_ids)` — parse input/output rate, utilization, total bytes

---

## 9. Telnet CLI — Uplink IP Network (VLAN SVI)

ZTE C320/C300 **tidak support** `ip address` langsung di physical uplink port (gei/xgei). IP harus di-set di **VLAN interface (SVI)** dan VLAN di-tag ke uplink port.

### Set IP on VLAN Interface

```text
configure terminal
interface vlan {vlan_id}
ip address {ip} {mask}
exit
interface {port_name}
switchport vlan {vlan_id} tag
exit
ip route 0.0.0.0 0.0.0.0 {gateway}
exit
exit
```
**Method:** `set_uplink_ip(port_name, vlan_id, ip_address, ip_mask, gateway)`

### Remove IP from VLAN Interface

```text
configure terminal
interface vlan {vlan_id}
no ip address
exit
exit
exit
```
**Method:** `set_uplink_ip(port_name, vlan_id, '', '', None)`

---

## 10. Telnet CLI — VLAN Management

### Create VLAN

```text
configure terminal
vlan database
vlan {id} [name {name}]
exit
exit
exit
```
**Method:** `create_vlan(vlan_id, vlan_name)`

### Rename VLAN

```text
configure terminal
vlan database
vlan {id} name {new_name}
exit
exit
exit
```
**Method:** `rename_vlan(vlan_id, new_name)`

### Delete VLAN

```text
configure terminal
vlan database
no vlan {id}
exit
exit
exit
```
**Method:** `delete_vlan(vlan_id)`

---

## 11. Telnet CLI — ONU Type Management

### Add ONU Type

```text
configure terminal
pon
onu-type {name} {gpon|epon} description {desc}
onu-type {name} {gpon|epon} max-tcont {N}
onu-type {name} {gpon|epon} max-gemport {N}
onu-type {name} {gpon|epon} max-switch-perslot {N}
onu-type {name} {gpon|epon} max-flow-perswitch {N}
onu-type {name} {gpon|epon} max-iphost {N}
onu-type-if {name} eth_0/1
onu-type-if {name} wifi_0/1
...
exit
exit
exit
```
**Method:** `add_onu_type(type_name, pon_type, description, max_tcont, max_gem, max_switch, max_flow, max_ip_host, interfaces)`

### Delete ONU Type

```text
configure terminal
pon
no onu-type {name}
exit
exit
exit
```
**Method:** `delete_onu_type(type_name)`

---

## 12. Telnet CLI — Profile Management (TCONT/Traffic/WAN-IP)

### Create TCONT Profile

```text
configure terminal
gpon
profile tcont {name} type {type} [maximum {bw}]
exit
exit
exit
```
**Method:** `create_tcont_profile(name, tcont_type, max_bw)`

### Delete TCONT Profile

```text
configure terminal
gpon
no profile tcont {name}
exit
exit
exit
```
**Method:** `delete_tcont_profile(name)`

### Create Traffic Profile

```text
configure terminal
gpon
profile traffic {name} sir {sir} pir {pir}
exit
exit
exit
```
**Method:** `create_traffic_profile(name, sir, pir)`

### Delete Traffic Profile

```text
configure terminal
gpon
no profile traffic {name}
exit
exit
exit
```
**Method:** `delete_traffic_profile(name)`

### Create WAN-IP Profile

```text
configure terminal
gpon
profile wan-ip {name} ipaddress {ip} netmask {mask} gateway {gw} [primary-dns {dns1}] [secondary-dns {dns2}]
exit
exit
exit
```
**Method:** `create_wan_ip_profile(name, ip_address, netmask, gateway, dns1, dns2)`

### Delete WAN-IP Profile

```text
configure terminal
gpon
no profile wan-ip {name}
exit
exit
exit
```
**Method:** `delete_wan_ip_profile(name)`

---

## 13. Telnet CLI — PON Port Management

### Enable/Disable PON Port

```text
configure terminal
interface gpon-olt_X/Y/Z
no shutdown    ← enable
shutdown       ← disable
exit
exit
exit
```
**Method:** `toggle_pon_port(port_name, enable)`

### Set PON Port Name

```text
configure terminal
interface gpon-olt_X/Y/Z
name {text}    ← atau: no name
exit
exit
exit
```
**Method:** `set_pon_port_name(port_name, new_name)`

### Set PON Port Description

```text
configure terminal
interface gpon-olt_X/Y/Z
description {text}    ← atau: no description
exit
exit
exit
```
**Method:** `set_pon_port_description(port_name, description)`

---

## 14. Telnet CLI — ONU Detail & Live Data

### Get ONU Live Detail (collect_onu_detail)

Mengumpulkan semua data ONU dalam satu session Telnet:

1. `show gpon onu detail-info gpon-onu_X/Y/Z:N` — Name, Type, State, Serial, Description, Distance, RX/TX Power, History
2. `show gpon remote-onu equip gpon-onu_X/Y/Z:N` — Equipment ID, Model, Vendor ID
3. `show pon power attenuation gpon-onu_X/Y/Z:N` — RX/TX power akurat (Up: OLT RX + ONU TX, Down: ONU RX + OLT TX)
4. SNMP fallback (OID .10, .11, .18) — jika Telnet power attenuation gagal
5. `show running-config interface gpon-onu_X/Y/Z:N` — tcont, gemport, service-port
6. `show running-config pon-onu-mng gpon-onu_X/Y/Z:N` — service-vlan mapping, VEIP, eth, wifi, tr069, pppoe, wan-ip
   - Fallback: `show running-config` (full) jika per-interface command error di V2.1.0
7. `show gpon remote-onu veip gpon-onu_X/Y/Z:N` — VEIP admin status, IANA port
8. `show gpon remote-onu tr069 gpon-onu_X/Y/Z:N` — TR-069 ACS, username, password, tag/vlan
9. `show gpon remote-onu ip-host gpon-onu_X/Y/Z:N` — WAN IP current address per host
10. `show gpon remote-onu security-mgmt gpon-onu_X/Y/Z:N` — Remote access ACL
11. `show running-config interface gpon-olt_X/Y/Z` — ONU registration line
12. `show interface gpon-onu_X/Y/Z:N` — Traffic counters (input/output bytes)

**Method:** `collect_onu_detail(frame, slot, port, onu_id)`

### Get ONU Live Data (get_onu_live_data)

```text
show running-config interface gpon-onu_X/Y/Z:N
```
Parse: tconts, gemports, service-ports.

**Method:** `get_onu_live_data(frame, slot, port, onu_id)`

---

## 15. Telnet CLI — ONU History & Traffic

### ONU History

```text
show gpon onu history gpon-onu_X/Y/Z:N
```
Fallback:
```text
show gpon onu event-log gpon-onu_X/Y/Z:N
```
**Method:** `collect_onu_history(frame, slot, port, onu_id)` — max 10 events

### ONU Live Traffic

```text
show gpon onu bandwidth gpon-onu_X/Y/Z:N
```
Fallback:
```text
show gpon onu performance gpon-onu_X/Y/Z:N
```
**Method:** `collect_onu_traffic(frame, slot, port, onu_id)` — downstream/upstream Kbps

---

## 16. Telnet CLI — Unregistered ONU Discovery

```text
show pon onu uncfg
```
Fallback (firmware lama):
```text
show gpon onu uncfg
```
**Method:** `collect_unregistered_onus()`

Output format:
```text
OltIndex            Model                SN                 PW
-----------------------------------------------------------------------
gpon-olt_1/1/5      F670LV9.0            ZTEGDC79F447       GDC79F447
```

Parse: pon_port, SN, vendor (dari SN prefix), model. Dedup by SN.

---

## 17. Telnet CLI — Chassis Info

```text
show card
show fan
```
**Method:** `collect_chassis_info()`

`show card` output:
```text
Rack Shelf Slot CfgType RealType Port HardVer SoftVer Status
1    1     1    GTGH    GTGHG    16   V1.0.0  V2.1.0  INSERVICE
1    1     3    SMXA    SMXA     4    V1.0    V2.1.0  INSERVICE
```

Card type detection:
- **GTGH/GTGHG/GTGO** → GPON card → `collect_all_onus()`, `collect_pon_port_stats()`
- **SMXA** → Uplink card (C320) → `collect_uplinks()`
- **SCXN/SCXM/SCXO/HUVQ** → Uplink card (C300) → `collect_uplinks()`
- **GICF/GISF** → Uplink card → `collect_uplinks()`

`show fan` output:
```text
FanUnitId FanSpeedLevel ActualSpeed
1         Standard(1)   3000
```
Juga mengandung: `Environment Temperature : 45 C`

---

## 18. Poll Orchestration (poll_olt)

**File:** `snmp_collector.py` → `poll_olt(olt, progress_cb)`

### Auto-Detect C300 vs C320

```python
model = (olt.model or 'C320').upper()
is_c300 = 'C300' in model
```

### Poll Steps

| Step | % | Action | Method |
|------|---|--------|--------|
| 1 | 5% | SNMP connect | `SNMPCollector.collect_system_info()` |
| 2 | 10% | SNMP system info | sysDescr, uptime |
| 3 | 25% | SNMP signal data | C320: `collect_onus()` / C300: `collect_onus_c300()` |
| 4 | 30% | Telnet connect | `TelnetCollector(ip, user, pass, port)` |
| 5 | 35% | Chassis info | `collect_chassis_info()` — cards, fans, temperature |
| 6 | 38% | ONU data (Telnet primary) | `collect_all_onus()` — baseinfo, state, detail-info, equip, power attenuation, PPPoE |
| 7 | 75% | ONU count | Telnet result count |
| 8 | 90% | SNMP signal merge | Match by SN, skip non-online ONUs (rx_power/onu_rx_power/tx_power = None) |
| 9 | 91% | VLAN config | `collect_vlans()` |
| 10 | 92% | ONU types | `collect_onu_types()` |
| 11 | 93% | Speed profiles | `collect_speed_profiles()` — TCONT + Traffic |
| 12 | 94% | WAN IP profiles | `collect_wan_ip_profiles()` |
| 13 | 95% | Uplink ports | `collect_uplinks()` — running-config, interface stats, SFP/DDM, VLAN IP |
| 14 | 96% | PON ports | `collect_pon_port_stats(slot)` per GPON card |
| 15 | 98% | Done | Result: system, onus, chassis, vlans, onu_types, speed_profiles, wan_ip_profiles, uplinks, pon_ports |

### SNMP Signal Merge Rules

1. **Skip non-online ONUs** — `rx_power`, `onu_rx_power`, `tx_power` di-set `None` untuk status != `online`
2. **SN match first** — cari SNMP signal by serial number
3. **Positional fallback** — jika SN tidak match, gunakan urutan Telnet = urutan SNMP walk
4. **OID .18 (OLT RX) tidak overwrite Telnet** — Telnet `show pon power attenuation` adalah ground truth. OID .18 hanya fallback jika Telnet gagal.

---

## Summary: C320 vs C300 Differences

| Aspect | C320 | C300 |
|--------|------|------|
| SNMP Enterprise Tree | `.3902.1012` | `.3902.1082` + `.3902.1015` |
| ONU Signal OID | regTable `.3.50.12` | `.1082.500.20` + `.1015.1010.11` |
| RX Power Formula | `raw / 500 - 30` | `(signed16 × 0.002) - 30` |
| OLT RX Formula | `raw / 500 - 30` (salah di V2.1.0) | `signed32 / 1000` |
| Index Format | ponIndex (BOARD_BASE + port × 256) | ifIndex `0x11{slot}{00}{port}` / ponIndex `0x10{slot}{port}{00}` |
| Card Health SNMP | Tidak digunakan (Telnet `show card`) | `.1082.10.1.2.4` + `.1082.10.10.2` |
| Telnet CLI | Sama | Sama |
| Transport | Telnet (raw socket) | Telnet (raw socket) |
| Uplink Card Type | SMXA | SCXN, SCXM, SCXO, HUVQ, GICF, GISF |
| GPON Card Type | GTGH, GTGHG, GTGO | GTGH, GTGHG, GTGO |

---

*Dokumen ini di-generate dari source code Salfanet NMS (`snmp_core.py` ~586 lines, `telnet_client.py` ~4122 lines, `snmp_collector.py` ~209 lines). Semua CLI dan OID di atas sudah berjalan di production.*

---

## Changelog

### 2026-07-06

#### Huawei Full Template — Dynamic Multi-VLAN
- **`telnet_client.py`** — Template `huawei_full` sekarang loop dynamic VLAN list dari `extra.vlans` (array of `{vlan, label}`). Backward compatible: fallback ke `mgmt_vlan`/`internet_vlan`/`voip_vlan` jika `extra.vlans` kosong.
- **`RegisterWizard.tsx`** — UI Huawei Full Config: 3 input VLAN tetap → dynamic list dengan tombol **Add VLAN** / **Remove VLAN**. Setiap row: VLAN ID + Label (optional). CLI preview & review/summary juga dynamic.
- **`AddOnu.tsx`** — Saat vendor = huawei, muncul section "Huawei Multi-VLAN Config" dengan dynamic VLAN list. Provisioning di-route ke `/api/pre-register` dengan `template=huawei_full` (bukan `/api/provision/ont`).

#### Rack Diagram Mobile Responsive (ZteRackDiagram C300)
- **`ZteRackDiagram.tsx`** — Header text lebih kecil di mobile (`text-xs sm:text-sm`), button compact. Rack container padding `p-2 sm:p-3`, min-width dikurangi (`min-w-[480px]` dari `560px`). FAN row dari fixed `width: 760px` grid → `flex w-full` dengan `flex-1` per fan block. Port panel modal `w-[calc(100vw-2rem)]` untuk mobile. Summary bar & legend gap responsive.

#### Uplink IP Config Preservation Across Sync
- **`sync_helper.py`** — IP network config (`ip_vlan_id`, `ip_address`, `ip_mask`, `ip_gateway`) sekarang di-preserve across sync dengan prioritaskan sync data (dari `collect_uplinks` → `show ip interface brief`), fallback ke saved DB values. Sebelumnya: sync delete + recreate uplinks tanpa preserve IP config.

#### Frontend Chart Dimension Fix
- **`OltConfiguration.tsx`** — `ResponsiveContainer` height dari `"100%"` → `{80}` (fixed pixel) karena parent `div` punya fixed height `h-20` (5rem = 80px). Memperbaiki warning `width(-1) and height(-1) of chart should be greater than 0`.
