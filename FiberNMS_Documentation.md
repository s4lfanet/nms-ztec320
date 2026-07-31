# Salfanet NMS — Multi-Tenant OLT Management System

## Dokumentasi Lengkap

---

## Update Terkini (Juli 2026)

Dokumentasi ini telah disesuaikan dengan implementasi terbaru yang sudah berjalan di sistem. Perubahan utama mencakup:

- Multi-vendor sync via adapter pattern (ZTE, HSGQ, Raisecom, BDCOM, C-Data, VSOL)
- Penambahan modul alerting dan notifikasi berbasis rule ke WhatsApp gateway + in-app bell notifications
- Penyempurnaan alur provisioning ONU, termasuk preview CLI dan handling VLAN/SSID/PPPoE
- WiFi SSID OMCI config: Open auth mengirim no-auth + encrypt none + no-key untuk dual-band (2.4G & 5G)
- Fiberhome VEIP template menggunakan TR069 Profile dropdown (sama seperti ZTE templates)
- Penguatan view detail ONU dengan informasi WAN, remote access, VEIP, TR069, dan WiFi
- Penambahan fitur manajemen FTTH (OTB/ODC/ODP) beserta koordinat lokasi
- SaaS: registrasi tenant, pembayaran Duitku, subdomain otomatis via Cloudflare Tunnel
- RX power signal stats menggunakan dynamic color ranges dari customization
- Optimistic logout: UI clears instantly tanpa delay
- CSP header: Cloudflare Insights beacon diizinkan
- Stabilisasi deployment VPS dan perbaikan schema database untuk kolom baru seperti latitude/longitude

## Daftar Isi

1. [Overview Sistem](#1-overview-sistem)
2. [Arsitektur](#2-arsitektur)
3. [Struktur Project](#3-struktur-project)
4. [Database Tables](#4-database-tables)
5. [Daftar Lengkap Telnet Commands](#5-daftar-lengkap-telnet-commands)
6. [Daftar Lengkap SNMP OIDs](#6-daftar-lengkap-snmp-oids)
7. [API Endpoints](#7-api-endpoints)
7b. [Security Implementation](#7b-security-implementation)
8. [RBAC & Permissions](#8-rbac--permissions)
9. [Sync Flow](#9-sync-flow)
10. [Deployment](#10-deployment)

---

## 1. Overview Sistem

Salfanet NMS adalah sistem manajemen OLT (Optical Line Terminal) ZTE C320 berbasis SaaS multi-tenant untuk jaringan FTTH (Fiber to the Home). Sistem ini mengelola perangkat OLT dan ONU-ONU yang terhubung melalui port PON, dengan isolasi tenant berbasis subdomain, manajemen subscription, dan integrasi payment gateway Duitku.

**Branding:** "Salfanet NMS" (configured via `SystemConfig` table, fetched from `/api/public/branding`).

**Fungsi utama:**
- Monitoring status OLT dan ONU secara real-time
- Konfigurasi ONU (register, deregister, reboot, disable/enable, clear config)
- Manajemen VLAN, ONU Types, Speed Profiles, WAN IP Profiles
- Monitoring uplink ports dan PON ports
- Manajemen infrastruktur FTTH (OTB → ODC → ODP)
- Role-based access control (RBAC) dengan multi-tenant isolation
- Action logging / audit trail
- Notifikasi status ONU
- SaaS: tenant registration, subscription packages, Duitku payment, auto-activation
- Security: domain-based login isolation, rate limiting, security headers

---

## 2. Arsitektur

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  React SPA  │────▶│  Flask (app.py)  │────▶│  SQLite DB  │
│  (Vite+TS)  │◀────│  ~6460 lines     │     │  (models.py)│
│  Code-split │     │  + 7 modules     │     │  20+ tables │
└─────────────┘     └────────┬─────────┘     └─────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
              ┌─────▼─────┐   ┌──────▼──────┐
              │   SNMP    │   │   Telnet    │   ┌──────────┐
              │snmp_core  │   │telnet_client│   │  Duitku  │
              │ (pysnmp)  │   │ (raw socket)│   │ Payment  │
              └─────┬─────┘   └──────┬──────┘   └──────────┘
                    │                │
                    └───────┬────────┘
                            │
                     ┌──────▼──────┐
                     │  ZTE C320   │
                     │    OLT      │
                     └─────────────┘

Multi-Tenant:
  nms.salfa.my.id        → Superadmin panel + public landing/registration
  <subdomain>-nms.salfa.my.id → Tenant-scoped OLT/ONU management
  Session cookies: isolated (nms-admin-session vs nms-tenant-session, host-only domain)
```

**Data Flow:**
1. User trigger "Sync" dari UI → React Query mutation → `POST /api/olt/<id>/sync`
2. Flask start background thread → `poll_olt()` di `snmp_collector.py` (shim → `snmp_core.py` + `telnet_client.py`)
3. SNMP walk: signal power (RX/TX), serial number, oper state
4. Telnet: ONU data (baseinfo, state, detail-info, remote-onu equip), chassis (card, fan), config (VLAN, ONU types, profiles, uplinks, PON ports)
5. Results saved ke SQLite
6. UI auto-refresh via React Query polling → tampilkan data baru

**ONU Detail Page (optimized):**
1. Page load → `GET /api/onu/<id>/detail` → DB-only response (instant, <50ms)
2. Live data lazy-load → `GET /api/onu/<id>/live-detail` → Telnet (background, ~10-15s)
3. User can manually refresh live data via "Refresh Live" button
4. Traffic polling → `GET /api/onu/<id>/traffic` → 3s interval (single CLI command, fast)
5. No auto-refetch of live data (was 30s, now manual only)

---

## 3. Struktur Project

```
e:\nms\
├── app.py                  # Flask app — routes, API, sync, SaaS, security (~6460 lines)
├── models.py               # SQLAlchemy models — 20+ tables (incl. SaaS tables)
├── extensions.py           # Shared Flask extensions (db, login_manager, migrate, logger, MultiTenantSessionInterface)
├── helpers.py              # Shared helper functions (utc_iso, log_action, permission_required, etc.)
├── logging_config.py       # Structured logging (JSON for prod, readable for dev)
├── snmp_core.py            # SNMP core — OIDs, decode/parse functions, SNMPCollector (~320 lines)
├── telnet_client.py        # Telnet CLI — SimpleTelnet + TelnetCollector (~4120 lines)
├── snmp_collector.py       # Compatibility shim — re-exports + poll_olt() orchestrator (~155 lines)
├── services_cf.py          # Cloudflare Tunnel service (DNS CNAME + ingress rules)
├── services_wa.py          # WhatsApp notification service
├── services_sync.py        # OLT sync service (background thread management)
├── routes_auth.py          # Auth Blueprint (login, logout, API auth endpoints)
├── sync_helper.py          # Sync helper (DB operations during sync)
├── alerts.py               # Alert monitoring engine
├── auto_sync.py            # Auto-sync scheduler
├── ont_provisioner.py      # ONT provisioning helper
├── migrate.py              # Flask-Migrate CLI (init/migrate/upgrade/current)
├── requirements.txt        # Python dependencies
├── tests/
│   └── test_basic.py       # Unit tests (auth, public API, security, helpers, models)
├── instance/
│   └── nms.db              # SQLite database
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # Router + ProtectedRoute + Suspense (React.lazy code splitting)
│   │   ├── main.tsx        # Entry point (BrowserRouter basename="/spa")
│   │   ├── pages/          # 18 pages, all lazy-loaded (separate chunks)
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Topbar.tsx
│   │   │   ├── EditableField.tsx
│   │   │   ├── ConfirmDialog.tsx
│   │   │   └── Toast.tsx
│   │   ├── hooks/
│   │   │   └── useHasPerm.ts
│   │   ├── lib/
│   │   │   ├── api.ts      # API client + TypeScript types
│   │   │   └── utils.ts
│   │   └── stores/
│   │       └── auth.ts     # Zustand auth store
│   ├── package.json
│   └── vite.config.ts      # Vite config with manualChunks (vendor-react, vendor-query, vendor-icons)
├── deploy/
│   ├── vps-setup.sh        # VPS deployment script
│   ├── .env.template
│   ├── cloudflared-config.yml
│   ├── cloudflared.service
│   └── nginx-fibernms.conf
├── templates/              # Legacy Jinja2 templates (login, dashboard, etc.)
├── static/                 # Legacy static assets
├── wa_gateway/             # WhatsApp notification gateway
├── fibernms_nginx.conf     # Nginx config
├── AGENTS.md               # AI agent handoff guide
└── README.md               # Project README
```

---

## 4. Database Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `olts` | OLT devices | name, ip_address, vendor, model, firmware_version, snmp_community, snmp_port, snmp_enabled, cli_username, cli_password, telnet_port, telnet_enabled, is_online, temperature, uptime, total_onu, online_onu, los_onu, offline_onu, dyinggasp_onu |
| `onus` | ONU records | olt_id, onu_index, frame, slot, port, onu_id, serial_number, name, description, status, rx_power, onu_rx_power, tx_power, distance, actual_type, pppoe, last_seen |
| `olt_cards` | Card info | olt_id, slot, rack, shelf, type, cfg_type, real_type, status, port_count |
| `olt_pon_ports` | PON port info | olt_id, port_number, port_name, admin_status, name, description, linktrap, onu_count, onu_online, onu_offline, sfp_vendor, sfp_type, sfp_wavelength, sfp_tx_power, sfp_rx_power, sfp_temperature |
| `olt_uplinks` | Uplink port info | olt_id, port_name, speed, admin_status, oper_status, duplex, medium, description, negotiation, flowcontrol, switchport_mode, vlans_tagged, input_rate, output_rate, input_packets, output_packets, crc_errors, dropped, sfp_vendor, sfp_type, sfp_serial, sfp_wavelength, sfp_rx_power, sfp_tx_power, sfp_temperature, sfp_bias_current, sfp_voltage, ip_vlan_id, ip_address, ip_mask, ip_gateway |
| `onu_vlans` | VLAN config | olt_id, vlan_id, vlan_name, vlan_type (L2/L3), onu_profiles |
| `onu_types` | ONU types | olt_id, type_name, pon_type, description, max_tcont, max_gem, max_switch, max_ip_host, max_veip |
| `speed_profiles` | TCONT + Traffic | olt_id, profile_type (tcont/traffic), name, type_val, fixed_bandwidth, assured_bandwidth, max_bandwidth, sir, pir |
| `wan_ip_profiles` | WAN IP profiles | olt_id, name, ip_address, netmask, gateway, dns1, dns2 |
| `fans` | Fan info | olt_id, fan_number, status, rpm, speed_level |
| `olt_sync_status` | Sync tracking | olt_id, progress, status, message |
| `templates` | ONU templates | name, vendor, model, onu_type, tcont_profile, traffic_profile, vlan |
| `tr069_profiles` | TR069 ACS | name, acs_url, acs_username, acs_password, default_olt_id, vlan |
| `onu_custom_columns` | Column config | column_name, column_key, visible_desktop, visible_mobile |
| `roles` | RBAC roles | name, permissions (JSON array), tenant_id |
| `users` | Users | username, password_hash, role_id, sidebar_name, all_olt, tenant_id, is_super_admin |
| `action_logs` | Audit log | user_id, username, action, category, target, detail, ip_address, timestamp |
| `notifications` | Notifications | user_id, type, title, message, is_read, olt_id, onu_id |
| `tenants` | SaaS tenants | name, subdomain, status (active/suspended/pending), contact_name, contact_email, contact_phone |
| `subscription_packages` | SaaS packages | name, max_olts, price, billing_cycle, features, is_active |
| `subscriptions` | Tenant subscriptions | tenant_id, package_id, start_date, end_date, status, max_olts |
| `payment_transactions` | Duitku payments | order_id, amount, payment_method, status, callback_data |
| `invoices` | Billing invoices | tenant_id, subscription_id, amount, status, due_date |
| `subscription_notifications` | WA notifications | subscription_id, tenant_id, notification_type (expiry_3d/7d) |
| `alert_rules` | Alert config | tenant_id, rule_type, thresholds |
| `bot_config` | Bot config | tenant_id, bot_type (telegram/discord/whatsapp) |
| `system_config` | System settings | key-value pairs (nms_name, etc.) |

---

## 5. Daftar Lengkap Telnet Commands

Semua command dijalankan melalui raw socket Telnet ke ZTE C320 (port 23). Setelah login, `terminal length 0` dikirim untuk disable paging.

### 5.1 System & Chassis

| Command | Context | Fungsi | Output Format |
|---------|---------|--------|---------------|
| `show card` | EXEC | Discovery card/slot — tipe card (GTGH/GTGHG/SMXA), status, port count | `Rack Shelf Slot CfgType RealType Port HardVer SoftVer Status` |
| `show fan` | EXEC | Fan RPM, status, dan temperature chassis | `FanUnitId ActualSpeed RPM` + `Environment Temperature: N` |
| `terminal length 0` | EXEC | Disable pagination output | — |
| `show running-config` | EXEC | Full running configuration — VLAN database, interface config, pon-onu-mng, ONU profiles | Multi-section config text |
| `show version` | EXEC | Firmware version, system info | Text block |

### 5.2 ONU Discovery & Status

| Command | Context | Fungsi | Output Format |
|---------|---------|--------|---------------|
| `show gpon onu baseinfo gpon-olt_X/Y/Z` | EXEC | SN per ONU pada PON port tertentu | `OnuIndex SN:XXXX Type:All` |
| `show gpon onu state gpon-olt_X/Y/Z` | EXEC | Status online/offline per ONU — PhaseState column | `OnuIndex AdminState PhaseState ...` |
| `show gpon onu detail-info gpon-onu_X/Y/Z:N` | EXEC | Name, description, serial, distance, TX/RX power, history | `Key: Value` per line |
| `show gpon remote-onu equip gpon-onu_X/Y/Z:N` | EXEC | Equipment ID, Model, Vendor ID, H/W & S/W version via OMCI | `Equipment ID: XXX` etc. |
| `show gpon onu history gpon-onu_X/Y/Z:N` | EXEC | Event history (online/offline/dyinggasp timestamps) | `Timestamp Status` |
| `show gpon onu event-log gpon-onu_X/Y/Z:N` | EXEC | Fallback event log | `Timestamp Status` |
| `show pon onu uncfg` | EXEC | Daftar ONU belum terdaftar (firmware 2.1+) | `OltIndex Model SN PW` |
| `show gpon onu uncfg` | EXEC | Fallback daftar ONU belum terdaftar | `OnuIndex SN Type` |

### 5.3 ONU Actions

| Command | Context | Fungsi |
|---------|---------|--------|
| `reset` | `configure terminal > interface gpon-onu_X/Y/Z:N` | Reboot ONU |
| `no onu N` | `configure terminal > interface gpon-olt_X/Y/Z` | Deregister/delete ONU |
| `shutdown` | `configure terminal > interface gpon-onu_X/Y/Z:N` | Disable ONU (admin down) |
| `no shutdown` | `configure terminal > interface gpon-onu_X/Y/Z:N` | Enable ONU (admin up) |
| `restore factory` | `configure terminal > pon-onu-mng gpon-onu_X/Y/Z:N` | Factory reset ONU via OMCI |
| `restore wifi` | `configure terminal > pon-onu-mng gpon-onu_X/Y/Z:N` | Reset WiFi settings via OMCI |

### 5.4 ONU Registration & Configuration

| Command | Context | Fungsi |
|---------|---------|--------|
| `onu N type TYPE sn SERIAL` | `configure terminal > interface gpon-olt_X/Y/Z` | Register ONU baru |
| `name TEXT` | `configure terminal > interface gpon-onu_X/Y/Z:N` | Set ONU name |
| `description TEXT` | `configure terminal > interface gpon-onu_X/Y/Z:N` | Set ONU description |
| `tcont N name NAME profile PROFILE` | `configure terminal > interface gpon-onu_X/Y/Z:N` | Create TCONT |
| `tcont N profile PROFILE` | `configure terminal > interface gpon-onu_X/Y/Z:N` | Create TCONT (no name) |
| `gemport N tcont N` | `configure terminal > interface gpon-onu_X/Y/Z:N` | Create GEM port |
| `gemport N traffic-limit downstream PROFILE` | `configure terminal > interface gpon-onu_X/Y/Z:N` | Set traffic limit on GEM port |
| `service-port N vport N user-vlan V vlan V` | `configure terminal > interface gpon-onu_X/Y/Z:N` | Create service port |
| `no service-port N` | `configure terminal` | Remove service port (global context) |
| `no gemport N` | `configure terminal > interface gpon-onu_X/Y/Z:N` | Remove GEM port |
| `no tcont N` | `configure terminal > interface gpon-onu_X/Y/Z:N` | Remove TCONT |
| `sn-bind enable sn` | `configure terminal > interface gpon-onu_X/Y/Z:N` | Enable SN binding |

### 5.5 ONU Management (pon-onu-mng context)

| Command | Context | Fungsi |
|---------|---------|--------|
| `service NAME gemport N vlan V` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Service to VLAN mapping (VEIP mode) |
| `service NAME gemport N iphost N vlan V` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Service to VLAN mapping (iphost mode) |
| `vlan port eth_0/N mode tag vlan V` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Set ETH port VLAN tagging |
| `vlan port eth_0/N mode hybrid def-vlan V` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Set ETH port hybrid mode |
| `vlan port wifi_0/N mode tag vlan V` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Set WiFi port VLAN tagging |
| `vlan port veip_1 mode hybrid` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Set VEIP port mode |
| `vlan port veip_1 vlan 1` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Set VEIP default VLAN |
| `pppoe N nat enable user USER password PASS` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Configure PPPoE |
| `wan N service internet host N` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Set WAN service type |
| `wan N service tr069 internet host N` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Set WAN service with TR069 |
| `wan-ip N mode dhcp vlan-profile NAME host N` | `pon-onu-mng gpon-onu_X/Y/Z:N` | WAN IP via DHCP |
| `wan-ip N mode pppoe username USER password PASS vlan-profile NAME host N` | `pon-onu-mng gpon-onu_X/Y/Z:N` | WAN IP via PPPoE |
| `wan-ip N mode static ip-address IP mask MASK vlan-profile NAME host N` | `pon-onu-mng gpon-onu_X/Y/Z:N` | WAN IP static |
| `wan-ip N mode static ip-profile NAME vlan-profile NAME host N` | `pon-onu-mng gpon-onu_X/Y/Z:N` | WAN IP static via IP profile |
| `wan-ip N ping-response enable traceroute-response enable` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Enable ping/traceroute response |
| `tr069-mgmt 1 state unlock` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Enable TR069 management |
| `tr069-mgmt 1 acs URL validate basic username USER password PASS` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Set ACS URL & credentials |
| `tr069-mgmt 1 tag pri 0 vlan V` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Set TR069 VLAN tagging |
| `tr069-mgmt 1 untag` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Set TR069 untagged |
| `firewall enable level LEVEL anti-hack disable` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Enable firewall |
| `security-mgmt 1 state enable mode forward protocol web ftp telnet ssh https snmp tr069` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Enable remote access protocols |
| `ssid ctrl wifi_0/N name NAME` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Set SSID name |
| `ssid auth wpa wifi_0/N wpa2-psk` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Set WiFi auth mode |
| `ssid auth wpa wifi_0/N encrypt aes` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Set WiFi encryption |
| `ssid auth wpa wifi_0/N key PASSWORD` | `pon-onu-mng gpon-onu_X/Y/Z:N` | Set WiFi password |
| `onu-type-if TYPE wifi_0/N` | `configure terminal > pon` | Add WiFi UNI port to ONU type |

### 5.6 ONU Remote Info (show gpon remote-onu)

| Command | Context | Fungsi |
|---------|---------|--------|
| `show gpon remote-onu equip gpon-onu_X/Y/Z:N` | EXEC | Equipment ID, Model, Vendor ID, H/W & S/W version |
| `show gpon remote-onu veip gpon-onu_X/Y/Z:N` | EXEC | VEIP admin status, IANA assigned port |
| `show gpon remote-onu tr069 gpon-onu_X/Y/Z:N` | EXEC | TR069 admin status, ACS URL, username, password, tag/vlan |
| `show gpon remote-onu ip-host gpon-onu_X/Y/Z:N` | EXEC | IP host info — current IP address per host |
| `show gpon remote-onu security-mgmt gpon-onu_X/Y/Z:N` | EXEC | Security management — service list, ingress type, ACL |

### 5.7 ONU Performance & Bandwidth

| Command | Context | Fungsi |
|---------|---------|--------|
| `show gpon onu bandwidth gpon-onu_X/Y/Z:N` | EXEC | DBA bandwidth (downstream/upstream) |
| `show gpon onu performance gpon-onu_X/Y/Z:N` | EXEC | Performance stats (rx-bps, tx-bps) |
| `show interface gpon-onu_X/Y/Z:N` | EXEC | Interface counters (input/output bytes, packets) |

### 5.8 Uplink Port Management

| Command | Context | Fungsi |
|---------|---------|--------|
| `show running-config interface gei_1/S/P` | EXEC | 1G uplink port config (speed, duplex, VLAN, etc.) |
| `show running-config interface xgei_1/S/P` | EXEC | 10G uplink port config |
| `show interface gei_1/S/P` | EXEC | Uplink port status & traffic stats |
| `show interface xgei_1/S/P` | EXEC | 10G uplink port status & traffic stats |
| `show interface optical-module-info PORT` | EXEC | SFP optical module info (vendor, wavelength, TX/RX power, temp, voltage) |
| `no shutdown` | `configure terminal > interface PORT` | Enable uplink port |
| `shutdown` | `configure terminal > interface PORT` | Disable uplink port |
| `speed 10\|100\|1000\|10000` | `configure terminal > interface PORT` | Set port speed |
| `duplex full\|half` | `configure terminal > interface PORT` | Set duplex mode |
| `negotiation auto` | `configure terminal > interface PORT` | Enable auto-negotiation |
| `no negotiation auto` | `configure terminal > interface PORT` | Disable auto-negotiation |
| `flowcontrol enable\|disable` | `configure terminal > interface PORT` | Set flow control |
| `description TEXT` | `configure terminal > interface PORT` | Set port description |
| `no description` | `configure terminal > interface PORT` | Remove port description |
| `switchport mode trunk\|access\|hybrid` | `configure terminal > interface PORT` | Set switchport mode |
| `switchport vlan IDS tag` | `configure terminal > interface PORT` | Add VLANs to trunk |
| `no switchport vlan IDS` | `configure terminal > interface PORT` | Remove VLANs from port |
| `show ip interface brief` | EXEC | VLAN interface IP summary (vlan, IP, mask, status) |
| `show ip route` | EXEC | IP routing table (default gateway, connected routes) |
| `interface vlan <id>` | `configure terminal` | Create/select VLAN interface (SVI) |
| `ip address <ip> <mask>` | `configure terminal > interface vlan <id>` | Set IP on VLAN interface |
| `no ip address` | `configure terminal > interface vlan <id>` | Remove IP from VLAN interface |
| `ip route 0.0.0.0 0.0.0.0 <gw>` | `configure terminal` | Set default gateway |

### 5.9 PON Port Management

| Command | Context | Fungsi |
|---------|---------|--------|
| `show gpon onu state gpon-olt_1/S/P` | EXEC | ONU online/offline counts per PON port |
| `show running-config interface gpon-olt_1/S/P` | EXEC | PON port config (admin status, name, description, linktrap) |
| `show interface optical-module-info gpon-olt_1/S/P` | EXEC | PON port SFP info |
| `no shutdown` | `configure terminal > interface gpon-olt_1/S/P` | Enable PON port |
| `shutdown` | `configure terminal > interface gpon-olt_1/S/P` | Disable PON port |
| `name TEXT` | `configure terminal > interface gpon-olt_1/S/P` | Set PON port name |
| `no name` | `configure terminal > interface gpon-olt_1/S/P` | Remove PON port name |
| `description TEXT` | `configure terminal > interface gpon-olt_1/S/P` | Set PON port description |
| `no description` | `configure terminal > interface gpon-olt_1/S/P` | Remove PON port description |

### 5.10 VLAN Management

| Command | Context | Fungsi |
|---------|---------|--------|
| `show vlan summary` | EXEC | List semua VLAN IDs (comma-separated) |
| `vlan ID` | `configure terminal > vlan database` | Create/select VLAN |
| `vlan ID name NAME` | `configure terminal > vlan database` | Rename VLAN |
| `no vlan ID` | `configure terminal > vlan database` | Delete VLAN |

### 5.11 ONU Type Management

| Command | Context | Fungsi |
|---------|---------|--------|
| `show onu-type` | EXEC | List semua ONU types dengan max TCONT/GEM/switch/iphost/VEIP |
| `onu-type NAME gpon description DESC` | `configure terminal > pon` | Create ONU type |
| `onu-type NAME gpon max-tcont N` | `configure terminal > pon` | Set max TCONT |
| `onu-type NAME gpon max-gemport N` | `configure terminal > pon` | Set max GEM port |
| `onu-type NAME gpon max-switch-perslot N` | `configure terminal > pon` | Set max switch per slot |
| `onu-type NAME gpon max-flow-perswitch N` | `configure terminal > pon` | Set max flow per switch |
| `onu-type NAME gpon max-iphost N` | `configure terminal > pon` | Set max IP host |
| `onu-type-if NAME eth_0/N` | `configure terminal > pon` | Add ETH interface to ONU type |
| `onu-type-if NAME wifi_0/N` | `configure terminal > pon` | Add WiFi interface to ONU type |
| `no onu-type NAME` | `configure terminal > pon` | Delete ONU type |

### 5.12 Profile Management (TCONT/Traffic/WAN-IP)

| Command | Context | Fungsi |
|---------|---------|--------|
| `show gpon profile tcont` | EXEC | List semua TCONT profiles |
| `show gpon profile traffic` | EXEC | List semua traffic profiles |
| `show gpon profile wan-ip` | EXEC | List semua WAN IP profiles (may not work on some firmware) |
| `profile tcont NAME type N maximum BW` | `configure terminal > gpon` | Create TCONT profile |
| `no profile tcont NAME` | `configure terminal > gpon` | Delete TCONT profile |
| `profile traffic NAME sir SIR pir PIR` | `configure terminal > gpon` | Create traffic profile |
| `no profile traffic NAME` | `configure terminal > gpon` | Delete traffic profile |
| `profile wan-ip NAME ipaddress IP netmask MASK gateway GW [primary-dns D1] [secondary-dns D2]` | `configure terminal > gpon` | Create WAN IP profile |
| `no profile wan-ip NAME` | `configure terminal > gpon` | Delete WAN IP profile |

### 5.13 Context Navigation Summary

```
EXEC mode (#)
├── show ...
├── configure terminal
│   ├── interface gpon-olt_X/Y/Z      → ONU registration, PON port config
│   ├── interface gpon-onu_X/Y/Z:N    → TCONT, GEM, service-port, name, desc, shutdown
│   ├── interface gei_1/S/P           → Uplink port config
│   ├── interface xgei_1/S/P          → 10G uplink port config
│   ├── interface vlan <id>           → VLAN interface (SVI) for L3 IP config
│   ├── pon-onu-mng gpon-onu_X/Y/Z:N  → Service/VLAN mapping, WiFi, TR069, PPPoE, WAN-IP, firewall
│   ├── vlan database                 → VLAN create/rename/delete
│   ├── pon                           → ONU type management
│   └── gpon                          → Profile management (TCONT/traffic/wan-ip)
```

---

## 6. Daftar Lengkap SNMP OIDs

Semua OID menggunakan enterprise ID ZTE: `1.3.6.1.4.1.3902.1012.3...`

SNMP menggunakan pysnmp 7.x Slim API (v1arch async). Community string default: `public`.

### 6.1 System OIDs

| OID | Name | Fungsi | Decode |
|-----|------|--------|--------|
| `1.3.6.1.2.1.1.1.0` | sysDescr | System description (firmware info) | String langsung |
| `1.3.6.1.2.1.1.3.0` | sysUpTime | System uptime dalam centiseconds | `raw // 100` → detik, format: `X days Y hours Z minutes` |

### 6.2 cfgTable — ONU Configuration (`.3.28`)

Index: `.ponIndex.cfgId` (2 components)
`cfgId == onuSlot` untuk ZTE C320 (same per-port sequential numbering).

| OID | Name | Fungsi | Decode |
|-----|------|--------|--------|
| `1.3.6.1.4.1.3902.1012.3.28.1.1.2` | ONU Name | Nama ONU dari config table | String |
| `1.3.6.1.4.1.3902.1012.3.28.1.1.3` | ONU Description | Deskripsi ONU | String |
| `1.3.6.1.4.1.3902.1012.3.28.1.1.5` | ONU Serial | Serial number ONU | OctetString: 4 byte ASCII vendor + hex serial → `parse_serial()` |

### 6.3 regTable — ONU Registration & Signal (`.3.50.12`)

Index: `.ponIndex.onuSlot.onuId` (3 components)

| OID | Name | Fungsi | Decode |
|-----|------|--------|--------|
| `1.3.6.1.4.1.3902.1012.3.50.12.1.1.1` | Reg Status | Registration status | Integer |
| `1.3.6.1.4.1.3902.1012.3.50.12.1.1.6` | Oper State | Operational state | `1=not_present, 2=inactive, 3=activating, 4=online, 5=online, 6=dyinggasp` → lainnya `offline` |
| `1.3.6.1.4.1.3902.1012.3.50.12.1.1.7` | Dereg Reason | Deregistration reason | `0=none, 1=Unknown, 2=LOS, 3=LOSi, 4=LOFi, 5=SFi, 6=LOAi, 7=LOAMi, 8=AuthFail, 9=PowerOff, 10=DeactiveSucc, 11=DeactiveFail, 12=Reboot, 13=Shutdown` |
| `1.3.6.1.4.1.3902.1012.3.50.12.1.1.10` | ONU RX Power | RX power di sisi ONU (downstream: OLT→ONU) | `raw / 500.0 - 30.0` → dBm. `0xFFFF/65535` = None |
| `1.3.6.1.4.1.3902.1012.3.50.12.1.1.11` | TX Power | TX power ONU | `raw / 500.0 - 30.0` → dBm |
| `1.3.6.1.4.1.3902.1012.3.50.12.1.1.18` | OLT RX Power | RX power di sisi OLT (upstream: ONU→OLT) | `raw / 500.0 - 30.0` → dBm |

### 6.4 PON Index Calculation

ZTE C320 menggunakan PON index untuk addressing port dalam SNMP:

```
BOARD1_BASE = 268500992   (slot 1)
BOARD2_BASE = 268509184   (slot 2)
PON_INCREMENT = 256

pon_index = BOARD_BASE + port_number * PON_INCREMENT
```

Contoh: PON port 1/1/3 → `268500992 + 3 * 256 = 268501760`

OID suffix untuk ONU pada port 1/1/3, onuSlot=1, onuId=1:
```
.268501760.1.1
```

### 6.5 SNMP Walk Strategy

```
1. Walk OID_OPER_STATE  → dapat semua oper state
2. Walk OID_RX_POWER    → dapat semua ONU RX power
3. Walk OID_TX_POWER    → dapat semua TX power
4. Walk OID_OLT_RX      → dapat semua OLT RX power
5. Walk OID_ONU_SERIAL  → dapat semua serial number
```

Data di-key oleh composite key `(ponIndex, onuSlot)` untuk menghindari collision antar port. Matching dengan Telnet data menggunakan serial number.

### 6.6 SNMP Signal Power Mapping

| Field di DB | OID | Arti | Arah |
|-------------|-----|------|------|
| `rx_power` | `.18` (OLT RX) | Power yang diterima OLT dari ONU | Upstream (ONU→OLT) |
| `onu_rx_power` | `.10` (ONU RX) | Power yang diterima ONU dari OLT | Downstream (OLT→ONU) |
| `tx_power` | `.11` (TX) | TX power ONU | Upstream |

**Fallback:** Jika OLT RX (`.18`) tidak tersedia, gunakan ONU RX (`.10`) sebagai `rx_power`.

### 6.7 Per-ONU SNMP Get (untuk ONU Detail)

Saat `collect_onu_detail()` tidak mendapatkan RX/TX dari Telnet `detail-info`, dilakukan SNMP get langsung:

```
oid_onu_rx = 1.3.6.1.4.1.3902.1012.3.50.12.1.1.10.{pon_index}.{onu_id}.1
oid_olt_tx = 1.3.6.1.4.1.3902.1012.3.50.12.1.1.14.{pon_index}.{onu_id}.1
oid_olt_rx = 1.3.6.1.4.1.3902.1012.3.50.12.1.1.18.{pon_index}.{onu_id}.1
```

Decode sama: `raw / 500.0 - 30.0` → dBm, dengan `0xFFFF/65535/255` = None.

**Catatan:** OID `.11` (ONU TX power) tidak digunakan lagi pada V2.1.0 karena return 0/65535. ONU TX power diambil dari Telnet `show pon power attenuation`.

### 6.8 Optical Status: Telnet vs SNMP

Pada ZTE C320 V2.1.0, `show pon power attenuation gpon-onu_X/Y/Z:N` adalah primary source untuk optical power levels. Output format:

```
           OLT                  ONU              Attenuation
--------------------------------------------------------------------------
 up      Rx :-22.204(dbm)      Tx:2.170(dbm)        24.374(dB)

 down    Tx :9.604(dbm)        Rx:-14.070(dbm)      23.674(dB)
```

Parser regex: `Rx\s*:\s*([-]?\d+\.?\d*)` dan `Tx\s*:\s*([-]?\d+\.?\d*)` per line.
Attenuation: `([-]?\d+\.?\d*)\s*\(dB\)`.

SNMP hanya fallback untuk nilai yang masih kosong (OLT RX, OLT TX, ONU RX). OID `.11` (ONU TX) di-skip karena return 0 di V2.1.0.

### 6.9 Penting: SNMP oper_state TIDAK Override Telnet

Pada ZTE C320 V2.1.0, SNMP `oper_state` (OID `.3.50.12.1.1.6`) mengembalikan nilai 4 (online) untuk ONU yang sebenarnya dalam state DyingGasp. Ini karena SNMP membaca cached/lagged value. **Telnet `show gpon onu state` adalah source of truth untuk ONU status.** Telnet dijalankan SETELAH SNMP walk di `poll_olt()`, sehingga status Telnet lebih current.

---

## 7. API Endpoints

### Auth
| Method | Path | Fungsi |
|--------|------|--------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |

### Dashboard
| Method | Path | Fungsi |
|--------|------|--------|
| GET | `/api/dashboard` | Dashboard data (OLT list + stats) |
| GET | `/api/dashboard/live-traffic` | Live uplink traffic rates |

### OLT Management
| Method | Path | Permission | Fungsi |
|--------|------|------------|--------|
| GET | `/api/olts` | — | List all OLTs |
| POST | `/api/olt` | `settings_ip_olts` | Create OLT |
| GET | `/api/olt/<id>` | — | Get OLT detail |
| PUT | `/api/olt/<id>` | `settings_ip_olts` | Update OLT |
| DELETE | `/api/olt/<id>` | `settings_ip_olts` | Delete OLT |
| POST | `/api/olt/<id>/sync` | `settings_ip_olts` | Trigger sync |
| GET | `/api/olt/<id>/sync-status` | — | Poll sync progress |
| POST | `/api/olt/<id>/test-connection` | — | Test SNMP + Telnet |

### ONU Management
| Method | Path | Permission | Fungsi |
|--------|------|------------|--------|
| GET | `/api/onu/<id>` | — | Get ONU detail |
| POST | `/api/onu/<id>/update` | per-field | Update name/desc/type/serial |
| POST | `/api/onu/<id>/update-field` | per-field | Update single field |
| POST | `/api/onu/<id>/action` | per-action | reboot/delete/disable/enable/clear-config/restore-factory/restore-wifi |
| GET | `/api/onu/<id>/detail` | — | ONU detail from DB only (instant, no Telnet) |
| GET | `/api/onu/<id>/live-detail` | — | ONU live data from OLT via Telnet (lazy, slow) |
| GET | `/api/onu/<id>/history` | — | ONU event history |
| GET | `/api/onu/<id>/traffic` | — | Live ONU traffic (3s polling) |
| POST | `/api/onu/<id>/get-status` | — | Full Get Status (interface info, optical, history, MACs) |
| POST | `/api/onu/<id>/resync-config` | `configure_onu` | Re-collect ONU config from OLT |
| GET | `/api/onu/<id>/running-config` | — | ONU running-config (interface + pon-onu-mng) |
| POST | `/api/onu/<id>/save-config` | `configure_onu` | Save ONU config to OLT |
| POST | `/api/onu/<id>/migrate` | `configure_onu` | Migrate single ONU to different PON |
| POST | `/api/onu/<id>/migrate-batch` | `configure_onu` | Batch migrate multiple ONUs to same PON |
| GET | `/api/onu/<id>/live-info` | — | Quick live ONU data (Telnet) |

### All ONUs (Server-Side Pagination)
| Method | Path | Permission | Fungsi |
|--------|------|------------|--------|
| GET | `/api/all-onus` | — | List ONUs with server-side pagination, SQL search, sort |

**Query params:** `olt`, `status`, `search`, `page`, `page_size`, `sort_by`, `sort_dir`

### ONU Registration
| Method | Path | Permission | Fungsi |
|--------|------|------------|--------|
| GET | `/api/olt/<id>/unregistered-onus` | `add_onu` | List unconfigured ONUs |
| GET | `/api/olt/<id>/next-onu-id` | `add_onu` | Get next available ONU ID |
| GET | `/api/olt/<id>/onus-by-port` | `add_onu` | List ONUs by specific PON port |
| POST | `/api/pre-register` | `add_onu` | Register + configure ONU |

### Uplink Port Management
| Method | Path | Permission | Fungsi |
|--------|------|------------|--------|
| POST | `/api/olt/<id>/uplink/<uplink_id>/toggle` | `settings_ip_olts` | Enable/disable port |
| POST | `/api/olt/<id>/uplink/<uplink_id>/configure` | `settings_ip_olts` | Edit port config |
| POST | `/api/olt/<id>/uplink/<uplink_id>/description` | `settings_ip_olts` | Edit description |
| POST | `/api/olt/<id>/uplink/<uplink_id>/vlan` | `settings_ip_olts` | Set VLAN trunk |
| POST | `/api/olt/<id>/uplink/<uplink_id>/vlan/remove` | `settings_ip_olts` | Remove VLANs |
| POST | `/api/olt/<id>/uplink/<uplink_id>/ip` | `settings_ip_olts` | Set/remove IP on VLAN interface (SVI) tagged to uplink port |
| POST | `/api/olt/<id>/uplink/refresh` | `settings_ip_olts` | Re-collect uplink data |

### PON Port Management
| Method | Path | Permission | Fungsi |
|--------|------|------------|--------|
| GET | `/api/olt/<id>/pon-ports` | — | List PON ports |
| GET | `/api/olt/<id>/pon-stats/<slot>` | — | Per-port ONU stats |
| POST | `/api/olt/<id>/pon-port/<port_id>/toggle` | `settings_ip_olts` | Enable/disable PON port |
| POST | `/api/olt/<id>/pon-port/<port_id>/edit` | `settings_ip_olts` | Edit PON port name/desc |

### VLAN Management
| Method | Path | Permission | Fungsi |
|--------|------|------------|--------|
| POST | `/api/olt/<id>/vlan/<vlan_id>/rename` | `settings_ip_olts` | Rename VLAN |
| POST | `/api/olt/<id>/vlan/<vlan_id>/delete` | `settings_ip_olts` | Delete VLAN |

### ONU Type Management
| Method | Path | Permission | Fungsi |
|--------|------|------------|--------|
| POST | `/api/olt/<id>/onu-type/add` | `settings_ip_olts` | Add ONU type |
| POST | `/api/olt/<id>/onu-type/<type_id>/delete` | `settings_ip_olts` | Delete ONU type |

### Speed Profile Management
| Method | Path | Permission | Fungsi |
|--------|------|------------|--------|
| POST | `/api/olt/<id>/tcont/add` | `settings_ip_olts` | Add TCONT profile |
| POST | `/api/olt/<id>/tcont/<profile_id>/delete` | `settings_ip_olts` | Delete TCONT |
| POST | `/api/olt/<id>/traffic/add` | `settings_ip_olts` | Add Traffic profile |
| POST | `/api/olt/<id>/traffic/<profile_id>/delete` | `settings_ip_olts` | Delete Traffic |

### WAN IP Profile Management
| Method | Path | Permission | Fungsi |
|--------|------|------------|--------|
| POST | `/api/olt/<id>/wan-ip/add` | `settings_ip_olts` | Add WAN IP profile |
| POST | `/api/olt/<id>/wan-ip/<profile_id>/delete` | `settings_ip_olts` | Delete WAN IP |

### FTTH Infrastructure
| Method | Path | Permission | Fungsi |
|--------|------|------------|--------|
| GET | `/api/ftth/tree` | — | Get FTTH tree |
| POST | `/api/ftth/otb` | `settings_ip_olts` | Create OTB |
| POST | `/api/ftth/odc` | `settings_ip_olts` | Create ODC |
| POST | `/api/ftth/odp` | `settings_ip_olts` | Create ODP |
| POST | `/api/ftth/odp-port` | `settings_ip_olts` | Create ODP port |
| POST | `/api/ftth/pon` | `settings_ip_olts` | Link PON to OTB |
| POST | `/api/ftth/import` | `settings_ip_olts` | Import CSV |
| PUT | `/api/ftth/otb/<id>` | `settings_ip_olts` | Update OTB |
| PUT | `/api/ftth/odc/<id>` | `settings_ip_olts` | Update ODC |
| PUT | `/api/ftth/odp/<id>` | `settings_ip_olts` | Update ODP |
| DELETE | `/api/ftth/otb/<id>` | `settings_ip_olts` | Delete OTB |
| DELETE | `/api/ftth/odc/<id>` | `settings_ip_olts` | Delete ODC |
| DELETE | `/api/ftth/odp/<id>` | `settings_ip_olts` | Delete ODP |

### User Management
| Method | Path | Permission | Fungsi |
|--------|------|------------|--------|
| GET | `/api/users` | `manage_users` | List users |
| POST | `/api/user` | `manage_users` | Create user |
| PUT | `/api/user/<id>` | `manage_users` | Update user |
| DELETE | `/api/user/<id>` | `manage_users` | Delete user |

### Notifications
| Method | Path | Fungsi |
|--------|------|--------|
| GET | `/api/notifications` | List notifications |
| POST | `/api/notifications/mark-all-read` | Mark all as read |
| POST | `/api/notifications/clear-read` | Clear read notifications |

### Action Logs
| Method | Path | Permission | Fungsi |
|--------|------|------------|--------|
| GET | `/api/logs` | `manage_users` | List action logs |

### Public Endpoints (no auth)
| Method | Path | Fungsi |
|--------|------|--------|
| GET | `/api/public/branding` | Get NMS brand name |
| GET | `/api/public/tenant-check` | Validate tenant subdomain (404 if not found, 403 if suspended) |
| GET | `/api/public/packages` | List active subscription packages |
| POST | `/api/public/register` | Register new tenant (creates tenant + admin user + pending subscription + invoice) |
| POST | `/api/public/register/pay` | Create Duitku payment for registration |
| GET | `/api/public/registration-status/<order_id>` | Poll registration payment status |

### Superadmin Endpoints (`@super_admin_required` — main domain + super admin only)
| Method | Path | Fungsi |
|--------|------|--------|
| GET | `/api/admin/packages` | List all packages |
| POST | `/api/admin/package` | Create package |
| PUT | `/api/admin/package/<id>` | Update package |
| DELETE | `/api/admin/package/<id>` | Delete package |
| GET | `/api/admin/tenants` | List all tenants |
| POST | `/api/admin/tenant` | Create tenant |
| PUT | `/api/admin/tenant/<id>` | Update tenant |
| DELETE | `/api/admin/tenant/<id>` | Delete tenant (cascading delete) |
| GET | `/api/admin/subscriptions` | List all subscriptions |
| POST | `/api/admin/subscription/<id>/renew` | Renew subscription |
| GET | `/api/admin/invoices` | List invoices |
| GET | `/api/admin/notifications` | List subscription notifications |

### Subscription Management (tenant)
| Method | Path | Permission | Fungsi |
|--------|------|------------|--------|
| GET | `/api/subscription` | `login_required` | Get current tenant subscription |
| POST | `/api/subscription/renew` | `login_required` | Create renewal payment |
| GET | `/api/subscription/invoices` | `login_required` | List tenant invoices |

### Duitku Payment Callback
| Method | Path | Fungsi |
|--------|------|--------|
| POST | `/api/payment/callback` | Duitku callback handler (auto-activate tenant on success) |
| GET | `/api/payment/return` | Duitku return redirect (REG→payment-result, REN→dashboard) |

---

## 7b. Security Implementation

### Domain-Based Login Isolation
- **Main domain** (`nms.salfa.my.id`): Only superadmin can login
- **Tenant subdomain** (`<subdomain>-nms.salfa.my.id`): Only tenant users matching the subdomain can login
- Enforced in both API (`/api/auth/login`) and legacy (`/login`) routes
- Cross-login attempts return 403 with descriptive message

### Session Isolation (Multi-Tenant)
- **`MultiTenantSessionInterface`** in `extensions.py` — custom Flask session interface
- **Separate cookie names**: `nms-admin-session` (main domain) vs `nms-tenant-session` (tenant subdomains)
- **Host-only cookie domain**: No `Domain` attribute set — cookies scoped to exact hostname, NOT shared across subdomains
- **Result**: Admin and tenant sessions can coexist in the same browser without conflict
- **Config**: `SESSION_COOKIE_SECURE=True`, `SESSION_COOKIE_HTTPONLY=True`, `SESSION_COOKIE_SAMESITE='Lax'`
- **No static `SESSION_COOKIE_DOMAIN` or `SESSION_COOKIE_NAME`** — dynamically determined per-request by `MultiTenantSessionInterface`

### Domain-Session Guard (Defense-in-Depth)
- **`enforce_domain_session_isolation()`** `@before_request` handler in `app.py`
- Validates that authenticated user matches the current domain:
  - Superadmin on tenant subdomain → session cleared, redirect to login
  - Tenant user on main domain → session cleared, redirect to login
  - Tenant user on wrong tenant subdomain → session cleared, redirect to login
- API requests return 401 JSON, page requests redirect to `/spa/login`

### Rate Limiting
- **5 login attempts** per IP per 5-minute window
- **15-minute lockout** after exceeding limit → HTTP 429
- Tracked in-memory via `_login_attempts` dict
- Cleared on successful login

### Security Headers (`@app.after_request`)
| Header | Value |
|--------|-------|
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| X-XSS-Protection | 1; mode=block |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | geolocation=(), microphone=(), camera=() |
| Strict-Transport-Security | max-age=31536000; includeSubDomains (HTTPS only) |

### Superadmin Access Control
- **`super_admin_required` decorator**: Checks `is_super_admin` AND main domain
- **Frontend route guard**: `ProtectedRoute` blocks non-superadmin from `/dashboard/admin`
- **Superadmin login URL**: `/secure-portal-x7k2` (non-guessable, main domain only)
- On tenant subdomains, `/secure-portal-x7k2` redirects to `/login`

### Tenant Validation
- `App.tsx` calls `/api/public/tenant-check` on subdomain load
- Shows `TenantNotFound` page if subdomain doesn't match an active tenant
- Shows `Tenant Suspended` page if tenant status is not `active`

### Subscription Enforcement
- `@app.before_request` checks subscription status for authenticated non-superadmin users
- Expired/suspended tenants get 403 with `subscription_expired: true`
- Frontend `ProtectedRoute` shows "Access Blocked" page for expired subscriptions

---

## 8. RBAC & Permissions

### Available Permissions

| Permission | Fungsi |
|------------|--------|
| `all_olt` | Superuser — akses semua OLT & semua permission |
| `view_dashboard` | Lihat dashboard |
| `add_onu` | Register ONU baru |
| `configure_onu` | Konfigurasi ONU (type, serial, onu_id, clear config, restore wifi) |
| `reboot_onu` | Reboot ONU |
| `edit_onu_name` | Edit nama ONU |
| `edit_onu_description` | Edit deskripsi ONU |
| `delete_onu` | Delete/deregister ONU |
| `reset_onu` | Factory reset ONU |
| `disable_onu` | Disable/enable ONU |
| `settings_ip_olts` | Akses OLT settings, config, uplink, PON, VLAN, FTTH |
| `manage_users` | Manajemen user & lihat action logs |
| `manage_templates` | Manajemen ONU templates |
| `manage_tr069` | Manajemen TR069 profiles |
| `customization` | Customization & alert settings |

### Default Roles

| Role | Permissions |
|------|------------|
| Full Access | `all_olt` (semua permission) |
| Viewer | `view_dashboard` (view only, tidak ada action buttons) |
| Limited | `view_dashboard`, `edit_onu_name`, `edit_onu_description`, `reboot_onu`, `disable_onu` |
| Demo | `view_dashboard`, `add_onu` (demo role untuk testing) |

### Frontend Permission Enforcement

- **Route level:** `ProtectedRoute` di `App.tsx` cek permission berdasarkan path
- **Sidebar:** `Sidebar.tsx` filter menu items berdasarkan permission; parent menu hanya tampil jika minimal 1 child visible
- **Component level:** `useHasPerm` hook untuk conditional render action buttons
- **Backend:** `@permission_required` decorator + `current_user.has_permission()` untuk granular checks

### Per-Action Permission Mapping (Backend)

| Action | Required Permission |
|--------|-------------------|
| reboot | `reboot_onu` |
| delete | `delete_onu` |
| clear-config | `configure_onu` |
| disable | `disable_onu` |
| enable | `disable_onu` |
| resync | `configure_onu` |
| restore-factory | `reset_onu` |
| restore-wifi | `configure_onu` |

### Per-Field Permission Mapping (Backend)

| Field | Required Permission |
|-------|-------------------|
| name | `edit_onu_name` |
| description | `edit_onu_description` |
| actual_type | `edit_onu_name` |
| onu_type | `configure_onu` |
| serial_number | `configure_onu` |
| onu_id | `configure_onu` |

---

## 9. Sync Flow

### poll_olt() — Step by Step

```
[5%]  SNMP: Connect & get system info (sysDescr, sysUpTime)
[10%] SNMP: System info parsed
[25%] SNMP: Walk signal tables (oper_state, rx_power, tx_power, olt_rx, serial)
       → Keyed by (ponIndex, onuSlot) composite key
       → Matched by serial number untuk Telnet enrichment

[30%] Telnet: Connect
[35%] Telnet: Collect chassis info (show card, show fan)
[38%] Telnet: Collect ALL ONU data (primary source)
       → show card → discover GPON cards (GTGH/GTGHG)
       → show gpon onu baseinfo per port → SN + onu_id
       → show gpon onu state per port → status (working/dyinggasp/los/offline)
       → show gpon onu detail-info per ONU → name, desc, distance
       → show gpon remote-onu equip per ONU → actual_type (Equipment ID)
       → show running-config → PPPoE usernames
       → Fallback: vendor name from SN prefix jika actual_type kosong

[75%] Telnet: ONU data complete
[90%] SNMP signal matched to Telnet ONUs by SN

[91%] Collect VLANs (show vlan summary + show running-config)
[92%] Collect ONU Types (show onu-type)
[93%] Collect Speed Profiles (show gpon profile tcont + traffic)
[94%] Collect WAN IP Profiles (show gpon profile wan-ip or fallback)
[95%] Collect Uplink Ports (show card → SMXA slots → show running-config + show interface + optical-module-info)
[96%] Collect PON Ports (per GPON card slot → show gpon onu state + show running-config interface + optical-module-info)

[97%] Done
[98%] Poll complete
```

### ONU Status Mapping (Telnet PhaseState)

| PhaseState (Telnet) | Status (DB) |
|---------------------|-------------|
| `working` | `online` |
| `logging` | `online` (negotiating) |
| `active` | `online` (activating) |
| `DyingGasp` | `dyinggasp` |
| `los` | `los` |
| lainnya | `offline` |

### ONU Vendor Detection (SN Prefix)

| Prefix | Vendor |
|--------|--------|
| FHTT, FHTC, FHHT | Fiberhome |
| HWTC, HWTB, HWTD, HWT9 | Huawei |
| ZTEG, ZICG, ZTES, ZTEI | ZTE |
| ALCL, ALCF | Alcatel-Lucent |
| ECRG, ECI0 | ECI |
| UBNT | Ubiquiti |
| SCOM | Sercomm |
| CXNK | Calix |
| DLNK | D-Link |
| TPNK | TP-Link |
| GSWD | Genexis |
| SPEN | Sagemcom |
| PRTL | Planet |

---

## 10. Deployment

### VPS Info

- **IP:** 192.168.54.246
- **Username:** root
- **App path:** /opt/fibernms/
- **Frontend dist:** /opt/fibernms/frontend/dist/
- **Service:** systemd fibernms
- **Python venv:** /opt/fibernms/.venv
- **Nginx config:** /etc/nginx/sites-available/fibernms

### Deploy Steps

```powershell
# 1. Build frontend
cd e:\nms\frontend
npm run build

# 2. Copy frontend dist to VPS
pscp -r -pw seven7890 e:\nms\frontend\dist\* root@192.168.54.246:/opt/fibernms/frontend/dist/

# 3. Copy backend files
pscp -pw seven7890 e:\nms\app.py e:\nms\models.py e:\nms\telnet_client.py e:\nms\sync_helper.py e:\nms\snmp_collector.py root@192.168.54.246:/opt/fibernms/

# 4. Restart service
plink -pw seven7890 root@192.168.54.246 "systemctl restart fibernms"

# 5. Verify
plink -pw seven7890 root@192.168.54.246 "systemctl is-active fibernms"
```

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Flask, SQLAlchemy, SQLite |
| SNMP | pysnmp 7.x (v1arch Slim API) |
| Telnet | Raw socket (telnetlib removed in Python 3.13+) |
| Frontend | React 19, TypeScript, Vite |
| State | Zustand (auth), React Query (data) |
| UI | TailwindCSS, Lucide icons |
| Deploy | Nginx reverse proxy, systemd |

### Known Gotchas

1. **`show vlan` alone** → "Incomplete command" — harus `show vlan summary`
2. **`show port` alone** → "Incomplete command" — harus `show running-config interface <port>`
3. **`show gpon profile wan-ip`** → mungkin error di beberapa firmware — fallback ke running-config
4. **TCONT/traffic profile format** → multi-line: `Profile name :xxx` header then data rows
5. **ONU type format** → multi-line block per type, parse as blocks
6. **Card types:** `GTGH`/`GTGHG`/`GTGO` → GPON cards; `SMXA` → Uplink cards
7. **Telnet uses raw sockets** — `telnetlib` removed in Python 3.13+
8. **pysnmp 7.x** — Each walk needs fresh `Slim(1)` instance
9. **SNMP oper_state lag** — SNMP reads cached value, Telnet is more current
10. **`show gpon onu state` footer** — `ONU Number: X/Y` line must be skipped to avoid overcounting
11. **`actual_type` source** — `show gpon remote-onu equip` (OMCI), NOT `show gpon onu detail-info` on V2.1
12. **Line wrapping** — ZTE C320 wraps long lines at ~80 chars, `_join_wrapped_lines()` handles this
13. **`show running-config pon-onu-mng {iface}`** — TIDAK valid di V2.1.0, hanya `show running-config interface {iface}` yang support per-ONU. Fallback ke full `show running-config` untuk pon-onu-mng section.
14. **ONU Detail page optimization** — `/api/onu/<id>/detail` adalah DB-only (instant). `/api/onu/<id>/live-detail` adalah Telnet lazy-load. Frontend tidak auto-refetch live data (manual refresh only via tombol "Refresh Live").
15. **All ONUs server-side pagination** — `/api/all-onus` menggunakan SQL `ILIKE` search, `joinedload` untuk eager loading `odp_port`, dan server-side pagination/sorting. Frontend mengirim `page`, `page_size`, `sort_by`, `sort_dir` params.
16. **Get Status optical parsing** — `show pon power attenuation` output: direction dan data di baris yang sama (`up Rx :val(dbm) Tx:val(dbm) val(dB)`), BUKAN di baris terpisah.
17. **Cloudflare Tunnel ingress port** — Service URL harus `http://localhost:8080` (match Nginx), BUKAN port 80. Port 80 → 502 Bad Gateway.
18. **CF API Token vs Tunnel Token** — Token dengan prefix `cfut_` adalah Tunnel Token (limited permissions). Untuk full API management (verify, PUT/DELETE tunnel config), gunakan proper API Token dengan permissions `Zone:DNS:Edit` + `Account:Tunnel:Edit`.
19. **Toast notification system** — Semua page menggunakan `../components/Toast` (custom). Tidak ada library eksternal (sonner dihapus). `<Toaster />` mounted once di `main.tsx`.
20. **Tenant deletion auto-reload** — Setelah delete tenant, AdminPanel auto-reload page setelah 1.5 detik untuk refresh semua data.
21. **WhatsApp notification on register** — `_send_registration_wa_notification()` dipanggil setelah CF setup. Menggunakan WA Native gateway (BotConfig `tenant_id=None`). Jika gateway tidak configured, skip gracefully (tidak block registrasi).
22. **Uplink IP Network via VLAN SVI** — ZTE C320/C300 TIDAK support `ip address` langsung di physical uplink port (gei/xgei). IP harus di-set di **VLAN interface (SVI)** dan VLAN di-tag ke uplink port:
    - `collect_uplinks()`: Baca `show ip interface brief` untuk mapping VLAN→IP, `show ip route` untuk default gateway. Match tagged VLANs di uplink port untuk populate `ip_vlan_id`, `ip_address`, `ip_mask`, `ip_gateway`.
    - `set_uplink_ip()`: Buat `interface vlan <id>` dengan `ip address <ip> <mask>`, tag VLAN ke uplink port via `switchport vlan <id> tag`, set default route via `ip route 0.0.0.0 0.0.0.0 <gateway>`.
    - Frontend: UplinkCard di OltConfiguration punya section "IP Network" dengan field VLAN ID, IP, mask, gateway.
    - DB: `OLTUplink` model punya column `ip_vlan_id`, `ip_address`, `ip_mask`, `ip_gateway`.

---

## 11. Cloudflare Tunnel Integration

### Config (system_config table)
| Key | Description |
|-----|-------------|
| `cf_api_token` | Cloudflare API Token |
| `cf_account_id` | Cloudflare Account ID |
| `cf_tunnel_id` | Cloudflare Tunnel ID |
| `cf_tunnel_name` | Cloudflare Tunnel Name |
| `cf_zone_name` | Zone/domain (e.g. `salfa.my.id`) |

### Auto-Provisioning Flow
1. Tenant registers via `/api/public/register`
2. `_add_cloudflare_tunnel_hostname()`:
   - Get zone ID from Cloudflare API
   - Create DNS CNAME: `{subdomain}.{zone}` → `{tunnel_id}.cfargotunnel.com`
   - Add ingress rule to tunnel config: hostname → `http://localhost:8080`
3. `_send_registration_wa_notification()`: Send WA with login details
4. On tenant delete: `_remove_cloudflare_tunnel_hostname()` cleans up DNS + ingress

### Subdomain Pattern
`{user_input}-nms.salfa.my.id` → CNAME → `{tunnel_id}.cfargotunnel.com` → ingress → `http://localhost:8080` (Nginx)

### Tenant URL Construction
- `_build_tenant_url()` in `services_wa.py` strips the first subdomain part from `base_url` to avoid double `nms`
- Example: `base_url=nms.salfa.my.id`, `subdomain=tenant-nms` → `https://tenant-nms.salfa.my.id` (NOT `tenant-nms.nms.salfa.my.id`)
- Same fix applied to payment callback redirect in `app.py`

---

## 12. WhatsApp Notification System

### Gateway
- WA Native gateway via `BotConfig` (`bot_type='whatsapp_native'`, `tenant_id=None`)
- API: `/send` endpoint, payload: `{phone, message}`
- Phone normalization: Indonesian prefixes handled by gateway

### Notification Types
| Function | Trigger | Content |
|----------|---------|---------|
| `_send_registration_wa_notification()` | Tenant registration | NMS name, tenant, package, trial end, dashboard URL, username, password, CF status |
| `_send_payment_wa_notification()` | Invoice created / payment success | Invoice details, amount, payment method |
| `_send_subscription_wa_notification()` | Subscription expiry (3d/7d) | Expiry warning, renewal link |
| `public_forgot_password` | Password reset request | New password |

---

## 13. Frontend Toast System

### Component: `frontend/src/components/Toast.tsx`
- Single global system, `<Toaster />` mounted in `main.tsx`
- Types: `success` (4s), `error` (5s), `warning` (4s), `info` (4s)
- API: `toast.success(msg)`, `toast.error(msg)`, `toast.warning(msg)`, `toast.info(msg)`
- Position: `fixed top-20 right-4 z-[9999]`
- Icons: CheckCircle, XCircle, AlertTriangle, Info (lucide-react)
- All 16+ pages use this system — no inline error divs, no external toast libraries
