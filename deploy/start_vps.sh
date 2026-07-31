#!/bin/bash
set -e

cd /opt/nms-test

echo "=== Pull latest code ==="
git pull origin main

echo "=== Rebuild frontend ==="
cd frontend
npm run build
cd ..

echo "=== Restart server with WebSocket ==="
pkill -f "python app.py" 2>/dev/null || true
pkill -f "python run_server.py" 2>/dev/null || true
pkill -f "uvicorn" 2>/dev/null || true
sleep 2
source .venv/bin/activate
nohup python run_server.py > /tmp/nms.log 2>&1 &
echo "PID: $!"

sleep 6

if pgrep -f "run_server.py" > /dev/null; then
    echo "Server: RUNNING"
else
    echo "Server: FAILED"
    tail -30 /tmp/nms.log
    exit 1
fi

echo "--- curl port 80 (Flask via iptables redirect) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:80/ 2>&1
echo "--- curl port 5000 (Flask) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:5000/ 2>&1
echo "--- curl port 8765 (FastAPI health) ---"
curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:8765/health 2>&1

echo ""
echo "=== Server log (last 20 lines) ==="
tail -20 /tmp/nms.log

echo ""
echo "DONE"
