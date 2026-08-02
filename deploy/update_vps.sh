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

echo "=== Update nginx (Cloudflare real_ip) ==="
# Update nginx config with Cloudflare real_ip support
cat > /etc/nginx/sites-available/salfanet-nms << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    # Cloudflare real IP — restore visitor IP from CF headers
    set_real_ip_from 173.245.48.0/20;
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    set_real_ip_from 103.31.4.0/22;
    set_real_ip_from 141.101.64.0/18;
    set_real_ip_from 108.162.192.0/18;
    set_real_ip_from 190.93.240.0/20;
    set_real_ip_from 188.114.96.0/20;
    set_real_ip_from 197.234.240.0/22;
    set_real_ip_from 198.41.128.0/17;
    set_real_ip_from 162.158.0.0/15;
    set_real_ip_from 104.16.0.0/13;
    set_real_ip_from 104.24.0.0/14;
    set_real_ip_from 172.64.0.0/13;
    set_real_ip_from 131.0.72.0/22;
    real_ip_header CF-Connecting-IP;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;

    location /spa/ {
        alias /opt/salfanet-nms/frontend/dist/;
        try_files $uri /spa/index.html;
        expires 1h;
    }
    location /spa/assets/ {
        alias /opt/salfanet-nms/frontend/dist/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    location /static/ {
        alias /opt/salfanet-nms/static/;
        expires 1h;
    }
    location /ws/ {
        proxy_pass http://127.0.0.1:8765;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
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
NGINXEOF
nginx -t && systemctl reload nginx
echo "Nginx updated with Cloudflare real_ip"

echo "=== Setup auto-backup cron ==="
CRON_LINE="0 * * * * cd /opt/salfanet-nms && /usr/bin/python3 auto_backup.py >> /var/log/salfanet-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'auto_backup\|salfanet-nms' ; echo "$CRON_LINE" ) | crontab -
touch /var/log/salfanet-backup.log
chown salfanet:salfanet /var/log/salfanet-backup.log 2>/dev/null || true
echo "Cron: auto_backup set to run hourly"

echo "=== Verify ==="
systemctl is-active salfanet-nms && echo "Service: ACTIVE" || echo "Service: FAILED"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:80/
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:5000/
curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:8765/health
echo "=== DONE ==="
