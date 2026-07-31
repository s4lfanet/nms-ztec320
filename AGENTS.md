# AGENTS.md — AI Agent Handoff Guide

## Project Context

This is a **SaaS multi-tenant multi-vendor OLT management system** (Salfanet NMS) built with Flask + React. It manages FTTH (Fiber to the Home) network infrastructure — OLT devices from multiple vendors (ZTE, HSGQ, Raisecom, BDCOM, C-Data, VSOL, Huawei, FiberHome, Dasan) and their connected ONUs (Optical Network Units). Features multi-tenant architecture with subdomain-based isolation, subscription management, Duitku payment integration, and vendor-specific adapter pattern for SNMP/CLI data collection.

**Branding:** The system is branded as "Salfanet NMS" (configured via `SystemConfig` table, fetched from `/api/public/branding`).

## Architecture Overview

```
User Browser ↔ Flask (app.py) ↔ SQLite (models.py)
                    ↕
     services_sync.py → vendor adapter poll_olt()
          ↕                    ↕
   ZTE: snmp_collector    HSGQ/Raisecom/EPON: SNMP-only via olt_adapters/
   (SNMP + Telnet)        (snmp_oids.py vendor OIDs)
```

### Data Flow (Multi-Vendor)
1. User triggers "Sync" from UI
2. Flask starts background thread via `services_sync.py`
3. `services_sync.py` gets vendor adapter from `RackAdapterRegistry.get_adapter(olt)`
4. If adapter has `poll_olt()` → calls `adapter.poll_olt()` (vendor-specific SNMP/CLI collection)
5. If no adapter registered → fallback to `snmp_collector.poll_olt()` (ZTE C320 legacy path)
6. Results saved to SQLite via `sync_helper.save_sync_result()`
7. UI auto-refreshes to show new data

### Vendor Adapter Architecture (`olt_adapters/`)
- **`base.py`** — `BaseOLTAdapter` abstract class: `get_rack_data()`, `poll_olt()`, `collect_onus()`, `collect_chassis()`, `normalize_port()`, `normalize_slot()`
- **`registry.py`** — `RackAdapterRegistry` registers adapters by vendor name, `get_adapter(olt)` returns instance
- **`normalized.py`** — Data classes: `RackData`, `NormalizedSlot`, `NormalizedPort`, `NormalizedFan`, `NormalizedPsu`
- **`snmp_oids.py`** — Per-vendor SNMP OID mappings + CLI command templates (ZTE, HSGQ, Raisecom, BDCOM, C-Data, VSOL, Huawei, FiberHome, Dasan)
- **`zte_adapter.py`** — ZTE adapter: `poll_olt()` delegates to `snmp_collector.poll_olt()` (legacy, untouched)
- **`hsgq_adapter.py`** — HSGQ EPON adapter: SNMP-based ONU collection using enterprise OID `.50224`
- **`raisecom_adapter.py`** — Raisecom GPON adapter: SNMP-based using enterprise OID `.8886.18`
- **`standalone_epon_adapter.py`** — Generic EPON adapter for BDCOM/C-Data/VSOL: dynamic vendor OID selection
- **`__init__.py`** — Auto-registers all adapters in `RackAdapterRegistry`

### Sync Dispatch Points
All three sync entry points use vendor adapter dispatch:
1. `services_sync.py` — `run_single_sync()`, `run_sync_all()` (UI-triggered)
2. `auto_sync.py` — Cron-based auto-sync
3. `app.py` — Auto-sync after ONU action (reboot/delete/clear-config)

Pattern:
```python
adapter = RackAdapterRegistry.get_adapter(olt)
if adapter and hasattr(adapter, 'poll_olt'):
    result = adapter.poll_olt(progress_cb=update_progress)
else:
    from snmp_collector import poll_olt
    result = poll_olt(olt, progress_cb=update_progress)
```

## Critical Files & Their Roles

| File | Role | Key Points |
|------|------|------------|
| `app.py` | Routes + API + sync orchestration | ~7300 lines. All routes in one file. Sync runs in `threading.Thread`. ONU detail split: DB-only `/detail` + Telnet `/live-detail`. SaaS: tenant registration, Duitku payment, subscription management, superadmin panel. Cloudflare Tunnel API integration for auto subdomain provisioning. WhatsApp notification on registration. Security: rate limiting, security headers (CSP includes Cloudflare Insights), domain-based access control. Error handlers for 500/404/Exception. Auto-sync after ONU action uses vendor adapter dispatch. Technician assignment (`/api/technicians`, technician_id in pre-register/update ONU). RX power color ranges (`/api/customization/rx-colors` stored in SystemConfig). ODP port assignment (`odp_port_id` in update ONU API). WiFi SSID config: Open auth sends explicit `no-auth`, `encrypt none`, `no-key` OMCI commands. RX power signal stats use dynamic color ranges from SystemConfig. Subscription expiry notifications include in-app bell notifications for super admin. |
| `models.py` | SQLAlchemy models | 20+ tables. Uses `db.create_all()` + Flask-Migrate for migrations. SaaS tables: `tenants`, `subscription_packages`, `subscriptions`, `payment_transactions`, `invoices`, `subscription_notifications`. ONU model has `technician_id` FK to `users` table for field technician assignment. |
| `snmp_core.py` | SNMP core collector | ~320 lines. OIDs, decode/parse functions (`decode_rx_power`, `parse_serial`, `detect_vendor_from_sn`, etc.), `SNMPCollector` class (pysnmp 7.x Slim API). |
| `telnet_client.py` | Telnet CLI collector | ~4330 lines. `SimpleTelnet` class (raw socket, IAC negotiation), `TelnetCollector` class (ZTE C320/C300 CLI commands: ONU management, VLAN, profiles, uplinks, PON ports, uplink IP network config via VLAN SVI). WiFi SSID OMCI config: `register_onu_template()` and `register_unified()` both handle open auth with explicit `no-auth`/`encrypt none`/`no-key` commands. Audit logging for open auth WiFi config. |
| `snmp_collector.py` | Compatibility shim | ~155 lines. Re-exports from `snmp_core` + `telnet_client`. Contains `poll_olt()` orchestrator. All existing `from snmp_collector import X` still works. |
| `extensions.py` | Shared Flask extensions | `db`, `login_manager`, `migrate`, `logger` instances. `MultiTenantSessionInterface` class for isolated admin/tenant session cookies. Breaks circular imports between app.py and blueprint modules. |
| `helpers.py` | Shared helper functions | `utc_iso`, `log_action`, `permission_required`, `super_admin_required`, `get_tenant_id`, `tenant_filter`, `check_subscription`, `check_olt_limit`, rate limiting functions. |
| `logging_config.py` | Structured logging | JSON formatter for production, human-readable for dev. Use `from extensions import logger`. |
| `services_cf.py` | Cloudflare Tunnel service | `get_cloudflare_config()`, `add_tunnel_hostname()`, `remove_tunnel_hostname()`. DNS CNAME + ingress rule management. |
| `services_wa.py` | WhatsApp notification service | `send_payment_notification()`, `send_registration_notification()`, `send_subscription_notification()`, `get_nms_branding()`. `_build_tenant_url()` constructs tenant login URL (strips first subdomain part from base_url to avoid double `nms`). |
| `services_sync.py` | OLT sync service | `start_single_sync()`, `start_sync_all()`. Dispatches to vendor adapter `poll_olt()` if registered, else fallback to ZTE `snmp_collector.poll_olt()`. Background thread management. |
| `routes_auth.py` | Auth Blueprint | Login, logout, API auth endpoints. Blueprint name: `auth`. |
| `sync_helper.py` | Sync result persistence | `save_sync_result()` persists poll_olt results to DB. Clears RX/TX for non-online ONUs (dyinggasp/offline/los). Graceful `.get()` for multi-vendor ONU data (non-ZTE may lack frame/slot/port). |
| `olt_adapters/` | Multi-vendor adapter package | Vendor-specific adapters, SNMP OID mappings, normalized data classes, registry. See "Vendor Adapter Architecture" above. |
| `migrate.py` | Flask-Migrate CLI | `py -3 migrate.py <init|migrate|upgrade|current>` for database migrations. |
| `tests/test_basic.py` | Unit tests | Auth endpoints, public API, security headers, helpers, models. Run: `py -3 -m pytest tests/ -v` |
| `frontend/src/` | React SPA (Vite+TS) | React 19, TailwindCSS v4, React Query, Zustand. Code splitting via `React.lazy` + vendor chunks. Server-side pagination on AllOnus. Multi-vendor rack diagrams via `RackDiagramRouter`. RX values display N/A for non-online ONUs. Customization page with 4 tabs: Desktop columns, Mobile columns, Signal Filter, RX Colors. AllOnus has inline editing for Technician & ODP port columns. PowerBadge uses configurable RX color ranges. Signal stat cards use dynamic RX color ranges from customization. Theme: Fiber Optic NOC palette (Space Grotesk + DM Sans fonts, fiber-teal accent). Optimistic logout (clears user state immediately, API call in background). |
| `templates/*.html` | Legacy Jinja2 templates | Login, dashboard, and some admin pages still server-rendered. |
| `frontend/src/components/rack/` | Rack diagram components | `RackDiagramRouter` dispatches to `ZteRackDiagram`, `HsgqRackDiagram`, `RaisecomRackDiagram`, `StandaloneEponRackDiagram` based on OLT vendor. |
| `frontend/src/hooks/` | React hooks | `useRackData` (fetch normalized rack data), `useRackMetrics` (aggregate metrics). |
| `frontend/src/types/rack.ts` | TypeScript interfaces | `RackData`, `NormalizedSlot`, `NormalizedPort`, `NormalizedFan`, `NormalizedPsu` for frontend. |
| `frontend/src/pages/Customization.tsx` | Customization page | 4 tabs: Desktop (column visibility/reorder), Mobile (column visibility), Signal Filter (critical/good thresholds with slider), RX Colors (configurable RX power color ranges with preview). Uses `api.getRxColors`/`api.saveRxColors` for RX color ranges. |
| `olt_configuration.html` | OLT config page | 7 tabs: Uplinks, PON Cards, VLANs, ONU Types, WAN-IP, Speed Profiles, System |
| `frontend/src/pages/RegisterWizard.tsx` | ONU Register Wizard | Multi-step wizard: Select OLT → Scan ONUs → Configure (template selection: ZTE Single/Dual/Multi, Huawei Full, Fiberhome VEIP) → Review & Register. WiFi SSID config with auth type dropdown (Open/WPA/WPA2/Mixed). Open auth hides password field and generates explicit `no-auth`/`encrypt none`/`no-key` OMCI commands. Fiberhome VEIP template uses TR069 Profile dropdown (same as ZTE templates) instead of manual ACS fields. Script preview shows exact CLI commands. |
| `frontend/src/pages/ProvisionWizard.tsx` | ONU Provision Wizard | Unified wizard with optional manual/pre-config mode. WiFi SSID config with auth type, password hidden for Open auth. Script preview generates correct OMCI commands including open auth `no-auth`/`encrypt none`/`no-key`. TR069 profile dropdown for ACS config. |
| `frontend/src/stores/auth.ts` | Zustand auth store | `fetchUser`, `login`, `logout`. Logout is optimistic — clears user state immediately, fires API call in background without awaiting. Prevents UI delay on logout. |

## CLI Command Reference (ZTE C320 V2.1.0)

```text
# System & Chassis
show card                              # Card slot discovery
show fan                               # Fan RPM & status

# ONU Management
show gpon onu baseinfo gpon-olt_X/Y/Z  # ONU serial numbers per PON port
show gpon onu state gpon-olt_X/Y/Z     # ONU online/offline status
show gpon onu detail-info gpon-onu_X/Y/Z:N  # ONU name, desc, type, distance
show gpon onu uncfg                    # Unregistered ONUs

# ONU Actions
reset gpon onu gpon-onu_X/Y/Z:N       # Reboot ONU
delete gpon onu gpon-onu_X/Y/Z:N      # Deregister ONU
create gpon onu gpon-olt_X/Y/Z:N type TYPE sn SERIAL  # Register ONU

# VLAN Management (in vlan database context)
show vlan summary                      # Lists all VLAN IDs (comma-separated)
vlan <id> name <name>                  # Rename VLAN
no vlan <id>                           # Delete VLAN
show vlan <id>                         # VLAN detail (works from vlan database context)

# ONU Type Management (in pon context)
onu-type <name> gpon description <desc>  # Create ONU type
no onu-type <name>                        # Delete ONU type
show onu-type                             # List all ONU types

# TCONT/Traffic/WAN-IP Profiles (in gpon context)
profile tcont <name> type <N> maximum <bw>  # Create TCONT profile
profile traffic <name> sir <sir> pir <pir>  # Create traffic profile
profile wan-ip <name> ipaddress <ip> netmask <mask> gateway <gw>  # Create WAN IP
no profile tcont <name>                      # Delete TCONT
no profile traffic <name>                    # Delete traffic
no profile wan-ip <name>                     # Delete WAN IP

# Uplink Interfaces (on SMXA cards)
show running-config interface gei_1/3/X   # 1G uplink port config
show running-config interface xgei_1/3/X  # 10G uplink port config
show ip interface brief                   # VLAN interface IP summary
show ip route                             # IP routing table (default gateway)

# Uplink IP Network (L3 via VLAN SVI)
interface vlan <id>                       # Create/select VLAN interface
  ip address <ip> <mask>                  # Set IP on VLAN interface
  no ip address                           # Remove IP from VLAN interface
switchport vlan <id> tag                  # Tag VLAN to uplink port (in interface context)
ip route 0.0.0.0 0.0.0.0 <gateway>        # Set default gateway
```

## Known Gotchas

1. **`show vlan` alone returns "Incomplete command"** — Must use `show vlan summary` then enter `vlan database` context for details.

2. **`show port` returns "Incomplete command"** — Must use `show running-config interface <portname>` for uplink ports.

3. **`show gpon profile wan-ip` may return error on some firmware** — The collector checks for `%Error` and returns empty list gracefully.

4. **TCONT/traffic profile format** — Multi-line: `Profile name :xxx` header then data rows. Parser must track current profile name across lines.

5. **ONU type format** — Multi-line block per type: `ONU type name:`, `PON type:`, `Description:`, etc. Must parse as blocks, not lines.

6. **Card types matter for tab filtering:**
   - `GTGH`/`GTGHG`/`GTGO` → GPON cards → shown in PON Cards tab
   - `SMXA` → Uplink cards → shown in Uplinks tab

7. **VLAN names** — Retrieved from running-config `vlan database` section. Only VLANs with explicit `name` command have names.

8. **Telnet uses raw sockets** — `telnetlib` was removed in Python 3.13+. `SimpleTelnet` class handles IAC negotiation manually.

9. **pysnmp 7.x Slim API** — Uses `Slim(1)` from `pysnmp.hlapi.v1arch.asyncio`. Each walk needs a fresh `Slim` instance.

10. **`actual_type` (ONU model) — source: `show gpon remote-onu equip`** — The correct command to get ONU hardware model is:
    ```
    show gpon remote-onu equip gpon-onu_1/1/1:N
    ```
    Uses OMCI to read directly from ONU. Works on V2.1.0+. Returns `Equipment ID:`, `Model:`, `Vendor ID:`, `H/W Version:`, `S/W Version:`, `System uptime:`, etc.
    - Verified working: Fiberhome (HG6045F3), Huawei (HG8245H5), ZTE (F663NV3A)
    - Offline ONUs won't respond (need active OMCI session) — their `actual_type` retains last DB value

    **Commands that do NOT work on V2.1.0:**
    - `show gpon onu version/omci-info/software-version` → `%Error: Invalid command`
    - `show gpon onu equip ...` → `%Error: Invalid command` (wrong syntax — must use `remote-onu`)
    - `show gpon onu detail-info` → no `Equipment ID:` field on V2.1 (V2.2+ only)
    - `show gpon onu baseinfo` → `Type: All` for all ONUs

    **Sync priority in `snmp_collector.py` (step 2b / 4b):**
    1. `remote-onu equip` Equipment ID/Model → `actual_type` (always update if specific model found)
    2. Vendor name from SN prefix → fallback only when `actual_type` still empty after step 1
    3. Manual edits via UI → never overwritten by vendor-name fallback

    `detect_model_from_sn()` is deprecated (wrong hardcoded guesses) — do not call it.

11. **ONU Status: `show gpon onu state` PhaseState** — Telnet is the primary source for ONU status. PhaseState column values:
    - `working` → `'online'`
    - `logging` / `active` → `'online'` (negotiating/activating)
    - `DyingGasp` → `'dyinggasp'` (ONU sent power-off signal)
    - `los` → `'los'` (Loss of Signal)
    - anything else → `'offline'`

    **SNMP `oper_state` (OID `.3.50.12.1.1.6`) must NOT override Telnet status** — on ZTE C320 V2.1.0, SNMP oper_state returns 4 (online) for DyingGasp ONUs because SNMP reads a cached/lagged value. Telnet state is more current (runs AFTER SNMP walk in `poll_olt()`).

    **ONU count bug fix** — `show gpon onu state` has a footer line `ONU Number: X/Y` containing `/` and `:` which was previously counted as an ONU entry (overcounting by 1 per port). Fix: skip lines starting with `ONU`. After sync, `olt_pon_ports.onu_count/online/offline` is recalculated from actual `onus` table rows to ensure consistency with All ONUs page.

12. **RX/TX values for non-online ONUs** — SNMP returns cached/last-known RX/TX values for offline/dyinggasp/los ONUs. This is misleading. Fix applied in 3 layers:
    - **`snmp_collector.py`**: Skip SNMP RX/TX enrichment for non-online ONUs (set to `None`)
    - **`sync_helper.py`**: When saving to DB, if `onu.status != 'online'`, force `rx_power`, `onu_rx_power`, `tx_power` = `None`
    - **Frontend (`AllOnus.tsx`, `ViewOnu.tsx`)**: Guard display — pass `null` to `PowerBadge`/`SignalBox` when `onu.status !== 'online'`
    - Status `dyinggasp` is preserved as-is (NOT remapped to `offline`) — it's a meaningful state showing ONU sent power-off signal

13. **Multi-vendor sync dispatch** — All sync entry points (`services_sync.py`, `auto_sync.py`, `app.py` auto-sync) use `RackAdapterRegistry.get_adapter(olt)` to dispatch to vendor-specific `poll_olt()`. ZTE adapter delegates to legacy `snmp_collector.poll_olt()` — zero disruption to existing ZTE C320 functionality. Non-ZTE adapters (HSGQ, Raisecom, Standalone EPON) implement SNMP-based collection using vendor-specific enterprise OIDs from `snmp_oids.py`.

14. **`sync_helper.py` graceful field handling** — Non-ZTE vendor ONUs may not have `frame/slot/port/onu_id` fields. `save_sync_result()` uses `.get()` with defaults (frame=1, slot=1, port=1, onu_id=idx) instead of direct dict access.

15. **Uplink IP Network via VLAN SVI** — ZTE C320/C300 does NOT support `ip address` directly on physical uplink ports (gei/xgei). IP must be set on a **VLAN interface (SVI)** and the VLAN tagged to the uplink port:
    - `collect_uplinks()`: Reads `show ip interface brief` for VLAN→IP mapping, `show ip route` for default gateway. Matches tagged VLANs on uplink ports to populate `ip_vlan_id`, `ip_address`, `ip_mask`, `ip_gateway`.
    - `set_uplink_ip()`: Creates `interface vlan <id>` with `ip address <ip> <mask>`, tags VLAN to uplink port via `switchport vlan <id> tag`, sets default route via `ip route 0.0.0.0 0.0.0.0 <gateway>`.
    - Frontend: UplinkCard in OltConfiguration has "IP Network" section with VLAN ID, IP, mask, gateway fields.
    - DB: `OLTUplink` model has `ip_vlan_id`, `ip_address`, `ip_mask`, `ip_gateway` columns.

16. **WiFi SSID Open Auth OMCI Config** — When `auth_type = open`, ZTE OMCI requires **3 explicit commands** to fully clear previous WPA config. Sending only `no-auth` leaves encryption AES + old key active, so SSID still requires password:
    ```text
    ssid auth wpa wifi_0/N no-auth       # Set auth mode to OPEN
    ssid auth wpa wifi_0/N encrypt none  # Clear encryption to NONE
    ssid auth wpa wifi_0/N no-key        # Clear existing WPA key
    ```
    - Applied in 3 backend locations: `telnet_client.py` `register_onu_template()`, `register_unified()`, and `app.py` WiFi update endpoint
    - Applied in 2 frontend script previews: `RegisterWizard.tsx`, `ProvisionWizard.tsx`
    - Dual-band: Both 2.4GHz (`wifi_0/1`) and 5GHz (`wifi_0/5`) get explicit open auth commands via SSID array iteration
    - Audit logging: `logger.info()` in both backend methods for troubleshooting
    - Frontend UI: Password field hidden when `auth === 'open'` in both wizards

17. **Fiberhome VEIP TR069 Profile** — Fiberhome VEIP template in RegisterWizard uses the same TR069 Profile dropdown as ZTE templates (pulls from `tr069Profiles` list). Replaces manual ACS URL/Username/Password fields. Selecting a profile auto-fills ACS URL, credentials, VLAN, and VLAN mode.

18. **CSP Cloudflare Insights** — Content Security Policy `script-src` must include `https://static.cloudflareinsights.com` to allow the Cloudflare Insights beacon. Without it, console errors appear on every page load.

19. **Optimistic Logout** — `auth.ts` store clears user state immediately on `logout()` and fires `api.logout()` in background without awaiting. Prevents UI delay — `ProtectedRoute` redirects to `/` instantly when `user` becomes `null`.

## Database Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `olts` | OLT devices | name, ip, vendor, model, firmware_version, snmp_*, telnet_* |
| `onus` | ONU records | olt_id, onu_index, frame/slot/port/onu_id, serial_number, name, status, rx_power, technician_id (FK users), distance (in meters, decoded by `decode_distance` × 0.112) |
| `olt_cards` | Card info from CLI | olt_id, slot, card_type, status, total_ports, ports_up/down |
| `olt_pon_ports` | PON port info | olt_id, port_number, port_name, admin_status, name, description, onu_count/online/offline |
| `olt_uplinks` | Uplink port info | olt_id, port_name, speed, admin/oper_status, duplex, medium, vlans_tagged, traffic stats, errors, ip_vlan_id, ip_address, ip_mask, ip_gateway (L3 VLAN SVI config) |
| `onu_vlans` | VLAN config | olt_id, vlan_id, vlan_name, vlan_type (L2/L3), onu_profiles |
| `onu_types` | ONU types | olt_id, type_name, pon_type, description, max_tcont/gem/switch/ip_host/veip |
| `speed_profiles` | TCONT + Traffic | olt_id, profile_type (tcont/traffic), name, type_val, fixed/assured/max_bandwidth, sir, pir |
| `wan_ip_profiles` | WAN IP profiles | olt_id, name, ip_address, netmask, gateway, dns1, dns2 |
| `fans` | Fan info | olt_id, fan_number, status, rpm, speed_level |
| `olt_sync_status` | Sync tracking | olt_id, progress, status, message |
| `templates` | ONU templates | name, vendor, model, onu_type, tcont_profile, traffic_profile, vlan |
| `tr069_profiles` | TR069 ACS | name, acs_url, acs_username/password, default_olt_id, vlan |
| `onu_custom_columns` | Column config | column_name, column_key, visible_desktop/mobile, tenant_id |
| `roles` + `users` | RBAC | Role-based permissions, tenant_id, is_super_admin |
| `tenants` | SaaS tenants | name, subdomain, status (active/suspended/pending), contact info |
| `subscription_packages` | SaaS packages | name, max_olts, price, billing_cycle, features |
| `subscriptions` | Tenant subscriptions | tenant_id, package_id, start/end_date, status, max_olts |
| `payment_transactions` | Duitku payments | order_id, amount, payment_method, status, callback data |
| `invoices` | Billing invoices | tenant_id, subscription_id, amount, status, due_date |
| `subscription_notifications` | WA notifications | subscription_id, notification_type (expiry_3d/7d) |
| `action_logs` | Audit log | user_id, username, action, category, target, detail, ip_address |
| `alert_rules` | Alert config | tenant_id, rule_type, thresholds |
| `bot_config` | Bot config | tenant_id, bot_type (telegram/discord/whatsapp) |
| `system_config` | System settings | key-value pairs (nms_name, rx_color_ranges JSON, etc.) |

## API Endpoints Summary

### OLT Management
- `POST /api/olt` — Create OLT
- `GET /api/olt/<id>` — Get OLT data (for edit modal)
- `PUT /api/olt/<id>` — Update OLT
- `DELETE /api/olt/<id>` — Delete OLT
- `POST /api/olt/<id>/sync` — Trigger sync
- `GET /api/olt/<id>/sync-status` — Poll sync progress
- `POST /api/olt/<id>/test-connection` — Test SNMP + Telnet

### Uplink Port Management
- `POST /api/olt/<id>/uplink/<uplink_id>/toggle` — Enable/Disable port
- `POST /api/olt/<id>/uplink/<uplink_id>/configure` — Edit port config (speed, duplex, etc.)
- `POST /api/olt/<id>/uplink/<uplink_id>/description` — Edit description
- `POST /api/olt/<id>/uplink/<uplink_id>/vlan` — Set VLAN trunk
- `POST /api/olt/<id>/uplink/<uplink_id>/vlan/remove` — Remove VLANs from port
- `POST /api/olt/<id>/uplink/<uplink_id>/ip` — Set/remove IP on VLAN interface (SVI) tagged to uplink port
- `POST /api/olt/<id>/uplink/refresh` — Re-collect uplink data

### PON Port Management
- `GET /api/olt/<id>/pon-ports` — List PON ports
- `GET /api/olt/<id>/pon-stats/<slot>` — Per-port ONU stats
- `POST /api/olt/<id>/pon-port/<port_id>/toggle` — Enable/Disable PON port
- `POST /api/olt/<id>/pon-port/<port_id>/edit` — Edit PON port name/description

### VLAN Management
- `POST /api/olt/<id>/vlan/<vlan_id>/rename` — Rename VLAN
- `POST /api/olt/<id>/vlan/<vlan_id>/delete` — Delete VLAN

### ONU Type Management
- `POST /api/olt/<id>/onu-type/add` — Add ONU type
- `POST /api/olt/<id>/onu-type/<type_id>/delete` — Delete ONU type

### Speed Profile Management
- `POST /api/olt/<id>/tcont/add` — Add TCONT profile
- `POST /api/olt/<id>/tcont/<profile_id>/delete` — Delete TCONT
- `POST /api/olt/<id>/traffic/add` — Add Traffic profile
- `POST /api/olt/<id>/traffic/<profile_id>/delete` — Delete Traffic

### WAN IP Profile Management
- `POST /api/olt/<id>/wan-ip/add` — Add WAN IP profile
- `POST /api/olt/<id>/wan-ip/<profile_id>/delete` — Delete WAN IP

### ONU Management
- `POST /api/onu/<id>/update` — Update name/desc/pppoe/technician_id/odp_port_id
- `POST /api/onu/<id>/delete` — Delete ONU
- `POST /api/onu/<id>/action` — CLI action (reboot/reset/delete/clear-config)
- `GET /api/onu/<id>/detail` — DB-only ONU detail (instant, no Telnet)
- `GET /api/onu/<id>/live-detail` — Live ONU data from Telnet (lazy, slow)
- `POST /api/onu/<id>/get-status` — Full Get Status (interface, optical, history, MACs)
- `POST /api/onu/<id>/migrate` — Migrate single ONU to different PON
- `POST /api/olt/<id>/migrate-batch` — Batch migrate multiple ONUs
- `GET /api/all-onus` — Server-side paginated ONU list (SQL search, sort, includes technician info)
- `POST /api/pre-register` — Register new ONU (accepts technician_id)
- `GET /api/technicians` — List users with technician role for assignment dropdowns

### Customization
- `GET /api/customization/columns` — Get column visibility config
- `POST /api/customization/columns` — Save column visibility config
- `GET /api/customization/signal-filter` — Get signal filter thresholds (critical/good)
- `POST /api/customization/signal-filter` — Save signal filter thresholds
- `GET /api/customization/rx-colors` — Get RX power color ranges (from SystemConfig `rx_color_ranges` JSON)
- `POST /api/customization/rx-colors` — Save RX power color ranges (requires `customization` permission)

### Public Endpoints (no auth)
- `GET /api/public/branding` — Get NMS brand name, base_url, base_domain, nms_prefix
- `GET /api/public/tenant-check` — Validate tenant subdomain (returns 404 if not found, 403 if suspended)
- `GET /api/public/packages` — List active subscription packages
- `POST /api/public/register` — Register new tenant (creates tenant + admin user + active trial subscription + invoice + Cloudflare tunnel hostname + WA notification)
- `POST /api/public/register/pay` — Create Duitku payment for registration
- `GET /api/public/registration-status/<order_id>` — Poll registration payment status
- `POST /api/public/forgot-password` — Send new password via WhatsApp to tenant's registered phone

### Superadmin Endpoints (`@super_admin_required` — main domain + super admin only)
- `GET /api/admin/packages` — List all packages
- `POST /api/admin/package` — Create package
- `PUT /api/admin/package/<id>` — Update package
- `DELETE /api/admin/package/<id>` — Delete package
- `GET /api/admin/tenants` — List all tenants
- `POST /api/admin/tenant` — Create tenant
- `PUT /api/admin/tenant/<id>` — Update tenant
- `DELETE /api/admin/tenant/<id>` — Delete tenant (cascading delete + Cloudflare DNS/ingress cleanup)
- `GET /api/admin/subscriptions` — List all subscriptions
- `POST /api/admin/subscription/<id>/renew` — Renew subscription
- `GET /api/admin/invoices` — List invoices
- `GET /api/admin/notifications` — List subscription notifications

### Security Implementation
- **`super_admin_required` decorator**: Checks `is_super_admin` AND main domain (rejects requests from tenant subdomains)
- **Login rate limiting**: `_check_rate_limit(ip)` — 5 attempts per 5 min window, 15 min lockout → HTTP 429
- **Security headers**: `@app.after_request` adds X-Frame-Options: DENY, X-Content-Type-Options: nosniff, X-XSS-Protection, Referrer-Policy, Permissions-Policy, HSTS
- **Domain-based login**: Both API (`/api/auth/login`) and legacy (`/login`) enforce: main domain → superadmin only, subdomain → matching tenant only
- **Session isolation**: `MultiTenantSessionInterface` in `extensions.py` — separate cookie names (`nms-admin-session` vs `nms-tenant-session`) + host-only cookie domain (no `Domain` attribute). Admin and tenant sessions can coexist in same browser without conflict.
- **Domain-session guard**: `enforce_domain_session_isolation()` `@before_request` — validates authenticated user matches current domain. Clears stale sessions from other domains (defense-in-depth).
- **Frontend admin guard**: `ProtectedRoute` in `App.tsx` blocks non-superadmin from `/dashboard/admin`
- **Frontend superadmin URL**: `/secure-portal-x7k2` only renders on main domain, redirects to `/login` on tenant subdomains
- **Tenant validation**: `App.tsx` calls `/api/public/tenant-check` on subdomain load, shows `TenantNotFound` page if invalid

## Cloudflare Tunnel Integration

Automated subdomain provisioning via Cloudflare API on tenant registration.

### Config (stored in `system_config` table)
- `cf_api_token` — Cloudflare API Token (NOT Tunnel Token)
- `cf_account_id` — Cloudflare Account ID
- `cf_tunnel_id` — Cloudflare Tunnel ID
- `cf_tunnel_name` — Cloudflare Tunnel Name
- `cf_zone_name` — Zone/domain name (e.g. `salfa.my.id`)

### Functions (`app.py`)
- `_get_cloudflare_config()` — Reads CF config from SystemConfig
- `_add_cloudflare_tunnel_hostname(full_subdomain, base_domain)` — Creates DNS CNAME + tunnel ingress rule (service: `http://localhost:8080`)
- `_remove_cloudflare_tunnel_hostname(full_subdomain, base_domain)` — Deletes DNS CNAME + removes tunnel ingress rule
- `_send_registration_wa_notification(tenant, pkg, sub, admin_username, admin_password, cf_success)` — Sends WA message with registration details

### Flow
1. Tenant registers → `public_register` creates tenant + trial subscription
2. `_add_cloudflare_tunnel_hostname()` called → creates CNAME `{subdomain}.{zone}` → `{tunnel_id}.cfargotunnel.com`, adds ingress rule
3. `_send_registration_wa_notification()` called → sends login details to tenant's WhatsApp
4. On tenant delete → `_remove_cloudflare_tunnel_hostname()` cleans up DNS + ingress

### Known Issues
- CF API Token (`cfut_` prefix) is actually a Tunnel Token with limited permissions — creation works but PUT/DELETE on tunnel config may fail with 401. Need a proper API Token with `Zone:DNS:Edit` + `Account:Tunnel:Edit` permissions.
- Nginx listens on port 8080, so tunnel ingress service must be `http://localhost:8080` (NOT port 80).

## WhatsApp Notification System

### Gateway
- Uses `BotConfig` table with `bot_type='whatsapp_native'`, `tenant_id=None` (superadmin config)
- Gateway API: `/send` endpoint accepts `{phone, message}` JSON
- Phone normalization handled by WA gateway (Indonesian prefixes)

### Notification Functions (`app.py`)
- `_send_registration_wa_notification()` — Registration details (URL, username, password, trial info, CF status)
- `_send_payment_wa_notification()` — Payment events (invoice created, payment success)
- `_send_subscription_wa_notification()` — Subscription expiry warnings (3d/7d before)
- `public_forgot_password` endpoint — Sends new password via WA

## Frontend Toast Notification System

### Component: `frontend/src/components/Toast.tsx`
- Single global toast system used across ALL pages
- Types: `success` (4s), `error` (5s), `warning` (4s), `info` (4s)
- API: `toast.success(msg)`, `toast.error(msg)`, `toast.warning(msg)`, `toast.info(msg)`
- Positioned: `fixed top-20 right-4 z-[9999]`
- Icons: CheckCircle (success), XCircle (error), AlertTriangle (warning), Info (info) — all from lucide-react
- `<Toaster />` mounted once in `main.tsx`
- All pages import from `../components/Toast` — no other toast libraries (sonner removed)

### Pages using toast (16 files):
ViewOnu, UserManagement, Tr069Profile, RegisterWizard, OltSettings, OltConfiguration, MyProfile, Login, FtthInfrastructure, Dashboard, Customization, AllOnus, AlertSettings, AdminPanel, AddOnu, LocationPicker

## Frontend Route Permissions

- **`/dashboard/settings/olts`** — requires `settings_ip_olts` permission (OLT list/settings page)
- **`/dashboard/settings/olts/:oltId/config`** — **no permission required** (view-only OLT config page). Backend APIs enforce `settings_ip_olts` for write operations (toggle port, create VLAN, etc.). This allows tenant users with view access to see OLT configuration.
- **`/dashboard/admin`** — blocked for non-superadmin
- **`/dashboard/onus/register`** — requires `add_onu` permission
- **`/dashboard/customization`** — requires `customization` permission

## UI/UX Theme Design

### Color Palette (Fiber Optic NOC)

| Color | Hex (Dark) | Hex (Light) | Usage |
|-------|-----------|-------------|-------|
| Deep Navy | `#0B1426` | `#E8EDF2` | Primary background — NOC room ambient, reduces eye strain |
| Fiber Teal | `#00D9C0` | `#00A88F` | Accent — color of 1310nm fiber light through jumpers |
| Link Green | `#22D3A0` | `#16A085` | Success/Online — active equipment LED indicators |
| Signal Amber | `#FBB040` | `#D68910` | Warning/Dyinggasp — caution indicators on network gear |
| Alert Coral | `#FF5757` | `#E04848` | Danger/LOS — critical alerts, less aggressive than pure red |
| Steel Gray | `#8B9BB8` | `#3A4A65` | Secondary text — cable sheathing tone |

### Typography
- **Space Grotesk** (headings/display) — geometric, technical character, loaded via Google Fonts
- **DM Sans** (body text) — clean, friendly, distinct from Inter/Roboto
- Loaded via `<link>` in `index.html` with `preconnect` for performance

### Signature Element: Fiber Beam
- `.fiber-beam` CSS class — thin animated gradient line (2px) at top of cards
- Evokes light traveling through a fiber optic strand
- Animation: `fiberFlow` keyframe, 3s linear infinite
- Add `className="fiber-beam"` to any card for the effect

### Light Theme Adjustments
- Background: `#E8EDF2` (soft slate, NOT pure white `#FFFFFF`)
- Surface: `#F2F5F9` (off-white with subtle blue-slate tint)
- Text colors darkened for contrast: `#1A2332` (primary), `#3A4A65` (secondary), `#5A6A85` (tertiary)
- Accent/status colors darkened ~15-20% from dark theme values
- Button primary uses white text (`#FFFFFF`) in light mode
- Focus ring: `0 0 0 2px #E8EDF2, 0 0 0 4px #00A88F`

### Accessibility
- `*:focus-visible` — clear focus ring with 2px gap + 4px accent color ring
- Touch targets: 36px+ on mobile, 42px input height to prevent iOS zoom
- High contrast button text (dark text on teal in dark mode, white text in light mode)
- `prefers-color-scheme` not used — manual toggle via `html.light` class

### Theme Architecture
- CSS variables in `:root` (dark) and `html.light` (light) — all components reference variables
- `@theme extend` block maps variables to Tailwind v4 color tokens (`--color-accent`, `--color-tx1`, etc.)
- Light theme overrides via `html.light { --color-accent: var(--lt-accent); ... }`
- Theme toggle adds `html.theme-transitioning` class for 0.3s smooth transition
- `index.html` `<meta name="theme-color">` set to `#0B1426`

### Key CSS Files
- `frontend/src/index.css` — All theme variables, component styles, responsive breakpoints, animations
- `frontend/index.html` — Google Fonts links, meta tags, PWA config

## Testing Checklist

- [x] OLT CRUD (add/delete) — tested add "Test OLT" + delete, limit enforcement works
- [ ] OLT CRUD (edit) — not tested
- [ ] Sync completes without errors (check terminal logs) — needs real OLT
- [ ] All 7 config tabs show data after sync — needs real OLT
- [ ] Uplink: enable/disable, edit config, edit VLAN trunk — needs real OLT
- [ ] PON Ports: per-port ONU stats, enable/disable, edit name — needs real OLT
- [ ] VLANs: rename, delete — needs real OLT
- [ ] ONU Types: add, delete — needs real OLT
- [ ] Speed Profiles: add/delete TCONT, add/delete Traffic — needs real OLT
- [ ] WAN-IP Profiles: add, delete — needs real OLT
- [x] ONU quick edit/delete works from All ONUs page — tested inline edit for Technician & ODP
- [ ] ONU detail page shows correct info — needs real OLT
- [ ] User management CRUD works — not tested
- [x] Login/logout works (domain-based: superadmin on main domain, tenant on subdomain)
- [x] Session isolation: admin + tenant sessions coexist in same browser (separate cookies, host-only domain)
- [x] Rate limiting: 5 failed logins → 429 response
- [x] Security headers present in response
- [x] Superadmin URL `/secure-portal-x7k2` only on main domain (redirects on tenant subdomain)
- [x] Non-superadmin blocked from `/dashboard/admin` (403)
- [x] Tenant registration → trial activation → Cloudflare subdomain auto-created
- [x] Tenant registration → WhatsApp notification sent to tenant's phone (URL format: `https://<subdomain>-nms.salfa.my.id/spa/login`)
- [x] Tenant deletion → Cloudflare DNS + ingress rule removed
- [x] Tenant deletion → page auto-reloads after 1.5s
- [x] Toast notifications consistent across all pages (success/error/warning/info)
- [x] No inline error divs — all errors use toast system
- [ ] Expired/suspended tenant blocked from dashboard — not tested
- [x] Technician assignment in pre-register/update ONU — dropdown populated from `/api/technicians`
- [x] ODP port assignment in update ONU API — links/unlinks ODP port from ONU
- [x] RX power color ranges configuration — API endpoints + Customization UI with preview
- [x] Distance unit display fixed to meters (m) in All ONUs table
- [x] RX OLT and PPPoE columns removed from All ONUs table (desktop + mobile)
- [x] Theme redesign: Fiber Optic NOC palette (Space Grotesk + DM Sans fonts, fiber-teal accent)
- [x] Light theme softened: soft slate background, darkened text, darkened accent colors
- [x] Accessibility: focus ring, touch targets, high contrast button text
- [x] WiFi SSID Open Auth: OMCI sends no-auth + encrypt none + no-key for both 2.4G and 5G
- [x] WiFi SSID Open Auth: Password field hidden in RegisterWizard & ProvisionWizard when auth=Open
- [x] WiFi SSID Open Auth: Script preview shows correct open auth commands
- [x] Fiberhome VEIP TR069: Profile dropdown works (same as ZTE templates), auto-fills ACS config
- [x] CSP: Cloudflare Insights beacon loads without console errors
- [x] Optimistic logout: UI clears instantly, no delay waiting for server response
- [x] Alert notifications: WhatsApp gateway + in-app bell notifications for ONU/OLT alerts
- [x] Alert notifications: Subscription expiry notifications to super admin (in-app bell)
- [x] RX power signal stats: Dynamic color ranges from customization (not hardcoded thresholds)
