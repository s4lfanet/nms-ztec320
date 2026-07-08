# Salfanet NMS — Multi-Tenant OLT Management System

A SaaS multi-tenant Flask-based OLT management system for ZTE C320/C300 FTTH network operators. Built with React SPA frontend, multi-tenant architecture with subdomain-based tenant isolation, subscription management, and Duitku payment integration.

## Quick Start

```bash
# Activate virtual environment
.venv\Scripts\activate   # Windows
source .venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Run the application
python app.py
```

Open **http://127.0.0.1:5000** and login with:
- Superadmin: `https://nms.salfa.my.id/spa/secure-portal-x7k2`
- Tenant: `https://<subdomain>.salfa.my.id/spa/login`

## Architecture

```
User Browser ↔ React SPA (Vite + TypeScript + TailwindCSS)
                    ↕
              Flask (app.py) ↔ SQLite (models.py)
                    ↕
            Telnet/SNMP (snmp_collector.py) → ZTE C320 OLT
                    ↕
            Duitku Payment Gateway (SaaS subscriptions)
```

### Multi-Tenant Model
- **Main domain** (`nms.salfa.my.id`): Superadmin panel + public landing/registration
- **Tenant subdomains** (`<subdomain>-nms.salfa.my.id`): Tenant-scoped OLT/ONU management
- **Session isolation**: Separate cookies (`nms-admin-session` vs `nms-tenant-session`) with host-only domain — admin and tenant sessions coexist in same browser
- Domain-based login isolation: superadmin can only login on main domain, tenants only on their subdomain

## Project Structure

```
nms/
├── app.py                    # Flask routes, API endpoints, sync logic (~6460 lines)
├── models.py                 # SQLAlchemy ORM models (20+ tables)
├── extensions.py             # Shared Flask extensions + MultiTenantSessionInterface
├── helpers.py                # Shared helper functions & decorators
├── snmp_core.py              # SNMP core collector (pysnmp 7.x)
├── telnet_client.py          # Telnet CLI collector (raw socket)
├── snmp_collector.py         # Compatibility shim + poll_olt() orchestrator
├── services_cf.py            # Cloudflare Tunnel service
├── services_wa.py            # WhatsApp notification service
├── services_sync.py          # OLT sync service
├── sync_helper.py            # Sync helper (DB operations during sync)
├── alerts.py                 # Alert monitoring engine
├── auto_sync.py              # Auto-sync scheduler
├── ont_provisioner.py        # ONT provisioning helper
├── requirements.txt          # Python dependencies
├── instance/
│   └── nms.db               # SQLite database
├── frontend/                 # React SPA (Vite + TypeScript)
│   ├── src/
│   │   ├── App.tsx           # Router + ProtectedRoute + tenant validation
│   │   ├── main.tsx          # Entry point (BrowserRouter basename="/spa")
│   │   ├── pages/            # 22 page components
│   │   ├── components/       # Layout, UI components
│   │   ├── hooks/            # useHasPerm
│   │   ├── lib/              # API client, utils
│   │   └── stores/           # Zustand auth store
│   ├── package.json
│   └── vite.config.ts
├── deploy/                   # VPS deployment scripts + configs
├── templates/                # Legacy Jinja2 templates (login, dashboard)
├── static/                   # Legacy static assets
├── wa_gateway/               # WhatsApp notification gateway
├── fibernms_nginx.conf       # Nginx config
├── AGENTS.md                 # AI agent handoff guide
├── FiberNMS_Documentation.md # Full system documentation
└── PRD.md                    # Product Requirements Document
```

## Key Features

### SaaS Multi-Tenant
- Tenant registration with subdomain provisioning
- Subscription packages (Starter/Business/Enterprise)
- Duitku payment integration (registration + renewal)
- Tenant isolation: subdomain-based access, per-tenant data filtering
- Superadmin panel: tenant management, subscriptions, packages, notifications
- Auto-activation on payment callback

### OLT Management
- Add/edit/delete OLT devices
- SNMP + Telnet connection testing
- Background sync with progress tracking
- Firmware version auto-detection

### OLT Configuration (per-OLT tabs)
| Tab | Data Source | Features |
|-----|-----------|----------|
| Uplinks | SMXA card ports | Enable/disable, edit config, VLAN trunk edit/delete, IP network config (VLAN SVI) |
| PON Cards | GPON card ports | Per-port ONU stats, enable/disable, edit name/description |
| VLANs | VLAN database | VLAN ID, name, type, rename, delete |
| ONU Types | `show onu-type` | Type name, PON type, description, max values, add, delete |
| WAN-IP Profiles | `show gpon profile wan-ip` | IP, netmask, gateway, DNS, add, delete |
| Speed Profiles | TCONT + Traffic | Bandwidth profiles, add, delete |
| System | OLT info | Name, IP, model, vendor, firmware, temp, uptime, status |

### ONU Management
- All ONUs table with server-side pagination, SQL search, sort
- Signal quality indicators (Good/Warning/Critical)
- Quick edit (name, description) inline
- View detail with actions (Reboot, Reset, Clear Config, Delete)
- ONU pre-registration from unconfigured scan
- ONU migration (single + batch)
- WAN service configuration via Telnet
- Get Status (interface, optical, history, MACs)

### Security
- **Session isolation**: Separate cookies for admin (`nms-admin-session`) and tenant (`nms-tenant-session`) with host-only domain — no cross-subdomain cookie sharing
- **Domain-session guard**: `@before_request` validates user-domain match, clears stale sessions
- **Domain-based login isolation**: superadmin → main domain only, tenants → their subdomain only
- **Rate limiting**: 5 login attempts per IP per 5 min window, 15 min lockout
- **Security headers**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, HSTS
- **RBAC**: Role-based access control with granular permissions
- **Superadmin URL**: Non-guessable path (`/secure-portal-x7k2`), main domain only
- **Admin route guard**: Frontend blocks non-superadmin from `/dashboard/admin`
- **Tenant validation**: Subdomain checked against active tenants on page load
- **Subscription enforcement**: Expired/suspended tenants blocked

### User Management
- Role-based access control (RBAC)
- Permissions: view_dashboard, add_onu, configure_onu, reboot_onu, etc.
- Default roles: Full Access, Viewer, Limited, Demo

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Python 3.10+ / Flask / SQLAlchemy |
| Database | SQLite (via SQLAlchemy ORM) |
| Frontend | React 19 / TypeScript / Vite |
| State | Zustand (auth), React Query (data) |
| UI | TailwindCSS, Lucide icons |
| Network | pysnmp 7.x (SNMPv2c) / Raw socket Telnet (Python 3.13+ compatible) |
| Payment | Duitku payment gateway |
| Deploy | Nginx reverse proxy, systemd, Cloudflare CDN |

## Supported Devices

| Vendor | Model | Status |
|--------|-------|--------|
| ZTE | C320 | Fully tested (V2.1.0) |
| ZTE | C300 | Compatible (same CLI) |
| ZTE | C600 | Planned |

## API Reference

See [FiberNMS_Documentation.md](FiberNMS_Documentation.md) for complete API documentation.

### Key Endpoints
| Method | Endpoint | Purpose |
|--------|---------|---------|
| POST | `/api/auth/login` | Login (domain-checked) |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/dashboard` | Dashboard data |
| GET | `/api/all-onus` | Server-side paginated ONU list |
| POST | `/api/olt/<id>/sync` | Trigger sync |
| POST | `/api/onu/<id>/action` | CLI action (reboot/reset/delete) |
| GET | `/api/public/branding` | Public branding (no auth) |
| GET | `/api/public/tenant-check` | Validate tenant subdomain (no auth) |
| GET | `/api/public/packages` | List subscription packages (no auth) |
| POST | `/api/public/register` | Register new tenant (no auth) |

## Deployment

```powershell
# 1. Build frontend
cd e:\nms\frontend && npm run build

# 2. Copy frontend dist to VPS
pscp -r -pw <password> e:\nms\frontend\dist\* root@<vps-ip>:/opt/fibernms/frontend/dist/

# 3. Copy backend files
pscp -pw <password> e:\nms\app.py e:\nms\models.py e:\nms\telnet_client.py root@<vps-ip>:/opt/fibernms/

# 4. Restart service
plink -pw <password> root@<vps-ip> "systemctl restart fibernms"
```

## License

Internal project. Not for distribution.
