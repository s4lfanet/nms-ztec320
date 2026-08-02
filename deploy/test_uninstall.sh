#!/bin/bash
set -e

echo "=== Download uninstaller ==="
curl -fsSL https://raw.githubusercontent.com/s4lfanet/nms-ztec320/main/uninstall-vps.sh -o /tmp/uninstall-vps.sh

echo "=== Run uninstaller ==="
echo "yes" | bash /tmp/uninstall-vps.sh

echo ""
echo "=== Verification ==="
if [ -d /opt/salfanet-nms ]; then
    echo "FAIL: /opt/salfanet-nms still exists"
else
    echo "OK: /opt/salfanet-nms removed"
fi

if systemctl is-active salfanet-nms 2>/dev/null; then
    echo "FAIL: salfanet-nms service still active"
else
    echo "OK: salfanet-nms service stopped/removed"
fi

if id salfanet 2>/dev/null; then
    echo "FAIL: salfanet user still exists"
else
    echo "OK: salfanet user removed"
fi

if [ -f /etc/nginx/sites-enabled/salfanet-nms ]; then
    echo "FAIL: nginx config still exists"
else
    echo "OK: nginx config removed"
fi

if [ -f /etc/systemd/system/salfanet-nms.service ]; then
    echo "FAIL: systemd service file still exists"
else
    echo "OK: systemd service file removed"
fi

echo ""
echo "=== Port check ==="
curl -s -o /dev/null -w "Port 80: HTTP %{http_code}\n" http://127.0.0.1:80/ 2>&1 || echo "Port 80: not responding"
curl -s -o /dev/null -w "Port 5000: HTTP %{http_code}\n" http://127.0.0.1:5000/ 2>&1 || echo "Port 5000: not responding"
curl -s -o /dev/null -w "Port 8765: HTTP %{http_code}\n" http://127.0.0.1:8765/health 2>&1 || echo "Port 8765: not responding"

echo ""
echo "=== DONE ==="
