# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
