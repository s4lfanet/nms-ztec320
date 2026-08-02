#!/bin/bash
set -e
cd /opt/salfanet-nms
git config --global --add safe.directory /opt/salfanet-nms
echo "=== Pull ==="
git pull origin main
echo "=== Build frontend ==="
cd frontend && npm run build && cd ..
echo "=== Restart ==="
systemctl restart salfanet-nms
sleep 5

echo "=== Setup auto-backup cron ==="
CRON_LINE="0 * * * * cd /opt/salfanet-nms && /usr/bin/python3 auto_backup.py >> /var/log/salfanet-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'auto_backup.py' ; echo "$CRON_LINE" ) | crontab -
touch /var/log/salfanet-backup.log
chown salfanet:salfanet /var/log/salfanet-backup.log 2>/dev/null || true
echo "Cron: auto_backup set to run hourly"

echo "=== Verify ==="
systemctl is-active salfanet-nms && echo "Service: ACTIVE" || echo "Service: FAILED"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:80/
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:5000/
curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:8765/health
echo "=== DONE ==="
