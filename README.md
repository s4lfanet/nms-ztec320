# Salfanet NMS — ZTE OLT Management System

Sistem manajemen OLT/ONU FTTH untuk perangkat **ZTE** (C320, C300, C300-M, C600, C650). Mendukung kartu **GPON** (GTG) dan **EPON** (ETG). Dibangun dengan Flask + React, mendukung sinkronisasi SNMP/Telnet, monitoring ONU real-time, alerting, provisioning, dan manajemen infrastruktur FTTH dari satu dashboard.

![License](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-3.12+-green)
![React](https://img.shields.io/badge/react-19+-cyan)
![OLT](https://img.shields.io/badge/OLT-ZTE%20C320%2FC300-orange)

## Fitur Utama

### OLT & ONU Management
- Tambah, edit, hapus, dan sinkronisasi OLT via SNMP + Telnet
- Monitoring status ONU, sinyal RX/TX, jarak, serial number, dan detail perangkat
- Aksi CLI: reboot, reset, delete, clear config, enable/disable, restore factory, restore WiFi, **replace ONU (swap SN/MAC)**
- Auto-sync setelah aksi ONU (reboot/delete/clear-config)
- **Non-ZTE ONU reboot**: FiberHome/Huawei ONUs menggunakan `shutdown`/`no shutdown` fallback (OMCI reboot tidak direspons). Deteksi vendor via SN prefix
- Rack diagram visual untuk chassis OLT (slot, port, fan, PSU)
- **GPON + EPON support**: Kartu GTG (GPON) dan ETG (EPON) terdeteksi otomatis, CLI commands menggunakan prefix yang sesuai (`gpon-olt_`/`gpon-onu_` vs `epon-olt_`/`epon-onu_`)
- **Auto-backup OLT config**: Backup running-config via Telnet (`write memory` + `show running-config`), simpan ke DB, download/restore, auto-prune berdasarkan retention policy, notifikasi failure ke admin

### ONU Provisioning
- Pre-register wizard: scan ONU → pilih template → konfigurasi → preview CLI → register
- Provision wizard dengan mode manual/pre-config
- Template ZTE (Single/Dual/Multi VLAN), Huawei Full, Fiberhome VEIP
- WiFi SSID OMCI config: Open/WPA/WPA2/Mixed auth untuk dual-band (2.4G & 5G)
- TR069/ACS profile support untuk Fiberhome VEIP template
- **EPON support**: Deteksi otomatis kartu ETG, CLI prefix `epon-olt_`/`epon-onu_`, scan uncfg EPON, script preview dinamis
- **EPON ONU registration**: MAC address diformat dotted (`xxxx.xxxx.xxxx`) untuk CLI ZTE, ONU type `ALL-EPON` (bukan `All`), keyword `mac` (bukan `sn`), skip GPON-only template commands (tcont/gemport), apply basic bridge service via `service-port`
- **Replace ONU (Swap SN/MAC)**: Ganti perangkat ONU rusak dengan SN/MAC baru tanpa konfigurasi ulang manual. Backup config → delete old → register new → re-apply config. Vendor validation (ZTE/FiberHome/Huawei), retry mechanism, progress logging

### Alerting & Monitoring
- Rule-based alerts untuk OLT offline, ONU offline/dyinggasp, sinyal rendah, CPU/memory/temperature
- Batched alerts per PON port (gangguan massal detection)
- Notifikasi ke Telegram, WhatsApp (third-party API), WhatsApp Native (Baileys gateway)
- Technician alert sending (per-user phone number)
- In-app bell notifications dengan dedup via AlertHistory
- **Debounce 120 detik** — alert hanya fires setelah 2x konfirmasi deteksi (mencegah false alert dari transient flap)
- **Auto-resolve** — notifikasi lama (offline/dyinggasp/los) otomatis ditandai RESOLVED saat ONU/OLT kembali online
- **Notification lifecycle** — Active → Resolved → Auto-cleanup (>7 hari read notifs dihapus otomatis)
- **Dedup recovery** — notifikasi recovery tidak duplikat (update existing jika ada)
- **OLT health auto-resolve** — alert CPU/mem/temp auto-resolve saat nilai kembali normal
- Maintenance window untuk suppress alerts
- OLT health check via SNMP (CPU, memory, temperature)
- Real-time push via WebSocket (bell icon update tanpa refresh)

### FTTH Infrastructure
- Manajemen hierarki OTB → ODC → ODP
- ODP port management dan assignment ke ONU
- Koordinat lokasi dengan tampilan peta
- Tree view navigasi infrastruktur

### Traffic Monitoring
- Real-time traffic per uplink/PON port via Telnet CLI
- Historical traffic logging (raw + hourly aggregation)
- Traffic grid visualization dengan Recharts

### Customization & RBAC
- Customizable column visibility dan sort order (desktop & mobile)
- Configurable RX power color ranges dengan preview
- Signal filter thresholds (critical/good) dengan slider
- Role-based access control (Full Access, Viewer, Limited, Technician)
- Technician assignment untuk ONU
- ONU custom columns

### Centralized Guide System
- **Panduan page** (`/dashboard/guide`): Pusat panduan penggunaan dengan search dan category filter
- 17 guides terorganisir dalam 7 kategori (Dashboard, ONU Management, Templates, Traffic, Infrastructure, System, Activity)
- Accordion UI dengan rich text (bold), prerequisites, dan tips per guide
- `TutorialBanner` di setiap halaman terhubung ke centralized data via `guideId` — single source of truth
- Quick-access "Panduan" link button di TutorialBanner untuk navigasi ke guide center

### WebSocket Real-time
- Sync progress broadcast per OLT
- ONU status change notifications
- Dashboard live events
- Auto-refresh UI pada sync completion

## Arsitektur

```text
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

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Flask 3.x, SQLAlchemy 2.x, Flask-Login, Flask-Migrate |
| Async/WebSocket | FastAPI, uvicorn, websockets |
| Network | pysnmp 7.x (SNMP), raw socket Telnet (IAC negotiation) |
| Frontend | React 19, TypeScript, Vite 8, TailwindCSS v4 |
| State | Zustand (auth), React Query (data fetching) |
| Charts | Recharts |
| Icons | Lucide React |
| Database | SQLite (default) / PostgreSQL (production) |
| Caching | Redis (optional, reduces OLT polling load) |
| Testing | pytest (backend), vitest (frontend) |

## Struktur Proyek

```text
├── app.py                 # Flask routes, API, sync orchestration (~7300 lines)
├── models.py              # SQLAlchemy models (OLT, ONU, Alert, FTTH, Users, etc.)
├── config.py              # Environment-based configuration
├── snmp_core.py           # SNMP core collector (pysnmp 7.x Slim API)
├── snmp_collector.py      # Compatibility shim (re-exports snmp_core + telnet_client)
├── telnet_client.py       # ZTE CLI collector & provisioning (~4330 lines)
├── alerts.py              # Alert engine + notification (Telegram, WA, in-app)
├── services_sync.py       # Sync service (background thread management)
├── sync_helper.py         # Sync result persistence to DB
├── cache.py               # Redis caching layer (in-memory fallback for dev)
├── auto_sync.py           # Cron-based auto-sync
├── auto_backup.py         # Automatic OLT config backup
├── task_queue.py          # Background task queue (traffic aggregation)
├── traffic_poller.py      # Traffic polling via Telnet CLI
├── ws_bridge.py           # WebSocket bridge for real-time events
├── api_async.py           # FastAPI app (WebSocket + Swagger docs)
├── api_docs.py            # FastAPI endpoint documentation
├── routes_auth.py         # Auth Blueprint (login, logout, API auth)
├── extensions.py          # Shared Flask extensions (db, login_manager, migrate)
├── helpers.py             # Shared helpers (permissions, rate limiting, logging)
├── logging_config.py      # Structured logging (JSON for prod, human-readable for dev)
├── run_server.py          # Hybrid server launcher (Flask + FastAPI)
├── migrate.py             # Flask-Migrate CLI wrapper
├── olt_adapters/          # ZTE adapter package
│   ├── __init__.py        # Auto-registers ZTE adapter
│   ├── base.py            # BaseOLTAdapter abstract class
│   ├── registry.py        # RackAdapterRegistry
│   ├── normalized.py      # Normalized data classes (RackData, Slot, Port, Fan, PSU)
│   ├── snmp_oids.py       # ZTE SNMP OID mappings
│   └── zte_adapter.py     # ZTE adapter (delegates to snmp_collector)
├── frontend/              # React SPA
│   ├── src/
│   │   ├── pages/         # Dashboard, AllOnus, ViewOnu, Settings, Customization, etc.
│   │   ├── components/    # Rack diagrams, UI components, layout, TutorialBanner
│   │   ├── data/          # Centralized guide data (guides.ts)
│   │   ├── hooks/         # useRackData, useRackMetrics, etc.
│   │   ├── stores/        # Zustand auth store
│   │   ├── types/         # TypeScript interfaces (rack.ts, etc.)
│   │   └── utils/         # API client, formatters
│   └── vite.config.ts     # Vite config with proxy + PWA
├── wa_gateway/            # WhatsApp Native gateway (Node.js/Baileys)
├── deploy/                # Deployment scripts & configs
│   ├── vps-setup.sh       # Ubuntu VPS one-click deployment
│   ├── nginx-fibernms.conf # Nginx reverse proxy config
│   ├── deploy-frontend.ps1 # Frontend build & deploy script
│   └── .env.template      # Production env template
├── migrations/            # Alembic database migrations
├── tests/                 # pytest unit tests
├── scripts/               # CLI utility scripts
├── requirements.txt       # Python dependencies
├── Dockerfile             # Multi-stage Docker build
├── docker-compose.yml     # Docker Compose (backend + postgres + redis + nginx)
└── .env.example           # Environment config template
```

## Quick Start

### Prerequisites

- **Python 3.12+**
- **Node.js 22+** (for frontend)
- **ZTE OLT** (C320/C300) accessible via SNMP (port 161) and Telnet (port 23)

### Option 1: VPS Full Installer (Ubuntu 22.04/24.04)

One-click installer for fresh VPS. Installs all dependencies, clones repo, builds frontend, sets up systemd + nginx, and starts the server.

```bash
# Download and run (as root)
curl -fsSL https://raw.githubusercontent.com/s4lfanet/nms-ztec320/main/install-vps.sh -o install-vps.sh
bash install-vps.sh

# Or with a domain
bash install-vps.sh yourdomain.com
```

What it does:
1. Installs system packages (Python 3, Node.js 22, nginx, git)
2. Clones repo to `/opt/salfanet-nms/`
3. Creates Python venv + installs dependencies
4. Builds frontend (React SPA)
5. Creates `.env` with auto-generated `SECRET_KEY`
6. Sets up systemd service (`salfanet-nms`)
7. Configures Nginx reverse proxy (port 80 → Flask 5000 + WebSocket 8765)
8. Starts everything and verifies

After install, access `http://<your-vps-ip>` and login with `admin` / `admin123`.

### Option 2: Local Installer (repo already cloned)

```bash
# Install only
bash install.sh

# Install + auto-start server
bash install.sh --start
```

### Option 3: Manual Setup

```bash
# 1. Backend setup
python -m venv .venv

# Windows
.venv\Scripts\activate
# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt

# 2. Frontend setup
cd frontend
npm install
npm run build
cd ..

# 3. Configure environment
cp .env.example .env
# Edit .env with your settings

# 4. Run the server
python run_server.py
# Or just Flask:
python app.py
```

### Access the Application

- **App**: http://127.0.0.1:5000
- **API Docs (Swagger)**: http://127.0.0.1:8765/docs
- **WebSocket**: ws://127.0.0.1:8765/ws/
- **Default login**: `admin` / `admin123`

### Development Mode (with hot reload)

```bash
# Terminal 1: Backend
python app.py

# Terminal 2: Frontend dev server
cd frontend
npm run dev
```

Frontend dev server runs on http://127.0.0.1:5173 with API proxy to Flask on port 5000.

## VPS Management

### Update (pull latest code + rebuild + restart)

Recommended — run the update script (as root, from the deployed app directory):

```bash
cd /opt/salfanet-nms
sudo bash deploy/update_vps.sh
```

This pulls the latest code, rebuilds the frontend, restarts the `salfanet-nms` service, refreshes the Nginx config (Cloudflare real IP support), and (re)registers the `auto_backup` (hourly) and `auto_sync` (every 5 min) cron jobs.

Manual equivalent, if you only need to pull code without touching nginx/cron:

```bash
cd /opt/salfanet-nms
git pull origin main
cd frontend && npm run build && cd ..
systemctl restart salfanet-nms
```

### Uninstall (remove everything)

```bash
# Download and run (as root)
curl -fsSL https://raw.githubusercontent.com/s4lfanet/nms-ztec320/main/uninstall-vps.sh -o uninstall-vps.sh
bash uninstall-vps.sh
```

What it removes:
- systemd service (`salfanet-nms`)
- Nginx config
- iptables port redirect
- App files (`/opt/salfanet-nms/` including database)
- App user (`salfanet`)

System packages (Python, Node.js, nginx) are kept.

### Service Management

```bash
systemctl status salfanet-nms      # Check status
systemctl restart salfanet-nms     # Restart
systemctl stop salfanet-nms        # Stop
journalctl -u salfanet-nms -f      # View logs (live)
```

### Installer Scripts Reference

| Script | Purpose | Command |
|--------|---------|---------|
| `install-vps.sh` | Full VPS installer (fresh server) | `bash install-vps.sh [domain]` |
| `install.sh` | Local installer (repo already cloned) | `bash install.sh [--start]` |
| `uninstall-vps.sh` | Full VPS uninstaller | `sudo bash uninstall-vps.sh` |
| `deploy/vps-setup.sh` | Deploy from source directory | `sudo bash deploy/vps-setup.sh [domain]` |
| `deploy/update_vps.sh` | Update an already-deployed VPS (pull, rebuild, restart, nginx, cron) | `sudo bash deploy/update_vps.sh` |

## Configuration

### Environment Variables (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | auto-generated | Flask secret key for sessions |
| `FLASK_ENV` | development | `development` / `production` / `testing` |
| `FLASK_DEBUG` | 0 | Enable debug mode (1/0) |
| `DATABASE_URL` | (empty=SQLite) | PostgreSQL URL for production |
| `HOST` | 0.0.0.0 | Server bind address |
| `PORT` | 5000 | Flask port |
| `WS_PORT` | 8765 | FastAPI/WebSocket port |
| `SESSION_COOKIE_SECURE` | 1 | HTTPS-only cookies (set 0 for HTTP) |
| `REDIS_URL` | (empty) | Redis URL for caching (optional, reduces OLT load) |
| `WA_GATEWAY_URL` | (empty) | WhatsApp gateway URL (optional) |

### Adding Your OLT

1. Login to the web UI
2. Go to **Settings → OLT Settings**
3. Click **Add OLT**
4. Enter OLT name, IP address, SNMP community, Telnet credentials
5. Click **Test Connection** to verify
6. Click **Sync** to pull ONU data

## Deployment

### Docker (Recommended for Production)

```bash
# Build and start all services
docker compose up -d

# With nginx reverse proxy (production profile)
docker compose --profile production up -d
```

Services: backend (Flask+FastAPI), PostgreSQL, Redis, Nginx

### VPS Deployment (Ubuntu)

```bash
# On your VPS:
sudo bash deploy/vps-setup.sh your-domain.com

# Or manually:
# 1. Copy files to /opt/fibernms/
# 2. Create Python venv, install requirements
# 3. Build frontend: cd frontend && npm ci && npm run build
# 4. Configure nginx (use deploy/nginx-fibernms.conf)
# 5. Create systemd service
# 6. sudo certbot --nginx -d your-domain.com (for HTTPS)
```

### Systemd Service

```ini
[Unit]
Description=Salfanet NMS
After=network.target

[Service]
Type=simple
User=fibernms
WorkingDirectory=/opt/fibernms
Environment="PATH=/opt/fibernms/.venv/bin"
ExecStart=/opt/fibernms/.venv/bin/python run_server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## API Documentation

- **Swagger UI**: http://localhost:8765/docs
- **ReDoc**: http://localhost:8765/redoc
- **OpenAPI JSON**: http://localhost:8765/openapi.json

### Key API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Login |
| `/api/auth/me` | GET | Current user info |
| `/api/dashboard` | GET | Dashboard summary |
| `/api/olts` | GET/POST | List/create OLTs |
| `/api/olts/<id>/sync` | POST | Sync OLT |
| `/api/all-onus` | GET | List all ONUs (paginated) |
| `/api/onu/<id>/action` | POST | ONU actions (reboot, delete, etc.) |
| `/api/onu/<id>/detail` | GET | ONU detail (DB) |
| `/api/onu/<id>/live-detail` | GET | ONU detail (Telnet live) |
| `/api/alert-rules` | GET/PUT | Alert rules |
| `/api/alert-rules/recheck` | POST | Manual alert re-check |
| `/api/bot-config/*` | GET/PUT | Telegram/WA bot config |
| `/api/ftth/*` | GET/POST | FTTH infrastructure |
| `/api/metrics/history` | GET | Historical metrics |
| `/api/public/branding` | GET | NMS branding (no auth) |

## Testing

```bash
# Backend tests
py -3 -m pytest tests/ -v

# Frontend tests
cd frontend
npm run test
```

## Documentation

- [ZTE C320/C300 CLI & OID Reference](ZTE_C320_C300_CLI_OID_Reference.md) — comprehensive CLI commands and SNMP OIDs

## Supported OLT Models

| Model | SNMP | Telnet CLI | GPON | EPON | Notes |
|-------|------|-----------|------|------|-------|
| ZTE C320 | ✅ | ✅ | ✅ | ✅ | Primary tested model (GTG + ETG cards) |
| ZTE C300 | ✅ | ✅ | ✅ | ✅ | Full support |
| ZTE C300-M | ✅ | ✅ | ✅ | ✅ | Full support |
| ZTE C600 | ✅ | ✅ | ✅ | ✅ | Full support |
| ZTE C650 | ✅ | ✅ | ✅ | ✅ | Full support |

## Supported ONU Vendors (on ZTE OLT)

ZTE OLTs manage ONUs from multiple vendors. The system auto-detects ONU vendor from serial number prefix:

- **ZTE** (ZTEG prefix)
- **Huawei** (HWTC prefix) — Huawei Full template
- **Fiberhome** (GPON prefix) — Fiberhome VEIP template with TR069
- **Other** (generic provisioning)

## License

MIT License — see [LICENSE](LICENSE) file for details.

## Credits

**Salfanet NMS** — Developed for FTTH network operators managing ZTE OLT infrastructure.

- SNMP: [pysnmp](https://github.com/lextudio/pysnmp) 7.x
- Frontend: [React](https://react.dev), [Vite](https://vitejs.dev), [TailwindCSS](https://tailwindcss.com)
- Icons: [Lucide](https://lucide.dev)
- Charts: [Recharts](https://recharts.org)
