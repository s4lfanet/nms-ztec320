#!/bin/bash
# ═══════════════════════════════════════════════════════
# Salfanet NMS — Full VPS Installer
# For: Ubuntu 22.04 / 24.04 LTS (fresh VPS)
# Usage: bash install-vps.sh [domain]
#
# What this does:
#   1. Install system packages (Python, Node.js 22, nginx)
#   2. Clone repo to /opt/salfanet-nms
#   3. Setup Python venv + install deps
#   4. Build frontend
#   5. Create .env + instance/ dir
#   6. Setup systemd service (Flask + FastAPI WebSocket)
#   7. Setup Nginx reverse proxy (port 80 → Flask + WS)
#   8. Setup cron jobs (auto-backup + auto-sync + traffic poller)
#   9. Start everything and verify
# ═══════════════════════════════════════════════════════
set -e

APP_NAME="salfanet-nms"
APP_USER="salfanet"
APP_DIR="/opt/${APP_NAME}"
DOMAIN="${1:-}"  # Optional domain arg

echo "═════════════════════════════════════════════════════"
echo "  Salfanet NMS — Full VPS Installer"
if [ -n "$DOMAIN" ]; then
    echo "  Domain: ${DOMAIN}"
else
    echo "  Mode: IP-based (no domain)"
fi
echo "═════════════════════════════════════════════════════"
echo ""

# Must be root
if [ "$EUID" -ne 0 ]; then
    echo "[ERROR] Please run as root: sudo bash install-vps.sh"
    exit 1
fi

# ── 1. System packages ──
echo "[1/9] Installing system packages..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    python3 python3-venv python3-pip \
    nginx curl git rsync \
    > /dev/null 2>&1

# Install Node.js 22 from NodeSource
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
    echo "  Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
fi
echo "  Python:  $(python3 --version)"
echo "  Node.js: $(node --version)"
echo "  npm:     $(npm --version)"

# ── 2. Create app user & clone repo ──
echo "[2/9] Setting up application..."
if ! id "${APP_USER}" &>/dev/null; then
    useradd --system --shell /bin/bash --home-dir "${APP_DIR}" "${APP_USER}"
fi

if [ -d "${APP_DIR}/.git" ]; then
    echo "  Updating existing repo..."
    cd "${APP_DIR}"
    git pull origin main 2>/dev/null || true
else
    echo "  Cloning repo..."
    rm -rf "${APP_DIR}"
    git clone https://github.com/s4lfanet/nms-ztec320.git "${APP_DIR}" > /dev/null 2>&1
fi

# ── 3. Python virtual environment ──
echo "[3/9] Setting up Python environment..."
cd "${APP_DIR}"
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
.venv/bin/pip install --upgrade pip --quiet
.venv/bin/pip install -r requirements.txt --quiet

# ── 4. Build frontend ──
echo "[4/9] Building frontend..."
cd frontend
npm install --no-audit --no-fund 2>/dev/null
npm run build 2>/dev/null
cd ..

# ── 5. Configuration ──
echo "[5/9] Creating configuration..."
mkdir -p instance
if [ ! -f ".env" ]; then
    cp .env.example .env
    # Generate random SECRET_KEY
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    if grep -q "SECRET_KEY=" .env; then
        sed -i "s/^SECRET_KEY=.*/SECRET_KEY=${SECRET_KEY}/" .env
    else
        echo "SECRET_KEY=${SECRET_KEY}" >> .env
    fi
    echo "  Created .env with generated SECRET_KEY"
else
    echo "  .env already exists, skipping."
fi

# Set permissions
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

# ── 6. Systemd service ──
echo "[6/9] Installing systemd service..."
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
echo "[7/9] Configuring Nginx..."
SERVER_NAME="${DOMAIN:-_}"

cat > /etc/nginx/sites-available/${APP_NAME} << 'NGINX_EOF'
server {
    listen 80;
    server_name _;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;

    # Built frontend (SPA)
    location /spa/ {
        alias APP_DIR/frontend/dist/;
        try_files $uri /spa/index.html;
        expires 1h;
    }

    location /spa/assets/ {
        alias APP_DIR/frontend/dist/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Legacy static files
    location /static/ {
        alias APP_DIR/static/;
        expires 1h;
    }

    # WebSocket — proxy to FastAPI (port 8765)
    location /ws/ {
        proxy_pass http://127.0.0.1:8765;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # All other API and app routes — proxy to Flask (port 5000)
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }
}
NGINX_EOF

# Replace APP_DIR placeholder
sed -i "s|APP_DIR|${APP_DIR}|g" /etc/nginx/sites-available/${APP_NAME}

ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/${APP_NAME}
rm -f /etc/nginx/sites-enabled/default
nginx -t 2>/dev/null
systemctl reload nginx
systemctl enable nginx

# ── 8. Setup cron jobs (auto-backup + auto-sync) ──
echo "[8/9] Setting up cron jobs..."
BACKUP_CRON="0 * * * * cd ${APP_DIR} && ${APP_DIR}/.venv/bin/python3 auto_backup.py >> /var/log/salfanet-backup.log 2>&1"
SYNC_CRON="*/5 * * * * cd ${APP_DIR} && ${APP_DIR}/.venv/bin/python3 auto_sync.py >> /var/log/salfanet-sync.log 2>&1"
TRAFFIC_CRON="*/5 * * * * cd ${APP_DIR} && ${APP_DIR}/.venv/bin/python3 traffic_poller.py >> /var/log/salfanet-traffic.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'auto_backup\|auto_sync\|traffic_poller\|salfanet-nms' ; echo "$BACKUP_CRON" ; echo "$SYNC_CRON" ; echo "$TRAFFIC_CRON" ) | crontab -
touch /var/log/salfanet-backup.log /var/log/salfanet-sync.log /var/log/salfanet-traffic.log
chown ${APP_USER}:${APP_USER} /var/log/salfanet-backup.log /var/log/salfanet-sync.log /var/log/salfanet-traffic.log 2>/dev/null || true
echo "  ✅ Auto-backup cron: hourly"
echo "  ✅ Auto-sync cron: every 5 minutes"
echo "  ✅ Traffic poller cron: every 5 minutes"

# ── 9. Start & verify ──
echo "[9/9] Starting services..."
systemctl restart "${APP_NAME}"
sleep 5

# Verify
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

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "═════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
    echo "  ✅ Installation Complete!"
else
    echo "  ⚠️  Installation completed with warnings"
    echo "  Check logs: journalctl -u ${APP_NAME} -f"
fi
echo "═════════════════════════════════════════════════════"
echo ""
if [ -n "$DOMAIN" ]; then
    echo "  App:      http://${DOMAIN}"
else
    echo "  App:      http://${SERVER_IP}"
fi
echo "  Login:    admin / admin123"
echo ""
echo "  Manage:"
echo "    systemctl status ${APP_NAME}"
echo "    systemctl restart ${APP_NAME}"
echo "    journalctl -u ${APP_NAME} -f"
echo ""
echo "  Config:   ${APP_DIR}/.env"
echo "  App dir:  ${APP_DIR}"
echo ""
if [ -z "$DOMAIN" ]; then
    echo "  Next steps:"
    echo "    1. Add your OLT via Settings > OLT Settings"
    echo "    2. (Optional) Point a domain to this IP and re-run:"
    echo "       bash install-vps.sh yourdomain.com"
    echo "    3. (Optional) Enable HTTPS:"
    echo "       certbot --nginx -d yourdomain.com"
    echo ""
fi
