# Deploy via Docker

Alternatif untuk `install-vps.sh`. Satu `docker-compose.yml` menjalankan seluruh stack.

## Layanan

| Service | Image | Peran |
|---------|-------|-------|
| `app` | build `Dockerfile` (python:3.12-slim) | Flask :5000 + FastAPI :8765 via `run_server.py` |
| `postgres` | postgres:16-alpine | Database utama |
| `redis` | redis:7-alpine | Cache + rate limiter (opsional tapi direkomendasikan) |
| `wa_gateway` | build `wa_gateway/Dockerfile` (node:20-slim) | WhatsApp Baileys :3001 |
| `nginx` | nginx:1.27-alpine | Serve `frontend/dist` + proxy `/api` → app:5000, `/ws` → app:8765 |

## Volume persisten

| Volume | Isi |
|--------|-----|
| `nms_pgdata` | Data PostgreSQL |
| `nms_instance` | `backend/instance/` — SQLite fallback, backup DB, arsip audit log |
| `wa_session` | Sesi login WhatsApp (Baileys multi-file auth state) |

## Quick start

```bash
cp .env.docker.example .env.docker
# Isi SECRET_KEY, INTERNAL_API_KEY, POSTGRES_PASSWORD

docker compose --env-file .env.docker up -d --build
# atau: ./start.sh (Linux/macOS) / start.bat (Windows) — auto-generate secrets
```

Buka `http://localhost:8080` (ubah lewat `HTTP_PORT` di `.env.docker`).

## Operasional

```bash
docker compose logs -f app          # log aplikasi
docker compose ps                   # status + healthcheck
docker compose down                 # stop (data tetap di volume)
docker compose down -v              # stop + HAPUS semua volume (hati-hati)
docker compose up -d --build app    # rebuild app setelah git pull
```

## Catatan

- `frontend/dist` di-mount read-only ke nginx — jalankan `npm run build` di host (atau pakai dist yang sudah ter-commit di repo) lalu `docker compose restart nginx` tidak diperlukan karena file langsung terbaca.
- Database default PostgreSQL. Untuk SQLite: comment `DATABASE_URL` di environment service `app` — data jatuh ke volume `nms_instance`.
- Healthcheck: app → `GET /api/public/branding`, postgres → `pg_isready`, wa_gateway → `/health` di `docker ps` kolom STATUS.
- Backup DB produksi: `docker compose exec postgres pg_dump -U nms salfanet_nms > backup.sql` atau pakai fitur backup in-app (tersimpan di `nms_instance/backups`).
