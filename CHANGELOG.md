# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### 2026-08-04 — Auto-Backup Audit & Fix

#### Fixed
- `backup_olt_config()` download endpoint: Added missing `write memory` before `show running-config` — downloaded config could miss unsaved changes
- `backup_olt_config()` download endpoint: Increased timeout from 30s to 60s to match auto-backup and backup-save endpoints (prevents truncation on large configs)
- `_auto_write_config()`: Replaced overly broad `'%' in out` error check with specific ZTE CLI error patterns (`%error`, `% invalid`, `%code`, `incomplete command`, `ambiguous command`, `return error`) — legitimate output containing `%` (VLAN names, descriptions) was causing false "write failed" warnings
- `auto_backup.py`: Failed backups no longer update `last_backup_at` — previously a failed backup would set `last_backup_at = now`, preventing retry until the full interval elapsed again. Now failed backups retry on the next hourly cron run

#### Added
- `auto_backup.py`: `notify_backup_failure()` function creates in-app notification for super admins when auto-backup fails (type=`olt_offline`, icon=`warning`)

---

### 2026-08-04 — EPON ONU Support (Register/Provision/Pre-Config + Unconfigured Scan)

#### Added
- **EPON support in ONU registration**: All registration methods (`register_onu`, `configure_onu_profile`, `register_and_configure`, `register_vendor_template`, `register_unified`) now accept `is_epon` parameter and use `epon-olt_`/`epon-onu_` CLI prefixes when true
- **EPON unconfigured ONU scanning**: `collect_unregistered_onus()` now parses `epon-olt_` and `epon-onu_` patterns from `show pon onu uncfg` output, including MAC-as-SN fallback (12 hex chars for EPON ONUs without vendor prefix)
- **EPON detection in API endpoints**: `/api/pre-register` and `/api/provision/unified` detect EPON from `pon_port` prefix or explicit `is_epon` flag in request body
- **EPON card count in OltConfiguration**: Stats row now calculates EPON card count dynamically from `ETG` prefix instead of hardcoded `"0"`
- Frontend `UnconfiguredOnu` interface: Added `is_epon` field in both `RegisterWizard.tsx` and `ProvisionWizard.tsx`
- Frontend wizards: API calls now send `pon_port` and `is_epon` in request body

#### Changed
- **Register/Provision script preview**: `RegisterWizard.tsx` and `ProvisionWizard.tsx` now use dynamic `epon-onu_`/`epon-olt_` or `gpon-onu_`/`gpon-olt_` prefixes based on `is_epon` detection from `pon_port` prefix
- **Migrate ONU**: `migrate_onu()` and batch migrate now read `onu.card` to determine `is_epon` and pass to `deregister_onu`/`register_onu`/`configure_onu_profile`
- **Update ONU re-register**: `update_onu` and `update_onu_type` inline edit now use dynamic `epon-olt_`/`gpon-olt_` prefix based on `onu.card` field
- **ONU traffic endpoint**: `onu_traffic` now uses dynamic `epon-onu_`/`gpon-onu_` prefix for `show interface` command
- **Provision DB save**: `/api/provision/unified` now saves `card='epon'` to ONU record on success for EPON ONUs
- **Log action prefix**: `log_action` targets now use `epon-onu_` or `gpon-onu_` prefix based on `is_epon`

---

### 2026-08-03 — EPON ONU Support (Sync, Actions, Live Data, Rack Diagram)

#### Added
- `_collect_epon_onus_fast()` method in `telnet_client.py` for lightweight EPON ONU collection during light sync (Telnet-based, no SNMP)
- EPON card detection (ETG prefix) in `collect_pon_port_stats` — uses `epon-olt` prefix and `show epon onu state` command
- EPON-specific ONU state parsing — EPON uses `epon-onu_` prefix and different status keywords
- `is_epon` parameter support in `reset_onu`, `deregister_onu`, `disable_onu`, `enable_onu`, `clear_onu_config`, `get_onu_live_data`, `collect_onu_detail`
- Early return for EPON ONUs in `get_onu_live_data` and `collect_onu_detail` (EPON doesn't support GPON-specific commands like `detail-info` or `pon power attenuation`)
- EPON early return in `onu_get_status` endpoint — EPON ONUs don't support `detail-info` or `pon power attenuation`
- Empty events for EPON ONUs in `collect_onu_history` (GPON-specific commands not supported)
- ETG prefix detection in `slot_type_for()` so EPON cards show as service slots in rack diagram
- `sync_helper.py`: `sync_onus` now stores `card_type` ('epon' or 'gpon') from ONU data into ONU model's `card` field
- `snmp_collector.py`: Light sync now includes EPON ONU collection via Telnet after SNMP collection
- `snmp_collector.py`: PON port collection now includes EPON cards (ETG prefix) alongside GPON (GTG prefix)

#### Changed
- `enrich_onus_via_telnet` now skips EPON ONUs (GPON-specific enrichment not applicable)
- `app.py`: All ONU action endpoints pass `is_epon` flag to TelnetCollector methods based on `onu.card` field
- `app.py`: `/api/onu/<id>/detail` and `/api/onu/<id>/live-detail` endpoints pass `is_epon` to `collect_onu_detail` and `get_onu_live_data`

---

### 2026-08-01 — Notification System Audit & Fix

#### Added
- `Notification.resolved` and `Notification.resolved_at` columns for notification lifecycle tracking (Active → Resolved)
- `AlertHistory.first_seen_at` column for debounce tracking (first detection vs actual alert fire)
- **Debounce mechanism**: ONU offline/dyinggasp/los alerts require 2 consecutive detections within 120 seconds before firing — prevents false alerts from transient status flaps
- **Auto-resolve**: When ONU comes back online, all old offline/dyinggasp/los notifications are automatically marked as RESOLVED
- **Auto-resolve OLT**: OLT offline notification auto-resolved when OLT becomes reachable again
- **Auto-resolve OLT health**: CPU/memory/temperature alerts auto-resolve when values drop below threshold
- **Recovery notification dedup**: Check existing unread recovery notification before creating new one (updates if exists)
- **OLT recovery dedup**: Same dedup for OLT recovery notifications
- **Auto-cleanup**: Read notifications older than 7 days are automatically deleted on each alert check cycle
- **Stale debounce cleanup**: If ONU recovers during debounce window, AlertHistory `first_seen_at` is reset (no alert fired)
- Frontend: Resolved notifications shown in separate section with `RESOLVED` badge and strikethrough title
- Frontend: Bell badge count only includes active (non-resolved) unread notifications
- Database migration: Auto-adds new columns on startup via `migrate_schema()`

#### Changed
- `alerts.py`: ONU offline detection rewritten with debounce logic (first_seen_at → wait 120s → fire on second detection)
- `alerts.py`: Recovery section now auto-resolves old notifications instead of just marking `is_read=True`
- `alerts.py`: OLT recovery section now deduplicates and auto-resolves old offline notification
- `alerts.py`: OLT health alerts (CPU/mem/temp) auto-resolve when condition clears
- `app.py`: Notifications API unread counts now filter `resolved=False` (only active alerts counted)
- `app.py`: Notifications API response now includes `resolved` and `resolved_at` fields
- `frontend/Topbar.tsx`: Notification list split into Active and Resolved sections
- `frontend/Topbar.tsx`: Removed SaaS subscription UI (subscription status badges in topbar)

#### Fixed
- False alerts from transient ONU status flaps (offline → online within 1 polling cycle)
- Notification accumulation — old offline notifications no longer stack up when ONU recovers
- Duplicate recovery notifications for same OLT/PON
- Stale OLT health alerts remaining active after condition clears
- Bell icon showing resolved notifications in unread count

---

### 2026-08-01 — VPS Installer, Uninstaller & SaaS Removal

#### Added
- `install-vps.sh`: Full one-click VPS installer for fresh Ubuntu 22.04/24.04 servers
  - Installs Python 3, Node.js 22, nginx, git
  - Clones repo, creates venv, builds frontend
  - Sets up systemd service (`salfanet-nms`)
  - Configures Nginx reverse proxy (port 80 → Flask 5000 + WebSocket 8765)
  - Auto-generates `SECRET_KEY`
- `uninstall-vps.sh`: Full VPS uninstaller
  - Stops & removes systemd service
  - Removes Nginx config
  - Removes iptables port redirect
  - Deletes app files (`/opt/salfanet-nms/` including database)
  - Removes app user (`salfanet`)
- `deploy/update_vps.sh`: Quick update script (pull + rebuild + restart)
- `deploy/test_uninstall.sh`: Uninstaller verification script
- `deploy/test_uninstall_reinstall.sh`: Full uninstall → reinstall test cycle
- `install.sh --start` flag: Auto-start server after local installation
- README: VPS installer, uninstaller, update, and service management documentation

#### Changed
- `deploy/vps-setup.sh`: Updated to use `run_server.py` (Flask + FastAPI), fix WebSocket proxy to port 8765, rename to `salfanet-nms`
- `frontend/App.tsx`: Root route `/` now redirects directly to `/login` (removed SaaS landing page)
- `frontend/App.tsx`: Removed all SaaS public pages (LandingPage, RegisterPage, PaymentResultPage, RenewalPage, TenantNotFound)
- `frontend/Dashboard.tsx`: Removed `SuperAdminDashboard` rendering for super admins
- `app.py`: CSP `connect-src` now includes `ws:` for plain WebSocket connections
- `frontend/useWebSocket.ts`: Fixed WebSocket URL to use WS_PORT (8765) instead of page host port

#### Fixed
- WebSocket connection failure on HTTP deployments (CSP blocking `ws:` protocol)
- `/api/admin/dashboard` 404 error (SuperAdminDashboard removed)
- SaaS landing page still appearing after SaaS removal (`/api/public/packages` 404)
- `git pull` on VPS failing with "dubious ownership" error
- OLT settings page not auto-reloading after add/edit OLT

---

### 2026-07-31 — Redis Caching & SaaS UI Removal

#### Added
- Redis caching with fallback to in-memory cache
- Cache TTLs: 300s (static), 60s (semi-static), 30s (chassis/PON), 15s (dashboard)
- Cache invalidation on sync and config changes
- Cache keys prefixed with `olt:<olt_id>:<datatype>`

#### Removed
- SaaS multi-tenancy features from admin panel
- SaaS subscription management UI
- SaaS tenant registration and payment flows
