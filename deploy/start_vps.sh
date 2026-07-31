#!/bin/bash
set -e

cd /opt/nms-test

echo "=== Pull latest code ==="
git pull origin main

echo "=== Rebuild frontend ==="
cd frontend
npm run build
cd ..

echo "=== Restart server ==="
pkill -f "python app.py" 2>/dev/null || true
sleep 2
source .venv/bin/activate
nohup python app.py > /tmp/nms.log 2>&1 &
echo "PID: $!"

sleep 5

if pgrep -f "python app.py" > /dev/null; then
    echo "Server: RUNNING"
else
    echo "Server: FAILED"
    tail -20 /tmp/nms.log
    exit 1
fi

echo "--- curl port 80 ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:80/ 2>&1
echo "--- curl port 5000 ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:5000/ 2>&1

echo "DONE"
