# ============================================================
# Salfanet NMS — Backend Dockerfile
# Multi-stage build for production
# ============================================================

# Stage 1: Build frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend
FROM python:3.12-slim AS backend

# System dependencies for pysnmp, psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

# Copy frontend build output to Flask static serving path
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Create instance directory for SQLite (fallback)
RUN mkdir -p /app/instance

# Create non-root user and set ownership
RUN groupadd -r salfanet && useradd -r -g salfanet -d /app -s /sbin/nologin salfanet \
    && chown -R salfanet:salfanet /app

# Expose ports
# 5000 = Flask (HTTP API)
# 8765 = FastAPI (WebSocket + async)
EXPOSE 5000 8765

# Environment defaults
ENV FLASK_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5000
ENV WS_PORT=8765

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/api/public/branding')" || exit 1

# Run as non-root user
USER salfanet

# Start hybrid server (Flask + FastAPI)
CMD ["python", "run_server.py"]
