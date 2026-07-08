#!/bin/bash
# ═══════════════════════════════════════════════════════
# FiberNMS — Ubuntu VPS Deployment Script
# Tested on: Ubuntu 22.04 / 24.04 LTS
# Usage: sudo bash vps-setup.sh
# ═══════════════════════════════════════════════════════

set -e

APP_NAME="fibernms"
APP_USER="fibernms"
APP_DIR="/opt/${APP_NAME}"
DOMAIN="${1:-localhost}"  # Pass domain as arg, or use localhost

echo "═══════════════════════════════════════════════════"
echo "  FiberNMS VPS Deployment"
echo "  Domain: ${DOMAIN}"
echo "═══════════════════════════════════════════════════"

# ── 1. System packages ──
echo "[1/8] Installing system packages..."
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip nginx certbot python3-certbot-nginx curl

# ── 2. Create app user ──
echo "[2/8] Creating application user..."
if ! id "${APP_USER}" &>/dev/null; then
    useradd --system --shell /bin/false --home-dir "${APP_DIR}" "${APP_USER}"
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
mkdir -p "${APP_DIR}/frontend/dist"
rsync -a "${SCRIPT_DIR}/frontend/dist/" "${APP_DIR}/frontend/dist/"

# ── 4. Python virtual environment ──
echo "[4/8] Setting up Python environment..."
python3 -m venv "${APP_DIR}/.venv"
"${APP_DIR}/.venv/bin/pip" install --quiet --upgrade pip
"${APP_DIR}/.venv/bin/pip" install --quiet -r "${APP_DIR}/requirements.txt"

# ── 5. Create instance directory & .env ──
echo "[5/8] Creating configuration..."
mkdir -p "${APP_DIR}/instance"
if [ ! -f "${APP_DIR}/instance/.env" ]; then
    cp "${APP_DIR}/deploy/.env.template" "${APP_DIR}/instance/.env"
    # Generate random secret key
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    sed -i "s/CHANGE_ME_TO_RANDOM_STRING/${SECRET_KEY}/" "${APP_DIR}/instance/.env"
    echo "  ⚠ Edit ${APP_DIR}/instance/.env with your OLT credentials"
fi

# Set permissions
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
chmod 600 "${APP_DIR}/instance/.env"

# ── 6. Systemd service ──
echo "[6/8] Installing systemd service..."
cat > /etc/systemd/system/${APP_NAME}.service << EOF
[Unit]
Description=FiberNMS - OLT Management System
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment="PATH=${APP_DIR}/.venv/bin"
EnvironmentFile=${APP_DIR}/instance/.env
ExecStart=${APP_DIR}/.venv/bin/python app.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${APP_NAME}

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=${APP_DIR}/instance
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${APP_NAME}"

# ── 7. Nginx reverse proxy ──
echo "[7/8] Configuring Nginx..."
cat > /etc/nginx/sites-available/${APP_NAME} << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    # Security headers
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;

    # Static files (built frontend)
    location /spa/ {
        alias ${APP_DIR}/frontend/dist/;
        try_files \$uri /spa/index.html;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }

    # Static assets with long cache
    location /spa/assets/ {
        alias ${APP_DIR}/frontend/dist/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Legacy static files
    location /static/ {
        alias ${APP_DIR}/static/;
        expires 1h;
    }

    # API and app
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }

    # WebSocket support (future)
    location /ws/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
EOF

ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/${APP_NAME}
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── 8. Start services ──
echo "[8/8] Starting services..."
systemctl start "${APP_NAME}"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Deployment Complete!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  App:     http://${DOMAIN}"
echo "  SPA:     http://${DOMAIN}/spa/"
echo "  Login:   admin / admin123"
echo ""
echo "  Config:  ${APP_DIR}/instance/.env"
echo "  Logs:    journalctl -u ${APP_NAME} -f"
echo "  Status:  systemctl status ${APP_NAME}"
echo ""
echo "  Next steps:"
echo "  1. Edit ${APP_DIR}/instance/.env"
echo "  2. systemctl restart ${APP_NAME}"
echo "  3. (Optional) sudo certbot --nginx -d ${DOMAIN}"
echo ""
