# AGENTS.md — Project Handoff Guide

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
| `tests/test_basic.py` | Unit tests | Auth endpoints, public API, security headers, helpers, models. Run (from `backend/`): `py -3 -m pytest tests/ -v` |
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

20. **Registrasi gagal → rollback otomatis** — `register_unified()` / `register_vendor_template()` menandai `registered_here` setelah `onu N type … sn …` sukses; bila langkah layanan gagal (CLI error / exception) dipanggil `_rollback_registration(pon_if, onu_id)` → `no onu N` lewat koneksi baru. Jangan mengembalikan `False` setelah registrasi tanpa rollback — ONU jadi "ghost" (ada di OLT, tidak di DB) dan register ulang ditolak.

21. **AI Agent (`ai_agent.py`, `routes_ai.py`)** — baca-saja: tool hanya query DB (tanpa Telnet/SNMP); pengecualian `tr069` memanggil GenieACS NBI dengan GET saja. Jawaban dirapikan `wa_format()`. Config di `SystemConfig` kunci `ai_*` (API key terenkripsi `ai_api_key_enc`). WhatsApp: `wa_gateway/index.js` meneruskan pesan teks pribadi ke `NMS_AI_INBOUND_URL` (diset saat gateway di-Start dari NMS) dengan `X-Internal-Key`; NMS yang menyaring pengirim (`sender_allowed`). Telegram: thread `ai-telegram-poller` dari `run_server.py` (long-poll getUpdates bot alert). Tambah tool baru di `TOOLS` — tetap baca-saja kecuali ada konfirmasi user + audit. Fitur baru yang menyimpan data operasional (mis. SNMP) → tambahkan tool + arahan di `SYSTEM_PROMPT` + perintah cepat bila sering ditanya (lihat #54), supaya AI tidak tertinggal.

22. **Tailwind tidak memindai `frontend/dist`** — `@source not "../dist"` di `index.css`. Tanpa ini CSS hasil build bergantung pada dist lama dan cek "dist sinkron" di CI gagal.

23. **Redesign bertahap (komponen bersama)** — token di `frontend/src/tokens.css`, komponen di `components/ui` (`StatusStrip`, `ActionMenu`, `Sheet`, `Stepper`, `DataList`, `Notice`, `StickyActionBar`). Halaman dipindah satu per satu (satu PR per halaman), logika API/telnet/SNMP tidak disentuh. Aksi merusak di `ActionMenu` pakai `danger: true`; konfirmasi tetap di `onClick`. Uji tata letak: `scripts/ui_check/check.py` (job CI `ui-responsive`) — jangan menambah halaman yang melebar keluar layar.

24. **Terjemahan (i18n) bertahap** — teks UI lewat `t('bagian.kunci')` (react-i18next), kunci di `frontend/src/i18n/locales/id.json` + `en.json` (harus sama persis — dijaga test `i18n.test.ts` dan `i18n-keys.test.ts`). Hanya teks tampilan yang diterjemahkan: perintah CLI/skrip ke OLT, nilai yang dikirim ke API, dan pesan dari server (`d.message`) tidak diubah. Halaman yang sudah: Pengaturan OLT, ONU Belum Terkonfigurasi, Riwayat Alert, Register/Provision/Onu Wizard, Detail ONU, Konfigurasi OLT, Template, TR069, Trafik, Mikrotik, User, Log Aktivitas, Log OLT, Terminal, Laporan, Update Sistem, Cloudflare, Auto Provision, AI Agent, FTTH, Pengaturan Alert, Kustomisasi, Tambah ONU, dan komponen bersama (push, update, pencarian, peta, rak) (+ halaman yang sejak awal memakai `t()`). Di wizard, fungsi `generate*Script` sengaja TIDAK diterjemahkan. Jangan beri nama parameter callback `t` di komponen yang memakai `t()` (bentrok). Teks di luar komponen React (popup HTML Leaflet, konstanta modul) disimpan sebagai kunci lalu diterjemahkan dengan `i18n.t()`/`t()` saat dipakai. `confirm()` mengembalikan `Promise<boolean>` — selalu cek hasilnya (`.then(ok => ok && …)`).

25. **Korelasi gangguan (`alerts._check_odp_outages`, `ftth_topology.py`)** — naik dari ODP → ODP induk → ODC/JC → OTB memakai kolom topologi FTTH (`feed_source`, `odc_id`, `jc_id`, `parent_odp_port_id`, `otb_id`, `parent_type/parent_id`). ODP: ≥ `odp_outage_threshold` ONU mati di port-nya sendiri (perilaku lama). ODC/JC/OTB (dan ODP induk): juga ≥ `outage_ratio_threshold`% dari semua ONU hilirnya. Yang dikirim hanya node tertinggi yang lolos. `outage_correlation_enabled=0` = perilaku lama persis. Notifikasi `odp_outage`/`outage` di-dedupe per `target_type/target_id` dengan `resolved=False`, di-resolve otomatis saat pulih (kirim pesan pulih) atau saat digantikan node di atasnya (tanpa pesan). Hanya baca DB, tanpa Telnet. `_deep_link_url` memakai rute SPA `/dashboard/...` (bukan `#/...`).

26. **Wilayah teknisi (`TechnicianArea`, `alert_routing.py`)** — `_send_technician_alerts` memakai `_technician_recipients()`: per alert cari teknisi `primary` terdekat (ONU.technician_id bila alert 1 ONU → node gangguan/ODP ONU → naik topologi → OLT). Alert butuh `olt_id`/`onu_ids`/`target_type`+`target_id` — builder alert baru wajib mengisinya. Teknisi tanpa wilayah = NOC, selalu terima semua. Hasil routing di `alert['assigned_user_ids']` (dipakai insiden/eskalasi). `backup` hanya untuk eskalasi.

27. **Insiden (`Incident`, `IncidentLog`, `incidents.py`, `routes_incidents.py`)** — dibuat/diperbarui di `_check_odp_outages` via `upsert_incident` (satu insiden aktif per node), ditutup di `close_stale_incidents` (merged ke root di atasnya / pulih: auto-resolve bila masih `open`). Status hanya maju: open → acknowledged → en_route → on_site → resolved (resolved wajib catatan). Foto di `instance/incident_photos/<id>/` (bukan static), disajikan lewat `/api/incidents/<id>/photos/<name>` dengan login. Alert punya `incident_id` → link insiden di pesan; penerima hasil routing disimpan di `assigned_user_ids`.

28. **Eskalasi & maintenance (`escalation.py`, `MaintenanceWindow.node_type/node_id`)** — `check_escalations()` dipanggil di akhir `_check_onus_for_tenant`: insiden `open` → level 1 teknisi `backup` (route_alert role='backup') → level 2 admin (super admin / `manage_users` + nomor WA); pengingat TTR sekali (log `action='ttr'`). Kunci SystemConfig `escalation_enabled/ack_minutes/ttr_hours`. Kirim WA lewat `alerts._wa_send(phone, text)`. Maintenance: window dengan `node_type` (otb/jc/odc/odp) hanya menahan ONU hilirnya (`_node_maintenance_scope`); window OLT-wide = `node_type` kosong. Jangan pakai `olt_id IS NULL` saja sebagai "semua OLT".

29. **Peta & laporan insiden (Fase 5)** — `LeafletMap` prop `outages` (lapisan sendiri, kelas `.outage-pulse` di `motion.css`); FTTH tab peta mengambil `/api/incidents?status=active` (ringkasan insiden membawa `lat/lng` node). `/api/incidents/report?days=N`: MTTR hanya dari insiden yang ditutup manusia (`resolved_by` terisi), `merged` dikecualikan. Info pelanggan = template + link `wa.me` (nomor dari `FTTHODPPort.customer_phone`), tidak dikirim otomatis.

30. **Role teknisi** — default `view_dashboard,view_onus,receive_alerts`: bisa melihat & menangani insiden (`_can_handle` = receive_alerts / manage_users / super admin), tidak bisa membuka Pengaturan Alert (`customization`). Kategori notifikasi `odp_outage`/`outage` termasuk `ALARM_CATEGORIES`; API notifikasi mengirim `incident_id` untuk link lonceng. Panduan teknisi ada di `data/guides.ts` (`technician-field`) — perbarui bila alur insiden berubah.

31. **Kaca hanya untuk kartu di atas latar** — apa pun yang menimpa konten (modal, dialog, menu, toast, sheet, topbar/sidebar/bottom nav, `sticky-action-bar`, kepala tabel) harus solid. Blok "Permukaan yang menimpa konten = SOLID" di akhir `glass.css` menangani `.modal-wrapper > .glass-card` dan `.modal-overlay ~ .glass-card`; untuk popover baru pakai kelas `surface-solid` atau `background: var(--bg-surface)` tanpa `backdrop-filter`. Overlay modal yang di-portal ke body memakai `body > .modal-overlay { z-index: 50 }` agar ikut menutup chrome.

32. **PWA tanpa reload mendadak (`lib/swUpdate.ts`)** — `registerType: 'prompt'`, `skipWaiting: false`. Versi SW baru memicu `onNeedRefresh` → `SwUpdateNotice` (pemberitahuan kecil) dan diterapkan saat pindah halaman / tombol Muat ulang (`applySwUpdate()` → SKIP_WAITING → reload). Jangan kembali ke `autoUpdate` + `updateSW(true)` di `onNeedRefresh`: itu memuat ulang halaman di tengah user membaca. Alur Update Sistem memakai `refreshAfterServerUpdate()`. `vite:preloadError` di `main.tsx` me-reload sekali (maks per 30 detik) bila chunk lama hilang setelah deploy. `onRegisteredSW` memanggil `reg.update()` tiap 5 menit dan saat `visibilitychange` → visible / `focus` / `online` (jeda min 20 dtk; PWA yang di-resume tidak memuat ulang halaman, jadi tanpa ini tidak pernah cek versi baru). Setelah Apply Update (halaman Update Sistem & pop-up) pakai `refreshAfterServerUpdate({ waitServer: true, onPhase })`: `reg.update()` dimulai sejajar dengan `waitForServer()` (dist baru sudah di disk walau service restart), lalu tunggu `reg.installing` selesai (maks 45 dtk), `SKIP_WAITING` ke `reg.waiting` dan reload di `controllerchange` — jangan kembali ke batas tunggu tetap: di HP precache belum selesai sehingga reload memuat versi lama. Tombol Muat ulang (`applySwUpdate()` = `refreshAfterServerUpdate()` tanpa waitServer) **selalu** berakhir reload: `getRegistration` dibatasi 3 dtk, `reg.update()` 10 dtk, unduhan manual 12 dtk, plus timer cadangan mutlak; tombol langsung menampilkan spinner. Jangan kembali memanggil `updateSW(true)` workbox di tombol — tanpa worker yang menunggu panggilan itu diam saja (bug "klik Muat ulang tidak merespons"). Pemberitahuan versi baru HANYA bila tampilan memang lama: `onNeedRefresh` → `handleNeedRefresh()` membandingkan `runningBuild()` (src `/assets/index-*.js` di dokumen) dengan `serverBuild()` (`/index.html?v=<ts>` — query membuatnya lolos dari precache); bila sama → `SKIP_WAITING` diam-diam tanpa reload (`window.__nmsSilentSwap` membuat `public/sw-reload.js` tidak me-reload). Ini memperbaiki pemberitahuan "Muat ulang" yang muncul berulang padahal tampilan sudah terbaru. Halaman Update Sistem memakai `uiIsStale()` untuk menampilkan tombol "Muat ulang tampilan" hanya bila perlu. Tes: `__tests__/swStale.test.ts` (stub `registerSW` menyimpan `onNeedRefresh` di `swStub`). PWA tersangkut: sebelum reload `refreshAfterServerUpdate` menyimpan bundel target (`sessionStorage nms-sw-attempt`); saat start `checkUpdateOutcome()` — bila bundel berjalan masih berbeda, `hardReset()` membuang semua registrasi SW + Cache Storage lalu reload (maks sekali/menit, `nms-sw-hard`). **JANGAN memakai header `Clear-Site-Data`** (pernah dicoba di `/api/auth/me`, PR #106): di Chrome Android respons tertahan dan aplikasi macet di layar "Loading..." — dicabut di hotfix berikutnya. `fetchUser` kini punya batas waktu 15 dtk + 1x coba ulang. Tes: `__tests__/swUpdate.test.ts` (alias `virtual:pwa-register` → stub di `vitest.config.ts`).

33. **Kredensial integrasi terenkripsi** — `MikrotikDevice.api_password` adalah property (kolom DB tetap `api_password`, isi token Fernet via `_api_password_enc`); `genieacs_nbi_password` di SystemConfig juga terenkripsi (dibaca `decrypt_field` di `genieacs_client._nbi_config`). Plaintext lama tetap terbaca; `secrets_migration.encrypt_legacy_secrets()` mengenkripsi ulang saat start. Jangan menulis password integrasi baru tanpa `encrypt_field`.

34. **GenieACS (`genieacs_client.py`)** — `fetch_devices()` wajib pakai `projection` + paging (`_PAGE`); jangan ambil dokumen penuh semua modem. Data model per device (`data_model()`, cache `_DM_CACHE`): `tr098` = `InternetGatewayDevice.*`, `tr181` = `Device.*` — fungsi tulis harus memilih path sesuai model; yang belum didukung TR-181 mengembalikan `TR181_UNSUPPORTED`. Semua task lewat `_post_task()`: HTTP 202 = antre → pesan `QUEUED_MSG`, route mengirim `queued: true` (UI: toast info, bukan sukses). `_param()` hanya untuk leaf (`_value`); untuk objek (mis. Hosts.Host) pakai `_node()`.

35. **Riwayat PPPoE & diagnosis (`link_state_poller.py`, `diagnosis.py`)** — poller mencatat `PppoeSessionEvent` (`up` hanya bila baris state sudah ada dan sebelumnya tidak login — jadi deploy pertama tidak membanjiri event; `down` saat sesi hilang; `reconnect` bila `uptime_seconds()` sesi turun). Prune per jam (`pppoe_event_days`, default 30). Tabel ini ONU-keyed → ikut dihapus di `helpers.delete_onu_dependents`. `MikrotikDevice.ping_source`: `mikrotik` (default, round-robin `ping_batch`) | `vps` (ThreadPoolExecutor `VPS_PING_WORKERS`, semua klien). `diagnose_onu()` hanya membaca DB (tanpa Telnet/API router) — dipakai `/api/onu/<id>/diagnosis`, AI tool `diagnose`, dan `/diagnosa`.

36. **Kesehatan MikroTik & pemantauan GenieACS (`integration_health.py`)** — `link_state_poller.read_health()` mengisi `MikrotikDevice.cpu_load/mem_used_pct/temperature/ros_*/health_at/last_ok_at` (kegagalan baca tidak menggagalkan poll). `check_mikrotik_health()` dipanggil di siklus alert setelah `_check_odp_outages`: notifikasi `mikrotik_down/cpu/temp` di-dedupe per `target_type='mikrotik', target_id` yang belum resolved, pulih → resolved + pesan `*_recovery`. GenieACS: `sync_device_maps()` juga menyimpan `GenieacsDeviceMap.last_inform`, dijalankan otomatis oleh link poller tiap `genieacs_sync_minutes` (default 30); `stale_devices()` = ONU online dengan inform > `genieacs_stale_hours`; `fetch_faults()/delete_fault()` (DELETE `/faults/<id>` di-URL-encode). `_to_dbm()` menormalkan RX modem (dBm, ×10, ×100, ×1000).

37. **Operasi massal TR-069 (`acs_bulk.py`, `AcsBulkJob/AcsBulkJobItem`)** — alur wajib: `/api/genieacs/bulk/preview` → `/bulk/run` dengan `confirm_count` = jumlah target saat ini (409 bila berubah), maks `MAX_TARGETS` (500), satu job berjalan (`running_job()` juga merapikan job 'running' tanpa thread hidup setelah restart). Eksekusi di thread `acs-bulk-<id>`, `WORKERS`=4 + `PAUSE_S`; tiap perintah lewat `genieacs_client._post_task` (202 → item `queued`). Aksi: refresh/reboot/inform_interval/firmware (task `download`, fileType `1 Firmware Upgrade Image`)/set_param (path lengkap, tipe xsd terbatas). Item menyimpan `onu_id` tanpa FK (riwayat tetap ada walau ONU dihapus). Jangan menambah aksi tanpa `validate_action()`.

38. **Rute server NMS → pelanggan (`vps_routes.py`, `VpsRoute`, `deploy/salfanet-route`)** — aplikasi (user `salfanet`) tidak punya root; rute kernel hanya lewat `sudo -n /usr/local/sbin/salfanet-route add|del|list|check`. Helper adalah salinan MILIK ROOT (dipasang `deploy/setup_routes.sh`) — sudoers jangan pernah menunjuk ke file di repo (repo dimiliki `salfanet`). Helper memvalidasi ulang semuanya (privat/CGNAT saja, /8–/32, tidak beririsan dengan jaringan server, gateway on-link) dan hanya menyentuh rute `proto 186`. Rute ditolak helper tidak disimpan ke DB. `apply_all()` dipanggil saat link poller start. API `/api/vps-routes*` = `super_admin_required`.

39. **Desain "Jalur Cahaya" (`lightpath.css`, `LivePulse`/`Sparkline`/`Heartbeat`)** — dimuat terakhir di `main.tsx`. Prinsip: data hidup terlihat (LivePulse dari `dataUpdatedAt` React Query, angka via `useCountUp` yang hanya beranimasi saat berubah, sparkline/strip riwayat), SATU momen cahaya (`.lightpath-rule.run` di-remount dengan `key={dataUpdatedAt}`) — jangan menambah animasi masuk di setiap kartu, label kalimat biasa (bukan KAPITAL kecil), warna status = informasi. Dashboard memakai `/api/dashboard/pulse` (`dashboard_pulse.build_pulse`: drops/recovers per jam per OLT dari `OnuStatusHistory`, seri online direkonstruksi mundur dari jumlah online sekarang; cache 60 dtk). Semua gerak punya fallback `prefers-reduced-motion`. Halaman yang auto-refresh: beri `PageHeader live={{ updatedAt: dataUpdatedAt, fetching: isFetching }}`. Login: `AuthLayout` medan serat TIA-598 (satu animasi). Teks UI baru wajib lewat `t()` — kunci umum di bagian `ui.*`.

40. **Gambar OLT (`olt_images.py`, `components/OltDeviceArt.tsx`)** — default ilustrasi SVG orisinal dari `oltDeviceClass(vendor, model)` (`chassis-large` / `chassis-mini` / `box`); model baru cukup ditambah ke regex `LARGE`/`MINI`. Jangan memasukkan foto produk atau logo vendor dari internet (hak cipta). Foto unggahan admin di `instance/olt_images/<id>.<ext>` (bukan static), divalidasi dari magic bytes (png/jpg/webp, ≤ 1,5 MB), disajikan lewat `/api/olt/<id>/image` dengan login; `image_url` membawa `?v=<mtime>` agar cache pecah saat diganti. Unggah/hapus membersihkan cache `dashboard:global`; hapus OLT ikut menghapus fotonya. Foto per model: `instance/olt_model_images/<vendor>--<model>.<ext>`, kunci `olt_images.model_key()` (slug, sama dengan `oltModelKey()` di `data/oltModels.ts`, divalidasi `KEY_RE` — jangan pakai kunci mentah dari URL untuk path). `olt_images.resolve(olt)` → foto OLT > foto model > None; UI pengelolaan foto model ada di Kustomisasi → tab Foto OLT (`OltModelPhotos bare`), bukan di daftar OLT; katalog model di `data/oltModels.ts` harus sejalan dengan `OLT_TYPE_GROUPS` di form Tambah OLT.

41. **Kualitas data FTTH (`ftth_quality.py`)** — validasi feed core saat simpan lewat `feed_error(kind, obj, old_tuple)` / `check_pon_core()`: dicek PER JENIS (PON core N dan ODC core N di OTB yang sama itu normal: patch masuk = core keluar), hanya bila feed berubah (`feed_tuple` lama ≠ baru) supaya data lama yang bentrok tetap bisa disunting. Route update: set atribut → `feed_error` → `db.session.rollback()` + 400 bila gagal. `_release_core` tidak menandai core tersedia bila `users_of()` masih menemukan node lain (pemegang saat ini dikecualikan). `build_report()` hanya baca DB → `/api/ftth/quality` → `FtthQualityPanel` (tab Overview). PON vs jalur: `pon_mismatch()` memakai hop `olt` dari `_trace_upstream_from_odp` (hop membawa `frame/slot/port`; PON dipilih sesuai `otb_core_number`). Impor `db` dari `models`, bukan `extensions`.

42. **Anggaran redaman (`ftth_budget.py`)** — `build(hops, onu)` dari hop `_trace_upstream_from_odp` (+ `drop_cable_attenuation_db` di hop ODP terakhir) → item kabel/splitter/konektor/splice, `expected_rx = TX PON − total`, dibanding `onu.onu_rx_power` (ONU RX = downstream; `rx_power` itu OLT RX, jangan dipakai) hanya bila ONU online. Verdict `ok|worse|better|incomplete|unknown`; `incomplete` bila splitter tak terisi/jalur putus (jangan dinilai). TX dari `OLTPort.sfp_tx_power` (port_name berakhiran `f/s/p`), fallback SystemConfig `ftth_olt_tx_dbm`. Nilai standar di SystemConfig `ftth_connector_loss_db/ftth_splice_loss_db/ftth_olt_tx_dbm/ftth_budget_tolerance_db` (`DEFAULTS`). `total_attenuation_db` lama (kabel saja) tetap dikirim untuk kompatibilitas.

43. **Informasi lapangan FTTH (tahap 3)** — mixin `FTTHFieldInfo` (models) di OTB/ODC/ODP/JC: `cable_label/cable_type/cable_cores/cable_route/node_status/installed_at` (kolom ditambah lewat `migrate_schema` di app.py). Route create/update memanggil `_apply_field_info(o, d)` (validasi `NODE_STATUSES`/`CABLE_TYPES`/tanggal ISO); dict node = `_*_to_dict_base` + `_field_info_dict`. Status core manual: `PUT /api/ftth/cores/<owner>/<id>/<core>` (available/reserved/damaged; core dipakai hanya boleh → damaged). `ftth_quality.check_core/check_pon_core` menolak core `damaged`; `_release_core` mempertahankan `damaged`. Foto node: `ftth_photos.py` → `instance/ftth_photos/<kind>/<id>/<hex16>.<ext>` (nama divalidasi `NAME_RE`, magic bytes, maks 12), dihapus di route delete node. Export CSV: kolom baru HANYA ditambah di akhir baris (import membaca posisi), bagian baru (`JC`, `JC SPLICES`, `FIBER CORES`) diabaikan import; `/api/ftth/export.json` = backup lengkap.

44. **Pemantauan perangkat SNMP (`snmp_monitor.py`, `routes_snmp.py`, `SnmpDevice/SnmpPort/SnmpSensor/SnmpEvent`)** — konsep Observium/LibreNMS (discovery vs poll), kode sendiri (Observium berlisensi terbatas — jangan salin kodenya). Klien pysnmp **v3arch** asyncio (v1/v2c/v3; `_run()` = event loop baru per perangkat, aman di thread). `collect_*` murni jaringan (paralel `ThreadPoolExecutor`, MAX_WORKERS 8), `apply_*` menulis DB berurutan. `_to_py()`: OID dikembalikan sebagai angka lewat `asTuple()` (bukan `prettyPrint`, yang memberi nama MIB). Laju dari counter HC 64-bit (fallback 32-bit + wrap); reboot (uptime turun) → event & laju dilewati. MikroTik: `mtxrGaugeTable` (v7) lalu OID tunggal ×10 (v6). Status `up` / `warn` (SNMP gagal, ping OK) / `down`; alert `snmp_down` di `integration_health.check_snmp_devices` (target_type `snmp`). Thread `snmp-poller` dari run_server.py, interval SystemConfig `snmp_poll_interval` (60–3600, default 300). Kredensial: property terenkripsi (`community`, `v3_auth_pass`, `v3_priv_pass`), password v3 tidak pernah dikirim API (hanya `has_*`); community v1/v2c dikirim di `community` HANYA untuk user `settings_ip_olts` (form menampilkannya sebagai teks biasa, seperti community OLT). Uji lokal: `snmpsim-command-responder` dengan file `.snmprec` (lihat tests/test_snmp_monitor.py untuk data tiruan). Riwayat (tahap 2): `record_samples()` di akhir `apply_poll` → `SnmpSample` (mentah, 48 jam) + upsert `SnmpSampleHourly` jam berjalan (total/count/vmax/vmin; satu query baca per perangkat). Metrik port `in/out/in_err/out_err`, perangkat `<kind>:<key>` sensor (mis. `cpu:cpu`, `temperature:mtg.17`). `routes_snmp.build_graph`: 6h/24h dari mentah, 7d/30d/1y dari per-jam (bucket 1j/3j/1hari), p95 dari rata-rata per titik. Prune tiap jam memakai Pengaturan (`snmp_raw_hours`/`snmp_hourly_days`/`snmp_event_days`, lihat #52; konstanta `*_RETENTION_*` hanya nilai bawaan). UI: `components/snmp/SnmpGraph.tsx` (Recharts) + `RangePicker`.

45. **SNMP tahap 3 — alert ambang, ringkasan, laporan (`snmp_alerts.py`)** — `check_snmp_thresholds()` dipanggil di siklus alert setelah `check_snmp_devices`; hanya baca DB. Alert port HANYA untuk `SnmpPort.watched` (tanda "Pantau" uplink/backbone; port akses sengaja tidak dialert): `snmp_port_down` (≥ `snmp_down_minutes`), `snmp_port_flap` (≥ `snmp_flap_count` event `port_down` dalam `snmp_flap_minutes`), `snmp_port_util` (N sampel `in`/`out` terakhir ≥ batas), `snmp_port_err`; perangkat: `snmp_cpu` (N sampel `cpu:cpu`), `snmp_temp`. target_type `snmp` / `snmp_port`. Semua punya histeresis (pulih di bawah batas − selisih) — jangan dibuat simetris, nanti alert naik-turun. Perangkat yang tidak `up` dilewati (ditangani `snmp_down`); port berhenti dipantau → alert terbukanya ditutup tanpa pesan. Ambang di SystemConfig (`DEFAULTS`/`LIMITS`, `/api/snmp/settings`). `/api/snmp/summary` = masalah aktif + port dipantau + trafik teratas (dipakai halaman Perangkat & `NetworkDevicesCard` di Dashboard, muncul hanya bila ada perangkat). `/api/snmp/report?month=YYYY-MM&tz=<menit>&scope=watched|all[&format=csv]`: dari `SnmpSampleHourly` — rata-rata, puncak (vmax), 95% dari rata-rata per jam, volume = Σ rata-rata jam × 3600/8; ketersediaan dari event `device_down/device_up`. Kategori baru wajib masuk `ALARM_CATEGORIES`.

46. **SNMP tahap 4 — topologi (`snmp_topology.py`, `SnmpNeighbor`)** — tetangga dibaca saat DISCOVERY (bukan poll) di akhir `collect_discovery` (`out['neighbors']`; gagal → `None` = data lama dibiarkan): LLDP-MIB `lldpRemTable` (indeks `timeMark.localPortNum.remIndex`; `lldpLocPortNum` → ifIndex langsung atau cocok nama lewat `lldpLocPortId/Desc`), alamat manajemen dari INDEKS `lldpRemManAddrTable` (`…subtype=1.len=4.a.b.c.d`), CDP `cdpCacheTable` (indeks `ifIndex.devIndex`), MikroTik `mtxrNeighborTable` (MNDP; duplikat tetangga yang sama via LLDP/CDP di port yang sama dibuang). `apply()` mengganti baris per perangkat; `link_all()` mencocokkan ke `SnmpDevice` (IP → host, sysName/identity → sys_name/nama, MAC chassis → MAC port) dan port lawan (nama/descr). `build()` → `/api/snmp/topology`: node = perangkat terdaftar + tetangga luar (`x:<chassis/nama/ip>`), link tak berarah (dilihat dari dua sisi = satu link). Menu sidebar bernama "Monitoring SNMP" (`nav.devices`, rute tetap `/dashboard/devices`). Halaman Mikrotik punya kolom SNMP: cocok per `host` → link detail, selain itu `DeviceFormModal initial={{name, host}}` (dari `pages/Devices.tsx`). UI: tab Topologi di halaman Perangkat (`TopologyMap`, tata letak gaya-pegas deterministik, dihitung ulang hanya bila struktur berubah; kanvas tegak di layar < 640px) dan tab Tetangga di detail perangkat. Hapus perangkat ikut menghapus tetangganya dan melepas `remote_device_id` yang menunjuk ke sana. Uji lokal: snmpsim file `nmslldp.snmprec`.

47. **Akun lihat-saja (viewer/demo) & pengelola akun** — `User.has_permission`: super admin dan role berizin **`all_olt` = SEMUA izin** (jangan beri `all_olt` ke role demo). Endpoint yang menghubungi OLT/perangkat (`/api/onu/<id>/live-detail|get-status|refresh-status|ping`, `/api/olt/<id>/refresh-signal`) wajib `view_onus`. Password WiFi/PPPoE ONU disamarkan `***` lewat `routes_onu._mask_secrets()` bila user tanpa `configure_onu` (`/detail` wifi_config, `/live-detail`, `/get-status`). Acknowledge alarm (status tim) butuh `receive_alerts`/`customization`/`configure_onu`; `GET /api/bot-config` butuh `customization` (token gateway WA). Pengelola akun non-super-admin (`routes_users`): hanya boleh memberi role yang izinnya ⊆ izinnya sendiri (`_role_assignable`), tidak bisa mengubah/menghapus super admin atau user yang lebih kuat (`_can_manage_user`), tidak bisa membuat/mengubah role lebih kuat (`_within_my_perms`). Endpoint tulis baru: selalu pakai `permission_required`, jangan hanya `login_required`. Tes: `tests/test_viewer_permissions.py` (client membuang `g._login_user` per permintaan — fixture `ctx` memakai satu app context).

48. **Port ala Observium — grafik mini, paket/detik, mode Live** — poll juga membaca paket unicast (`ifHCIn/OutUcastPkts`, cadangan 32-bit `ifIn/OutUcastPkts`) → `SnmpPort.in_pps/out_pps` + sampel `pkt_in`/`pkt_out`; gagal baca paket tidak menggagalkan poll. Laju (bps/pps) baru ada mulai poll KEDUA — `_port_dict.has_counters` membuat UI menulis "menunggu poll berikutnya" alih-alih "—". `/api/snmp/devices/<id>/sparks` = rata-rata 30 menit 24 jam (48 titik) dari `SnmpSample` untuk `PortSpark` di daftar port. Mode Live: `GET /api/snmp/ports/<id>/live` → `snmp_monitor.read_port_live()` (hanya SNMP GET counter 1 port, timeout 2 dtk tanpa retry), dibatasi 1x/detik per port (`_live_last`, 429), laju dihitung KLIEN (`components/snmp/PortLive.tsx`, tiap 3 dtk, 60 titik, berhenti sendiri 10 menit, jeda saat tab tersembunyi, counter 32-bit berputar ditangani). Error SNMP dikembalikan 502 dengan pesannya → panel Live sekaligus jadi alat diagnosis. Bagian i18n `live.*` dipakai bersama `LivePulse` — tambah kunci, jangan menimpa bagian.

49. **Detail port ala Winbox (`snmp_portinfo.py`)** — statis saat discovery (`collect_static` → `apply_static`): MTU, duplex (EtherLike `dot3StatsDuplexStatus`), IP per interface (`ipAddrTable`, indeks = alamat), modul SFP MikroTik `mtxrOpticalTable` .1.3.6.1.4.1.14988.1.1.19.1.1 (vendor/part/serial/tipe/λ ÷100/konektor SFF-8024/jarak/rate) → `SnmpPort.sfp_info` JSON. Dinamis tiap poll (`collect_dynamic` → `apply_dynamic`): DOM (RX/TX dBm = Integer32 ÷1000, nilai unsigned ≥2^31 dikembalikan bertanda; suhu; tegangan ÷1000; bias mA; rx_loss/tx_fault) → kolom `dom_*` + sampel `dom_rx/dom_tx/dom_temp`; statistik `mtxrInterfaceStatsTable` .1.3.6.1.4.1.14988.1.1.14.1.1 + discard IF-MIB → `ext_stats` JSON (total, bukan laju). Indeks tabel MikroTik = ifIndex, cadangan cocok nama. **MikroTik tidak mengisi ifIn/OutErrors** — `mikrotik_error_overrides()` menjumlah kolom error mtxr menjadi counter error port; saat sumber berganti pertama kali (`ext_at` masih kosong) laju error dilewati agar tidak ada lonjakan/alert palsu. Alert `snmp_optical` (port dipantau, link UP, RX < `snmp_rx_low_dbm` default −25, histeresis 1 dB); link putus tetap ditangani `snmp_port_down`. API `GET /api/snmp/ports/<id>` → `detail_dict()`; UI `components/snmp/PortDetail.tsx` (+ `rxTone`). Uji lokal: snmpsim `nmsmt.snmprec`.

50. **Rasa aplikasi — `feel.css` (dimuat paling akhir di `main.tsx`)** — gerak hanya sebagai JAWABAN tindakan (tekan, pilih, buka, muat); jangan menambah animasi masuk per kartu atau loop tanpa alasan. Satu kurva `--ease-out`, 120–260 ms, semua mati di `prefers-reduced-motion`. Isi: tombol `.btn-*` mengecil saat ditekan; sorotan yang MELUNCUR lewat `hooks/useSlidingIndicator(selector, deps)` (mengukur elemen aktif, kali pertama tanpa transisi) di `Tabs` (`[aria-selected=true]`, kontainer `data-sliding` membuat `.tab-btn-active` transparan), menu samping (`a[aria-current=page]`, bilah `.nav-ind`) dan bar bawah HP (`.bnav-active`, `.bnav-ind`); `TopProgress` (AppShell) — bilah 2px saat pindah halaman atau saat query belum punya data (`useIsFetching` predicate `data === undefined`; refetch latar TIDAK memunculkannya); `.reveal` untuk panel yang dibuka (detail port); `Skeleton` = `.skeleton-shimmer`; `a/button.glass-card` & `.card-hover` terangkat 1px saat hover. Komponen baru: pakai kelas ini, jangan membuat animasi sendiri.

51. **Tab halaman memakai `components/ui/Tabs`** — jangan membuat baris tab sendiri (tombol + `border-b` + `overflow-x-auto`): di HP jadi baris yang harus digeser dan tidak ikut sorotan meluncur. Banyak tab → `mobileGrid={3|4}`. Kustomisasi (7 tab) memakai `mobileGrid={4}`; baris rentang RX Colors = grid 2×2 di HP (nomor + hapus ditumpuk di kiri), 4 kolom mulai `sm`; daftar API token = kartu di HP, tabel mulai `md`.

52. **Pengaturan Monitoring SNMP (tab Pengaturan di `/dashboard/devices`, `?tab=settings`, hanya `settings_ip_olts`)** — `snmp_monitor.GENERAL` = `{key: (bawaan, min, maks)}` di SystemConfig: `snmp_poll_interval` (dtk), `snmp_discovery_hours`, `snmp_timeout`, `snmp_retries`, `snmp_raw_hours` (min 24 — grafik 24 jam & grafik mini port dari data mentah), `snmp_hourly_days`, `snmp_event_days`; nilai di luar batas dijepit. Timeout/retry dipakai lewat `_RUNTIME` (variabel modul) yang diisi `refresh_runtime()` di awal `poll_all`/`discover_device` dan setelah PUT — thread pekerja tidak punya app context, jadi jangan membaca SystemConfig di dalam `collect_*`. `_run()` tanpa argumen = nilai pengaturan; mode Live tetap 2 dtk/0 retry. Community bawaan perangkat baru (`snmp_default_community`, TERENKRIPSI) + `snmp_default_version`: dikirim di `new_device.community` hanya untuk `settings_ip_olts`, mengisi `DeviceFormModal` bila kosong. `/api/snmp/settings` GET/PUT satu endpoint untuk ambang alert + umum; ringkasan siklus terakhir disimpan di SystemConfig `snmp_last_cycle` (bukan memori — proses web bisa berbeda dari poller). UI `components/snmp/SnmpSettings.tsx`; tombol Ambang alert di header diganti tab ini. Tes: `tests/test_snmp_settings.py`.

53. **Tabel ARP & MAC + pencarian MAC/IP (`snmp_tables.py`, `SnmpArp`/`SnmpFdb`)** — ARP: `ipNetToMediaTable` (indeks `ifIndex.a.b.c.d`), cadangan `ipNetToPhysicalTable` (IPv4 saja); MAC: Q-BRIDGE `dot1qTpFdbPort` (indeks `fdbId.mac6`, fdbId→VLAN via `dot1qVlanFdbId`, tanpa itu fdbId = VLAN), cadangan BRIDGE-MIB `dot1dTpFdbPort`; nomor bridge port → ifIndex lewat `dot1dBasePortIfIndex`; status `invalid`/`self` dibuang. Dibaca TERJADWAL (`snmp_tables_minutes`, default 30) di akhir `poll_all` lewat `update_tables()` (paralel, hanya perangkat yang poll-nya ok) + langsung setelah discovery; `SnmpDevice.tables_at/tables_note` (kolom via `add_col`). `apply()` upsert dengan first_seen/last_seen — baris yang hilang TIDAK dihapus (riwayat "terakhir terlihat di port mana"), dibersihkan `prune_events` setelah `snmp_tables_keep_hours` (default 168). `active` = `last_seen >= tables_at`. MAC pindah port / IP pindah MAC → first_seen di-reset. API: `GET /api/snmp/devices/<id>/tables` (maks 5000 per tabel; IP ikut di baris MAC dari ARP perangkat mana pun), `POST …/tables/refresh` (`settings_ip_olts`), `GET /api/snmp/search?q=` (`norm_query`: MAC format bebas/sebagian → cocok `replace(mac,':','')`; IP → ARP lalu port switch lewat MAC-nya; baris ARP di perangkat yang sama dengan baris MAC digabung), `GET /api/snmp/ports/<id>` membawa `macs`. UI `components/snmp/MacTables.tsx`: tab ARP/MAC di detail perangkat, tab "Cari MAC/IP" di Monitoring SNMP (`?tab=search&q=`), bagian "MAC di port ini" di `PortDetail`. Hapus perangkat ikut menghapus barisnya. Tes `tests/test_snmp_tables.py`; uji lokal snmpsim `nmsarp.snmprec`.

54. **AI Agent membaca Monitoring SNMP** — tool `snmp_devices` (pakai `routes_snmp.build_summary()`), `snmp_device` (nama/IP/sysName, cocok sebagian; ambigu → `mungkin_maksud`), `snmp_port` (nama port ATAU keterangan/alias; trafik 24 jam dari `SnmpSample`, `_port_macs`), `find_mac` (pakai `routes_snmp.search_tables()` — fungsi bersama dengan `/api/snmp/search`). Semua hanya baca DB hasil poller; AI tidak pernah mengirim SNMP. Pencarian MAC/IP dicocokkan ke pelanggan lewat `OnuLinkState.caller_id` (MAC sesi PPPoE, dibandingkan huruf kecil) dan `pppoe_ip` → field `onu` di hasil (UI tab Cari MAC/IP menautkan ke ONU). Perintah cepat tanpa AI: `/snmp [perangkat]`, `/mac <MAC|IP>` (juga di daftar `QUICK` halaman AI Agent). Rencana lanjutan SNMP (vendor lain, wireless, VLAN, BGP, dll.) di `docs/ROADMAP-SNMP.md`. Tes `tests/test_ai_snmp.py`.

55. **Audit keamanan 2026-11 (`docs/SECURITY-AUDIT-2026-11.md`)** — (a) `app._reject_cli_control_chars`: semua JSON ke `/api/olt*`, `/api/onu*`, `/api/provision*`, `/api/pre-register`, `/api/scan-unconfigured`, `/api/ztp-config` ditolak 400 bila ada string berisi karakter kontrol (baris baru/CR/tab/ESC) — satu perintah OLT = satu baris; endpoint baru di area itu otomatis terlindungi, field banyak baris JANGAN ditaruh di bawah prefiks itu. Provisioning tetap lewat `cli_sanitize`. (b) Teks data ke HTML mentah (popup Leaflet, `innerHTML`) wajib `lib/html.ts escapeHtml`. (c) `PUT /api/system-config` non-super-admin butuh `customization`; GET menyamarkan kunci `_enc|password|secret|token|api_key|private|community` untuk non-super-admin. (d) `/metrics` hanya `Bearer $METRICS_TOKEN` atau super admin. (e) Batas body `MAX_REQUEST_MB` (25) kecuali `/api/system/restore-db`. (f) Pillow ≥13 + `Image.open(formats=[PNG,JPEG,WEBP,GIF])` di `branding_icons`. (g) Apply Update & `update_vps.sh` menjalankan `pip install -r requirements.txt` bila file itu berubah. (h) `/api/tr069` menyamarkan password ACS → provisioning memanggil `_unmask_acs_password()` (password asli dari profil; tidak pernah mengirim `***`). Catatan: bagian "SaaS multi-tenant" di atas adalah desain lama — tidak ada lagi `tenant_id` di route.

56. **IP asli & asal di Log Aktivitas (`client_ip.py`, `ip_info.py`, `IpInfo`)** — produksi lewat Cloudflare **Tunnel** → cloudflared (127.0.0.1) → Nginx → Flask; `set_real_ip_from` Nginx hanya berisi rentang Cloudflare, dan `ProxyFix(x_for=1)` mengambil hop terakhir = 127.0.0.1, jadi dulu SEMUA log & batas login melihat 127.0.0.1 (satu bucket rate-limit untuk semua orang). Selalu pakai `client_ip.client_ip()` / `client_meta()` (bukan `request.remote_addr`): `CF-Connecting-IP` (+ `CF-IPCountry`) hanya dipercaya bila hop Nginx DAN koneksi TCP ke Flask sama-sama loopback; koneksi TCP non-loopback (Flask bind 0.0.0.0, akses LAN langsung) → alamat TCP asli, `X-Forwarded-For`/header CF dari klien diabaikan. `log_action(..., username=)` untuk peristiwa tanpa sesi; login menulis `login_failed` (Username tidak dikenal/Password salah) dan `login_blocked`. `ActionLog.ip_country/user_agent` (add_col; di luar hash chain). ISP/ASN: `ip_info` — penyedia SystemConfig `ip_lookup_provider` `ipinfo` (IPinfo Lite, token `ip_lookup_token` terenkripsi, boleh komersial dengan atribusi — UI menampilkan "Data IP oleh IPinfo") | `ip-api` (kota, NON-komersial, HTTP; hanya bila dipilih admin) | `off` (bawaan tanpa token). `/api/action-logs` membaca cache `IpInfo` dan memicu `ensure_async()` (satu thread latar, maks 60 IP, TTL 30 hari / gagal 1 jam); IP privat/loopback/CGNAT tidak pernah dikirim keluar (`scope`). `?ip=` menyaring per IP. `/api/ip-lookup/settings` = super admin. UI: `components/IpOrigin.tsx` (+ `lib/ua.ts parseUa/flag`), panel penyedia di halaman Log Aktivitas. Tes `tests/test_activity_log_ip.py`, `__tests__/ua.test.ts`.

57. **Garis di tema gelap: pakai `line`, bukan `brd`, untuk pemisah baris & grid grafik** — `--border-color` gelap (#212834) nyaris sama dengan latar kartu (apalagi bila warna kartu dikustomisasi), sehingga `divide-brd`/`border-b border-brd` dan grid Recharts tidak terlihat. Token: `--line-color` (gelap `rgba(148,163,184,.18)`, terang = `--border-color`, jadi tema terang tidak berubah) → utilitas `divide-line`/`border-line`/`bg-line`; `--chart-grid` untuk `<CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />` + `axisLine`/`tickLine`. Sudah dipakai di semua komponen SNMP (`components/snmp/*`, `Devices.tsx`, `DeviceDetail.tsx`); grafik baru wajib memakai `--chart-grid`.

58. **Kontras teks tema gelap & warna Recharts** — `--text-3` gelap dulu #64748B (3.4–3.8:1 di kartu, gagal WCAG AA untuk teks 10–12px) → kini `--text-2: #B6C2D2`, `--text-3: #93A1B6` (≥5.8:1 sampai latar #1F2630). Tema terang: `--text-3` #64748B — catatan: `lightpath.css` ikut MENIMPA `--text-3` untuk `html.light` (dulu #6b7c93), jadi ubah keduanya. Jangan turunkan teks dengan `text-tx3/60` dsb. untuk informasi yang perlu dibaca. `index.css` punya aturan global Recharts (`.recharts-cartesian-axis-tick-value` fill `--text-3`, tooltip bawaan memakai `--bg-surface`/`--text-1`, label `--text-2`, garis sumbu `--chart-grid`) supaya grafik yang tidak mengatur `tick`/`contentStyle` tidak memakai abu #666/latar putih bawaan Recharts. Saat menguji CSS baru di Playwright blokir service worker (`new_context(service_workers='block')`) — SW bisa menyajikan CSS lama.

59. **Keamanan MikroTik — brute force & login mencurigakan (`mikrotik_security.py`, `MtSecState/MtSecEvent/MtSecLogin/MtSecAlert`)** — HANYA MEMBACA router: `RouterOSClient.get_log()` (`/log/print` dengan `.proplist`, REST `GET /rest/log`). `collect(dev, cli)` dipanggil `link_state_poller.poll_device` SETELAH commit kesehatan (jangan menahan transaksi saat jaringan), dibatasi `mt_sec_interval`; posisi baca = `.id` log (hex) di `MtSecState.last_id`, `.id` turun = router reboot → semua baris dianggap baru. Pembacaan PERTAMA hanya baseline (log lama tidak dialert) + mempelajari IP login lama. `parse_message()`: `login failure for user X from IP via S`, `user X logged in from IP via S` (login `api` oleh `dev.api_user` = poller NMS → dilewati; login berulang dari IP yang sama disimpan maks 1/jam), `user X added|removed|changed by Y` (format v6 & v7). `check_security()` di siklus alert setelah `check_snmp_thresholds` (baca DB saja): `bruteforce` (≥`mt_sec_bf_threshold` gagal dari 1 IP dalam `mt_sec_bf_minutes`, dedupe per router+IP di `MtSecAlert`), `distributed` (≥`mt_sec_dist_threshold` dari ≥3 IP), `success_after_fail` (login berhasil dari IP dengan ≥3 gagal 1 jam sebelumnya), `new_ip` (IP publik baru; DIAM selama masa belajar 24 jam sejak baseline), `user_change`; whitelist IP/CIDR `mt_sec_whitelist`. Notifikasi kategori `mt_security` (masuk `ALARM_CATEGORIES`), target_type `mt_sec` = id `MtSecAlert` (deep link `/dashboard/devices?tab=security`). Serangan ditutup setelah `mt_sec_quiet_minutes` tanpa percobaan (+ pesan pulih); notifikasi sekali-kirim resolved otomatis setelah 24 jam. Asal IP lewat `ip_info` (cache, cari langsung maks 4 dtk). Analisis AI (`mt_sec_ai_analysis`, hanya bila AI aktif): thread `mt-sec-ai`, `ai_agent.ask()` maks 3 per siklus, dikirim menyusul sebagai alert `mt_security_ai` + disimpan di `MtSecAlert.ai_text` — alert utama TIDAK menunggu AI. NMS tidak pernah memblokir IP di router (aksi tulis butuh konfirmasi user + audit bila kelak ditambah). API `GET /api/mikrotik/security`, `GET/PUT /api/mikrotik/security/settings` (`settings_ip_olts`). AI tool `mikrotik_security`, perintah `/keamanan [router]`. UI tab Keamanan di Monitoring SNMP (`components/snmp/MikrotikSecurity.tsx`, hanya `settings_ip_olts`; peristiwa beruntun sama digabung). Prune per jam (`mt_sec_retention_days`). Tes `tests/test_mikrotik_security.py`.

60. **Keamanan MikroTik tahap 2 — audit konfigurasi, address-list firewall, generator script** — semua tetap BACA-SAJA ke router. `RouterOSClient.read(path, props, query)` = print/GET generik (query `?k=v` persis) — JANGAN dipakai untuk perintah tulis. (a) `mikrotik_audit.py`: `gather()` membaca `READS` (resource, ip/service, user, ip/dns, ip/proxy, ip/socks, system/scheduler, system/script, tool/bandwidth-server, ip/upnp, ip/firewall/filter; menu tak ada → None, dilewati), `evaluate()` murni → temuan `{id, severity, title, detail, fix}` + skor (100 − 25/kritis − 8/peringatan − 2/saran): CVE-2018-14847 (< 6.42.1), versi < 6.49, layanan tanpa `address` (KRITIS bila tidak ada drop di chain input), telnet/ftp/www, user `admin`, DNS remote tanpa drop port 53, proxy, SOCKS (kritis), bandwidth-server, UPnP, scheduler/script berpola fetch/import/user add/socks, tidak ada drop input. `save()` menyimpan `MtSecAudit` dan mencatat peristiwa `audit` HANYA untuk temuan kritis yang BARU (id belum ada di audit sebelumnya). Otomatis dari `collect()` tiap `mt_audit_hours` (0 = manual), manual `POST /api/mikrotik/security/audit/<id>` (`settings_ip_olts`). (b) Address-list: `collect()` membaca tiap nama di `mt_sec_fw_lists` (bawaan nms-portscan, nms-portscan-lan, nms-synflood, nms-bruteforce; nama divalidasi `_LIST_RE`) lewat query `?list=` (bukan seluruh address-list — bisa ribuan baris geoip). `ingest_fw()` → `MtSecFwSeen`; per daftar ada baris PENANDA `address=''` (waktu baca terakhir) — daftar yang pertama kali dibaca = baseline, IP yang tidak ada di pembacaan sebelumnya = peristiwa `fw_list` (jadi NMS mati lama tidak memicu alert ulang; daftar kosong yang baru dipasang tetap mengalert IP pertamanya). Penanda dikecualikan dari ringkasan. Alert `fw_list` digabung per router+daftar per `mt_sec_fw_digest_minutes`; daftar berisi `lan` → dicocokkan ke pelanggan (`OnuLinkState.pppoe_ip`), lainnya → ISP/negara. (c) Generator script `frontend/src/lib/mtFirewall.ts` (`buildFirewallScript`, tes `mtFirewall.test.ts`): semua nama/IP divalidasi (entri tidak valid dibuang, tidak pernah masuk script); aturan disisipkan `place-before` aturan filter pertama (penanda passthrough bila kosong) dalam blok `{ }`; address-list `nms-*`; `nms-admin` diterima paling atas — server NMS WAJIB masuk daftar admin, kalau tidak koneksi API poller (8728) bisa terkena aturan brute force bertahap. UI: `components/snmp/MikrotikSecurityExtra.tsx` (`AuditCard`, `FwListsCard`, `FirewallScriptCard`). Tes backend di `tests/test_mikrotik_security.py`.

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

## Production VPS (Salfanet NMS) — DO NOT CONFUSE WITH 192.168.54.129

- **IP: 192.168.54.131** (user root). 192.168.54.129 is a DIFFERENT project (Salfanet Radius) — never deploy NMS there.
- Domain: https://zte.salfa.my.id (Cloudflare → Nginx → Flask :5000 / WebSocket :8765)
- Repo path: `/opt/salfanet-nms`, venv `/opt/salfanet-nms/.venv`, DB `backend/instance/nms.db`
- Service: `systemctl restart salfanet-nms` (runs as user `salfanet`, EnvironmentFile `backend/.env`)
- Redis: local `redis-server` on 127.0.0.1:6379 (`REDIS_URL` set in `backend/.env`)
- Cron (root): `auto_sync.py` */5, `traffic_poller.py` 2-59/5, `auto_backup.py` :00, `db_backup.py` :15 → logs in `/var/log/salfanet-*.log`
- Deploy: prefer the **Apply Update** button in the web app (runs as user `salfanet`), or `bash deploy/update_vps.sh` (chowns the tree back to `salfanet` after pulling). Do NOT run a bare `git pull` as root: root-owned files make the web updater fail with "Permission denied" (fix: `chown -R salfanet:salfanet /opt/salfanet-nms`). If you must pull manually: `sudo -u salfanet git pull origin main && systemctl restart salfanet-nms`. `frontend/dist` is committed, so NO build is needed on the server.
- Changed frontend source? Rebuild on the dev machine, then commit dist: `cd frontend && npm ci && npm run build` (npm + `package-lock.json` reproduces dist exactly; CI verifies dist is in sync).
  - `frontend/dist` is committed; on the VPS run `git checkout -- frontend/dist && git clean -fd frontend/dist` before `git pull` if the pull conflicts.

## Production Deployment (NMS ini)

- **Host: 192.168.54.131** (user root, port 22) — login via SSH key; jangan simpan password/kredensial di repo ini: `ssh root@192.168.54.131 "..."`
- Path: `/opt/salfanet-nms` (git repo + deployment sekaligus)
- Service: `systemctl restart salfanet-nms` — backend Flask+FastAPI di port 5000/8765
- Frontend: `frontend/dist` ter-commit — `git pull` sudah cukup, tidak perlu build di server
- ⚠️ 192.168.54.129 / `/var/www/salfanet-radius` adalah aplikasi LAIN (salfanet-radius billing, Next.js) — jangan deploy NMS ke sana
- Browser perlu hard refresh setelah deploy (PWA service worker cache agresif)
61. **HIOSO HA7304 (non-C/V) & 2-PON: SNMP GET, bukan walk** — `HiosoAdapter._is_ha7304_get_model()` (model HA7304 / HA7302*) memakai `_collect_from_mib_get()`: GET kolom status `.25355.3.2.6.3.2.1.39.1.<pon>.<onu>` batch 16 OID (`HA7304_BATCH`; PDU besar timeout), lalu kolom lain hanya untuk ONU yang MAC-nya bukan nol (kolom 11 = MAC; kolom 9 firmware tidak dipakai). Gagal → jatuh ke jalur walk lama via `_snmp_collect()` (dipakai bersama `collect_onus` dan `poll_olt`). Jarak = kolom 25 × 1,4955 (`calc_ha7304_distance_m`), BUKAN rumus RTT jalur lama. DDM (`.14.2.1` kolom 8 Rx, 4 Tx) hanya untuk ONU online; skala diperbaiki `parse_optical_dbm`. Nama ONU dibaca sampai 0x00 pertama (`clean_snmp_text`). SNMP SET memakai `snmp_community_write` (jatuh ke read community): nama = bytes + `\x00` (30 karakter dikirim tanpa 0x00) dengan type hint `'x'`; reboot kolom 22 = 1; enable/disable kolom 35 = 1/2. Reboot lewat route `onu_action` hanya bila OLT HiOSO tanpa CLI (jalur Telnet tetap untuk yang punya CLI). Tes: `tests/test_hioso_ha7304_get.py`.
62. **Job latar belakang: detak & perapian** — `job_health.py`: `beat(nama)` menulis `SystemConfig job_beat_<nama>` (epoch); `check(skip)` membandingkan dengan batas di `JOBS` dan mengirim alert (kategori `job_stale`, masuk `ALARM_CATEGORIES`) SEKALI saat macet (flag `job_stale_<nama>`), plus pesan pulih. Job yang butuh perangkat (`link-poller`→MikrotikDevice, `snmp-poller`→SnmpDevice, `traffic-poller`→OLT) tidak dialert bila perangkatnya kosong. Alert monitor memeriksa semua kecuali dirinya; poller SNMP memeriksa `alert-monitor`. Job baru: panggil `job_health.beat('nama')` tiap siklus dan daftarkan di `JOBS`. `rx_history.aggregate_rx_hourly()/prune_rx_history()` dijalankan tiap jam oleh `link_state_poller._rx_maintenance_async` (dulu hanya skrip cron yang tidak pernah dipasang → `onu_rx_samples` membengkak). Skrip cron di `deploy/update_vps.sh` harus selalu memuat 4 job (`db_backup`, `auto_backup`, `auto_sync`, `traffic_poller`) karena filter `grep -v salfanet-nms` membuang semua baris cron lama. Tes: `tests/test_job_health.py`.
63. **SNMP: induk-anak, pemeliharaan, ringkasan mingguan** — `SnmpDevice.parent_id` (Integer biasa, tanpa FK; `add_col`), tabel `SnmpMaintenance` (device_id NULL = semua; waktu UTC naif). `snmp_depend.Scope` dimuat sekali per siklus alert: `suppressed(dev)` = pemeliharaan ATAU ada leluhur berstatus `down` (maks 10 tingkat, aman dari lingkaran). Dipakai di `integration_health.check_snmp_devices` (alert "turun" anak ditahan; alert induk menambahkan daftar keturunan yang ikut turun) dan `snmp_alerts.check_snmp_thresholds` (hanya PEMELIHARAAN yang menahan — perangkat berstatus `up` berarti terjangkau, induk turun tidak relevan). Notifikasi yang SUDAH terbuka tidak diubah; pemulihan tetap normal. `routes_snmp._apply` menolak induk tak ada/diri sendiri/lingkaran (`would_cycle`); menghapus perangkat melepas anaknya (`parent_id=NULL`) dan menghapus jendelanya. API: `GET/POST /api/snmp/maintenance`, `DELETE /api/snmp/maintenance/<id>`, `POST /api/snmp/digest/send`. `snmp_digest.py`: `build()` murni dari `SnmpEvent` (`downtime_seconds` memasangkan device_down/up), `maybe_send()` dipanggil tiap siklus poller SNMP (maks sekali per hari terjadwal; ditandai SEBELUM kirim agar kegagalan tidak diulang), kunci `snmp_digest_enabled/day/hour/last`, bawaan NONAKTIF. UI: `components/snmp/SnmpDepend.tsx` (`ParentSelect`, `MaintenancePanel`, `DigestCard`), i18n `snmpdep.*`. Tes: `tests/test_snmp_depend.py`.
64. **Sensor kustom SNMP (ambang bertingkat)** — model `SnmpSensorRule` (metric = `in/out/in_err/out_err` + `port_id`, atau `<kind>:<key>` sensor perangkat; `op` gt/lt; `warn`/`crit`; `minutes`; status tersimpan). `snmp_rules.py`: `level_for()` murni (SEMUA sampel jendela harus melanggar), `needed_samples()` (jendela ≥4 sampel boleh kehilangan satu), `evaluate()` membaca `SnmpSample` dengan jendela + ½ interval poll, `validate()` (Down harus lebih parah dari Warning; metrik harus ada di perangkat). `snmp_alerts._check_rules` dipanggil dari `check_snmp_thresholds` per perangkat: dua `toggle` — `snmp_rule_c` (critical) dan `snmp_rule_w` (warning), kategori `snmp_rule`; `_Ctx.toggle(..., quiet_recovery=True)` dipakai agar Warning↔Down tidak mengirim pesan "pulih". Data belum cukup → status/alert dipertahankan (`None`). Aturan dihapus/dinonaktifkan → alert terbuka ditutup di blok pembersihan akhir. Nilai trafik tersimpan dalam bit/s; formulir memakai Mbps (`SensorRules.tsx` `toForm/fromForm`). API: `GET/POST /api/snmp/devices/<id>/rules`, `PUT/DELETE /api/snmp/rules/<id>`. Tes: `tests/test_snmp_rules.py`.
65. **Peta topologi: lapisan PRTG** — `snmp_topology.annotate(nodes)` menambah ke tiap node `parent_id`, `in_maintenance`, `rules_warn`, `rules_down` dan mengembalikan `deps` (garis induk-anak); `/api/snmp/topology` kini memuat `deps`. `build()` tetap `(nodes, links)` (dipakai tes). `TopologyMap.tsx` menggambar dependensi hanya untuk pasangan tanpa link LLDP dan memasukkannya ke tata letak; kanvas tak lagi kosong bila hanya ada dependensi. Tes: `test_topology_annotations_and_deps` di `tests/test_snmp_depend.py`.
66. **Laporan PDF SNMP** — `snmp_report.py`: `collect()` (data murni), `build_pdf()` (fpdf2, font inti latin-1 → `_txt` membuang karakter non-latin), `send_pdf()` mengirim ke Telegram (`sendDocument` multipart) dan WA bawaan (`POST :3000/send-file`, base64; endpoint baru di `wa_gateway/index.js` — perlu restart gateway setelah update). WA gateway pihak ketiga TIDAK dapat PDF (API file tiap penyedia beda), hanya ringkasan teks. Dijadwalkan lewat `snmp_digest.send()` bila `snmp_digest_pdf=1` (bawaan 0). Endpoint: `GET /api/snmp/report.pdf`, `POST /api/snmp/report/send`. Footer harus `set_auto_page_break(False)` agar tak muncul halaman kosong. Tes: `test_snmp_pdf_report_builds_and_sends`.
67. **Status job & backup** — `GET /api/system/health` (super admin) = `job_health.status()` + `backup_health.status()`; kartu `SystemHealth.tsx` di halaman Update Sistem (tombol Backup sekarang, daftar + unduh backup lewat `GET /api/system/backups/<nama>` yang memvalidasi nama `nms_db_backup_*` tanpa path). Job baru `auto-backup` (detak di awal `auto_backup.py`, batas 4 jam, hanya bila ada OLT ber-auto-backup). **Salinan luar server**: `db_backup.upload_remote()` (scp, env `BACKUP_REMOTE_SCP_TARGET` / `_KEY`, dipakai juga oleh `/api/system/backup-db`); cron per jam memanggil `backup_health.remote_cycle()` → unggah sekali per hari, ulang tiap jam bila gagal, alert Telegram/WA sekali saat mulai gagal/pulih. Kunci SSH & known_hosts harus disiapkan manual. Catatan tes: fixture `ctx` menyimpan `current_user` di konteks app — jangan campur panggilan anonim dan login dalam satu tes. Tes: `tests/test_backup_health.py`.
68. **Restore database dari UI** — `routes_system._restore_sqlite_from_file()` (inti bersama: cek integritas → cek skema → salinan pengaman `<db>.pre_restore_<waktu>` → timpa → verifikasi → auto-rollback). Dua pintu: `POST /api/system/restore-db` (unggah .db, `restart=1` opsional) dan `POST /api/system/restore-from-backup` (`{filename, confirm:'RESTORE'}`, nama divalidasi `safe_backup_path`, backup asli disalin ke temp dulu agar tak tersentuh). Setelah sukses layanan di-restart lewat `_restart_service_soon()` (systemd-run, pola sama dengan Apply Update) supaya migrasi `add_col` memeriksa DB lama. UI: `RestoreDialog` di `SystemHealth.tsx` — wajib ketik RESTORE. Hanya SQLite. Berkas `.pre_restore_*` tidak dipangkas otomatis. Tes: `test_restore_from_server_backup_requires_confirm_and_restores` di `tests/test_basic.py`.
69. **Foto OLT dinormalisasi** — `olt_images.normalize()` (Pillow): semua unggahan (PNG/JPG/WEBP, ≤1,5 MB berkas asli) diubah ke PNG: EXIF diluruskan, sisi terpanjang ≤ `STANDARD_PX` (512), rasio asli tetap, tidak diperbesar, transparansi dipertahankan, metadata dibuang; gambar > 40 juta piksel atau rusak ditolak. `save()`/`save_model()` selalu menulis `.png` (berkas lama .jpg/.webp tetap terbaca lewat `ALLOWED`). Tes harus memakai gambar sungguhan (bukan sekadar magic bytes). Tes: `tests/test_olt_images.py`.
70. **Hapus latar foto OLT** — `image_bg.remove_background(im)` dipanggil dari `olt_images.normalize()` sebelum pengecilan: model `silueta.onnx` (±43 MB, onnxruntime, diunduh SEKALI ke `instance/models/` saat unggahan pertama, SHA-256 dipin; butuh akses GitHub dari VPS) → alpha, dipotong rapat (+3%). Tanpa onnxruntime/model → cadangan: latar polos dari tepi (isi dari tepi). Hasil tak masuk akal (objek <4% / >97% gambar) atau error → foto asli dipakai; tak pernah menggagalkan unggahan. Gagal unduh → coba lagi 10 menit kemudian. Segmentasi dijalankan pada versi ≤1024 px. `onnxruntime` ada di `requirements.txt` (Apply Update menjalankan pip install). Tes memakai fixture autouse yang mematikan sesi model (jangan unduh 43 MB di CI); kualitas pada foto OLT sungguhan belum bisa diuji di sandbox. `ImageDraw.floodfill` di Pillow 13 tidak mengisi — jangan dipakai.
71. **Proses ulang foto OLT** — `olt_images.reprocess_all()` + `POST /api/olt-images/reprocess` (tombol "Proses ulang semua foto" di Kustomisasi → Foto OLT): foto lama (sebelum fitur hapus-latar) tidak berubah sendiri. Respons unggahan memuat `background_removed` + `bg` = `image_bg.status()` (`engine` model/fallback, `onnxruntime`, `model_file`, `error`); UI memberi peringatan bila latar tak terhapus. Uji di foto OLT asli (HiOSO HA7304C, ZTE C320 dari screenshot pengguna): latar putih/abu terhapus bersih oleh model `silueta`.
72. **Pasang mesin hapus-latar dari UI** — `image_bg.start_install(app)` (thread latar, tidak kena batas waktu proxy): `sys.executable -m pip install 'onnxruntime>=1.18,<2'` → `_reset_engine()` (buang modul/kegagalan lama, tanpa restart) → unduh model + muat sesi. Status di `image_bg.install_state()` (`idle/running/done/failed`, langkah `pip/model`, ekor log). API: `GET /api/olt-images/engine` (login), `POST /api/olt-images/engine/install` (super admin). UI: kotak status di `OltModelPhotos.tsx` + tombol **Pasang sekarang** (polling 3 dtk saat berjalan). Alasan perlu: Apply Update hanya menjalankan pip bila `requirements.txt` berubah di pull itu dan gagal diam-diam. `numpy` kini eksplisit di requirements. Tes: instalasi sukses/gagal pip/gagal model, tak ganda, non-super-admin ditolak (tes terpisah — fixture `ctx` menyimpan current_user).
73. **Audit sync OLT (auto_sync)** — hasil audit & perbaikan: (a) `sync_quality.record()` dipanggil dari `auto_sync._sync_one_olt`: sinkron BURUK bila gagal atau ONU terbaca <50% dari yang dikenal (OLT ≥5 ONU); 3 buruk berturut-turut → notifikasi `sync_partial` sekali + pulih; OLT offline tidak dihitung. Menutup celah "OLT jawab SNMP tapi tabel ONU kosong/sebagian" — sinkron tetap `completed`, jadi `sync_stale` diam dan status/RX/TX ONU membeku. State di SystemConfig `sync_bad_<id>`/`sync_bad_alerted_<id>`. (b) job `auto-sync` di `job_health.JOBS` (detak di akhir `auto_sync.py`, batas 20 mnt; TIDAK terbit bila run kena timeout `os._exit(1)`). (c) `OLT.polling_interval` kini dihormati bila >330 dtk (`sync_quality.light_sync_due`); sinkron penuh 6 jam tak terpengaruh. Belum ditangani (catatan): OLT dengan `snmp_enabled=False` (mis. HiOSO web/CLI) TIDAK pernah di-auto-sync dan tak punya alert `sync_stale`; `monitoring_enabled` tidak dipakai auto_sync; ONU yang tak terbaca di light walk (≥50%) tetap membawa RX lama tanpa penanda. Tes: `tests/test_sync_quality.py`.
74. **Filter jenis port SNMP** — `frontend/src/lib/portKind.ts`: `portKind(p)` klasifikasi dari `if_type` IANA (6/62/69/117 ethernet, 135/136 vlan, 209 bridge, 161 bond, 23/131 tunnel, 71 wifi, 24 loopback); bila kosong/other(1)/propVirtual(53) → tebak dari nama (vlan*, *.N, bridge*, bond*, pppoe/l2tp/…, ether*/sfp*/Gi*). Dipakai `Ports()` di `DeviceDetail.tsx` (chip + cari, tampil bila >8 port). Kunci i18n `dev.pk.*`, `dev.portSearch`, `dev.portShown`. Tes: `src/__tests__/portKind.test.ts`.
75. **Format alert SNMP** — `snmp_alerts.stamp(msg, now)` menambah baris `🕒 Waktu: ... WIB` (zona dari SystemConfig `timezone`); `fmt_duration()` untuk durasi. `_Ctx.toggle` menempelkan waktu pada alert dan, pada pesan pulih, nama perangkat + 'Lama bermasalah' (dari `Notification.created_at`). `integration_health.check_snmp_devices` memakai helper yang sama. Tes: `tests/test_snmp_alert_format.py`.
76. **Hold alert SNMP** — `snmp_alerts.HOLD_CATS` (snmp_temp, snmp_optical, snmp_port_err) ditahan `snmp_hold_minutes` (default 3, 0=mati; SystemConfig, belum ada UI). `_Ctx._held` menyimpan waktu mulai di SystemConfig `snmp_hold_<kategori>_<id>`; hilang saat kondisi pulih. CPU/utilisasi/aturan sudah punya persistensi sendiri (siklus/menit), port down & flapping punya jendela sendiri, jadi tidak ikut. Tes: `tests/test_snmp_alert_format.py`.
77. **Wilayah teknisi bulk** — model `TechnicianArea` memang many-to-many (satu teknisi banyak node, satu node banyak teknisi; semua `primary` di level terdekat menerima alert, lihat `alert_routing.route_alert`). `POST /api/technician-areas/bulk` {user_ids, nodes[{node_type,node_id}], role} idempoten (pasangan ada → hanya ganti peran; maks 2000 kombinasi). UI: `TechnicianAreasCard` di `AlertSettings.tsx` (chip teknisi + daftar centang wilayah). Tes: `tests/test_technician_areas.py::test_bulk_*`.
78. **Alert info ke semua teknisi** — `alerts._technician_recipients`: bila `alert_routing.alert_levels(alert)` kosong (tidak ada node FTTH/OLT/ONU — mis. target_type `snmp`), alert dikirim ke semua teknisi (receive_alerts + nomor WA, bukan super admin), `assigned_user_ids` kosong. Alert berlokasi tetap routing per wilayah (#77). Tes: `test_alert_info_tanpa_lokasi_ke_semua_teknisi`.
79. **Cakupan alert teknisi** — SystemConfig `tech_alert_scope` ('all' default | 'area'), `alert_routing.alert_scope()`, endpoint `GET/PUT /api/technician-areas/scope`, radio di `TechnicianAreasCard`. Mode 'all': `_technician_recipients` kirim semua alert ke semua teknisi; `assigned_user_ids` tetap diisi dari routing wilayah (penanggung jawab insiden). Mode 'area': perilaku #77/#78 (FTTH per wilayah, alert tanpa lokasi ke semua). Tes area memanggil `_scope('area')`.
80. **Trafik Aplikasi (`flow_collector.py`, `flow_names.py`, `routes_flow.py`, `components/snmp/TrafficFlow.tsx`)** — kolektor UDP NetFlow v5/v9 + IPFIX (parser struct sendiri; template v9/IPFIX di memori per (exporter, domain, id); field panjang-variabel tidak didukung). Thread `flow-collector` (run_server.py) membuka socket HANYA bila SystemConfig `flow_enabled`=1 (default 0, port `flow_port` 2055); thread `flow-resolver` mengisi cache IP→layanan. Klasifikasi arah di `Aggregator.add`: satu sisi harus lokal (`flow_local_nets`, default RFC1918+CGNAT), selain itu diabaikan (cegah hitung ganda flow pasca-NAT/transit); download = remote→klien (interface `in_if`), upload = klien→remote (`out_if`) — jadi `if_index` = interface sisi internet. Agregasi memori → `FlowBucket` (5 menit, retensi `flow_bucket_days`), `FlowServiceHour` (`flow_hour_days`), `FlowClientHour` (per klien×layanan, `flow_client_days`; entri <20 KB ditahan di memori sampai cukup besar agar tabel tidak meledak); upsert aditif `INSERT … ON CONFLICT` (SQLite). Layanan: `flow_names.service_for_name` (aturan sufiks `RULES`, lalu domain induk; tak dikenal = 'Lainnya'); sumber nama = DNS cache MikroTik (`RouterOSClient.read('ip/dns/cache')`, rantai CNAME ditelusuri; hanya berguna bila pelanggan memakai router sebagai DNS) lalu reverse DNS (≤60 IP/menit, batas 8 dtk); cache `FlowIpName` (7 hari bernama, 1 hari tak dikenal; nama dari DNS router tidak ditimpa rDNS). Alamat pelanggan → nama dari `PppoeSessionEvent` (event 'up' terbaru). API `/api/flow/{status,settings,interfaces,overview,clients,client/<ip>}`; settings butuh `settings_ip_olts`. Hanya MENERIMA data — tidak menulis konfigurasi router (perintah `/ip traffic-flow …` hanya ditampilkan di UI). Server perlu izin UDP masuk di port itu. Tes: `tests/test_flow.py`.
81. **Trafik Aplikasi per perangkat** — UI-nya tab `flow` di `DeviceDetail.tsx` (bukan tab global lagi); semua endpoint `/api/flow/*` menerima `device_id` → exporter = `SnmpDevice.flow_ip` atau `host` (`routes_flow.exporter_ip`). Kolom baru `SnmpDevice.flow_ip` (divalidasi sebagai IP di `routes_snmp._apply`, diedit dari kartu setup tab itu). Pengaturan kolektor (port, jaringan lokal, aktif/mati) tetap GLOBAL karena satu socket UDP untuk semua router. Parameter `exporter` mentah masih diterima (tanpa `device_id`).
82. **Kolom baru di tabel lama wajib didaftarkan di `migrate_schema()`** — `db.create_all()` hanya membuat tabel BARU, tidak menambah kolom ke tabel yang sudah ada. Kolom model baru tanpa `add_col(...)` → "no such column" di semua query tabel itu (halaman tampak kosong, simpan 500) pada instalasi lama. Insiden #145 (`snmp_devices.flow_ip`). Ada jaring pengaman generik di akhir `migrate_schema()` yang menambah kolom model yang hilang, tapi tetap daftarkan `add_col` eksplisit; test: `test_migrate_schema.py::TestModelColumnsSafetyNet`.
83. **AI agent harus ikut fitur baru** — tiap fitur data baru (monitoring, flow, dll.) wajib punya tool baca di `ai_agent.py` (`TOOLS` + petunjuk di `SYSTEM_PROMPT`) + test. Trafik Aplikasi: `traffic_flow` (layanan & pelanggan teratas per perangkat SNMP) dan `traffic_flow_client` (layanan yang diakses satu IP/PPPoE) — memanggil view `routes_flow` lewat `test_request_context`, jadi logika & filter exporter sama dengan UI. Tool hanya MEMBACA.
84. **Deteksi anomali Trafik Aplikasi (`flow_anomaly.py`)** — dipanggil dari siklus alert (setelah `check_snmp_thresholds`), kategori `flow_anomaly` (ada di `snmp_alerts.CATEGORIES` & `ALARM_CATEGORIES`). Membandingkan total unggah/unduh pelanggan di jam berjalan (`FlowClientHour`) dengan rata-rata per jam 7 hari sebelumnya; alert bila ≥ `flow_anomaly_min_gb` (2 GB) DAN ≥ `flow_anomaly_factor` (5×); pelanggan dengan riwayat < 6 jam tidak dinilai. `flow_anomaly_enabled` (SystemConfig, default 1). Dedupe via `_Ctx.toggle` dengan `target_id` = IP→int (×2, +1 untuk arah unduh). Test `test_flow_anomaly.py`.
85. **Sensor status MikroTik (PSU/kipas)** — `SnmpSensor.kind='status'`: 1 = ok, 0 = gagal (MIKROTIK-MIB BoolValue). Dibaca dari tabel gauge (unit 6) atau, bila PSU tidak ada di sana, dari OID `mtxrHl` .15/.16 (`snmp_monitor`). Alert `snmp_status` (kritis, kategori ikut `HOLD_CATS`) di `snmp_alerts._check_device`; UI `DeviceDetail` menampilkan OK/FAIL. Bila ada model yang artinya terbalik, cek nilai mentah di tabel `snmp_sensors` sebelum mengubah.
86. **OLT di topologi SNMP** — OLT tidak kirim LLDP, jadi `snmp_topology.olt_links()` menautkannya ke port: (1) manual `SnmpOltLink` (tabel baru, form di `TopologyMap` → `/api/snmp/olt-links`), (2) otomatis bila OLT belum punya penautan manual: tetangga LLDP/CDP/MNDP ber-IP/nama sama, atau ARP IP OLT → MAC → port FDB yang bukan port ke perangkat SNMP lain. `build()` menambah node `o<olt_id>` (`kind:'olt'`, status dari `OLT.is_online`) + garis ke port; hanya OLT yang punya sambungan ditampilkan. Garis merah bila `oper_status` port ≠ up atau OLT offline. Alert port turun menambah baris "OLT terdampak" (`snmp_alerts._olt_impact` → `olts_behind_port`). Test `test_topology_olt.py`.
87. **Topologi per jalur/perangkat** — `/api/snmp/topology` mengembalikan `groups` (komponen terhubung via `snmp_topology.components`, link fisik + dependensi; jalur yang tidak saling terhubung = topologi terpisah) dan menerima `?device_id=` untuk hanya jalur perangkat itu. UI: pemilih "Jalur topologi" di tab Topologi + tab **Topologi** di `DeviceDetail` (`<TopologyMap deviceId>`). Test `test_snmp_topology.py::test_topologi_per_jalur_terpisah`.
88. **Sensor non-MikroTik (`snmp_sensors_vendor.py`)** — `collect(c)` dipanggil dari `collect_poll` bila perangkat bukan MikroTik: ENTITY-SENSOR-MIB (nilai = raw × 10^−precision × 10^eksponen skala; hanya status operasional 1; dBm ≤ −40 dianggap tanpa sinyal) lalu cadangan CISCO-ENVMON, plus CPU Cisco bila HR CPU kosong. Format sensor sama dengan MikroTik (`kind/key/name/value/unit`, key `ent.*`/`cvt.*`/`cvf.*`/`cvp.*`); kind `optical` (dBm) baru, ikon default. Status Cisco 1 = ok, selain itu 0 (alert `snmp_status`). Vendor lain (Huawei-ENTITY-EXTENT, Juniper DOM, Ubiquiti) belum — tambah hanya bila ada data walk asli untuk uji. Test `test_sensors_vendor.py`.
89. **Grup perangkat SNMP** — `SnmpDevice.group_name` (teks bebas ≤100, API field `group`), didaftarkan di `migrate_schema` (`add_col`) + test migrasi. UI: chip filter di `Devices.tsx`, field Grup (datalist dari grup yang ada) di `DeviceFormModal`; `snmp_alerts._head` menambah baris `Grup:`; AI `snmp_devices` memuat `grup`. Roadmap F2 (ambang per grup) belum.
90. **Ambang alert per grup (F2)** — override disimpan sebagai JSON di SystemConfig `snmp_group_overrides` ({grup: {key: nilai}}), dijepit `LIMITS` oleh `snmp_alerts.clean_overrides`. `check_snmp_thresholds` memakai `cfg_for(dev, cfg, overrides)` (cocok lewat `dev.group_name`) untuk `_check_device`/`_check_port`; key yang tidak di-override ikut global. API: `GET/PUT /api/snmp/settings` (`group_overrides`, `groups`); UI di modal Ambang alert (`SnmpOverview.tsx`). Test: `tests/test_snmp_group_thresholds.py`.
91. **Billing per port (G)** — kolom `SnmpPort.customer/commit_mbps/overage_rate` (didaftarkan di `migrate_schema`), diedit lewat `PUT /api/snmp/ports/<id>`. Pemakaian tagihan = p95 rata-rata per jam (arah terbesar in/out) — BUKAN sampel 5 menit, jadi sedikit lebih rendah dari p95 standar ISP; kelebihan = max(0, p95 − komitmen), biaya = kelebihan × tarif. `build_report(scope='billing')` memuat port ber-pelanggan/komitmen; `GET /api/snmp/billing` (`?customer=`, `?format=csv`). UI: `PortBilling` di panel port `DeviceDetail.tsx`, scope *Billing pelanggan* di `SnmpReport.tsx`. Test: `tests/test_snmp_billing.py`.
92. **Hitungan ONU per OLT = dari tabel ONU** — `OLT.total_onu/online_onu/…` hanya salinan; `/api/dashboard` dan tool AI `summary` memakai `helpers.onu_counts_by_olt()` (GROUP BY di tabel ONU, sumber yang sama dengan `/api/all-onus`), dan akhir `save_sync_result` memanggil `sync_olt_onu_counters` (bukan penghitung dalam-loop yang dobel bila walk berisi entri ganda). Pembaca baru hitungan ONU jangan membaca kolom OLT langsung. Test: `TestCountersMatchOnuTable`.
93. **VLAN per port (C)** — dibaca bersama ARP/MAC di `snmp_tables.collect/parse/apply` (jadwal `snmp_tables_minutes`): Q-BRIDGE `dot1qVlanStaticEgressPorts/UntaggedPorts/Name` + `dot1qPvid`; bitmap PortList → nomor port bridge → ifIndex lewat `dot1dBasePortIfIndex`. Tabel baru `SnmpVlan` (diganti total tiap pembacaan; ikut dihapus bersama perangkat), kolom `SnmpPort.pvid`. API `GET /api/snmp/devices/<id>/vlans` (per VLAN + per port; cadangan: VLAN yang terlihat di FDB). UI `VlanCard.tsx` di tab ARP/MAC. Perangkat yang tidak mengimplementasikan Q-BRIDGE (banyak MikroTik) hanya menampilkan VLAN dari FDB. Test: `tests/test_snmp_vlan.py`.
94. **Wireless MikroTik (B)** — dibaca di pembacaan tabel (`snmp_tables`): MIKROTIK-MIB `mtxrWlRtabTable` (klien, indeks `mac6.ifIndex`: sinyal .3, tx .8, rx .9, uptime .11 TimeTicks, SNR .12; 0 = tidak ada) dan `mtxrWlApTable` (SSID .4, klien .6, freq .7, noise .9, CCQ .10; indeks ifIndex). Tabel `SnmpWifiRadio`/`SnmpWifiClient` diganti total tiap pembacaan (ikut dihapus bersama perangkat). ROS 7 tidak mengisi `ApClientCount` → jumlah klien dihitung dari tabel klien. API `GET /api/snmp/devices/<id>/wireless` (nama pelanggan dari MAC = caller-id PPPoE bila cocok). UI `WirelessCard.tsx` di tab ARP/MAC. OID diverifikasi dari MIB Observium, belum diuji di perangkat nyata (paket `wifi` ROS 7 baru mungkin memakai tabel berbeda). Test: `tests/test_snmp_wireless.py`.
