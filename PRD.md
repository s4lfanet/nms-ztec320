# Salfanet NMS — Product Requirements Document (PRD)

## 1. Product Overview

**Product Name:** Salfanet NMS (Network Management System)
**Purpose:** A SaaS multi-tenant OLT (Optical Line Terminal) management system for FTTH (Fiber to the Home) network operators to manage ZTE C320/C300 OLTs and their connected ONUs. Features subdomain-based tenant isolation, subscription management with Duitku payment integration, and a modern React SPA frontend.
**Stack:** Python 3 / Flask / SQLAlchemy / React 19 / TypeScript / Vite / TailwindCSS
**Database:** SQLite (via SQLAlchemy ORM)
**Deployment:** Nginx reverse proxy, systemd, Cloudflare CDN

## 2. Target Users

- FTTH network engineers and operators (tenant users)
- NOC (Network Operations Center) staff
- ISP technicians managing ZTE OLT devices
- SaaS superadmin (platform operator)
- Tenant administrators (managing their own OLTs)

## 3. Core Features

### 3.1 Authentication & Authorization
- Login/logout with username/password
- Role-based access control (RBAC) with multi-tenant isolation
- Domain-based login: superadmin on main domain, tenants on subdomain only
- Rate limiting: 5 attempts per IP per 5 min, 15 min lockout
- Security headers: X-Frame-Options, X-Content-Type-Options, HSTS, etc.
- Superadmin URL: non-guessable path (`/secure-portal-x7k2`), main domain only
- Three default roles: Full Access, Viewer, Limited
- Permission-based feature gating

### 3.2 SaaS Multi-Tenant
- Tenant registration with subdomain provisioning
- Subscription packages (Starter/Business/Enterprise)
- Duitku payment integration (registration + renewal)
- Auto-activation on payment callback
- Tenant isolation: subdomain-based access, per-tenant data filtering
- Superadmin panel: tenant management, subscriptions, packages, notifications
- Tenant validation: invalid/suspended subdomains show error page
- Subscription enforcement: expired tenants blocked from dashboard

### 3.3 Dashboard
- OLT summary: total count, online/offline status
- ONU statistics: online, LOS, DyingGasp, offline, other
- Per-OLT cards showing temperature, uptime, fan status, ONU counts
- Real-time sync trigger from dashboard

### 3.4 ONU Management

#### All ONUs Page
- Table view of all ONUs across all OLTs
- Filter by OLT and status (online/offline/los/dyinggasp)
- Signal quality summary cards (Good ≥-26 dBm, Warning -26~-28 dBm, Critical <-28 dBm)
- Customizable column display
- Quick edit (name, description) inline
- Quick delete with confirmation
- Bulk select and bulk delete
- View detail link per ONU

#### View ONU Detail Page
- Full ONU information display (OLT, ONU ID, type, serial, signal, status, distance, etc.)
- Edit name and description
- Action buttons: Reboot, Reset, Clear Config, Delete
- WAN Services, Remote Access, VEIP, TR069, WiFi sections (UI framework)

#### Add ONU Page
- Scan unconfigured ONUs from OLT via Telnet CLI (`show gpon onu uncfg`)
- Pre-register ONU on OLT (`create gpon onu`)
- Template selection for provisioning

### 3.5 OLT Settings

#### OLT Management Table
- List all configured OLTs
- Display: Name, IP, Model, Firmware version
- Show: Temperature, Total ONU count, Uptime
- Sync status with progress bar
- Connection status (Telnet, SNMP)
- Actions: Edit, Sync, Configuration, Delete

#### Edit OLT Modal
- Load full OLT data from API (`GET /api/olt/<id>`)
- Editable fields: Name, IP, Type (vendor-model), SNMP community/port/version, Telnet username/password/port
- Test connection (SNMP + Telnet)
- Save with auto-connection test

### 3.6 OLT Configuration Page

#### Stats Row
- Card Uplink, Card GPON, Card EPON count
- Fan count, Total ONU, Online, LOS, DyingGasp, Offline, Other

#### Tabs
| Tab | Data Source | Content |
|-----|-----------|---------|
| **Uplinks** | `olt.uplinks` + `olt.cards` | Uplink port table (name, speed, admin/oper status, VLAN trunk, IP network config via VLAN SVI) or card info fallback |
| **PON Cards** | `olt.cards` | PON card info with port statistics (UP/Down/Shutdown) |
| **VLANs** | `olt.vlans` | VLAN ID, name, type (L2/L3), ONU profiles + **Rename/Delete** |
| **ONU Types** | `olt.onu_types_list` | Type name, PON type, description, max-tcont/gem/switch/ip-host/veip + **Add/Delete** |
| **WAN-IP Profiles** | `olt.wan_ip_profiles` | Profile name, IP, netmask, gateway, DNS + **Add/Delete** |
| **Speed Profiles** | `olt.speed_profiles` | TCONT profiles (name, type, fixed/assured/max BW) + Traffic profiles (name, SIR, PIR) + **Add/Delete** |
| **System** | `olt` table | Name, IP, model, vendor, firmware, temp, uptime, SNMP/Telnet status with badges |

### 3.7 Templates
- ONU provisioning templates (vendor, model, onu_type, tcont_profile, traffic_profile, VLAN)
- CRUD operations

### 3.8 TR069 Profiles
- ACS (Auto Configuration Server) configuration
- CRUD operations linked to OLT

### 3.9 Customization
- Configure which columns are visible in the All ONUs table
- Desktop and mobile visibility toggles

### 3.10 User Management
- Create/edit/delete users
- Role assignment
- Permission management

## 4. Data Collection Architecture

### 4.1 SNMP Collection (`SNMPCollector`)
- **Protocol:** SNMPv2c via pysnmp 7.x Slim API
- **Collects:** System info (sysDescr, sysUptime), ONU signal power (rx/tx), ONU serial numbers
- **OIDs:** ZTE C320 MIB extensions

### 4.2 Telnet Collection (`TelnetCollector`)
- **Protocol:** Raw socket Telnet (Python 3.13+ compatible, no telnetlib dependency)
- **CLI Commands Used:**

| Command | Purpose | Parser |
|---------|---------|--------|
| `show card` | Card slot discovery & status | `_parse_show_card()` |
| `show fan` | Fan RPM and status | `_parse_show_fan()` |
| `show gpon onu baseinfo gpon-olt_X/Y/Z` | ONU serial numbers per PON port | Inline in `collect_all_onus()` |
| `show gpon onu state gpon-olt_X/Y/Z` | ONU online/offline status | Inline in `collect_all_onus()` |
| `show gpon onu detail-info gpon-onu_X/Y/Z:N` | ONU name, desc, type, distance | Inline in `collect_all_onus()` |
| `show gpon onu uncfg` | Unregistered ONUs | `collect_unregistered_onus()` |
| `show vlan summary` | VLAN configuration list | `collect_vlans()` |
| `show onu-type` | Supported ONU types | `collect_onu_types()` |
| `show gpon profile tcont` | TCONT bandwidth profiles | `collect_speed_profiles()` |
| `show gpon profile traffic` | Traffic shaping profiles | `collect_speed_profiles()` |
| `show gpon profile wan-ip` | WAN IP provisioning profiles | `collect_wan_ip_profiles()` |
| `show running-config interface gei_1/3/X` | Uplink port config | `collect_uplinks()` |
| `show running-config interface xgei_1/3/X` | 10G uplink port config | `collect_uplinks()` |
| `show ip interface brief` | VLAN interface IP summary | `collect_uplinks()` |
| `show ip route` | IP routing table (default gateway) | `collect_uplinks()` |
| `show gpon onu state gpon-olt_X/Y/Z` | PON port ONU stats | `collect_pon_port_stats()` |
| `show running-config interface gpon-olt_X/Y/Z` | PON port config | `collect_pon_port_stats()` |
| `reset gpon onu gpon-onu_X/Y/Z:N` | Reboot ONU | `reset_onu()` |
| `delete gpon onu gpon-onu_X/Y/Z:N` | Deregister ONU | `deregister_onu()` |
| `create gpon onu ...` | Register new ONU | `register_onu()` |

### 4.3 Sync Process
1. SNMP: System info + signal power collection
2. Telnet: Chassis info (cards, fans, temp)
3. Telnet: ONU data collection (primary source for name, SN, status, type, distance)
4. Telnet: VLAN, ONU Type, Speed Profile, WAN IP, Uplink collection
5. Data merge: SNMP signal + Telnet ONU data
6. Database update: OLT stats, ONU records, config data

## 5. Database Schema

### Tables
| Table | Purpose |
|-------|---------|
| `olts` | OLT device configuration & statistics |
| `onus` | ONU records linked to OLT |
| `olt_cards` | Chassis card info from CLI |
| `olt_uplinks` | Uplink port info + traffic stats + error counters + IP network config (VLAN SVI: ip_vlan_id, ip_address, ip_mask, ip_gateway) |
| `olt_pon_ports` | PON port info + ONU counts |
| `fans` | Fan hardware records |
| `olt_sync_status` | Sync progress tracking |
| `onu_vlans` | VLAN config (vlan_id, name, type L2/L3, onu_profiles) |
| `onu_types` | ONU types (type_name, pon_type, description, max_tcont/gem/switch/ip_host/veip) |
| `speed_profiles` | TCONT + Traffic bandwidth profiles |
| `wan_ip_profiles` | WAN IP provisioning profiles |
| `templates` | ONU provisioning templates |
| `tr069_profiles` | TR069 ACS configuration |
| `onu_custom_columns` | Customizable table columns |
| `roles` | User roles with permissions |
| `users` | Login accounts |

## 6. API Endpoints

### OLT Management
- `POST /api/olt` — Create OLT
- `GET /api/olt/<id>` — Get OLT data
- `PUT /api/olt/<id>` — Update OLT
- `DELETE /api/olt/<id>` — Delete OLT + children
- `POST /api/olt/<id>/sync` — Trigger sync
- `GET /api/olt/<id>/sync-status` — Get sync progress
- `POST /api/olt/<id>/test-connection` — Test SNMP + Telnet

### OLT Configuration
- `POST /api/olt/<id>/uplink/<uplink_id>/toggle` — Enable/Disable uplink port
- `POST /api/olt/<id>/uplink/<uplink_id>/configure` — Edit port config (speed, duplex, etc.)
- `POST /api/olt/<id>/uplink/<uplink_id>/description` — Edit description
- `POST /api/olt/<id>/uplink/<uplink_id>/vlan` — Set VLAN trunk
- `POST /api/olt/<id>/uplink/<uplink_id>/vlan/remove` — Remove VLANs from port
- `POST /api/olt/<id>/uplink/<uplink_id>/ip` — Set/remove IP on VLAN interface (SVI) tagged to uplink port
- `POST /api/olt/<id>/uplink/refresh` — Re-collect uplink data
- `GET /api/olt/<id>/pon-ports` — List PON ports
- `GET /api/olt/<id>/pon-stats/<slot>` — Per-port ONU stats
- `POST /api/olt/<id>/pon-port/<port_id>/toggle` — Enable/Disable PON port
- `POST /api/olt/<id>/pon-port/<port_id>/edit` — Edit PON port name/description
- `POST /api/olt/<id>/vlan/<vlan_id>/rename` — Rename VLAN
- `POST /api/olt/<id>/vlan/<vlan_id>/delete` — Delete VLAN
- `POST /api/olt/<id>/onu-type/add` — Add ONU type
- `POST /api/olt/<id>/onu-type/<type_id>/delete` — Delete ONU type
- `POST /api/olt/<id>/tcont/add` — Add TCONT profile
- `POST /api/olt/<id>/tcont/<profile_id>/delete` — Delete TCONT
- `POST /api/olt/<id>/traffic/add` — Add Traffic profile
- `POST /api/olt/<id>/traffic/<profile_id>/delete` — Delete Traffic
- `POST /api/olt/<id>/wan-ip/add` — Add WAN IP profile
- `POST /api/olt/<id>/wan-ip/<profile_id>/delete` — Delete WAN IP

### ONU Management
- `POST /api/onu/<id>/update` — Update name/desc/pppoe
- `POST /api/onu/<id>/delete` — Delete ONU
- `POST /api/onu/<id>/action` — CLI action (reboot/reset/delete/clear-config)
- `POST /api/pre-register` — Register new ONU
- `POST /api/scan-unconfigured` — Scan unregistered ONUs

### Template/TR069/User/Role/Customization
- Standard CRUD endpoints for each entity

## 7. Non-Functional Requirements

- **Performance:** Sync should complete within 2 minutes for 128 ONUs per OLT
- **Compatibility:** ZTE C320, C300, C300-M firmware V2.x
- **Security:** Passwords hashed with werkzeug, session-based auth, domain-based login isolation, rate limiting, security headers
- **Scalability:** SQLite for single-server, can be migrated to PostgreSQL
- **Browser Support:** Modern browsers (Chrome, Firefox, Edge)
- **Multi-Tenant:** Subdomain-based isolation, shared session cookie across subdomains

## 8. Future Enhancements

- [ ] Huawei OLT support (MA5608T, MA5800)
- [ ] Real-time WebSocket notifications
- [ ] SNMP trap receiver
- [ ] Bulk ONU provisioning from CSV
- [ ] ONU firmware upgrade management
- [ ] Bandwidth monitoring graphs (RRD/InfluxDB)
- [ ] RESTful API documentation (Swagger/OpenAPI)
- [ ] Multi-language support
- [ ] Dark mode theme
- [ ] CSP header via Nginx
- [ ] Environment-based SECRET_KEY
- [ ] IP whitelist for superadmin URL
- [ ] Session idle timeout
- [ ] Password complexity requirements
