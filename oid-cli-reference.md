# Dokumentasi OID & CLI — NMS Monitoring Reference

> **Tujuan**: Dokumen ini mencatat seluruh SNMP OID dan CLI command yang saat ini digunakan oleh aplikasi NMS Surganet untuk OLT Monitoring dan Network Device Monitoring. Dokumen ini menjadi acuan dasar saat akan mereplikasi monitoring di lokasi lain dengan perangkat yang sama.

**Versi dokumen**: April 2026 (diperbarui: penambahan GenieACS TR-069 + Auto Register ONT)  
**Versi terbaru**: Juli 2026 (diperbarui: perbaikan PPPOE_STALE_DAYS=7, penambahan API onu_types, update vendor files)  
**Source code**: `/var/www/nms/lib/vendors/`, `/var/www/nms/lib/NetworkPoller.php`, `/var/www/nms/api/autoregis/`, `/root/autoregis*.py`

---

## Daftar Isi

1. [OLT Monitoring — Gambaran Umum](#1-olt-monitoring--gambaran-umum)
2. [ZTE (ZXA10 C300)](#2-zte-zxa10-c300)
3. [Huawei (MA5680T / MA5683T / MA5608T)](#3-huawei-ma5680t--ma5683t--ma5608t)
4. [FiberHome (AN5516)](#4-fiberhome-an5516)
5. [BDCOM (GP3600 / P3310C / P3608)](#5-bdcom-gp3600--p3310c--p3608)
6. [C-Data (FD1104B / FD1108S / FD1216S / FD1608GS)](#6-c-data-fd1104b--fd1108s--fd1216s--fd1608gs)
7. [Dasan / DZS (V5812G / V5824G / V6424)](#7-dasan--dzs-v5812g--v5824g--v6424)
8. [HSGQ (HSGQ-XE04ID)](#8-hsgq-hsgq-xe04id)
9. [VSOL (V1600G / V1600D)](#9-vsol-v1600g--v1600d)
10. [Raisecom (ISCOM6820-GP / ISCOM5800E)](#10-raisecom-iscom6820-gp--iscom5800e)
11. [Nokia / ALU (7360 ISAM FX / 7342 ISAM FTTU)](#11-nokia--alu-7360-isam-fx--7342-isam-fttu)
12. [TP-Link (P1201-08 / P1201-16)](#12-tp-link-p1201-08--p1201-16)
13. [Calix (E7-2 / E9-2 / AXOS E7)](#13-calix-e7-2--e9-2--axos-e7)
14. [Network Device Monitoring (MikroTik / Switch / UPS)](#14-network-device-monitoring-mikrotik--switch--ups)
15. [Traffic Grapher — RRD & Polling Logic](#15-traffic-grapher--rrd--polling-logic)
16. [PPPoE Grapher — Logic Sesi Up/Down](#16-pppoe-grapher--logic-sesi-updown)
17. [Network Poller — Arsitektur & Cron](#17-network-poller--arsitektur--cron)
18. [Standard Interface OIDs (IF-MIB)](#18-standard-interface-oids-if-mib)
19. [Catatan SSH / CLI Umum](#19-catatan-ssh--cli-umum)
20. [Checklist Deployment Lokasi Baru](#20-checklist-deployment-lokasi-baru)
21. [GenieACS — TR-069 Management](#21-genieacs--tr-069-management)
22. [Auto Register ONT (AutoRegis)](#22-auto-register-ont-autoregis)

---

## 1. OLT Monitoring — Gambaran Umum

NMS menggunakan SNMP v2c untuk polling ONT/ONU di semua OLT. Data yang dikumpulkan per ONT:

| Data | Keterangan |
|------|-----------|
| Serial Number (SN) | Identifier unik ONT |
| Status / Run Status | Online / Offline / LOS / DyingGasp |
| RX Power (OLT-side) | Daya terima OLT dari ONT (dBm) |
| RX Power (ONU-side) | Daya terima ONT dari OLT (dBm) |
| TX Power (ONU-side) | Daya kirim ONT ke OLT (dBm) |
| Distance | Jarak ONT dari OLT (meter) |
| Description | Label/nama pelanggan |

CLI digunakan untuk operasi: `show detail`, `show optical`, `reboot`, `add`, `delete`, `set description`.

---

## 2. ZTE (ZXA10 C300)

**Enterprise OID**: `.1.3.6.1.4.1.3902`  
**SNMP Version**: v2c  
**Catatan khusus**: ZTE C300 menggunakan DUA tree MIB yang berbeda:
- Tree `.3902.1082` — Data registrasi/status ONT, diindex oleh `ifIndex`
- Tree `.3902.1015` — Optical power OLT-side, diindex oleh `ponIndex`

**Konversi index**:
- `ifIndex` format: `0x11{slot}{00}{port}` — contoh: `0x11020001` = `gpon_1/2/1`
- `ponIndex` format: `0x10{slot}{port}{00}` — contoh: `0x10020100` = `gpon_1/2/1`

### SNMP OIDs — ZTE C300

#### Tree .3902.1082 — Data ONT (index: ifIndex.onuId)

| OID | Keterangan | Satuan |
|-----|-----------|--------|
| `.1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.18` | Serial Number (formatted string) — e.g. `"1,HWTC7C9A0A9B"` | String |
| `.1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.6`  | Serial Number (hex raw OctetString) | HexBytes |
| `.1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.2`  | Description / Deskripsi ONT | String |
| `.1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.3`  | ONU Name | String |
| `.1.3.6.1.4.1.3902.1082.500.20.2.1.2.1.8` | **Actual ONU Type/Model** (e.g. "HG8245A", "ZTE-F601") — didapat setelah ONT online | String |
| `.1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.10` | Run Status (versi lama) | Integer |
| `.1.3.6.1.4.1.3902.1082.500.10.2.3.8.1.4`  | **Run Status** (1=init, 2=los, 3=ranging, 4=**online**, 5=dyinggasp, 6=offline, 7=authfail) | Integer |
| `.1.3.6.1.4.1.3902.1082.500.10.2.3.10.1.2` | Distance dari OLT | meter |
| `.1.3.6.1.4.1.3902.1082.500.10.2.2.3.1.1`  | PON Port Name/Alias (index: ifIndex) | String |

#### Tree .3902.1082.500.20 — ONU-side Optical Power (index: ifIndex.onuId.1)

| OID | Keterangan | Satuan / Konversi |
|-----|-----------|-----------|
| `.1.3.6.1.4.1.3902.1082.500.20.2.2.2.1.10` | ONU Downstream RX Power | dBuW unsigned 16-bit, `(signed × 0.002) − 30 = dBm` |
| `.1.3.6.1.4.1.3902.1082.500.20.2.2.2.1.14` | ONU Upstream TX Power | dBuW unsigned 16-bit, rumus sama |

> `0xFFFF (65535)` = offline/tidak tersedia

#### Tree .3902.1015 — OLT-side Optical Power (index: ponIndex.onuId)

| OID | Keterangan | Satuan / Konversi |
|-----|-----------|-----------|
| `.1.3.6.1.4.1.3902.1015.1010.11.2.1.2` | OLT RX dari ONT | Integer / 1000 = dBm |
| `.1.3.6.1.4.1.3902.1015.1010.11.2.1.3` | ONT TX Power | Integer / 1000 = dBm |

#### Card / Board Health (index: slot)

| OID | Keterangan | Satuan |
|-----|-----------|--------|
| `.1.3.6.1.4.1.3902.1082.10.1.2.4.1.4.1.1` | Card Type Name ("PRWH","GTGHG","SCXN") | String |
| `.1.3.6.1.4.1.3902.1082.10.1.2.4.1.5.1.1` | Card Status (1=inservice) | Integer |
| `.1.3.6.1.4.1.3902.1082.10.1.2.4.1.9.1.1` | CPU Load | % |
| `.1.3.6.1.4.1.3902.1082.10.1.2.4.1.11.1.1` | Memory Usage | % |
| `.1.3.6.1.4.1.3902.1082.10.1.2.4.1.13.1.1` | Role (1=main, 2=standby) | Integer |
| `.1.3.6.1.4.1.3902.1082.10.10.2.1.6.1.2.1.1` | Temperature | °C |
| `.1.3.6.1.4.1.3902.1082.10.10.2.1.6.1.5.1.1` | Fan Speed | RPM |
| `.1.3.6.1.4.1.3902.1082.10.10.2.3.11.1.2.1.1` | PSU Input Voltage (index: PSU idx) | Volt |

#### SFP / PON Port Diagnostics — Tree .3902.1015.3.1.13.1 (index: diagIndex)

> `diagIndex` dihitung dari ifIndex PON port. Lihat catatan konversi Format A ↔ B di atas.

| OID | Keterangan | Satuan / Konversi |
|-----|-----------|--------|
| `.1.3.6.1.4.1.3902.1015.3.1.13.1.1.{diagIndex}` | OLT-side RX Power dari ONT (per ONU) | raw / 1000 = dBm |
| `.1.3.6.1.4.1.3902.1015.3.1.13.1.4.{diagIndex}` | TX Power SFP OLT port | raw / 1000 = dBm |
| `.1.3.6.1.4.1.3902.1015.3.1.13.1.9.{diagIndex}` | Bias Current SFP | raw / 1000 = mA |
| `.1.3.6.1.4.1.3902.1015.3.1.13.1.10.{diagIndex}` | Voltage SFP | raw / 1000 = V |
| `.1.3.6.1.4.1.3902.1015.3.1.13.1.11.{diagIndex}` | Wavelength SFP | nm |
| `.1.3.6.1.4.1.3902.1015.3.1.13.1.12.{diagIndex}` | Temperature SFP | raw / 1000 = °C |
| `.1.3.6.1.4.1.3902.1015.3.1.13.1.13.{diagIndex}` | Model SFP (hex string) | String |
| `.1.3.6.1.4.1.3902.1015.3.1.13.1.14.{diagIndex}` | Vendor SFP (hex string) | String |

#### ENTITY-MIB (standard)

| OID | Keterangan |
|-----|-----------|
| `.1.3.6.1.2.1.47.1.1.1.1.2` | Entity Description |
| `.1.3.6.1.2.1.47.1.1.1.1.5` | Entity Class |
| `.1.3.6.1.2.1.47.1.1.1.1.6` | Entity Position |
| `.1.3.6.1.2.1.47.1.1.1.1.8` | HW Revision |
| `.1.3.6.1.2.1.47.1.1.1.1.13` | Model |

### CLI Commands — ZTE C300

**Protokol**: SSH  
**Autentikasi**: `zte / zte` (default)  
**SSH Cipher**: `aes128-cbc,3des-cbc`  
**SSH KEX**: `diffie-hellman-group14-sha1`  
**HostKeyAlgorithms**: `+ssh-rsa`  
**Mode**: Interactive (tidak support SSH exec channel)  
**Paging**: Kirim `terminal length 0` setelah login

> Format port CLI: `gpon-olt_1/{slot}/{port}` dan ONT: `gpon-onu_1/{slot}/{port}:{ont_id}`

| Fungsi | Command Sequence |
|--------|-----------------|
| Detail ONT | `enable` → `show gpon onu detail-info gpon-onu_{slot}/{port}:{ont_id}` |
| Optical Power ONT | `enable` → `show pon power attenuation gpon-onu_{slot}/{port}:{ont_id}` |
| Service ONT | `enable` → `show gpon onu service gpon-onu_{slot}/{port}:{ont_id}` |
| Daftar ONT di PON | `enable` → `show gpon onu state gpon-olt_{slot}/{port}` |
| Daftar Optical di PON | `enable` → `show pon power onu-rx gpon-olt_{slot}/{port}` |
| Reboot ONT | `enable` → `configure terminal` → `pon-onu-mng gpon-onu_{slot}/{port}:{ont_id}` → `reboot` → `yes` (konfirmasi) → `exit` → `exit` |
| Tambah ONT | `enable` → `configure terminal` → `interface gpon-olt_{slot}/{port}` → `onu {ont_id} type auto sn {SN}` → `exit` → `exit` |
| Hapus ONT | `enable` → `configure terminal` → `interface gpon-olt_{slot}/{port}` → `no onu {ont_id}` → `exit` → `exit` |
| Set Deskripsi ONT | `enable` → `configure terminal` → `interface gpon-onu_{slot}/{port}:{ont_id}` → `name {desc}` → `exit` → `exit` |
| Set Deskripsi PON Port | `enable` → `configure terminal` → `interface gpon-olt_{slot}/{port}` → `name {desc}` → `exit` → `exit` |
| Show Running Config | `enable` → `show running-config` (atau `show running-config \| section {section}`) |

---

## 3. Huawei (MA5680T / MA5683T / MA5608T)

**Enterprise OID**: `.1.3.6.1.4.1.2011`  
**SNMP Version**: v2c

### SNMP OIDs — Huawei

#### ONT Data (index: ponIfIndex.ontId)

| OID | Keterangan | Satuan / Konversi |
|-----|-----------|-----------|
| `.1.3.6.1.4.1.2011.6.128.1.1.2.43.1.3` | Serial Number | String |
| `.1.3.6.1.4.1.2011.6.128.1.1.2.46.1.15` | Status (1=online, lainnya=offline) | Integer |
| `.1.3.6.1.4.1.2011.6.128.1.1.2.51.1.4` | OLT-side RX Power | raw / 100 = dBm |
| `.1.3.6.1.4.1.2011.6.128.1.1.2.46.1.20` | Distance dari OLT | meter |
| `.1.3.6.1.4.1.2011.6.128.1.1.2.43.1.9` | Description | String |

#### Board Health (index: slot)

| OID | Keterangan | Satuan |
|-----|-----------|--------|
| `.1.3.6.1.4.1.2011.6.128.1.1.1.6.1.1` | Temperature | °C |
| `.1.3.6.1.4.1.2011.6.128.1.1.1.6.1.5` | CPU Load | % |
| `.1.3.6.1.4.1.2011.6.128.1.1.1.6.1.7` | Memory Usage | % |

### CLI Commands — Huawei

**Mode**: `enable` → `config`  
**Prompt**: `{.*[>#]}`

| Fungsi | Command Sequence |
|--------|-----------------|
| Detail ONT | `enable` → `display ont info {frame} {slot} {port} {ont_id}` |
| Optical Power ONT | `enable` → `display ont optical-info {frame} {slot} {port} {ont_id}` |
| Service ONT | `enable` → `display service-port port {frame}/{slot}/{port} ont {ont_id}` |
| Daftar ONT di PON | `enable` → `display ont info {frame} {slot} {port} all` |
| Daftar Optical di PON | `enable` → `display ont optical-info {frame} {slot} {port} all` |
| Reboot ONT | `enable` → `config` → `interface gpon {frame}/{slot}` → `ont reset {port} {ont_id}` → `quit` → `quit` |
| Tambah ONT | `enable` → `config` → `interface gpon {frame}/{slot}` → `ont add {port} {ont_id} sn-auth {SN} omci ont-lineprofile-id 1 ont-srvprofile-id 1 desc "{desc}"` → `quit` → `quit` |
| Hapus ONT | `enable` → `config` → `interface gpon {frame}/{slot}` → `ont delete {port} {ont_id}` → `quit` → `quit` |
| Show Config | `enable` → `display current-configuration` (atau `display current-configuration section {section}`) |

---

## 4. FiberHome (AN5516-01 / AN5516-04 / AN5516-06)

**Enterprise OID**: `.1.3.6.1.4.1.5765`  
**SNMP Version**: v2c

### SNMP OIDs — FiberHome

#### ONT Data (index: ponIfIndex.ontId)

| OID | Keterangan | Satuan / Konversi |
|-----|-----------|-----------|
| `.1.3.6.1.4.1.5765.1.33.1.2.1.1.2` | Serial Number | String |
| `.1.3.6.1.4.1.5765.1.33.1.2.1.1.3` | Status (1=online) | Integer |
| `.1.3.6.1.4.1.5765.1.33.1.2.3.1.4` | OLT-side RX Power | raw / 100 = dBm |
| `.1.3.6.1.4.1.5765.1.33.1.2.1.1.6` | Description | String |

#### Board Health (index: slot)

| OID | Keterangan | Satuan |
|-----|-----------|--------|
| `.1.3.6.1.4.1.5765.1.33.1.1.2.1.3` | Temperature | °C |

> **Catatan**: FiberHome HG6145D2 menolak `GetParameterValues` pada subtree path (misal `LANDevice.1.Hosts.`). Gunakan `GetParameterNames` + specific leaf GetParameterValues.

### CLI Commands — FiberHome

| Fungsi | Command Sequence |
|--------|-----------------|
| Detail ONT | `enable` → `show gpon onu detail {slot}/{port}/{ont_id}` |
| Optical Power ONT | `enable` → `show gpon onu optical-info {slot}/{port}/{ont_id}` |
| Service ONT | `enable` → `show gpon onu service {slot}/{port}/{ont_id}` |
| Daftar ONT di PON | `enable` → `show gpon onu state {slot}/{port}` |
| Reboot ONT | `enable` → `configure terminal` → `gpon onu reset {slot}/{port}/{ont_id}` → `exit` |
| Tambah ONT | `enable` → `configure terminal` → `interface gpon {slot}/{port}` → `onu {ont_id} sn {SN} desc "{desc}"` → `exit` → `exit` |
| Hapus ONT | `enable` → `configure terminal` → `interface gpon {slot}/{port}` → `no onu {ont_id}` → `exit` → `exit` |
| Show Config | `enable` → `show running-config` (atau `show running-config section {section}`) |

---

## 5. BDCOM (GP3600 / P3310C / P3608)

**Enterprise OID**: `.1.3.6.1.4.1.3320`  
**SNMP Version**: v2c  
**Jenis**: GPON dan EPON

### SNMP OIDs — BDCOM

| OID | Keterangan | Satuan / Konversi |
|-----|-----------|-----------|
| `.1.3.6.1.4.1.3320.101.10.1.1.3` | Serial Number (index: ponIfIndex.ontId) | String |
| `.1.3.6.1.4.1.3320.101.10.1.1.26` | Status (1=online) | Integer |
| `.1.3.6.1.4.1.3320.101.10.5.1.5` | OLT-side RX Power | raw / 100 = dBm |
| `.1.3.6.1.4.1.3320.101.10.1.1.8` | Description | String |

### CLI Commands — BDCOM (EPON)

| Fungsi | Command Sequence |
|--------|-----------------|
| Detail ONU | `enable` → `show epon onu-info interface EPON0/{slot}:{ont_id}` |
| Optical Power ONU | `enable` → `show epon optical-info interface EPON0/{slot}:{ont_id}` |
| Daftar ONU | `enable` → `show epon onu-info interface EPON0/{slot}` |
| Reboot ONU | `enable` → `configure terminal` → `interface EPON0/{slot}` → `epon onu {ont_id} reset` → `exit` → `exit` |

---

## 6. C-Data (FD1104B / FD1108S / FD1216S / FD1608GS)

**Enterprise OID**: `.1.3.6.1.4.1.34592`  
**SNMP Version**: v2c

### SNMP OIDs — C-Data

| OID | Keterangan | Satuan / Konversi |
|-----|-----------|-----------|
| `.1.3.6.1.4.1.34592.1.3.4.1.2.1.1.3` | Serial Number (index: ponIfIndex.ontId) | String |
| `.1.3.6.1.4.1.34592.1.3.4.1.2.1.1.10` | Status (1=online) | Integer |
| `.1.3.6.1.4.1.34592.1.3.4.1.5.1.1.2` | OLT-side RX Power | raw / 100 = dBm |
| `.1.3.6.1.4.1.34592.1.3.4.1.2.1.1.7` | Description | String |

### CLI Commands — C-Data

| Fungsi | Command Sequence |
|--------|-----------------|
| Detail ONT | `enable` → `show onu running config gpon-olt_{slot}/{port} onu {ont_id}` |
| Optical Power ONT | `enable` → `show pon onu optical-info gpon-olt_{slot}/{port} onu {ont_id}` |
| Daftar ONT | `enable` → `show gpon onu state gpon-olt_{slot}/{port}` |
| Reboot ONT | `enable` → `configure terminal` → `pon-onu-mng gpon-onu_{slot}/{port}:{ont_id}` → `reboot` → `exit` → `exit` |

---

## 7. Dasan / DZS (V5812G / V5824G / V6424)

**Enterprise OID**: `.1.3.6.1.4.1.6296`  
**SNMP Version**: v2c

### SNMP OIDs — Dasan

| OID | Keterangan | Satuan / Konversi |
|-----|-----------|-----------|
| `.1.3.6.1.4.1.6296.101.23.3.1.1.4` | Serial Number (index: ponIfIndex.ontId) | String |
| `.1.3.6.1.4.1.6296.101.23.3.1.1.12` | Status (1=online) | Integer |
| `.1.3.6.1.4.1.6296.101.23.3.5.1.2` | OLT-side RX Power | raw / 100 = dBm |
| `.1.3.6.1.4.1.6296.101.23.3.1.1.8` | Description | String |

### CLI Commands — Dasan

| Fungsi | Command Sequence |
|--------|-----------------|
| Detail ONU | `enable` → `show onu detail {slot}/{port}.{ont_id}` |
| Optical Power ONU | `enable` → `show onu optical-transceiver {slot}/{port}.{ont_id}` |
| Daftar ONU | `enable` → `show onu status {slot}/{port}` |
| Reboot ONU | `enable` → `configure terminal` → `onu reset {slot}/{port}.{ont_id}` → `exit` |

---

## 8. HSGQ (HSGQ-XE04ID)

**Enterprise OID**: `.1.3.6.1.4.1.50224`  
**SNMP Version**: v2c  
**Jenis**: EPON  
**Index ONU**: `onuIndex = (slot << 24) | (port << 8) | ont_id`  
**Index Port**: `portIndex = (slot << 24) | (port << 16)`  
**Catatan khusus**: LOID tidak bisa dibaca via SNMP; identifier menggunakan MAC address ONT.

### SNMP OIDs — HSGQ

#### ONU Info (index: onuIndex)

| OID | Keterangan | Satuan / Keterangan |
|-----|-----------|-----------|
| `.1.3.6.1.4.1.50224.3.3.2.1.2` | ONU Name | String |
| `.1.3.6.1.4.1.50224.3.3.2.1.8` | Status Link (1=online, 2=offline) | Integer |
| `.1.3.6.1.4.1.50224.3.3.2.1.7` | MAC Address (hex bytes) — identifier utama EPON | HexBytes |
| `.1.3.6.1.4.1.50224.3.3.2.1.16` | LLID (EPON Link ID); `65535=belum pernah auth` | Integer |
| `.1.3.6.1.4.1.50224.3.3.2.1.15` | Distance dari OLT | meter |
| `.1.3.6.1.4.1.50224.3.3.2.1.26` | Chip/Model String | String |

#### Optical Table (index: onuIndex.0.0 — atau portIndex.65535.65535 untuk OLT port)

| OID | Keterangan | Satuan / Konversi |
|-----|-----------|-----------|
| `.1.3.6.1.4.1.50224.3.3.3.1.4` | OLT RX dari ONU (ONU-index) | raw / 100 = dBm |
| `.1.3.6.1.4.1.50224.3.3.3.1.5` | TX Power ONU / OLT TX (portIndex.65535.65535) | raw / 100 = dBm |
| `.1.3.6.1.4.1.50224.3.3.3.1.6` | Bias Current | raw / 100 = mA |
| `.1.3.6.1.4.1.50224.3.3.3.1.7` | Voltage SFP | raw / 100 = V |
| `.1.3.6.1.4.1.50224.3.3.3.1.8` | Temperature SFP | raw / 100 = °C |

#### PON Port Table (index: portIndex)

| OID | Keterangan |
|-----|-----------|
| `.1.3.6.1.4.1.50224.3.2.1.1.2` | PON Port Name |
| `.1.3.6.1.4.1.50224.3.2.1.1.9` | PON Port Status (1=online) |

#### System Health (scalar)

| OID | Keterangan | Satuan |
|-----|-----------|--------|
| `.1.3.6.1.4.1.50224.3.1.1.17.0` | CPU Usage | % |
| `.1.3.6.1.4.1.50224.3.1.1.18.0` | Memory Usage | % |

---

## 9. VSOL (V1600G / V1600D)

**Enterprise OID**: `.1.3.6.1.4.1.37950`  
**SNMP Version**: v2c

### SNMP OIDs — VSOL

| OID | Keterangan | Satuan / Konversi |
|-----|-----------|-----------|
| `.1.3.6.1.4.1.37950.1.1.5.12.1.1.1.1` | Serial Number (index: ponIfIndex.ontId) | String |
| `.1.3.6.1.4.1.37950.1.1.5.12.1.1.1.2` | Status (1=online) | Integer |
| `.1.3.6.1.4.1.37950.1.1.5.12.1.3.1.2` | OLT-side RX Power | raw / 100 = dBm |

### CLI Commands — VSOL

| Fungsi | Command Sequence |
|--------|-----------------|
| Detail ONT | `enable` → `show onu info gpon {slot}/{port} onu {ont_id}` |
| Optical Power ONT | `enable` → `show onu optical-info gpon {slot}/{port} onu {ont_id}` |
| Daftar ONT | `enable` → `show onu state gpon {slot}/{port}` |
| Reboot ONT | `enable` → `configure terminal` → `onu reset gpon {slot}/{port} onu {ont_id}` → `exit` |

---

## 10. Raisecom (ISCOM6820-GP / ISCOM5800E)

**Enterprise OID**: `.1.3.6.1.4.1.8886`  
**SNMP Version**: v2c  
**Index ONT ("type2id")**: 32-bit integer — `(0b0001 << 28) | (slot << 23) | (port << 16) | onu`  
**Index Optical ("index2")**: `slot×10000000 + port×100000 + onu×1000 + 1`  
**Catatan khusus**: ISCOM6820-GP tidak bisa menangani concurrent SNMP walks pada enterprise OIDs; harus sequential.

### SNMP OIDs — Raisecom

#### ONT Table (index: type2id)

| OID | Keterangan | Satuan / Konversi |
|-----|-----------|-----------|
| `.1.3.6.1.4.1.8886.18.3.1.3.1.1.2` | Serial Number | String |
| `.1.3.6.1.4.1.8886.18.3.1.3.1.1.17` | Status (1=online, 3=offline) | Integer |
| `.1.3.6.1.4.1.8886.18.3.1.3.1.1.20` | Description | String |
| `.1.3.6.1.4.1.8886.18.3.1.3.1.1.16` | Distance dari OLT | meter |
| `.1.3.6.1.4.1.8886.18.3.1.3.1.1.18` | Active flag | Integer |
| `.1.3.6.1.4.1.8886.18.3.1.3.1.1.15` | Offline Reason code | Integer (lihat tabel di bawah) |

**Kode Offline Reason**:

| Kode | Makna |
|------|-------|
| 2 | LOS |
| 3 | Host request (ONU deregister) |
| 4 | LOBi |
| 5 | LOFi |
| 6 | Dying gasp |
| 7 | Deactivated by OLT |
| 8 | ONU disabled |
| 13 | Branch fiber cut |
| 24 | ONU Alarm |

#### OLT-side RX Power (index: type2id)

| OID | Keterangan | Satuan / Konversi |
|-----|-----------|-----------|
| `.1.3.6.1.4.1.8886.18.3.1.3.3.1.1` | OLT RX Power | raw / 10 = dBm |

#### ONU-side Optical Power (index: index2)

| OID | Keterangan | Satuan / Konversi |
|-----|-----------|-----------|
| `.1.3.6.1.4.1.8886.18.3.6.3.1.1.16` | ONU RX Power (downstream) | `(raw - 15000) / 500 = dBm`; `0` = offline |
| `.1.3.6.1.4.1.8886.18.3.6.3.1.1.17` | ONU TX Power (upstream) | rumus sama |

#### Board Health — Raisecom

| OID | Keterangan | Satuan / Index |
|-----|-----------|--------|
| `.1.3.6.1.4.1.8886.1.27.2.1.1.10.0` | Chassis Temperature (scalar) | °C |
| `.1.3.6.1.4.1.8886.18.1.7.1.1.1.4.{slot}.0` | CPU Usage per slot | % |
| `.1.3.6.1.4.1.8886.18.1.7.3.1.1.1.{slot}.0` | Memory Total per slot | bytes |
| `.1.3.6.1.4.1.8886.18.1.7.3.1.1.2.{slot}.0` | Memory Available per slot | bytes |
| `.1.3.6.1.4.1.8886.1.27.3.1.1.5.{slot}` | Card Type Code | Integer |
| `.1.3.6.1.4.1.8886.1.27.3.1.1.11.{slot}` | Card Status | Integer |
| `.1.3.6.1.4.1.8886.1.27.5.1.1.4.{fan_slot}.{fan_idx}` | Fan Speed | RPM |

#### SFP Info — Raisecom (index: col.ifIndex)

| OID | Keterangan | Satuan |
|-----|-----------|--------|
| `.1.3.6.1.4.1.8886.1.18.2.1.1.1.3.{ifIndex}` | SFP Vendor | String |
| `.1.3.6.1.4.1.8886.1.18.2.1.1.1.4.{ifIndex}` | SFP Model | String |
| `.1.3.6.1.4.1.8886.1.18.2.1.1.1.5.{ifIndex}` | SFP Serial Number | String |
| `.1.3.6.1.4.1.8886.1.18.2.1.1.1.16.{ifIndex}` | SFP Wavelength | pm (picometer) |

#### SFP DDM — Raisecom (index: ifIndex.param)

> Base OID: `.1.3.6.1.4.1.8886.1.18.2.2.1.1.2.{ifIndex}.{param}`

| Param | Keterangan | Satuan / Konversi |
|-------|-----------|--------|
| 1 | Temperature | raw / 1000 = °C |
| 2 | Bias Current | raw / 1000 = mA |
| 3 | TX Power | µW (mikrowatt) |
| 4 | RX Power | millidBm (`raw / 1000 = dBm`) |
| 7 | Voltage | raw / 1000 = V |

### CLI Commands — Raisecom

| Fungsi | Command Sequence |
|--------|-----------------|
| Detail ONT | `enable` → `show gpon onu info slot {slot} port {port} onu {ont_id}` |
| Optical Power ONT | `enable` → `show gpon onu optical-info slot {slot} port {port} onu {ont_id}` |
| Daftar ONT | `enable` → `show gpon onu state slot {slot} port {port}` |
| Reboot ONT | `config` → `gpon-onu {slot}/{port}/{ont_id}` → `reboot` → `yes` (konfirmasi) → `exit` → `exit` |
| Hapus ONT | `config` → `interface gpon-olt {slot}/{port}` → `no create gpon-onu {ont_id}` → `exit` → `exit` |
| Set Deskripsi ONT | `config` → `interface gpon-onu {slot}/{port}/{ont_id}` → `description {desc}` → `exit` → `exit` |
| Set Deskripsi PON Port | `config` → `interface gpon-olt {slot}/{port}` → `description {desc}` → `exit` → `exit` |

---

## 11. Nokia / ALU (7360 ISAM FX / 7342 ISAM FTTU)

**Enterprise OID**: `.1.3.6.1.4.1.6527`  
**SNMP Version**: v2c  
**CLI Protocol**: TL1-style commands

### SNMP OIDs — Nokia

| OID | Keterangan | Satuan / Konversi |
|-----|-----------|-----------|
| `.1.3.6.1.4.1.6527.3.1.2.33.1.6.1.4` | Serial Number (index: ponIfIndex.ontId) | String |
| `.1.3.6.1.4.1.6527.3.1.2.33.1.6.1.2` | Status (1=online) | Integer |
| `.1.3.6.1.4.1.6527.3.1.2.33.1.8.1.2` | OLT-side RX Power | raw / 100 = dBm |
| `.1.3.6.1.4.1.6527.3.1.2.2.1.8.1.18` | Board Temperature (index: slot) | °C |

### CLI Commands — Nokia (TL1)

| Fungsi | Command Sequence |
|--------|-----------------|
| Detail ONT | `show equipment ont interface 1/1/{slot}/{port}/{ont_id} detail` |
| Optical Power ONT | `show equipment ont optics 1/1/{slot}/{port}/{ont_id} detail` |
| Slot ONT | `show equipment ont slot 1/1/{slot}/{port}/{ont_id}` |
| Daftar ONT | `show equipment ont status pon 1/1/{slot}/{port}` |
| Disable ONT | `configure equipment ont interface 1/1/{slot}/{port}/{ont_id} admin-state down` |
| Enable ONT | `configure equipment ont interface 1/1/{slot}/{port}/{ont_id} admin-state up` |
| Show Config | `info configure` (atau `info configure {section}`) |

---

## 12. TP-Link (P1201-08 / P1201-16)

**Catatan**: TP-Link menggunakan OID yang sama dengan `GenericVendor` (SNMP standard IF-MIB).

### CLI Commands — TP-Link

| Fungsi | Command Sequence |
|--------|-----------------|
| Detail ONT | `enable` → `show gpon onu detail interface gpon-port {slot}/{port} onu {ont_id}` |
| Optical Power ONT | `enable` → `show gpon onu optical-info interface gpon-port {slot}/{port} onu {ont_id}` |
| Daftar ONT | `enable` → `show gpon onu interface gpon-port {slot}/{port}` |

---

## 13. Calix (E7-2 / E9-2 / AXOS E7)

**Enterprise OID**: `.1.3.6.1.4.1.6321`  
**SNMP Version**: v2c  
**CLI Protocol**: Calix CMS (tidak pakai `enable`/`configure terminal`)

### SNMP OIDs — Calix

| OID | Keterangan | Satuan / Konversi |
|-----|-----------|-----------|
| `.1.3.6.1.4.1.6321.1.2.2.4.1.3.1.4` | Serial Number (index: ponIfIndex.ontId) | String |
| `.1.3.6.1.4.1.6321.1.2.2.4.1.3.1.2` | Status (1=online) | Integer |
| `.1.3.6.1.4.1.6321.1.2.2.4.1.5.1.2` | OLT-side RX Power | raw / 100 = dBm |

### CLI Commands — Calix

| Fungsi | Command Sequence |
|--------|-----------------|
| Detail ONT | `show ont {shelf}/{slot}/{port}/{ont_id}` |
| Optical Power ONT | `show ont {shelf}/{slot}/{port}/{ont_id} optics` |
| Daftar ONT | `show ont {shelf}/{slot}/{port} summary` |
| Reboot ONT | `reset ont {shelf}/{slot}/{port}/{ont_id}` |

---

## 14. Network Device Monitoring (MikroTik / Switch / UPS)

Dikelola oleh `NetworkPoller.php`. Data dikumpulkan via SNMP v2c/v3 dan disimpan di RRD files (`/var/lib/nms/rrd/`).

### Perangkat yang Didukung

| Tipe | Vendor | Catatan |
|------|--------|---------|
| `mikrotik` | MikroTik | HR-MIB untuk CPU/RAM; tracking PPPoE session via ifType=23 |
| `switch` | Generic / Dell PowerConnect 8000 | HR-MIB (generic) atau Dell vendor OID |
| `ups` | APC (SURT/SUA series) | RFC 1628 UPS-MIB + **APC PowerNet-MIB fallback** (lihat catatan di bawah) |
| `ups` | Eaton / generic | RFC 1628 UPS-MIB |

> **Catatan APC SURT/SUA series (firmware 416.x):** Bug firmware menyebabkan `upsOutputSource` di RFC 1628 melaporkan `2 (none)` meskipun UPS sedang aktif on-line. Akibatnya seluruh baris tabel output RFC 1628 (voltage/current/load) tidak tersedia. Poller otomatis fallback ke **APC PowerNet-MIB** (`.1.3.6.1.4.1.318`) untuk membaca status dan data output.

### OIDs — System Info (Standard)

| OID | Keterangan |
|-----|-----------|
| `.1.3.6.1.2.1.1.1.0` | sysDescr — Deskripsi sistem |
| `.1.3.6.1.2.1.1.3.0` | sysUpTime — Uptime (centiseconds) |

---

## 15. Traffic Grapher — RRD & Polling Logic

### Penyimpanan Data — RRD (Round Robin Database)

Setiap interface disimpan dalam file `.rrd` terpisah di `/var/lib/nms/rrd/{device_id}/`.

**Format nama file RRD:**

| Interface | Penamaan File | Contoh |
|-----------|--------------|--------|
| Non-PPPoE (physical, VLAN) | `{device_id}/{ifIndex}.rrd` | `5/23.rrd` |
| PPPoE | `{device_id}/name_{slug}.rrd` | `5/name_pppoe_pelanggan1.rrd` |

> PPPoE menggunakan nama (`if_name`) bukan `ifIndex` karena MikroTik assign ulang `ifIndex` baru setiap kali sesi reconnect.

### Struktur RRD

```
rrdtool create <file> --step 60
  DS:in:COUNTER:120:0:U       ← ifHCInOctets  (64-bit counter, heartbeat 120s)
  DS:out:COUNTER:120:0:U      ← ifHCOutOctets (64-bit counter, heartbeat 120s)
  RRA:AVERAGE:0.5:1:1440      ← resolusi 1 menit  × 1 hari
  RRA:AVERAGE:0.5:5:2016      ← resolusi 5 menit  × 7 hari
  RRA:AVERAGE:0.5:60:8760     ← resolusi 1 jam    × 1 tahun
  RRA:AVERAGE:0.5:1440:3650   ← resolusi 1 hari   × 10 tahun
  RRA:MAX:0.5:1:1440
  RRA:MAX:0.5:5:2016
  RRA:MAX:0.5:60:8760
```

- **DS type `COUNTER`**: rrdtool otomatis menghitung rate dari selisih counter antar update → menghasilkan **bytes/second**.
- **Heartbeat 120s**: jika tidak ada update selama 2× step (120 detik), data dianggap `NaN` (tidak diplot).
- **Tidak perlu reset** saat counter wrap (64-bit counter di `ifHCInOctets`/`ifHCOutOctets`).

### Alur Polling Traffic

```
pollDevice()
  └─ pollTraffic()
       ├─ Ambil semua interfaces dari DB (is_monitored=1) untuk device ini
       ├─ snmpWalk ifHCInOctets  (.1.3.6.1.2.1.31.1.1.1.6)   ← satu round-trip
       ├─ snmpWalk ifHCOutOctets (.1.3.6.1.2.1.31.1.1.1.10)  ← satu round-trip
       ├─ snmpWalk ifOperStatus  (.1.3.6.1.2.1.2.2.1.8)      ← satu round-trip
       └─ For each interface:
            ├─ Cocokkan via if_index dari DB
            ├─ Jika if_index tidak ditemukan di walk → skip (PPPoE down)
            ├─ ensureRrd() — buat file .rrd jika belum ada
            ├─ updateRrd() — rrdtool update <file> <ts>:<in_bytes>:<out_bytes>
            └─ Update if_oper_status + last_seen_at di DB
```

> **Kunci**: saat PPPoE session down, `ifIndex`-nya tidak akan muncul di walk → baris di-`skip`, **RRD tidak diupdate**. rrdtool akan menyimpan `NaN` untuk periode tersebut. Data historis sebelum down **tetap terjaga** karena file `.rrd` tidak dihapus.

### Membaca Data Grapher (Chart.js)

`getTrafficData($rrdFile, $range)` memanggil `rrdtool fetch` dan mengkonversi ke bits/s:

```
rrdtool fetch <file> AVERAGE --start <now - window> --end now --resolution <step>
```

| Range | Window | Step |
|-------|--------|------|
| `1h`  | 3600s  | 60s  |
| `6h`  | 21600s | 300s |
| `24h` | 86400s | 1800s |
| `7d`  | 604800s | 3600s |
| `30d` | 2592000s | 86400s |

Konversi: `bytes/s × 8 = bits/s` (output ke Chart.js dalam bps).  
Nilai `nan` dari rrdtool dikonversi ke `null` (Chart.js akan memotong garis di titik tersebut).

---

## 16. PPPoE Grapher — Logic Sesi Up/Down

### Masalah Dasar PPPoE di MikroTik

Setiap kali PPPoE client reconnect, MikroTik **assign `ifIndex` baru** yang berbeda dari sesi sebelumnya. Jika RRD dikunci ke `ifIndex`, data historis akan hilang dan file `.rrd` baru dibuat setiap reconnect.

### Solusi: Key by Interface Name

NMS menggunakan **nama interface** (`if_name`, contoh: `pppoe-pelanggan1`) sebagai kunci permanen:

- File RRD: `name_{slug}.rrd` — tetap sama walau `ifIndex` berubah
- DB record: satu baris per nama PPPoE, `if_index` di-update ke nilai terbaru saat reconnect

### Alur Lengkap Siklus PPPoE

```
┌─────────────────────────────────────────────────────────────────┐
│ SESI PERTAMA KALI (new user)                                    │
│  syncPppoe() → tidak ada di DB → INSERT baris baru              │
│  → ensureRrd("name_pppoe_xxx.rrd") dibuat                       │
│  pollTraffic() → snmpWalk HC → if_index ditemukan → updateRrd() │
└─────────────────────────────────────────────────────────────────┘
             ↓
┌─────────────────────────────────────────────────────────────────┐
│ SESI DISCONNECT (PPPoE down)                                    │
│  syncPppoe() → if_name tidak ada di walk SNMP → tidak ada aksi  │
│  pollTraffic() → if_index tidak ada di walk → SKIP              │
│  → RRD tidak diupdate → rrdtool simpan NaN untuk periode ini    │
│  → Data historis tetap ada, grafik putus di periode down        │
└─────────────────────────────────────────────────────────────────┘
             ↓
┌─────────────────────────────────────────────────────────────────┐
│ SESI RECONNECT (ifIndex baru!)                                  │
│  syncPppoe() → if_name ada di SNMP walk dengan ifIndex baru     │
│  → ifIndex di-update di DB (UPDATE nms_network_interfaces)      │
│  → file .rrd TIDAK diganti (path tetap "name_pppoe_xxx.rrd")    │
│  pollTraffic() → pakai if_index baru → updateRrd() ke file lama │
│  → Grafik dilanjutkan dari titik sebelum disconnect             │
└─────────────────────────────────────────────────────────────────┘
             ↓
┌─────────────────────────────────────────────────────────────────┐
│ TIDAK MUNCUL > 30 HARI (stale cleanup)                         │
│  discoverInterfaces() → cek last_seen_at                        │
│  → DELETE dari DB + unlink file .rrd                            │
│  → PPPOE_STALE_DAYS = 30                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Deteksi PPPoE

Interface PPPoE dideteksi saat `discoverInterfaces()` dengan kriteria (salah satu):
- `ifType = 23` (PPP — RFC 1573)
- Nama interface mengandung string `"pppoe"` (case-insensitive)

Deteksi ini hanya berlaku untuk device bertipe `mikrotik`.

### syncPppoe() — Live Sync per Siklus Poll

`syncPppoe()` dipanggil **setiap menit** (sebelum `pollTraffic()`) dan hanya melakukan:

1. Walk satu OID: `ifName` (`.1.3.6.1.2.1.31.1.1.1.1`) — satu round-trip
2. Filter in-memory: hanya entry yang namanya mengandung `"pppoe"`
3. Untuk setiap nama PPPoE yang ditemukan:
   - Sudah di DB + `ifIndex` sama → tidak ada aksi
   - Sudah di DB + `ifIndex` berbeda (reconnect) → `UPDATE if_index`
   - Belum di DB (sesi baru) → `INSERT` + `ensureRrd()`

> Tujuan: **sesi PPPoE baru langsung mulai digrapher dalam 1 menit** tanpa menunggu `discoverInterfaces()` manual.

### Tabel DB: `nms_network_interfaces`

| Kolom | Keterangan |
|-------|-----------|
| `device_id` | FK ke `nms_network_devices` |
| `if_index` | ifIndex saat ini (berubah setiap reconnect untuk PPPoE) |
| `if_name` | Nama interface — **kunci permanen untuk PPPoE** |
| `if_alias` | Alias/deskripsi |
| `if_type` | 23 = PPP/PPPoE, 6 = ethernetCsmacd, 131 = tunnel, dll |
| `if_speed_mbps` | Kecepatan (Mbps) |
| `if_oper_status` | 1=up, 2=down (diupdate setiap poll) |
| `is_pppoe` | 1 jika PPPoE |
| `is_monitored` | 1 = masuk polling traffic |
| `rrd_file` | Path absolut ke file .rrd |
| `last_seen_at` | Timestamp terakhir muncul di SNMP walk |

> **Catatan**: PPPoE yang tidak muncul selama **7 hari** akan dihapus (stale cleanup). Nilai ini didefinisikan sebagai `PPPOE_STALE_DAYS = 7` di `NetworkPoller.php`.

---

## 17. Network Poller — Arsitektur & Cron

### File Poller

| File | Fungsi |
|------|--------|
| `/var/www/nms/bin/network_poller.php` | Entry point utama, dipanggil oleh cron |
| `/var/www/nms/lib/NetworkPoller.php` | Class utama: poll, discovery, PPPoE sync, UPS, RRD |

### Cron Schedule

```
* * * * *  www-data  php /var/www/nms/bin/network_poller.php
```

Berjalan **setiap menit**. Lock file di `/tmp/nms_network_poller.lock` mencegah overlap jika run sebelumnya belum selesai.

### Arsitektur Parallel (pcntl_fork)

```
network_poller.php
  ├─ Lock file check (flock LOCK_NB) → exit jika masih ada yang berjalan
  ├─ Ambil semua active devices dari DB
  ├─ Load Telegram settings (token, chat_id, flags notify)
  ├─ Jika pcntl_fork tidak tersedia → sequential fallback
  └─ Parallel:
       ├─ Split devices ke batches (ceil(total / maxWorkers))
       ├─ maxWorkers = 10 (parallel fork workers)
       ├─ Untuk setiap batch: pcntl_fork() → child process
       │    ├─ Database::resetInstance() (tiap child punya koneksi DB sendiri)
       │    ├─ new NetworkPoller()
       │    └─ For each device: pollDevice($dev)
       └─ Parent: pcntl_waitpid() untuk semua child
```

### Alur pollDevice()

```
pollDevice($dev)
  1. snmpGet sysDescr (.1.3.6.1.2.1.1.1.0)
     └─ Gagal/null → setStatus(down) + event('down') + Telegram alert → return
  2. snmpGet sysUpTime (.1.3.6.1.2.1.1.3.0)
  3. getCpuMem()
     ├─ MikroTik/Switch (generic): HR-MIB (hrProcessorLoad, hrStorage)
     ├─ Dell: vendor OID CPU string + scalar KB memory
     └─ UPS: skip (tidak poll CPU/RAM)
  4. setStatus(up, uptime, sysDescr, cpu, memUsed, memTotal) → UPDATE DB
  5. event('up') — hanya fire jika sebelumnya status=down (state-change only)
  6. Routing berdasarkan type:
     ├─ 'ups'      → pollUpsEvents()
     └─ lainnya    → syncPppoe() [hanya mikrotik] + pollTraffic()
```

### Flag & Opsi CLI

| Flag | Fungsi |
|------|--------|
| `--discover` | Force `discoverInterfaces()` untuk semua device sebelum poll |

Contoh penggunaan manual:
```bash
php /var/www/nms/bin/network_poller.php --discover
```

### Event Throttling

| Event | Kondisi fire |
|-------|-------------|
| `up` | Hanya saat `last_status` berubah dari 0 → 1 |
| `down` | Hanya saat `last_status` berubah dari 1 → 0 |
| `ups_*` | Throttle 5 menit — tidak spam setiap poll cycle |

### Notifikasi Telegram

Telegram alert dikirim untuk:
- **Device up/down**: `setTelegramConfig(token, chatId, upsEnabled, devEnabled)`
- **UPS events**: battery low/depleted, on battery, low runtime, overload, alarm

Settings diambil dari tabel `nms_settings`:

| Key | Keterangan |
|-----|-----------|
| `telegram_bot_token` | Bot token Telegram |
| `telegram_chat_id` | Chat/group ID tujuan |
| `ups_notify_enabled` | `1` = aktifkan alert UPS |
| `device_notify_enabled` | `1` = aktifkan alert device up/down |

---

## 18. Standard Interface OIDs (IF-MIB)

Digunakan oleh semua tipe device (OLT, MikroTik, Switch) untuk interface discovery dan traffic polling.

### IF-MIB (RFC 2863) — Walk per table

| OID | Keterangan |
|-----|-----------|
| `.1.3.6.1.2.1.2.2.1.2` | ifDescr — Nama/deskripsi interface |
| `.1.3.6.1.2.1.2.2.1.3` | ifType — Tipe interface (23=PPP/PPPoE, 24=loopback) |
| `.1.3.6.1.2.1.2.2.1.5` | ifSpeed — Kecepatan interface (bps) |
| `.1.3.6.1.2.1.2.2.1.8` | ifOperStatus — Status operasional (1=up, 2=down) |
| `.1.3.6.1.2.1.31.1.1.1.1` | ifName — Nama interface (IF-MIB extension) |
| `.1.3.6.1.2.1.31.1.1.1.18` | ifAlias — Alias/deskripsi interface |
| `.1.3.6.1.2.1.31.1.1.1.15` | ifHighSpeed — Kecepatan (Mbps) |
| `.1.3.6.1.2.1.31.1.1.1.6`  | ifHCInOctets — Traffic masuk (64-bit counter, bytes) |
| `.1.3.6.1.2.1.31.1.1.1.10` | ifHCOutOctets — Traffic keluar (64-bit counter, bytes) |
| `.1.3.6.1.2.1.31.1.1.1.7`  | ifHCInUcastPkts — Paket unicast masuk (64-bit) |
| `.1.3.6.1.2.1.31.1.1.1.11` | ifHCOutUcastPkts — Paket unicast keluar (64-bit) |
| `.1.3.6.1.2.1.31.1.1.1.8`  | ifHCInMulticastPkts — Paket multicast masuk (64-bit) |
| `.1.3.6.1.2.1.31.1.1.1.12` | ifHCOutMulticastPkts — Paket multicast keluar (64-bit) |
| `.1.3.6.1.2.1.31.1.1.1.9`  | ifHCInBroadcastPkts — Paket broadcast masuk (64-bit) |
| `.1.3.6.1.2.1.31.1.1.1.13` | ifHCOutBroadcastPkts — Paket broadcast keluar (64-bit) |
| `.1.3.6.1.2.1.2.2.1.13` | ifInDiscards — Paket masuk yang dibuang (32-bit) |
| `.1.3.6.1.2.1.2.2.1.19` | ifOutDiscards — Paket keluar yang dibuang (32-bit) |
| `.1.3.6.1.2.1.2.2.1.14` | ifInErrors — Error paket masuk (32-bit) |
| `.1.3.6.1.2.1.2.2.1.20` | ifOutErrors — Error paket keluar (32-bit) |

**Catatan untuk PON port (ZTE C300)**: Index adalah ifIndex dari port `gpon_S/P` (Format A: `0x11{01}{slot}{port}`). Counter di atas merepresentasikan total traffic **seluruh ONT** di PON port tersebut. Statistik per-ONT via SNMP tidak tersedia pada ZTE C300 (hanya OMCI).

**Kalkulasi rate NMS**: Server menyimpan snapshot counter per OLT di `cache/if_rates_{id}.json`. Delta counter dibagi interval waktu (detik) menghasilkan `in_bps`/`out_bps`. Rate hanya valid jika interval 5–300 detik.

### HOST-RESOURCES-MIB (RFC 2790) — CPU & RAM

| OID | Keterangan |
|-----|-----------|
| `.1.3.6.1.2.1.25.3.3.1.2` | hrProcessorLoad — CPU load per CPU (%) |
| `.1.3.6.1.2.1.25.2.3.1.2` | hrStorageType — Tipe storage |
| `.1.3.6.1.2.1.25.2.3.1.4` | hrStorageAllocationUnits — Ukuran unit alokasi |
| `.1.3.6.1.2.1.25.2.3.1.5` | hrStorageSize — Total ukuran (dalam units) |
| `.1.3.6.1.2.1.25.2.3.1.6` | hrStorageUsed — Terpakai (dalam units) |

> RAM teridentifikasi jika `hrStorageType` berakhiran `.2` (`hrStorageRam`).

### Dell PowerConnect 8000 — Vendor-Specific CPU/RAM

| OID | Keterangan | Format |
|-----|-----------|--------|
| `.1.3.6.1.4.1.674.10895.5000.2.6132.1.1.1.1.4.9.0` | CPU String | String: `"5 Secs (X%) 60 Secs (Y%) 300 Secs (Z%)"` — ambil 60 Secs |
| `.1.3.6.1.4.1.674.10895.5000.2.6132.1.1.1.1.4.1.0` | Memory Available | KB |
| `.1.3.6.1.4.1.674.10895.5000.2.6132.1.1.1.1.4.2.0` | Memory Total | KB |

### UPS-MIB (RFC 1628)

#### Identitas

| OID | Keterangan |
|-----|-----------|
| `.1.3.6.1.2.1.33.1.1.2.0` | upsIdentModel — Model UPS |
| `.1.3.6.1.2.1.33.1.1.3.0` | upsIdentFirmwareVersion |
| `.1.3.6.1.2.1.33.1.1.4.0` | upsIdentAgentSoftwareVersion |

#### Battery

| OID | Keterangan | Satuan / Nilai |
|-----|-----------|-----------|
| `.1.3.6.1.2.1.33.1.2.1.0` | upsBatteryStatus | 1=unknown, 2=normal, **3=low**, **4=depleted** |
| `.1.3.6.1.2.1.33.1.2.2.0` | upsSecondsOnBattery | seconds |
| `.1.3.6.1.2.1.33.1.2.3.0` | upsEstimatedMinutesRemaining | menit |
| `.1.3.6.1.2.1.33.1.2.4.0` | upsEstimatedChargeRemaining | % |
| `.1.3.6.1.2.1.33.1.2.5.0` | upsBatteryVoltage | 0.1 V |
| `.1.3.6.1.2.1.33.1.2.6.0` | upsBatteryCurrent | 0.1 A |
| `.1.3.6.1.2.1.33.1.2.7.0` | upsBatteryTemperature | °C |

#### Input

| OID | Keterangan | Satuan |
|-----|-----------|--------|
| `.1.3.6.1.2.1.33.1.3.2.0` | upsInputNumLines | jumlah line |
| `.1.3.6.1.2.1.33.1.3.3.1.2.1` | upsInputFrequency | 0.1 Hz |
| `.1.3.6.1.2.1.33.1.3.3.1.3.1` | upsInputVoltage | V RMS |
| `.1.3.6.1.2.1.33.1.3.3.1.4.1` | upsInputCurrent | 0.1 A RMS |
| `.1.3.6.1.2.1.33.1.3.3.1.5.1` | upsInputTruePower | W |

#### Output

| OID | Keterangan | Satuan / Nilai |
|-----|-----------|-----------|
| `.1.3.6.1.2.1.33.1.4.1.0` | upsOutputSource | 1=other, 2=none, 3=normal, 4=bypass, **5=battery**, 6=booster, 7=reducer |
| `.1.3.6.1.2.1.33.1.4.2.0` | upsOutputFrequency | 0.1 Hz |
| `.1.3.6.1.2.1.33.1.4.3.0` | upsOutputNumLines | jumlah line |
| `.1.3.6.1.2.1.33.1.4.4.1.2.1` | upsOutputVoltage | V RMS |
| `.1.3.6.1.2.1.33.1.4.4.1.3.1` | upsOutputCurrent | 0.1 A RMS |
| `.1.3.6.1.2.1.33.1.4.4.1.4.1` | upsOutputPower | W |
| `.1.3.6.1.2.1.33.1.4.4.1.5.1` | upsOutputPercentLoad | % |

#### Alarm

| OID | Keterangan |
|-----|-----------|
| `.1.3.6.1.2.1.33.1.6.1.0` | upsAlarmsPresent — jumlah alarm aktif |

**Alert Telegram** dikirim ketika:
- `upsBatteryStatus` = 3 (low) atau 4 (depleted)
- `upsOutputSource` = 5 (on battery)
- `upsEstimatedMinutesRemaining` < threshold (configurable)
- `upsAlarmsPresent` > 0

> **Keterbatasan SURT2000:** OID `upsBatteryCurrent` (.33.1.2.6.0) dan `upsOutputCurrent` (.33.1.4.4.1.3.1) **tidak tersedia** pada APC SURT2000 dengan firmware 416.8.I (dikembalikan `noSuchName`).

---

### APC PowerNet-MIB — Fallback untuk SURT/SUA Series

**Enterprise OID**: `.1.3.6.1.4.1.318.1.1.1`  
**Versi SNMP**: v1 atau v2c  
**Berlaku untuk**: APC Smart-UPS RT (SURT), Smart-UPS (SUA), dan model lain yang melaporkan `upsOutputSource=none` saat on-line  
**Trigger fallback**: Diaktifkan otomatis oleh poller saat `upsOutputSource` RFC 1628 = `0` atau `2 (none)`

#### Battery (APC)

| OID | Keterangan | Satuan / Nilai |
|-----|-----------|--------|
| `.1.3.6.1.4.1.318.1.1.1.2.1.1.0` | `upsBasicBatteryStatus` | 2=batteryNormal, 3=batteryLow |
| `.1.3.6.1.4.1.318.1.1.1.2.2.1.0` | `upsAdvBatteryCapacity` | % |
| `.1.3.6.1.4.1.318.1.1.1.2.2.2.0` | `upsAdvBatteryTemperature` | °C |
| `.1.3.6.1.4.1.318.1.1.1.2.2.3.0` | `upsAdvBatteryRunTimeRemaining` | Timeticks ÷ 6000 = menit |
| `.1.3.6.1.4.1.318.1.1.1.2.2.8.0` | `upsAdvBatteryActualVoltage` | V (integer langsung, bukan ×10) |

> Tidak ada OID **battery current** yang tersedia di SURT2000.

#### Input (APC)

| OID | Keterangan | Satuan |
|-----|-----------|--------|
| `.1.3.6.1.4.1.318.1.1.1.3.2.1.0` | `upsBasicInputVoltage` | V (integer) |
| `.1.3.6.1.4.1.318.1.1.1.3.2.4.0` | `upsBasicInputFrequency` | Hz (integer langsung, bukan ×10) |
| `.1.3.6.1.4.1.318.1.1.1.3.3.1.0` | `upsAdvInputLineVoltage` | 0.1 V |
| `.1.3.6.1.4.1.318.1.1.1.3.3.4.0` | `upsAdvInputFrequency` | 0.1 Hz |

> Tidak ada OID **input current** yang tersedia di SURT2000 (`noSuchName`).

#### Output (APC)

| OID | Keterangan | Satuan / Nilai |
|-----|-----------|--------|
| `.1.3.6.1.4.1.318.1.1.1.4.1.1.0` | `upsBasicOutputStatus` | **2=onLine**, 3=onBattery, 4=onSmartBoost, 12=onSmartTrim |
| `.1.3.6.1.4.1.318.1.1.1.4.2.1.0` | `upsBasicOutputVoltage` | V (integer) |
| `.1.3.6.1.4.1.318.1.1.1.4.2.2.0` | `upsBasicOutputFrequency` | Hz (integer langsung, bukan ×10) |
| `.1.3.6.1.4.1.318.1.1.1.4.2.3.0` | `upsBasicOutputLoad` | % |
| `.1.3.6.1.4.1.318.1.1.1.4.3.1.0` | `upsAdvOutputVoltage` | 0.1 V (lebih presisi) |
| `.1.3.6.1.4.1.318.1.1.1.4.3.2.0` | `upsAdvOutputFrequency` | 0.1 Hz |
| `.1.3.6.1.4.1.318.1.1.1.4.3.3.0` | `upsAdvOutputActivePower` | **W (watt)** — digunakan sebagai `output_power` |

> **OID `.4.2.6.0` tidak digunakan** — dikembalikan `0` pada SURT2000 (kemungkinan `upsBasicOutputVA` yang tidak diimplementasikan).  
> **Tidak ada OID output current** (`upsAdvOutputCurrent` `.4.3.4.0` → `noSuchName` di SURT2000).

#### Pemetaan Status ke RFC 1628

| APC `upsBasicOutputStatus` | Ekuivalen RFC 1628 `upsOutputSource` | Label |
|--------------------------|--------------------------------------|-------|
| 2 (onLine) | 3 (normal) | normal |
| 3 (onBattery) | 5 (battery) | battery |
| 4 (onSmartBoost) | 6 (booster) | booster |
| 12 (onSmartTrim) | 7 (reducer) | reducer |
| 6 (onBypass) | 4 (bypass) | bypass |

---

## 19. Catatan SSH / CLI Umum

### ZTE C300 — Khusus

```
SSH Options wajib:
  -o KexAlgorithms=diffie-hellman-group14-sha1
  -o HostKeyAlgorithms=+ssh-rsa
  -o Ciphers=aes128-cbc,3des-cbc

- ZTE TIDAK support SSH exec channel (non-interactive)
- Harus pakai expect/interactive session
- Prompt pattern: {.*[>#$]}
- Kirim "terminal length 0" setelah login untuk disable paging
- "--More--" paged output akan memakan karakter pertama send berikutnya
- "quit" memunculkan prompt konfirmasi "confirm to logout without saving? [yes/no]"
- Waktu normal sesi: ~5-7 detik
- Kredensial default: zte / zte
```

### Prompt Pattern per Vendor

| Vendor | Prompt Pattern |
|--------|---------------|
| ZTE | `{.*[>#$]}` |
| Huawei | `{.*[>#]}` |
| FiberHome | `{.*[>#]}` |
| BDCOM | `{.*[>#]}` |
| C-Data | `{.*[>#]}` |
| Dasan | `{.*[>#$]}` |
| VSOL | `{.*[>#]}` |
| Raisecom | `{.*[>#$]}` |
| Nokia | `{.*[#>$]}` |
| TP-Link | `{.*[>#]}` |
| Calix | `{.*[>#]}` |

### Perintah Konfirmasi

| Vendor | Trigger | Konfirmasi yang dikirim |
|--------|---------|------------------------|
| ZTE | `reboot` ONT | `yes` |
| Raisecom | `reboot` ONT | `yes` |

---

## 20. Checklist Deployment Lokasi Baru

Gunakan checklist ini saat menambahkan OLT atau network device di lokasi baru:

### OLT Baru

- [ ] Tentukan vendor dan model OLT
- [ ] Aktifkan SNMP v2c pada OLT, set community string (read-only cukup untuk monitoring)
- [ ] Pastikan port SNMP (161/UDP) bisa diakses dari server NMS
- [ ] Untuk ZTE: pastikan SSH menggunakan cipher yang kompatibel (lihat Catatan SSH di atas)
- [ ] Verifikasi OID serial number (SN) bisa dibaca: `snmpwalk -v2c -c {community} {host} {OID_ONT_SN}`
- [ ] Verifikasi OID RX Power bisa dibaca dan nilai masuk akal (misal -15 s/d -27 dBm)
- [ ] Input OLT ke database NMS: host IP, community, vendor, port range PON
- [ ] Jalankan discovery PON ports (walk ifName/ifDescr untuk dapat ifIndex)
- [ ] Test CLI login manual sebelum didaftarkan ke NMS
- [ ] Verifikasi `terminal length 0` (ZTE) / paging disabled agar output tidak terpotong

### Network Device (MikroTik / Switch)

- [ ] Aktifkan SNMP v2c atau v3 pada perangkat
- [ ] Pastikan `ifHCInOctets` / `ifHCOutOctets` tersedia (64-bit counter)
- [ ] Untuk Dell PowerConnect: gunakan OID vendor-specific CPU/RAM (bukan HR-MIB)
- [ ] Jalankan `discoverInterfaces` via NMS (atau `network_poller.php --discover`) untuk auto-detect semua interface
- [ ] Tandai interface yang ingin dimonitor (`is_monitored = 1`)
- [ ] Verifikasi direktori RRD ada dan writable: `/var/lib/nms/rrd/{device_id}/`
- [ ] Verifikasi `rrdtool` tersedia di server: `which rrdtool`
- [ ] Pastikan cron poller aktif: `* * * * * www-data php /var/www/nms/bin/network_poller.php`
- [ ] Pastikan `pcntl` PHP extension aktif untuk parallel polling: `php -m | grep pcntl`

### MikroTik dengan PPPoE

- [ ] Aktifkan SNMP di MikroTik: `/snmp set enabled=yes community=public`
- [ ] Verifikasi `ifHCInOctets`/`ifHCOutOctets` bisa dibaca untuk interface fisik
- [ ] Verifikasi interface PPPoE muncul di SNMP walk dengan nama yang konsisten (sesuai PPP profile)
- [ ] Pastikan `ifType=23` atau nama interface mengandung "pppoe" agar terdeteksi sebagai PPPoE
- [ ] Setelah device didaftarkan, tunggu 1 menit: `syncPppoe()` akan otomatis detect sesi aktif
- [ ] Verifikasi file RRD dibuat dengan prefix `name_`: `ls /var/lib/nms/rrd/{device_id}/name_*.rrd`
- [ ] Cek grafik tidak hilang setelah simulasi reconnect (file `.rrd` harus tetap sama)
- [ ] Pastikan `PPPOE_STALE_DAYS = 30` sesuai kebutuhan (entri tidak muncul > 30 hari akan dihapus)

### UPS Baru

- [ ] Aktifkan SNMP v1 atau v2c pada UPS NMC/management module
- [ ] Verifikasi RFC 1628 UPS-MIB tersedia: `snmpget -v1 -c {community} {host} .1.3.6.1.2.1.33.1.1.2.0`
- [ ] Verifikasi output source RFC 1628: `snmpget -v1 -c {community} {host} .1.3.6.1.2.1.33.1.4.1.0`
  - Jika hasilnya `2 (none)` padahal UPS sedang on-line → **APC firmware bug** → poller akan otomatis fallback ke PowerNet-MIB
  - Verifikasi fallback: `snmpget -v1 -c {community} {host} .1.3.6.1.4.1.318.1.1.1.4.1.1.0` → harus `2 (onLine)`
- [ ] Walk seluruh UPS-MIB untuk cek OID tersedia: `snmpwalk -v1 -c {community} {host} .1.3.6.1.2.1.33`
- [ ] Untuk APC: walk PowerNet-MIB: `snmpwalk -v1 -c {community} {host} .1.3.6.1.4.1.318.1.1.1`
- [ ] Set threshold battery low / runtime low di config NMS
- [ ] Konfigurasi Telegram token + chat ID untuk alert notifikasi: isi di tabel `nms_settings`
- [ ] Test manual trigger alert dengan mensimulasikan kondisi battery low

### Verifikasi Poller Berjalan

```bash
# Cek lock file (jika ada, poller sedang berjalan)
ls -la /tmp/nms_network_poller.lock

# Jalankan manual dengan output debug
php /var/www/nms/bin/network_poller.php

# Force re-discover semua interface
php /var/www/nms/bin/network_poller.php --discover

# Cek file RRD terbentuk dan diupdate
ls -la /var/lib/nms/rrd/{device_id}/
rrdtool lastupdate /var/lib/nms/rrd/{device_id}/{ifIndex}.rrd

# Preview data RRD 1 jam terakhir
rrdtool fetch /var/lib/nms/rrd/{device_id}/name_pppoe_xxx.rrd AVERAGE \
  --start -3600 --end now --resolution 60
```

---

## 21. GenieACS — TR-069 Management

NMS menggunakan **GenieACS v1.2.13** sebagai ACS (Auto Configuration Server) untuk manajemen CPE via protokol TR-069.

### Infrastruktur

| Komponen | URL / Port | Keterangan |
|----------|-----------|------------|
| GenieACS CWMP | `http://{server}:7547` | Endpoint CPE (TR-069) |
| GenieACS NBI | `http://127.0.0.1:7557` | REST API untuk query device/params |
| GenieACS UI | `http://{server}:3000` | Web UI administrasi GenieACS |
| GenieACS FS | `http://{server}:7567` | File Server (firmware upload) |

**Source code integrasi NMS**: `/var/www/nms/lib/GenieACS.php`

### Virtual Parameters (VP)

Virtual Parameters di-deploy via GenieACS NBI. Script disimpan di `/tmp/vp_NAMA.js` lalu di-PUT:

```bash
curl -X PUT "http://localhost:7557/virtual_parameters/NAMA" \
  -H "Content-Type: application/javascript" \
  --data-binary @/tmp/vp_NAMA.js
```

#### Daftar Virtual Parameters Aktif

| Nama VP | Parameter Sumber | Keterangan |
|---------|-----------------|------------|
| `DeviceUptime` | `Device.DeviceInfo.UpTime` | Uptime perangkat (detik) |
| `SerialNumber` | `Device.DeviceInfo.SerialNumber` / `InternetGatewayDevice.DeviceInfo.SerialNumber` | SN CPE, fallback ke IGD |
| `PPPoEUsername` | `Device.*.PPP.*.Username` / `InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Username` | Username PPPoE aktif |
| `IPAddress` | `Device.*.IP.Interface.*.IPv4Address.*.IPAddress` | IP WAN |
| `MACAddress` | `Device.Ethernet.Interface.*.MACAddress` | MAC address WAN |
| `remoteweb` | Virtual — baca `Device.X_HW_DEBUG.WEBTelnet.Telnet_Enable` (Huawei) / `Device.X_ZTE-COM_RemoteManagement.HTTPEnable` (ZTE) | Status remote web access CPE |

> **Catatan Nokia G-1425G-H**: Parameter remote web akses menggunakan `Device.X_ALCL-COM_WebConfig.RemoteAccessEnable`. VP `remoteweb` mendeteksi vendor dari OUI dan membaca parameter yang sesuai.

### Nokia ALCL G-1425G-H — Catatan Firmware

Beberapa firmware Nokia G-1425G-H memiliki masalah dengan TR-069 parameter path untuk optical power dan ethernet statistics. Pastikan untuk menggunakan firmware versi terbaru yang mengimplementasikan `Device.Optical.Interface` dan `Device.Ethernet.Interface` dengan benar.

### GenieACS NBI — Query Examples

```bash
# List semua CPE terdaftar
curl -u admin:admin "http://localhost:7557/devices"

# Cari CPE berdasarkan Serial Number
curl -u admin:admin "http://localhost:7557/devices/?query=%7B%22SerialNumber%22%3A%22FD5B7A5B7A5B%22%7D"

# Baca parameter spesifik dari CPE
curl -u admin:admin "http://localhost:7557/devices/{device_id}/tasks" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"name":"getParameterValues","parameterNames":["Device.DeviceInfo.SerialNumber"]}'
```

### Provisions

Provisions di-deploy ke GenieACS dan diasosiasikan ke preset:

```bash
curl -X PUT "http://localhost:7557/provisions/NAMA" \
  -H "Content-Type: application/javascript" \
  --data-binary @/tmp/provision_NAMA.js
```

#### Daftar Provisions Aktif

| Nama Provision | Fungsi |
|---------------|--------|
| `default` | Provision utama — refresh parameter standar (SN, uptime, IP, MAC, PPPoE username) |
| `remoteweb_enable` | Set parameter remote web CPE ke `true`/`1` sesuai vendor |
| `remoteweb_disable` | Set parameter remote web CPE ke `false`/`0` sesuai vendor |

### Presets

Preset mengontrol kapan provision dijalankan.

| Nama Preset | Provision | Kondisi / Jadwal |
|-------------|-----------|------------------|
| `inform` | `default` | Setiap CPE kirim Inform (event-driven) |
| `remoteweb_on` | `remoteweb_enable` | Tag `remoteweb_enable` di-set pada device |
| `remoteweb_off` | `remoteweb_disable` | Tag `remoteweb_disable` di-set pada device |

### Nokia ALCL G-1425G-H — Parameter TR-069 Spesifik

**OUI**: `000AC2` (Nokia/ALCL)  
**ProductClass**: `G-1425G-H`

#### Parameter Penting

| Parameter TR-069 | Keterangan | Tipe |
|-----------------|-----------|------|
| `Device.DeviceInfo.SerialNumber` | Serial number ONT | string |
| `Device.DeviceInfo.SoftwareVersion` | Versi firmware aktif | string |
| `Device.DeviceInfo.HardwareVersion` | Versi hardware | string |
| `Device.DeviceInfo.UpTime` | Uptime (detik) | unsignedInt |
| `Device.ManagementServer.URL` | URL ACS (CWMP endpoint) | string |
| `Device.ManagementServer.Username` | Username koneksi ke ACS | string |
| `Device.X_ALCL-COM_WebConfig.RemoteAccessEnable` | Enable/disable remote web access | boolean |
| `Device.X_ALCL-COM_WebConfig.RemoteAccessPort` | Port remote web (default 8080) | unsignedInt |
| `Device.IP.Interface.1.IPv4Address.1.IPAddress` | IP WAN interface | string |
| `Device.PPP.Interface.1.Username` | PPPoE username | string |
| `Device.Ethernet.Interface.1.MACAddress` | MAC WAN | string |

#### GenieACS UI Config (`ui.device.10`)

Konfigurasi tampilan device di GenieACS UI untuk Nokia G-1425G-H. Tersimpan di MongoDB collection `ui` dengan ID `device.10`.

Custom columns yang ditampilkan:
- Serial Number, Software Version, Hardware Version
- IP Address (VP `IPAddress`), PPPoE Username (VP `PPPoEUsername`)
- Remote Web Status (VP `remoteweb`)
- Uptime (VP `DeviceUptime`)

---

## 22. Auto Register ONT (AutoRegis)

Fitur AutoRegis memungkinkan OLT ZTE melakukan registrasi ONT baru secara otomatis. ONT yang belum terdaftar (uncfg) dideteksi via CLI Telnet, lalu dikonfigurasi dengan service-port (VLAN) dan TR-069 management.

### Arsitektur

```
NMS Web UI (/autoregis)
    │
    ├─ Buat / Edit Job → simpan ke DB (autoregis_jobs)
    ├─ Enable Job → generate Python script + systemd unit → start service
    └─ Riwayat registrasi ← POST dari Python script ke /api/autoregis/log

systemd: autoregis_job_{id}.service
    └─ python3 /var/www/nms/scripts/autoregis/job_{id}.py
         ├─ Telnet ke OLT (port 23)
         ├─ Login, optional: send "enable" + enable_password
         ├─ Loop setiap 30 detik:
         │    ├─ show gpon onu uncfg (semua PON port)
         │    ├─ Untuk tiap ONT uncfg:
         │    │    ├─ configure terminal
         │    │    ├─ interface gpon-olt_{slot}/{port}
         │    │    ├─ onu {id} type auto sn {SN}
         │    │    ├─ exit
         │    │    ├─ interface gpon-onu_{slot}/{port}:{id}
         │    │    ├─ tcont 1 profile 1G
         │    │    ├─ gemport 1 tcont 1
         │    │    ├─ service-port 1 vport 1 user-vlan {vlan_acs} vlan {vlan_acs}   (ACS/TR-069)
         │    │    ├─ service-port 2 vport 1 user-vlan {vlan_internet} vlan {vlan_internet}
         │    │    ├─ service-port 3 vport 1 user-vlan {vlan_extra} vlan {vlan_extra}
         │    │    ├─ exit
         │    │    ├─ pon-onu-mng gpon-onu_{slot}/{port}:{id}
         │    │    ├─ tr069-mgmt 1 ipv4-index 1 vlan {vlan_acs}
         │    │    ├─ exit
         │    │    └─ POST hasil ke /api/autoregis/log
         │    └─ write (simpan config OLT)
         └─ Reconnect otomatis jika koneksi putus
```

### Script yang Ada (Legacy)

| Script | OLT | Keterangan |
|--------|-----|------------|
| `/root/autoregis.py` | `192.168.11.104` (ZTE C300 TRC) | Tanpa `enable`, ACS user `acsNet` |
| `/root/autoregisTRC.py` | `192.168.11.103` (ZTE C300 Mini PDT) | Dengan `enable`, enable pass `zxr10`, ACS user `admin` |

> Script legacy ini dibiarkan berjalan sebagaimana adanya (`autoregisOLT.service`, `autoregisTRC.service`). Job baru dikelola via NMS web UI.

### Database Schema

#### Tabel `autoregis_jobs`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | int AUTO_INCREMENT | PK |
| `name` | varchar(100) | Nama job (label) |
| `host` | varchar(255) | IP / hostname OLT |
| `username` | varchar(100) | Username login OLT (default: `zte`) |
| `password` | varchar(255) | Password login OLT (default: `zte`) |
| `enable_password` | varchar(255) | Password `enable` mode (kosong = skip) |
| `acs_url` | varchar(255) | CWMP endpoint ACS (default: `http://192.168.10.52:7547`) |
| `acs_username` | varchar(100) | Username CWMP |
| `acs_password` | varchar(255) | Password CWMP |
| `vlan_acs` | int | VLAN untuk TR-069/ACS (default: 100) |
| `vlan_internet` | int | VLAN internet (default: 200) |
| `vlan_extra` | int | VLAN ekstra (default: 300) |
| `vlan_def` | int | Default VLAN ONU (default: 200) |
| `is_enabled` | tinyint(1) | 1 = service systemd aktif |
| `created_at` | timestamp | Waktu pembuatan |
| `updated_at` | timestamp | Waktu terakhir update |

#### Tabel `autoregis_history`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | bigint AUTO_INCREMENT | PK |
| `job_id` | int | FK ke `autoregis_jobs.id` |
| `job_name` | varchar(100) | Nama job (snapshot saat registrasi) |
| `olt_host` | varchar(255) | IP OLT |
| `sn` | varchar(64) | Serial Number ONT |
| `frame` | varchar(10) | Frame/shelf index |
| `slot` | varchar(10) | Slot OLT |
| `port` | varchar(10) | PON port |
| `onu_index` | int | Nomor ONU pada port tersebut |
| `status` | enum | `success` / `failed` |
| `message` | text | Pesan hasil / error |
| `registered_at` | timestamp | Waktu registrasi |

### Systemd Service

Setiap job yang di-enable membuat unit file di `/etc/systemd/system/autoregis_job_{id}.service`:

```ini
[Unit]
Description=AutoRegis ONT Job {id} — {name}
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/python3 /var/www/nms/scripts/autoregis/job_{id}.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Script Python disimpan di `/var/www/nms/scripts/autoregis/job_{id}.py`.

### API Endpoints

| Method | URL | Fungsi | Role |
|--------|-----|--------|------|
| GET | `/api/autoregis/list` | Daftar job + status service | semua |
| POST | `/api/autoregis/save` | Buat / update job | admin, operator |
| POST | `/api/autoregis/toggle` | Enable / disable job (start/stop systemd) | admin |
| POST | `/api/autoregis/delete` | Hapus job + stop service + hapus script | admin |
| GET | `/api/autoregis/history` | Riwayat registrasi (paginated, 50/hal) | semua |
| GET | `/api/autoregis/status` | Status systemd + journal log job | semua |
| GET | `/api/autoregis/onu_types` | Daftar tipe ONU yang didukung untuk autoregistration | admin, operator |
| POST | `/api/autoregis/log` | Terima log dari Python script (localhost only) | internal |

### Sudoers — `www-data` Permissions

File: `/etc/sudoers.d/nms-autoregis`

```
# NMS AutoRegis — allow www-data to manage autoregis systemd services
www-data ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/systemd/system/autoregis_job_*.service
www-data ALL=(ALL) NOPASSWD: /bin/systemctl daemon-reload
www-data ALL=(ALL) NOPASSWD: /bin/systemctl start autoregis_job_*.service
www-data ALL=(ALL) NOPASSWD: /bin/systemctl stop autoregis_job_*.service
www-data ALL=(ALL) NOPASSWD: /bin/systemctl enable autoregis_job_*.service
www-data ALL=(ALL) NOPASSWD: /bin/systemctl disable autoregis_job_*.service
www-data ALL=(ALL) NOPASSWD: /bin/systemctl status autoregis_job_*.service
www-data ALL=(ALL) NOPASSWD: /bin/rm -f /etc/systemd/system/autoregis_job_*.service
www-data ALL=(ALL) NOPASSWD: /usr/bin/journalctl -u autoregis_job_*.service -n * --no-pager
```

> `is-active` **tidak** perlu sudo — `systemctl is-active` bisa dijalankan oleh user biasa.

### Deployment & Troubleshooting

```bash
# Cek status semua job autoregis
systemctl list-units 'autoregis_job_*.service'

# Lihat log realtime job tertentu
journalctl -u autoregis_job_1.service -f

# Cek DB riwayat registrasi hari ini
mysql -u nms -p'SurgaNMS@2026!' nms \
  -e "SELECT job_name, sn, slot, port, onu_index, status, registered_at \
      FROM autoregis_history WHERE DATE(registered_at)=CURDATE() ORDER BY registered_at DESC LIMIT 20;"

# Validasi sudoers
visudo -c

# Test sudoers dari www-data (non-interactive)
sudo -u www-data sudo -n /bin/systemctl status autoregis_job_1.service

# Cek script yang di-generate
ls -la /var/www/nms/scripts/autoregis/

# Pastikan Python3 + telnetlib tersedia
python3 -c "import telnetlib; print('OK')"
```

### Checklist Deployment AutoRegis di Lokasi Baru

- [ ] Buat DB tables: `autoregis_jobs` dan `autoregis_history` (schema di atas)
- [ ] Buat direktori scripts: `mkdir -p /var/www/nms/scripts/autoregis && chown www-data:www-data /var/www/nms/scripts/autoregis`
- [ ] Buat file sudoers: `/etc/sudoers.d/nms-autoregis` (isi seperti di atas), `chmod 440`
- [ ] Validasi: `visudo -c`
- [ ] Pastikan `python3` tersedia dan `telnetlib` bisa diimport
- [ ] Pastikan server bisa Telnet ke OLT port 23 (`telnet {host} 23`)
- [ ] Akses NMS → menu **Auto Regis ONT** → buat job baru
- [ ] Isi: nama, IP OLT, credentials, VLAN (ACS/internet/extra/def), ACS URL + credentials
- [ ] Klik **Enable** — service akan start otomatis
- [ ] Monitor riwayat di tab History atau via `journalctl -u autoregis_job_{id}.service -f`

---

*Dokumen ini di-generate dari source code `/var/www/nms/lib/vendors/*.php`, `/var/www/nms/lib/NetworkPoller.php`, `/var/www/nms/bin/network_poller.php`, `/var/www/nms/api/autoregis/`, dan `/root/autoregis*.py`. Terakhir diperbarui: Juli 2026 (perbaikan: PPPOE_STALE_DAYS=7, penambahan API endpoint onu_types, update vendor files ZTE/Huawei/FiberHome/Raisecom/VSOL/BDCOM/Calix/CDATA/Dasan/HSGQ/VSOL).*
