#!/bin/bash
# ═══════════════════════════════════════════════════════
# Salfanet NMS — Full VPS Installer
# For: Ubuntu 22.04 / 24.04 LTS (fresh VPS)
# Usage: bash install-vps.sh [domain]
# On a slow connection to the default npm registry, point pnpm at a faster
# mirror: PNPM_REGISTRY=https://registry.npmmirror.com bash install-vps.sh
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

# Fresh cloud VPS instances often run `unattended-upgrades` automatically
# right after boot, which holds the dpkg lock for a while — a plain
# `apt-get install` fails immediately in that window (looks like the
# installer "just stops" since output below is redirected to /dev/null).
# -o DPkg::Lock::Timeout makes apt wait for the lock instead of failing.
apt_get() { apt-get -o DPkg::Lock::Timeout=300 "$@"; }

# ── 1. System packages ──
echo "[1/9] Installing system packages..."
apt_get update -qq
DEBIAN_FRONTEND=noninteractive apt_get install -y -qq \
    software-properties-common \
    nginx curl git rsync \
    > /dev/null 2>&1

# Ensure a Python 3.10+ interpreter is available. Ubuntu's default `python3`
# varies a lot by release (3.8 on 20.04, 3.10 on 22.04, 3.12 on 24.04) — this
# app's deps (uvicorn>=0.34, fastapi>=0.115) don't support Python < 3.9, so
# relying on whatever `python3` happens to resolve to fails on older images.
PYTHON_BIN=""
for cand in python3.12 python3.13 python3.11 python3.10; do
    if command -v "$cand" &>/dev/null; then
        PYTHON_BIN="$cand"
        break
    fi
done
if [ -z "$PYTHON_BIN" ] && command -v python3 &>/dev/null; then
    _sys_minor=$(python3 -c 'import sys; print(sys.version_info[1])' 2>/dev/null || echo 0)
    if [ "$_sys_minor" -ge 10 ]; then
        PYTHON_BIN="python3"
    fi
fi
if [ -z "$PYTHON_BIN" ]; then
    echo "  System Python is too old (need 3.10+) — installing Python 3.12 via deadsnakes PPA..."
    # Add the PPA by fetching its signing key over plain HTTPS (443) instead of
    # `add-apt-repository`, which uses the classic hkp keyserver protocol
    # (port 11371) — that port is blocked on some networks/firewalls and
    # add-apt-repository then hangs indefinitely with no error output.
    DEBIAN_FRONTEND=noninteractive apt_get install -y -qq gnupg > /dev/null 2>&1
    mkdir -p /etc/apt/keyrings
    if timeout 20 curl -fsSL 'https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xBA6932366A755776' -o /tmp/deadsnakes.asc \
        && gpg --dearmor -o /etc/apt/keyrings/deadsnakes.gpg /tmp/deadsnakes.asc; then
        CODENAME=$(lsb_release -cs 2>/dev/null || . /etc/os-release && echo "$VERSION_CODENAME")
        echo "deb [signed-by=/etc/apt/keyrings/deadsnakes.gpg] https://ppa.launchpadcontent.net/deadsnakes/ppa/ubuntu ${CODENAME} main" \
            > /etc/apt/sources.list.d/deadsnakes.list
        apt_get update -qq
        DEBIAN_FRONTEND=noninteractive apt_get install -y -qq python3.12 python3.12-venv python3.12-dev > /dev/null 2>&1 || true
    fi
    if command -v python3.12 &>/dev/null; then
        PYTHON_BIN="python3.12"
    else
        echo "[ERROR] Could not install Python 3.10+. Install it manually (e.g. via deadsnakes PPA) and re-run."
        exit 1
    fi
else
    DEBIAN_FRONTEND=noninteractive apt_get install -y -qq "${PYTHON_BIN}-venv" > /dev/null 2>&1 || true
fi

# Install Node.js 22 from NodeSource
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
    echo "  Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
    apt_get install -y -qq nodejs > /dev/null 2>&1
fi
echo "  Python:  $(${PYTHON_BIN} --version) (${PYTHON_BIN})"
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
    "${PYTHON_BIN}" -m venv .venv
fi
.venv/bin/pip install --upgrade pip --quiet
.venv/bin/pip install -r requirements.txt --quiet

# ── 4. Build frontend ──
echo "[4/9] Building frontend..."
if [ -f "frontend/dist/index.html" ]; then
    echo "  Using pre-built frontend/dist/ from the repo — no Node/pnpm/registry needed."
else
    echo "  frontend/dist/ not found in repo, building from source..."
    cd frontend
    # corepack asks an interactive Y/n before downloading pnpm the first time —
    # in a non-interactive script with no stdin to answer, this hangs forever
    # with no error output (this is the "stuck right after Building frontend"
    # behavior). Disable the prompt and bound the download with a timeout.
    export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
    timeout 60 corepack enable pnpm 2>/dev/null || npm install -g pnpm 2>/dev/null || true

    # Optional faster mirror for slow/regional connections to the default npm
    # registry — opt-in only, e.g.: PNPM_REGISTRY=https://registry.npmmirror.com bash install-vps.sh
    _pnpm_install_args=(install --no-frozen-lockfile)
    if [ -n "${PNPM_REGISTRY:-}" ]; then
        echo "  Using pnpm registry: ${PNPM_REGISTRY}"
        _pnpm_install_args+=(--registry "${PNPM_REGISTRY}")
    fi

    # pnpm install can hang indefinitely on a slow/flaky connection with no
    # feedback — bound each attempt and retry instead of getting stuck silently.
    _pnpm_ok=0
    for _attempt in 1 2 3; do
        if timeout 180 pnpm "${_pnpm_install_args[@]}"; then
            _pnpm_ok=1
            break
        fi
        echo "  pnpm install attempt ${_attempt}/3 failed or timed out (slow network?), retrying..."
        sleep 5
    done
    if [ "$_pnpm_ok" -ne 1 ]; then
        echo "[ERROR] pnpm install failed after 3 attempts — check your network connection, or retry manually:"
        echo "         cd ${APP_DIR}/frontend && pnpm install"
        exit 1
    fi
    timeout 300 pnpm build
    cd ..
fi

# ── 5. Configuration ──
echo "[5/9] Creating configuration..."
mkdir -p instance
if [ ! -f ".env" ]; then
    cp .env.example .env
    # Generate random secrets. FLASK_ENV must be "production" here — .env.example
    # defaults to "development" (Werkzeug debugger + insecure cookies enabled),
    # which is right for local dev but wrong for a VPS install.
    SECRET_KEY=$("${PYTHON_BIN}" -c "import secrets; print(secrets.token_hex(32))")
    INTERNAL_API_KEY=$("${PYTHON_BIN}" -c "import secrets; print(secrets.token_hex(32))")
    CREDENTIAL_ENCRYPTION_KEY=$("${PYTHON_BIN}" -c "import secrets; print(secrets.token_hex(32))")
    # A "Secure" session cookie is only ever sent by the browser back over
    # HTTPS — this installer only sets up plain HTTP (port 80) by default,
    # so SESSION_COOKIE_SECURE=1 here would silently break every login
    # (cookie gets set, browser refuses to send it back, every subsequent
    # request 401s). Only turn it on once HTTPS is actually in place
    # (see the reminder printed after certbot in step 9).
    sed -i \
        -e "s/^SECRET_KEY=.*/SECRET_KEY=${SECRET_KEY}/" \
        -e "s/^INTERNAL_API_KEY=.*/INTERNAL_API_KEY=${INTERNAL_API_KEY}/" \
        -e "s/^CREDENTIAL_ENCRYPTION_KEY=.*/CREDENTIAL_ENCRYPTION_KEY=${CREDENTIAL_ENCRYPTION_KEY}/" \
        -e "s/^FLASK_ENV=.*/FLASK_ENV=production/" \
        -e "s/^SESSION_COOKIE_SECURE=.*/SESSION_COOKIE_SECURE=0/" \
        .env
    echo "  Created .env (FLASK_ENV=production) with generated SECRET_KEY, INTERNAL_API_KEY, CREDENTIAL_ENCRYPTION_KEY"
    echo "  Note: SESSION_COOKIE_SECURE=0 (HTTP-only by default) — after enabling HTTPS"
    echo "        (see 'Enable HTTPS' below), set it to 1 in .env and restart the service."
else
    echo "  .env already exists, skipping."
    if grep -q "^FLASK_ENV=development" .env; then
        echo "  [WARNING] Existing .env has FLASK_ENV=development — the debugger and insecure"
        echo "            cookies are enabled. Set FLASK_ENV=production in ${APP_DIR}/.env"
        echo "            and restart: systemctl restart ${APP_NAME}"
    fi
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

# The app runs as the non-root ${APP_USER} user and needs to restart its own
# service after a self-update (System Update page / POST /api/system/update/apply)
# — grant exactly that one command, nothing broader.
cat > /etc/sudoers.d/${APP_NAME}-restart << EOF
${APP_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl restart ${APP_NAME}
EOF
chmod 440 /etc/sudoers.d/${APP_NAME}-restart
visudo -cf /etc/sudoers.d/${APP_NAME}-restart > /dev/null || rm -f /etc/sudoers.d/${APP_NAME}-restart

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

# ── 8. Setup cron jobs (db backup + OLT config backup + auto-sync) ──
echo "[8/9] Setting up cron jobs..."
DB_BACKUP_CRON="0 * * * * cd ${APP_DIR} && ${APP_DIR}/.venv/bin/python3 db_backup.py >> /var/log/salfanet-db-backup.log 2>&1"
BACKUP_CRON="0 * * * * cd ${APP_DIR} && ${APP_DIR}/.venv/bin/python3 auto_backup.py >> /var/log/salfanet-backup.log 2>&1"
SYNC_CRON="*/5 * * * * cd ${APP_DIR} && ${APP_DIR}/.venv/bin/python3 auto_sync.py >> /var/log/salfanet-sync.log 2>&1"
TRAFFIC_CRON="*/5 * * * * cd ${APP_DIR} && ${APP_DIR}/.venv/bin/python3 traffic_poller.py >> /var/log/salfanet-traffic.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'db_backup\.py\|auto_backup\|auto_sync\|traffic_poller\|salfanet-nms' ; echo "$DB_BACKUP_CRON" ; echo "$BACKUP_CRON" ; echo "$SYNC_CRON" ; echo "$TRAFFIC_CRON" ) | crontab -
touch /var/log/salfanet-db-backup.log /var/log/salfanet-backup.log /var/log/salfanet-sync.log /var/log/salfanet-traffic.log
chown ${APP_USER}:${APP_USER} /var/log/salfanet-db-backup.log /var/log/salfanet-backup.log /var/log/salfanet-sync.log /var/log/salfanet-traffic.log 2>/dev/null || true

# Cron logs above are appended to forever with no rotation otherwise —
# harmless short-term, but grows unbounded over months/years of hourly
# and every-5-minutes cron runs.
cat > /etc/logrotate.d/${APP_NAME} << LOGROTATE_EOF
/var/log/salfanet-*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    su ${APP_USER} ${APP_USER}
}
LOGROTATE_EOF

echo "  ✅ DB backup cron: hourly (instance/backups/, 24 hourly + 7 daily retention)"
echo "  ✅ OLT config backup cron: hourly"
echo "  ✅ Auto-sync cron: every 5 minutes"
echo "  ✅ Traffic poller cron: every 5 minutes"
echo "  ✅ Log rotation: daily, 14 days retention"

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
echo "  Next steps:"
echo "    1. Add your OLT via Settings > OLT Settings"
if [ -z "$DOMAIN" ]; then
    echo "    2. (Optional) Point a domain to this IP and re-run:"
    echo "       bash install-vps.sh yourdomain.com"
    echo "    3. (Optional) Enable HTTPS — requires a domain (Let's Encrypt can't"
    echo "       certify a bare IP), then:"
    echo "       certbot --nginx -d yourdomain.com"
else
    echo "    2. Enable HTTPS:"
    echo "       certbot --nginx -d ${DOMAIN}"
fi
echo "    * After HTTPS is working, set SESSION_COOKIE_SECURE=1 in ${APP_DIR}/.env"
echo "      and restart (systemctl restart ${APP_NAME}) — until then, login only"
echo "      works over plain HTTP; a Secure cookie set without HTTPS is silently"
echo "      dropped by the browser and breaks login."
echo ""
