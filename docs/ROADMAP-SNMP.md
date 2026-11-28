# Rencana Monitoring SNMP — tahap berikutnya

Status per 25 November 2026. Ini daftar rencana yang belum dikerjakan; urutan mengikuti
manfaat untuk operasional ISP. Semua tetap **baca-saja** (SNMP GET/WALK), tanpa mengubah
konfigurasi perangkat, dan memakai konsep Observium/LibreNMS dengan kode sendiri.

## Sudah ada (ringkas)

Discovery & poll, status perangkat, port (bps, pps, error, grafik mini, mode Live),
detail port ala Winbox (MTU, duplex, IP, SFP, DOM), sensor MikroTik, grafik 6 jam–1 tahun
dengan 95th percentile, laporan bulanan + CSV, alert ambang (port, CPU, suhu, redaman SFP),
topologi LLDP/CDP/MNDP, tabel ARP/MAC + pencarian MAC/IP, halaman Pengaturan, dan tool
AI Agent (`snmp_devices`, `snmp_device`, `snmp_port`, `find_mac`, perintah `/snmp`, `/mac`).

## Tahap A — Sensor vendor lain (prioritas) — SEBAGIAN SELESAI 28 Nov 2026

**Sudah:** ENTITY-SENSOR-MIB (suhu, tegangan, arus, daya, kipas, dBm SFP) dan CISCO-ENVMON (suhu, status kipas/PSU) + CPU Cisco (`snmp_sensors_vendor.py`, dipanggil dari `collect_poll` untuk perangkat non-MikroTik). **Huawei VRP** (suhu + kipas, HUAWEI-ENTITY-EXTENT) menyusul 28 Nov. Belum: pemetaan DOM vendor ke kolom `dom_*` port, ENTITY-MIB inventaris, optik Huawei (dBm/mW bercampur), JUNIPER-DOM, Ubiquiti, dan uji dengan snmpsim per vendor — butuh data walk dari perangkat asli.

Tujuan: CPU, memori, suhu, kipas, PSU, dan redaman SFP terbaca juga dari switch/router selain MikroTik.

| Sumber | Isi | Catatan |
|---|---|---|
| ENTITY-SENSOR-MIB (`entPhySensorTable`, RFC 3433) | suhu, tegangan, arus, kipas, dBm SFP | Standar, dipakai Cisco, Huawei, Juniper, Arista. Satuan dari `entPhySensorType` + `entPhySensorScale` + `entPhySensorPrecision`. Nama dari `entPhysicalName`. |
| ENTITY-MIB (`entPhysicalTable`) | model, serial, modul/SFP terpasang | Melengkapi inventaris & pemetaan sensor DOM ke port (`entAliasMappingTable`). |
| HOST-RESOURCES-MIB | CPU per inti, RAM, disk | Sudah dipakai sebagian; rapikan untuk Linux/Windows/Proxmox. |
| CISCO-PROCESS-MIB / CISCO-ENVMON-MIB | CPU 5 menit, suhu, kipas, PSU | Cadangan untuk IOS lama tanpa ENTITY-SENSOR. |
| HUAWEI-ENTITY-EXTENT-MIB | CPU, memori, suhu, optik SFP | Switch S-series / router NE/AR. |
| Juniper JUNIPER-DOM-MIB | DOM SFP | Bila ENTITY-SENSOR tidak memuat optik. |
| Ubiquiti (UBNT-UniFi / EdgeSwitch) | CPU, suhu, PoE | Banyak dipakai di POP kecil. |

Rancangan: modul `snmp_sensors_vendor.py` dengan deteksi lewat `sysObjectID` → daftar
tabel yang dicoba; hasil masuk ke `SnmpSensor` (kind/key yang sudah ada) sehingga grafik,
alert suhu/CPU, laporan, dan AI langsung ikut. DOM vendor lain dipetakan ke kolom `dom_*`
port lewat `entAliasMappingTable` agar alert `snmp_optical` juga berlaku.
Uji: file snmpsim per vendor (`nmscisco`, `nmshuawei`, `nmsjuniper`).

## Tahap B — Wireless MikroTik

`mtxrWlRtabTable` / `mtxrWlStatTable` (v6) dan `mtxrWl60G*`: klien per AP, sinyal,
CCQ, TX/RX rate, frekuensi. Berguna untuk PTP/PTMP backhaul. Alert sinyal turun di bawah ambang.

## Tahap C — VLAN per port

Q-BRIDGE `dot1qVlanStaticTable` (egress/untagged ports bitmap) → daftar VLAN tagged/untagged
per port di detail port; VLAN juga ditampilkan di baris MAC.

## Tahap D — Status routing

BGP4-MIB `bgpPeerTable` (state, uptime, prefix diterima dari CISCO-BGP4-MIB/vendor bila ada),
OSPF-MIB `ospfNbrTable`. Alert peer BGP turun. MikroTik v7 memberi BGP lewat SNMP terbatas —
perlu dicek per versi RouterOS sebelum dijanjikan.

## Tahap E — Penemuan otomatis

Menambah perangkat dari: tetangga LLDP/CDP yang punya IP manajemen, dan pindai subnet
(daftar CIDR + community bawaan dari Pengaturan). Selalu sebagai **usulan** yang dikonfirmasi admin,
bukan langsung ditambah.

## Tahap F — Grup & aturan alert per perangkat/port — F1 (grup) SELESAI 28 Nov 2026

**F1:** kolom `SnmpDevice.group_name` (teks bebas, saran dari grup yang sudah ada), filter chip di daftar perangkat, tampil di baris, di alert (`Grup: …`), dan di AI. **F2 (SELESAI 28 Nov 2026):** ambang alert per grup (override semua ambang di modal Ambang alert); port pelanggan tidak dialert sudah bisa lewat tanda *watched* per port.

Grup perangkat (POP, backbone, pelanggan korporat) untuk filter dan laporan; ambang khusus per
grup/port (mis. uplink 10G batas 80%, port pelanggan tidak dialert).

## Tahap G — Billing per port

Port pelanggan korporat: komitmen Mbps, 95th percentile bulanan, kelebihan pemakaian; ekspor
CSV per pelanggan. Data sudah tersedia dari `SnmpSampleHourly`.

## Di luar rencana

Syslog (sudah ditangani Graylog), pemantauan aplikasi/layanan (HTTP/DNS) — bisa dipertimbangkan
terpisah bila dibutuhkan.
