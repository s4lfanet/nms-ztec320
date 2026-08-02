#!/bin/bash
set -e

echo "=== Stop & remove old installation ==="
systemctl stop salfanet-nms 2>/dev/null || true
systemctl disable salfanet-nms 2>/dev/null || true
rm -f /etc/systemd/system/salfanet-nms.service
systemctl daemon-reload 2>/dev/null || true
pkill -f "python run_server.py" 2>/dev/null || true
pkill -f "uvicorn" 2>/dev/null || true
pkill -f "python app.py" 2>/dev/null || true
rm -rf /opt/nms-test
rm -rf /opt/salfanet-nms
rm -f /etc/nginx/sites-enabled/salfanet-nms
rm -f /etc/nginx/sites-available/salfanet-nms
iptables -t nat -F PREROUTING 2>/dev/null || true
iptables -t nat -F OUTPUT 2>/dev/null || true
sleep 2

echo "=== Download and run full installer ==="
curl -fsSL https://raw.githubusercontent.com/s4lfanet/nms-ztec320/main/install-vps.sh -o /tmp/install-vps.sh
bash /tmp/install-vps.sh
