#!/bin/bash
# ═══════════════════════════════════════════════════════
# Salfanet NMS — Full Uninstaller for VPS
# Removes: systemd service, nginx config, app files, app user
# Usage: sudo bash uninstall-vps.sh
# ═══════════════════════════════════════════════════════
set -e

APP_NAME="salfanet-nms"
APP_USER="salfanet"
APP_DIR="/opt/${APP_NAME}"

echo "═════════════════════════════════════════════════════"
echo "  Salfanet NMS — Full Uninstaller"
echo "═════════════════════════════════════════════════════"
echo ""

# Must be root
if [ "$EUID" -ne 0 ]; then
    echo "[ERROR] Please run as root: sudo bash uninstall-vps.sh"
    exit 1
fi

# Confirm
echo "This will completely remove Salfanet NMS:"
echo "  - Stop & remove systemd service"
echo "  - Remove nginx config"
echo "  - Delete ${APP_DIR}/ (all app files + database)"
echo "  - Remove app user '${APP_USER}'"
echo "  - Remove iptables port redirect (if any)"
echo ""
read -p "Are you sure? Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Cancelled."
    exit 0
fi
echo ""

# ── 1. Stop & remove systemd service ──
echo "[1/5] Stopping & removing systemd service..."
systemctl stop "${APP_NAME}" 2>/dev/null || true
systemctl disable "${APP_NAME}" 2>/dev/null || true
rm -f /etc/systemd/system/${APP_NAME}.service
systemctl daemon-reload
echo "  Done."

# ── 2. Remove nginx config ──
echo "[2/5] Removing nginx configuration..."
rm -f /etc/nginx/sites-enabled/${APP_NAME}
rm -f /etc/nginx/sites-available/${APP_NAME}
# Restore default nginx site if no other sites exist
if [ -z "$(ls -A /etc/nginx/sites-enabled/ 2>/dev/null)" ]; then
    ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default 2>/dev/null || true
fi
nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
echo "  Done."

# ── 3. Remove iptables port redirect ──
echo "[3/5] Removing iptables port redirect..."
iptables -t nat -D PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 5000 2>/dev/null || true
iptables -t nat -D OUTPUT -p tcp -o lo --dport 80 -j REDIRECT --to-port 5000 2>/dev/null || true
netfilter-persistent save 2>/dev/null || true
echo "  Done."

# ── 4. Delete app files ──
echo "[4/5] Deleting application files..."
rm -rf "${APP_DIR}"
echo "  Removed ${APP_DIR}/"

# ── 5. Remove app user ──
echo "[5/5] Removing app user..."
userdel "${APP_USER}" 2>/dev/null || true
echo "  Done."

# Kill any remaining processes
pkill -f "run_server.py" 2>/dev/null || true
pkill -f "uvicorn" 2>/dev/null || true
pkill -u "${APP_USER}" 2>/dev/null || true

echo ""
echo "═════════════════════════════════════════════════════"
echo "  ✅ Uninstallation Complete!"
echo "═════════════════════════════════════════════════════"
echo ""
echo "  Salfanet NMS has been fully removed."
echo "  System packages (Python, Node.js, nginx) are kept."
echo ""
echo "  To remove system packages too:"
echo "    apt-get remove -y nodejs nginx && apt-get autoremove -y"
echo ""
