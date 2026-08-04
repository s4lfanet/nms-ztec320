# Salfanet NMS — Product Requirements Document (PRD)

## 1. Product Overview

**Salfanet NMS** adalah sistem manajemen OLT/ONU FTTH untuk perangkat ZTE (C320, C300, C300-M, C600, C650). Sistem mendukung kartu GPON (GTG) dan EPON (ETG), dengan sinkronisasi SNMP/Telnet, monitoring real-time, alerting, provisioning, dan manajemen infrastruktur FTTH dari satu dashboard.

**Target users**: Operator ISP/FTTH yang mengelola jaringan fiber optic dengan OLT ZTE.

---

## 2. Goals & Objectives

| Goal | Metric |
|------|--------|
| Single dashboard untuk semua OLT/ONU management | 1 UI untuk multi-OLT, multi-vendor ONU |
| Real-time monitoring ONU status & signal | Auto-sync setiap 5 menit, WebSocket push |
| Automated alerting untuk gangguan jaringan | Debounce 120s, auto-resolve, multi-channel notifikasi |
| Self-service ONU provisioning | Wizard-based, script preview, multi-template |
| FTTH infrastructure tracking | OTB → ODC → ODP hierarchy dengan peta lokasi |
| Config backup & audit trail | Auto-backup hourly, manual backup, action logs |

---

## 3. Functional Requirements

### 3.1 OLT Management

| ID | Requirement | Priority |
|----|------------|----------|
| OLT-01 | Tambah/edit/hapus OLT dengan SNMP + Telnet credentials | Must |
| OLT-02 | Test connection (SNMP + Telnet) sebelum save | Must |
| OLT-03 | Sync OLT — pull ONU data, chassis, PON ports, uplinks | Must |
| OLT-04 | Light sync (SNMP-only, cepat) vs Full sync (SNMP + Telnet) | Must |
| OLT-05 | Auto-sync via cron (setiap 5 menit, configurable) | Should |
| OLT-06 | Rack diagram visual — slot, port, fan, PSU per OLT | Should |
| OLT-07 | OLT health monitoring — CPU, memory, temperature via SNMP | Should |
| OLT-08 | Multi-vendor OLT support via adapter pattern (ZTE, HSGQ, Raisecom, BDCOM, C-Data, VSOL, Huawei, FiberHome, Dasan) | Could |

### 3.2 ONU Management

| ID | Requirement | Priority |
|----|------------|----------|
| ONU-01 | List semua ONU dengan server-side pagination, filter, sort | Must |
| ONU-02 | ONU detail — DB data (status, signal, distance, serial) | Must |
| ONU-03 | ONU live detail — Telnet real-time (running-config, equip) | Must |
| ONU-04 | ONU actions: reboot, reset, delete, clear-config, enable/disable | Must |
| ONU-05 | Auto-sync + auto-write config setelah ONU action | Must |
| ONU-06 | Inline edit: name, description, ONU type, technician, ODP port | Must |
| ONU-07 | ONU migration (pindah PON port) | Should |
| ONU-08 | ONU traffic monitoring (real-time via Telnet) | Should |
| ONU-09 | ONU event history (deregister, reboot, config changes) | Should |
| ONU-10 | GPON + EPON support — dynamic CLI prefix detection | Must |

### 3.3 ONU Provisioning

| ID | Requirement | Priority |
|----|------------|----------|
| PROV-01 | Register Wizard: scan uncfg → select ONU → template → configure → preview → register | Must |
| PROV-02 | Provision Wizard: unified wizard dengan manual/pre-config mode | Must |
| PROV-03 | Service templates: Bridge, PPPoE, ZTE Single/Dual/Multi, Huawei Full, Fiberhome VEIP | Must |
| PROV-04 | WiFi SSID OMCI config — Open/WPA/WPA2/Mixed, dual-band 2.4G & 5G | Must |
| PROV-05 | TR069/ACS profile support — dropdown saved profiles, auto-fill ACS URL/user/pass | Should |
| PROV-06 | Script preview — CLI commands yang akan dikirim ke OLT, copy to clipboard | Must |
| PROV-07 | Multi-ONU batch registration dengan delay antar registrasi | Should |
| PROV-08 | Technician assignment saat provisioning | Should |
| PROV-09 | EPON support — deteksi kartu ETG, prefix `epon-olt_`/`epon-onu_` | Must |
| PROV-10 | VEIP auto-detect dari serial number (ZTEG = iphost, non-ZTE = VEIP) | Must |

### 3.4 Alerting & Notifications

| ID | Requirement | Priority |
|----|------------|----------|
| ALT-01 | Alert rules: OLT offline, ONU offline/dyinggasp/los, sinyal rendah, CPU/mem/temp | Must |
| ALT-02 | Batched alerts per PON port (gangguan massal detection) | Must |
| ALT-03 | Multi-channel: Telegram, WhatsApp (third-party API), WhatsApp Native (Baileys) | Should |
| ALT-04 | In-app bell notifications dengan WebSocket real-time push | Must |
| ALT-05 | Debounce 120 detik — 2x konfirmasi deteksi sebelum fire alert | Must |
| ALT-06 | Auto-resolve — notifikasi lama ditandai RESOLVED saat kondisi normal | Must |
| ALT-07 | Auto-cleanup — notifikasi read >7 hari dihapus otomatis | Should |
| ALT-08 | Maintenance window — suppress alerts pada periode tertentu | Could |
| ALT-09 | Technician alert sending — per-user phone number | Should |
| ALT-10 | Alert history log (AlertHistory table) untuk audit trail | Should |

### 3.5 FTTH Infrastructure

| ID | Requirement | Priority |
|----|------------|----------|
| FTTH-01 | Manajemen hierarki: OTB → ODC → ODP | Must |
| FTTH-02 | ODP port management dan assignment ke ONU | Must |
| FTTH-03 | Koordinat lokasi (lat/lng) dengan tampilan peta | Should |
| FTTH-04 | Tree view navigasi infrastruktur | Should |
| FTTH-05 | Fiber path tracking (OTB → ODC → ODP → ONU) | Could |

### 3.6 Traffic Monitoring

| ID | Requirement | Priority |
|----|------------|----------|
| TRF-01 | Real-time traffic per uplink/PON port via Telnet CLI | Should |
| TRF-02 | Historical traffic logging (raw + hourly aggregation) | Should |
| TRF-03 | Traffic grid visualization dengan Recharts | Should |
| TRF-04 | Auto traffic polling via cron (setiap 5 menit) | Could |

### 3.7 Config Backup

| ID | Requirement | Priority |
|----|------------|----------|
| BAK-01 | Manual backup — `write memory` + `show running-config` → save to DB | Must |
| BAK-02 | Auto-backup via cron (hourly, configurable interval + time-of-day) | Should |
| BAK-03 | Download backup as `.cfg` file | Must |
| BAK-04 | Delete old backups | Must |
| BAK-05 | Auto-prune backups older than retention period (default 30 days) | Should |
| BAK-06 | Backup failure notification ke super admin | Should |
| BAK-07 | Backup history list (manual + auto, success + failed) | Must |
| BAK-08 | Auto-write config (`write` command) setelah provisioning/config changes | Must |

### 3.8 Customization & RBAC

| ID | Requirement | Priority |
|----|------------|----------|
| CUS-01 | Role-based access control (Full Access, Viewer, Limited, Technician) | Must |
| CUS-02 | Customizable column visibility dan sort order (desktop & mobile) | Should |
| CUS-03 | Configurable RX power color ranges dengan preview | Should |
| CUS-04 | Signal filter thresholds (critical/good) dengan slider | Should |
| CUS-05 | ONU custom columns | Could |
| CUS-06 | Technician assignment untuk ONU | Should |

### 3.9 OLT Configuration

| ID | Requirement | Priority |
|----|------------|----------|
| CFG-01 | Uplink port management (speed, VLAN, description) | Must |
| CFG-02 | PON card management (enable/disable, port config) | Must |
| CFG-03 | VLAN management (create, rename, delete) | Must |
| CFG-04 | ONU type management (create, delete, list) | Must |
| CFG-05 | WAN-IP profile management | Should |
| CFG-06 | Speed profile management (TCONT + Traffic profiles) | Must |
| CFG-07 | System info (hostname, management IP, firmware) | Should |
| CFG-08 | EPON card count di stats row | Must |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| ID | Requirement | Target |
|----|------------|--------|
| PERF-01 | Dashboard load time | < 2s (cached), < 5s (uncached) |
| PERF-02 | ONU list pagination | 50 ONUs/page, server-side |
| PERF-03 | Sync duration (light) | < 30s per OLT |
| PERF-04 | Sync duration (full) | < 120s per OLT |
| PERF-05 | WebSocket latency | < 500ms push |
| PERF-06 | Frontend bundle size | < 500KB gzipped (main chunk) |

### 4.2 Reliability

| ID | Requirement |
|----|------------|
| REL-01 | Auto-restart on crash (systemd `Restart=always`) |
| REL-02 | File lock pada cron scripts (mencegah overlapping runs) |
| REL-03 | Graceful fallback: SNMP timeout → Telnet, Redis down → in-memory cache |
| REL-04 | SQLite busy timeout 30s untuk concurrent writes |
| REL-05 | Failed backup retry pada cron berikutnya (tidak update `last_backup_at`) |

### 4.3 Security

| ID | Requirement |
|----|------------|
| SEC-01 | Session cookie: HttpOnly, SameSite=Lax, Secure (HTTPS) |
| SEC-02 | Permission decorator di setiap state-changing route |
| SEC-03 | CLI password encryption (`encrypt_field`/`decrypt_field`) |
| SEC-04 | CSP headers (script-src, style-src, connect-src including ws:) |
| SEC-05 | Rate limiting pada auth endpoints |
| SEC-06 | X-Forwarded-For / X-Real-IP untuk audit log (behind Nginx/Cloudflare) |
| SEC-07 | No hardcoded secrets — `SECRET_KEY` auto-generated, env vars untuk credentials |

### 4.4 Compatibility

| ID | Requirement |
|----|------------|
| COMP-01 | Browser: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+ |
| COMP-02 | OS: Ubuntu 22.04/24.04 (VPS), Windows 10/11 (dev) |
| COMP-03 | Database: SQLite (dev), PostgreSQL 14+ (production) |
| COMP-04 | Python 3.12+, Node.js 22+ |
| COMP-05 | OLT: ZTE C320/C300/C300-M/C600/C650 |
| COMP-06 | PWA support (vite-plugin-pwa) |

---

## 5. System Architecture

```
Browser → React SPA (Vite + TypeScript + TailwindCSS v4)
              ↓
         Flask API (port 5000) → SQLite / PostgreSQL
              ↓
    SNMP (pysnmp 7.x) + Telnet CLI → ZTE OLT/ONU devices
              ↓
    FastAPI (port 8765) → WebSocket real-time + Swagger docs
              ↓
    Alert Engine → Telegram / WhatsApp / In-app notifications
```

### Key Components

| Component | File(s) | Role |
|-----------|---------|------|
| Flask API | `app.py` | Routes, API, sync orchestration |
| Models | `models.py` | SQLAlchemy models (20+ tables) |
| SNMP Core | `snmp_core.py` | pysnmp 7.x Slim API, OID mappings |
| Telnet Client | `telnet_client.py` | ZTE CLI commands, ONU provisioning |
| Sync Service | `services_sync.py`, `sync_helper.py` | Background sync, DB persistence |
| Auto Sync | `auto_sync.py` | Cron-based sync (every 5 min) |
| Auto Backup | `auto_backup.py` | Cron-based config backup (hourly) |
| Traffic Poller | `traffic_poller.py` | Cron-based traffic polling (every 5 min) |
| Alert Engine | `alerts.py` | Rule-based alerts, debounce, auto-resolve |
| WebSocket | `ws_bridge.py`, `api_async.py` | Real-time push notifications |
| Vendor Adapters | `olt_adapters/` | Multi-vendor adapter pattern |
| Frontend | `frontend/src/` | React 19 SPA |
| Auth | `routes_auth.py` | Login/logout, session management |
| Helpers | `helpers.py` | Permission, logging, tenant helpers |
| Extensions | `extensions.py` | Shared Flask extensions (db, login_manager) |
| Config | `config.py` | Environment-based configuration |
| Cache | `cache.py` | Redis caching (in-memory fallback) |

---

## 6. Data Model (Key Entities)

```
OLT (1) ──┬── ONU (N)           — ONU status, signal, serial, card type
           ├── OLTCard (N)       — Chassis slots (GTG=GPON, ETG=EPON)
           ├── OLTUplink (N)     — Uplink ports
           ├── OLTPort (N)       — PON ports with stats
           ├── Fan (N)           — Fan RPM & status
           ├── OLTConfigBackup(N)— Running-config backups
           ├── ONUType (N)       — Registered ONU types
           ├── SpeedProfile (N)  — TCONT + Traffic profiles
           ├── WanIpProfile (N)  — WAN IP profiles
           └── ONUVlan (N)       — VLAN database

User (1) ──┬── ActionLog (N)     — Audit trail
            └── Notification (N) — In-app bell notifications

AlertRule (1) ── AlertHistory (N) — Alert detection log

FTTHOTB → FTTHODC → FTTHODP → FTTHODPPort — Infrastructure hierarchy
```

---

## 7. API Endpoints (Key)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Login |
| `/api/auth/me` | GET | Current user |
| `/api/dashboard` | GET | Dashboard summary |
| `/api/olts` | GET/POST | List/create OLTs |
| `/api/olts/<id>/sync` | POST | Sync OLT |
| `/api/all-onus` | GET | List ONUs (paginated) |
| `/api/onu/<id>/action` | POST | ONU actions |
| `/api/onu/<id>/detail` | GET | ONU detail (DB) |
| `/api/onu/<id>/live-detail` | GET | ONU detail (Telnet) |
| `/api/pre-register` | POST | Register ONU |
| `/api/provision/unified` | POST | Provision ONU |
| `/api/scan-unconfigured` | POST | Scan unconfigured ONUs |
| `/api/olt/<id>/backups` | GET | List backups |
| `/api/olt/<id>/backup-save` | POST | Save backup to DB |
| `/api/olt/<id>/auto-backup` | PUT | Toggle auto-backup |
| `/api/alert-rules` | GET/PUT | Alert rules |
| `/api/alert-rules/recheck` | POST | Manual re-check |
| `/api/ftth/*` | GET/POST | FTTH infrastructure |
| `/api/public/branding` | GET | NMS branding (no auth) |

---

## 8. Deployment

### VPS (Ubuntu 22.04/24.04)

```bash
# One-click install
curl -fsSL https://raw.githubusercontent.com/s4lfanet/nms-ztec320/main/install-vps.sh | bash

# Update
cd /opt/salfanet-nms && sudo bash deploy/update_vps.sh
```

### Docker

```bash
docker compose up -d
# With nginx: docker compose --profile production up -d
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| Flask API | 5000 | Backend REST API |
| FastAPI WebSocket | 8765 | Real-time push + Swagger docs |
| Nginx | 80 | Reverse proxy (Flask + WebSocket) |
| Cron | — | auto_sync (5min), auto_backup (1h), traffic_poller (5min) |

---

## 9. Future Roadmap

| Feature | Priority | Status |
|---------|----------|--------|
| Multi-vendor OLT (HSGQ, Raisecom, BDCOM, C-Data, VSOL, Huawei, FiberHome) | Medium | Adapter pattern ready, partial implementation |
| ONU config restore from backup | Low | Not started |
| Mobile app (React Native) | Low | Not started |
| RBAC per-OLT (tenant isolation) | Low | SaaS routes exist, frontend removed |
| GraphQL API | Low | Not planned |
| ONU firmware management | Low | Not started |
| Network topology auto-discovery | Low | Not started |
