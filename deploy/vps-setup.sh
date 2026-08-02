#!/bin/bash
# ═══════════════════════════════════════════════════════
# Salfanet NMS — Ubuntu VPS Deployment Script
# Tested on: Ubuntu 22.04 / 24.04 LTS
# Usage: sudo bash deploy/vps-setup.sh [domain]
#
# This script deploys from the current source directory.
# For fresh VPS install from GitHub, use install-vps.sh instead.
# ═══════════════════════════════════════════════════════
set -e

APP_NAME="salfanet-nms"
APP_USER="salfanet"
APP_DIR="/opt/${APP_NAME}"
DOMAIN="${1:-}"

echo "═══════════════════════════════════════════════════"
echo "  Salfanet NMS VPS Deployment"
if [ -n "$DOMAIN" ]; then
    echo "  Domain: ${DOMAIN}"
else
    echo "  Mode: IP-based (no domain)"
fi
echo "═══════════════════════════════════════════════════"

# Must be root
if [ "$EUID" -ne 0 ]; then
    echo "[ERROR] Please run as root: sudo bash deploy/vps-setup.sh"
    exit 1
fi

# ── 1. System packages ──
echo "[1/8] Installing system packages..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    python3 python3-venv python3-pip nginx certbot python3-certbot-nginx curl rsync

# ── 2. Create app user ──
echo "[2/8] Creating application user..."
if ! id "${APP_USER}" &>/dev/null; then
    useradd --system --shell /bin/bash --home-dir "${APP_DIR}" "${APP_USER}"
fi
mkdir -p "${APP_DIR}"

# ── 3. Copy application files ──
echo "[3/8] Deploying application files..."
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
rsync -a --exclude='.venv' --exclude='__pycache__' --exclude='node_modules' \
    --exclude='frontend/node_modules' --exclude='frontend/dist' \
    --exclude='instance/' --exclude='.git' \
    "${SCRIPT_DIR}/" "${APP_DIR}/"

# Copy built frontend
if [ -d "${SCRIPT_DIR}/frontend/dist" ]; then
    mkdir -p "${APP_DIR}/frontend/dist"
    rsync -a "${SCRIPT_DIR}/frontend/dist/" "${APP_DIR}/frontend/dist/"
else
    echo "  Frontend not built. Building now..."
    cd "${APP_DIR}/frontend"
    npm install --no-audit --no-fund
    npm run build
    cd "${APP_DIR}"
fi

# ── 4. Python virtual environment ──
echo "[4/8] Setting up Python environment..."
python3 -m venv "${APP_DIR}/.venv"
"${APP_DIR}/.venv/bin/pip" install --quiet --upgrade pip
"${APP_DIR}/.venv/bin/pip" install --quiet -r "${APP_DIR}/requirements.txt"

# ── 5. Create instance directory & .env ──
echo "[5/8] Creating configuration..."
mkdir -p "${APP_DIR}/instance"
if [ ! -f "${APP_DIR}/.env" ]; then
    cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    if grep -q "SECRET_KEY=" "${APP_DIR}/.env"; then
        sed -i "s/^SECRET_KEY=.*/SECRET_KEY=${SECRET_KEY}/" "${APP_DIR}/.env"
    else
        echo "SECRET_KEY=${SECRET_KEY}" >> "${APP_DIR}/.env"
    fi
    echo "  Created .env with generated SECRET_KEY"
fi

# Set permissions
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
chmod 600 "${APP_DIR}/.env"

# ── 6. Systemd service ──
echo "[6/8] Installing systemd service..."
cat > /etc/systemd/system/${APP_NAME}.service << EOF
[Unit]
Description=Salfanet NMS - OLT Management System
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment="PATH=${APP_DIR}/.venv/bin"
ExecStart=${APP_DIR}/.venv/bin/python run_server.py --host 0.0.0.0 --port 5000 --ws-port 8765
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${APP_NAME}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${APP_NAME}"

# ── 7. Nginx reverse proxy ──
echo "[7/8] Configuring Nginx..."
SERVER_NAME="${DOMAIN:-_}"

cat > /etc/nginx/sites-available/${APP_NAME} << NGINXEOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;

    location /spa/ {
        alias ${APP_DIR}/frontend/dist/;
        try_files \$uri /spa/index.html;
        expires 1h;
    }

    location /spa/assets/ {
        alias ${APP_DIR}/frontend/dist/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /static/ {
        alias ${APP_DIR}/static/;
        expires 1h;
    }

    # WebSocket — proxy to FastAPI (port 8765)
    location /ws/ {
        proxy_pass http://127.0.0.1:8765;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
    }

    # API and app — proxy to Flask (port 5000)
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/${APP_NAME}
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
systemctl enable nginx

# ── 8. Start services ──
echo "[8/8] Starting services..."
systemctl restart "${APP_NAME}"
sleep 5

# ── 9. Setup cron jobs (auto-backup + auto-sync) ──
echo "[9/9] Setting up cron jobs..."
BACKUP_CRON="0 * * * * cd ${APP_DIR} && ${APP_DIR}/.venv/bin/python3 auto_backup.py >> /var/log/salfanet-backup.log 2>&1"
SYNC_CRON="*/5 * * * * cd ${APP_DIR} && ${APP_DIR}/.venv/bin/python3 auto_sync.py >> /var/log/salfanet-sync.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'auto_backup\|auto_sync\|salfanet-nms' || true ; echo "$BACKUP_CRON" ; echo "$SYNC_CRON" ) | crontab -
touch /var/log/salfanet-backup.log /var/log/salfanet-sync.log
chown ${APP_USER}:${APP_USER} /var/log/salfanet-backup.log /var/log/salfanet-sync.log 2>/dev/null || true
echo "  ✅ Auto-backup cron: hourly"
echo "  ✅ Auto-sync cron: every 5 minutes"

# Verify
SERVER_IP=$(hostname -I | awk '{print $1}')
FAIL=0

if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/ 2>/dev/null | grep -q "200\|302"; then
    echo "  ✅ Flask (port 5000): OK"
else
    echo "  ❌ Flask (port 5000): FAILED"
    FAIL=1
fi

if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8765/health 2>/dev/null | grep -q "200"; then
    echo "  ✅ FastAPI WebSocket (port 8765): OK"
else
    echo "  ❌ FastAPI WebSocket (port 8765): FAILED"
    FAIL=1
fi

if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:80/ 2>/dev/null | grep -q "200\|302"; then
    echo "  ✅ Nginx (port 80): OK"
else
    echo "  ❌ Nginx (port 80): FAILED"
    FAIL=1
fi

echo ""
echo "═══════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
    echo "  ✅ Deployment Complete!"
else
    echo "  ⚠️  Deployment completed with warnings"
    echo "  Check: journalctl -u ${APP_NAME} -f"
fi
echo "═══════════════════════════════════════════════════"
echo ""
if [ -n "$DOMAIN" ]; then
    echo "  App:     http://${DOMAIN}"
else
    echo "  App:     http://${SERVER_IP}"
fi
echo "  Login:   admin / admin123"
echo ""
echo "  Manage:"
echo "    systemctl status ${APP_NAME}"
echo "    systemctl restart ${APP_NAME}"
echo "    journalctl -u ${APP_NAME} -f"
echo ""
echo "  Config:  ${APP_DIR}/.env"
echo ""
if [ -n "$DOMAIN" ]; then
    echo "  HTTPS:   sudo certbot --nginx -d ${DOMAIN}"
fi
echo ""
