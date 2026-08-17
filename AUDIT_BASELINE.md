# AUDIT_BASELINE.md — Salfanet NMS Repository Inventory

**Generated:** Phase 0 — Baseline & Repository Inventory  
**No code changes were made in this phase.**

---

## 1. Architecture Overview

```
User Browser (React SPA)
    ↕
Nginx (reverse proxy, production)
    ↕                          ↕
Flask (port 5000)         FastAPI (port 8765)
  - All REST API routes     - WebSocket server
  - Auth (Flask-Login)      - /broadcast endpoint
  - Background threads      - API docs (Swagger/ReDoc)
    ↕                          ↕
SQLAlchemy ORM ← → SQLite / PostgreSQL
    ↕
services_sync.py → vendor adapter poll_olt()
    ↕                    ↕
snmp_core.py        telnet_client.py
(SNMP polling)      (CLI commands)
    ↕                    ↕
  OLT Device (ZTE C320/C300, HSGQ, Raisecom, etc.)
```

### Hybrid Server
- `run_server.py` starts Flask in a daemon thread + FastAPI/uvicorn in main thread
- Alert monitor runs as a daemon thread (`alerts.run_alert_monitor`)
- Both servers share the same Python process and DB connections

---

## 2. Component Inventory

### Backend Files

| File | Lines | Role |
|------|-------|------|
| `app.py` | ~8,360 | All REST API routes, ONU/OLT CRUD, sync triggers, SaaS, provisioning |
| `telnet_client.py` | ~8,500+ | ZTE C320/C300 CLI commands, ONU mgmt, VLAN, WiFi, provisioning |
| `snmp_core.py` | ~1,500+ | SNMP OIDs, decoders, SNMPCollector class (pysnmp 7.x Slim) |
| `snmp_collector.py` | ~380 | Compatibility shim + `poll_olt()` orchestrator |
| `models.py` | 739 | 30+ SQLAlchemy models |
| `alerts.py` | ~1,500+ | Alert rules engine, notification system, alert monitor thread |
| `sync_helper.py` | ~640 | Sync result persistence, ONU upsert, stale cleanup |
| `api_docs.py` | ~1,200+ | Flask API documentation registration for FastAPI |
| `api_async.py` | 333 | FastAPI WebSocket + health check + broadcast endpoint |
| `cache.py` | 403 | Redis/memory cache, singleflight, stale-while-revalidate |
| `services_sync.py` | 242 | OLT sync service (single + parallel), ThreadPoolExecutor |
| `auto_sync.py` | 235 | Cron-based auto-sync (file lock, parallel, light/full mode) |
| `traffic_poller.py` | 181 | Cron traffic polling + hourly aggregation |
| `auto_backup.py` | 213 | Cron OLT config backup + retention pruning |
| `task_queue.py` | 257 | RQ-based task queue (sync, traffic poll) — optional |
| `trap_listener.py` | ~1,000+ | SNMP trap listener for real-time ONU events |
| `metrics_service.py` | 161 | Prometheus metrics (Counter, Histogram, Gauge) |
| `ws_bridge.py` | 81 | HTTP bridge: Flask → FastAPI WebSocket broadcast |
| `helpers.py` | 142 | Permission decorators, rate limiting, audit log, utilities |
| `config.py` | 135 | Environment-based configuration |
| `extensions.py` | 19 | Shared Flask extensions (db, login_manager, migrate, logger) |
| `logging_config.py` | 67 | JSON/dev structured logging |
| `routes_auth.py` | 70 | Auth blueprint (login, logout, me) |
| `services_wa.py` | ~40 | WhatsApp notification service |
| `run_server.py` | 94 | Hybrid server launcher |

### OLT Adapters (`olt_adapters/`)

| File | Role |
|------|------|
| `base.py` | `BaseOLTAdapter` abstract class |
| `registry.py` | `RackAdapterRegistry` — vendor dispatch |
| `normalized.py` | Data classes: RackData, NormalizedSlot, NormalizedPort, etc. |
| `snmp_oids.py` | Per-vendor SNMP OID mappings |
| `zte_adapter.py` | ZTE adapter (delegates to `snmp_collector.poll_olt`) |
| `__init__.py` | Auto-registers all adapters |

### Frontend Files (`frontend/src/`)

| Category | Count | Key Files |
|----------|-------|-----------|
| Pages | 23 | Dashboard, AllOnus, ViewOnu, AddOnu, RegisterWizard, ProvisionWizard, OltSettings, OltConfiguration, etc. |
| Components | 13+ | AppShell, RackDiagram, Toast, ConfirmDialog, LeafletMap, etc. |
| Hooks | 4 | useWebSocket, useRackData, useRackMetrics, useHasPerm |
| Stores | 2 | auth (Zustand), theme (Zustand) |
| Lib | 2 | api.ts (centralized API client), utils.ts |
| Types | 1 | rack.ts |

---

## 3. Quantitative Baseline

| Metric | Count |
|--------|-------|
| Backend API endpoints (`@app.route`) | ~190 |
| Auth blueprint routes (`@bp.route`) | 4 |
| Frontend routes | ~20 (under `/dashboard/*`) |
| SQLAlchemy models | 30+ |
| Background workers/threads | 5+ (sync, auto-sync, alert monitor, ws_bridge, traffic) |
| Cron/scheduler jobs | 3 (auto_sync, traffic_poller, auto_backup) |
| Vendor adapters | 1 (ZTE) + registry for future vendors |
| WebSocket channels | 3 (sync, onus, dashboard) |
| Test files | 1 (`test_basic.py`) + 2 load tests |
| Test cases | 10 (auth, public, security headers, helpers, models) |
| Frontend dependencies | 12 runtime + 15 dev |
| Backend dependencies | 10 (Flask, SQLAlchemy, pysnmp, FastAPI, uvicorn, redis, prometheus-client, pytest) |

---

## 4. Dependency Audit

### Backend (`requirements.txt`)
- **Flask** >=3.0 — no lock strategy (uses `>=` without pinned versions)
- **pysnmp** >=7.1 — SNMP polling
- **FastAPI** >=0.115.0 — WebSocket + async
- **uvicorn[standard]** >=0.34.0 — ASGI server
- **redis** >=5.0 — caching
- **prometheus-client** >=0.20.0 — metrics
- **pytest** >=8.0 — testing
- **Missing from requirements.txt**: `httpx` (used by `ws_bridge.py`), `cryptography` (used by `models.py` for Fernet encryption), `rq` (used by `task_queue.py`)

### Frontend (`package.json`)
- React 19, React Router 7, TanStack Query 5, Zustand 5, TailwindCSS 4, Recharts 3, Lucide React
- `package-lock.json` present (lock strategy OK)

### Docker
- Multi-stage build: Node 22 → Python 3.12-slim
- **No non-root user** in Dockerfile
- **gcc present in runtime image** (should be build-only)
- Healthcheck present (checks `/api/public/branding`)

---

## 5. Critical Components

### Sync Engine
- **3 sync entry points**: `services_sync.py` (UI), `auto_sync.py` (cron), `_auto_sync_olt()` in `app.py` (action-triggered)
- All use `threading.Thread(daemon=True)` — no job state tracking, no cancellation
- **No OLT sync lock** — same OLT can be synced simultaneously by cron + UI + action-triggered
- `auto_sync.py` uses `fcntl.flock` for cron overlap prevention (Linux only, not Windows)
- `services_sync.py` uses `ThreadPoolExecutor(max_workers=5)` for parallel sync-all

### Cache Layer
- Redis with memory fallback
- Singleflight pattern for deduplication
- Stale-while-revalidate with background refresh
- Per-OLT namespacing (`olt:{olt_id}:*`)
- **Memory fallback has no max entries limit or eviction policy**

### WebSocket
- FastAPI sidecar on port 8765
- 3 channels: `sync:{olt_id}`, `onus:{olt_id}`, `dashboard`
- **No authentication on WebSocket endpoints** — `token` query param exists but is TODO
- `/broadcast` endpoint has no auth — anyone can POST to push events
- No heartbeat timeout / stale connection cleanup on server side
- Ping/pong handled client-side only

### Credential Security
- `cli_password` and `acs_password` encrypted via Fernet (derived from `SECRET_KEY`)
- `snmp_community` and `snmp_community_write` stored in **plaintext** in DB
- `snmp_community` exposed in API response at `GET /api/olt/<id>` to any `@login_required` user
- **Single `SECRET_KEY`** used for both Flask sessions and Fernet encryption — no separate `CREDENTIAL_ENCRYPTION_KEY`
- `decrypt_field()` silently returns plaintext on failure — no explicit error
- Bot tokens (`bot_token`, `api_key`) stored in plaintext in `BotConfig` table

### Login Security
- Rate limiting via in-memory dict (`_login_attempts` in `helpers.py`)
- **Not Redis-backed** — rate limit resets on server restart, not shared across workers
- No CSRF protection on POST endpoints
- Session: HttpOnly=True, SameSite=Lax, Secure=production (configurable)

---

## 6. Technical Debt

| Area | Issue | Severity |
|------|-------|----------|
| `app.py` size | 8,360 lines — monolithic, all routes in one file | High |
| `telnet_client.py` size | 8,500+ lines — all CLI commands in one file | High |
| Missing deps in `requirements.txt` | `httpx`, `cryptography`, `rq` not listed | High |
| `fcntl` usage | `auto_sync.py`, `traffic_poller.py`, `auto_backup.py` use `fcntl` (Linux-only, breaks on Windows) | Medium |
| No migration for new columns | `db.create_all()` used in tests, only 1 migration version exists | Medium |
| `task_queue.py` | RQ integration exists but `rq` not in requirements.txt, unused in main flow | Low |
| No structured error responses | API errors are ad-hoc `{success: false, message: "..."}` — no error codes | Medium |

---

## 7. Security Risks

| # | Risk | Location | Severity |
|---|------|----------|----------|
| S1 | **SNMP community strings exposed to all users** — `GET /api/olt/<id>` returns `snmp_community` and `snmp_community_write` to any logged-in user (Viewer, Technician) | `app.py:5629-5646` | **HIGH** |
| S2 | **WebSocket has no authentication** — any client can connect and receive NMS data | `api_async.py:220-295` | **HIGH** |
| S3 | **`/broadcast` endpoint unauthenticated** — anyone can push events to WebSocket clients | `api_async.py:202-214` | **HIGH** |
| S4 | **Single `SECRET_KEY`** for Flask sessions + Fernet encryption — compromise of one key compromises all | `config.py:40-52`, `models.py:10-14` | **HIGH** |
| S5 | **`decrypt_field()` silently returns plaintext** on decryption failure — masks encryption misconfiguration | `models.py:31-43` | **Medium** |
| S6 | **SNMP community stored in plaintext** — not encrypted in DB | `models.py:127-128` | **Medium** |
| S7 | **Bot tokens in plaintext** — `BotConfig.bot_token`, `api_key` not encrypted | `models.py:525-528` | **Medium** |
| S8 | **Rate limiting in-memory only** — resets on restart, not shared across workers | `helpers.py:106-141` | **Medium** |
| S9 | **No CSRF protection** on POST endpoints | Global | **Medium** |
| S10 | **`onu_action` endpoint** — `@login_required` only, permission checks are inline per-action (correct but inconsistent pattern) | `app.py:1360-1361` | **Low** |
| S11 | **`onu_replace` endpoint** — `@login_required` only, no permission check | `app.py:1983-1984` | **Medium** |
| S12 | **`update_onu_field` endpoint** — `@login_required` only, no permission check for field-level edits | `app.py:2326-2327` | **Medium** |
| S13 | **Docker runs as root** — no non-root USER in Dockerfile | `Dockerfile` | **Medium** |
| S14 | **CSP allows `unsafe-inline` and `unsafe-eval`** for scripts | `app.py:70-78` | **Low** |

---

## 8. Performance Risks

| # | Risk | Location | Severity |
|---|------|----------|----------|
| P1 | **N+1 queries in dashboard** — `Fan.query.filter_by()` and `OLTCard.query.filter_by()` called per OLT in a loop | `app.py:177-180` | **Medium** |
| P2 | **No DB indexes** on frequently queried columns (`onu.olt_id`, `onu.status`, `onu.serial_number`, `onu.technician_id`, `olt_sync_status.olt_id`, `alert_history.onu_id`, `notification.is_read`, etc.) | `models.py` | **High** |
| P3 | **Memory cache has no eviction** — unbounded growth in long-running process without Redis | `cache.py:92-114` | **Medium** |
| P4 | **`cache_clear("dashboard:*")`** uses Redis `KEYS` command — O(N) scan, blocks Redis | `cache.py:162-179` | **Medium** |
| P5 | **No connection pool sizing for SQLite** — `check_same_thread=False` with 30s timeout may not be enough under load | `config.py:74-78` | **Low** |
| P6 | **Traffic polling is serial** — iterates OLTs one by one, each opening a Telnet session | `traffic_poller.py:130-178` | **Medium** |

---

## 9. Concurrency Risks

| # | Risk | Location | Severity |
|---|------|----------|----------|
| C1 | **No OLT sync lock** — same OLT can be synced simultaneously by cron + UI + action-triggered sync | `services_sync.py`, `auto_sync.py`, `app.py:1255` | **HIGH** |
| C2 | **`OLTSyncStatus` race condition** — multiple sync paths read/write the same row without locking | `services_sync.py:16-91`, `app.py:1255-1304` | **HIGH** |
| C3 | **`start_single_sync()` always starts a new thread** — no check if sync is already running | `services_sync.py:215-234` | **HIGH** |
| C4 | **ThreadPoolExecutor in sync-all** — no per-OLT lock, but different OLTs run in parallel (OK by design) | `services_sync.py:177-212` | **Low** |
| C5 | **SQLite write concurrency** — multiple background threads writing to SQLite may cause `database is locked` | Global | **Medium** |

---

## 10. Database Risks

| # | Risk | Location | Severity |
|---|------|----------|----------|
| D1 | **Missing indexes** — only 2 indexes exist (`traffic_logs.recorded_at`, `traffic_log_hourly.hour_start`). Missing on: `onus.olt_id`, `onus.status`, `onus.serial_number`, `onus.technician_id`, `olt_sync_status.olt_id`, `alert_history.onu_id`, `notifications.is_read`, `action_logs.user_id`, `metric_history.olt_id`, `metric_history.onu_id`, `uptime_log.onu_id` | `models.py` | **HIGH** |
| D2 | **No migration for schema changes** — only 1 migration version exists, `db.create_all()` used elsewhere | `migrations/versions/` | **Medium** |
| D3 | **`func.date_trunc` in `task_queue.py`** — PostgreSQL-only function, will fail on SQLite | `task_queue.py:155` | **Low** |
| D4 | **`func.strftime` in `traffic_poller.py`** — SQLite-only function, will fail on PostgreSQL | `traffic_poller.py:39` | **Medium** |
| D5 | **No transaction boundaries** — long sync operations commit frequently (progress updates) but no explicit transaction for the full sync | `services_sync.py` | **Low** |

---

## 11. Frontend Risks

| # | Risk | Location | Severity |
|---|------|----------|----------|
| F1 | **Route protection is frontend-only** — `ProtectedRoute` checks permissions but backend is the real security boundary (some endpoints lack permission checks) | `App.tsx:55-88` | **Medium** |
| F2 | **`window.location.pathname` used** instead of `useLocation()` from React Router | `App.tsx:73` | **Low** |
| F3 | **No centralized route config** — permissions scattered in `routePermissions` dict + `routePatterns` array | `App.tsx:32-53` | **Low** |
| F4 | **Centralized API client exists** (`api.ts`) — good, but some pages may use raw `fetch()` | `frontend/src/lib/api.ts` | **Low** |
| F5 | **No error boundary** — unhandled React errors crash the entire SPA | Global | **Medium** |
| F6 | **No loading skeleton standardization** — each page handles loading state independently | Global | **Low** |

---

## 12. Deployment Risks

| # | Risk | Location | Severity |
|---|------|----------|----------|
| E1 | **Docker runs as root** — no `USER` directive in Dockerfile | `Dockerfile` | **Medium** |
| E2 | **gcc in runtime image** — build dependency leaked into production | `Dockerfile:18-21` | **Low** |
| E3 | **No graceful shutdown** — Flask thread is daemon, killed abruptly on SIGTERM | `run_server.py:51-57` | **Medium** |
| E4 | **`fcntl` not available on Windows** — cron scripts fail on Windows development | `auto_sync.py`, `traffic_poller.py`, `auto_backup.py` | **Low** |
| E5 | **Secrets in docker-compose.yml** — `POSTGRES_PASSWORD` has default value, `SECRET_KEY` has default "change-me-in-production" | `docker-compose.yml:26,68` | **Medium** |
| E6 | **No `.dockerignore` for sensitive files** — `.env` may be copied into image | `.dockerignore` exists (550 bytes, needs audit) | **Low** |
| E7 | **Missing dependencies in `requirements.txt`** — `httpx`, `cryptography`, `rq` not listed, causing import errors on clean install | `requirements.txt` | **HIGH** |

---

## 13. Test Coverage

| Area | Tests | Coverage |
|------|-------|----------|
| Auth (login/logout) | 4 tests | Basic |
| Public endpoints | 1 test | Minimal |
| Security headers | 1 test | Minimal |
| Helpers (utc_iso, rate limiting) | 4 tests | Basic |
| Models (password hashing) | 1 test | Minimal |
| RBAC / Permission matrix | 0 | **None** |
| SNMP decoders | 0 | **None** |
| Telnet commands | 0 | **None** |
| Sync engine | 0 | **None** |
| Cache layer | 0 | **None** |
| Backup/restore | 0 | **None** |
| Provisioning | 0 | **None** |
| Frontend | 1 test (app.test.ts) | **Minimal** |

---

## 14. Summary of Priorities (Batch 1 — Phases 0-3)

### Phase 1 — Security Hardening (Highest Priority)
1. Fix SNMP community exposure in `GET /api/olt/<id>` (S1)
2. Add WebSocket authentication (S2, S3)
3. Separate `CREDENTIAL_ENCRYPTION_KEY` from `SECRET_KEY` (S4)
4. Make `decrypt_field()` raise on failure instead of silently returning plaintext (S5)
5. Add missing permission checks on `onu_replace`, `update_onu_field` (S11, S12)
6. Move rate limiting to Redis when available (S8)
7. Add missing dependencies to `requirements.txt` (E7)

### Phase 2 — OLT Sync Concurrency
1. Implement per-OLT sync lock (Redis distributed lock with TTL, in-memory fallback)
2. Check lock in `start_single_sync()`, `_auto_sync_olt()`, `auto_sync.py`, `services_sync.py`
3. Return `already_running` status when lock is held
4. Ensure lock release on exception/timeout/crash

### Phase 3 — Job/Worker Architecture
1. Add job state to `OLTSyncStatus` (PENDING, RUNNING, VERIFYING, SUCCESS, FAILED, PARTIAL_FAILURE, CANCELLED)
2. Track job lifecycle for long-running operations
3. Design for future migration to RQ/Celery without changing business logic
