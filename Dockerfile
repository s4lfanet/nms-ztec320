# Salfanet NMS app image — Flask (WSGI :5000) + FastAPI (ASGI :8765)
# in one process via backend/run_server.py.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Asia/Jakarta

# pysnmp/paramiko are pure-python; cryptography has wheels. gcc only needed
# if a transitive dep falls back to source builds.
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc curl tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

COPY backend/ backend/

WORKDIR /app/backend

# Instance dir (sqlite db, backups, audit archives) lives on a volume.
RUN mkdir -p /app/backend/instance/backups

EXPOSE 5000 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:5000/api/public/branding || exit 1

CMD ["python", "run_server.py"]
