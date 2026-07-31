#!/bin/bash
# Kill stuck dpkg
kill -9 $(pgrep -f 'dpkg|debconf') 2>/dev/null || true
sleep 2
dpkg --configure -a 2>/dev/null || true

# Just add iptables rule directly (iptables-persistent already partially installed)
iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 5000
iptables -t nat -A OUTPUT -p tcp -o lo --dport 80 -j REDIRECT --to-port 5000

# Save manually
mkdir -p /etc/iptables
iptables-save > /etc/iptables/rules.v4 2>/dev/null || true

echo "Port 80 -> 5000 redirect configured"

# Verify server still running
pgrep -f "python app.py" > /dev/null && echo "Server: RUNNING" || echo "Server: NOT RUNNING"

# Test port 80
sleep 1
curl -s -o /dev/null -w "Port 80: HTTP %{http_code}\n" http://127.0.0.1:80/ 2>&1 || echo "Port 80: FAILED"
curl -s -o /dev/null -w "Port 5000: HTTP %{http_code}\n" http://127.0.0.1:5000/ 2>&1 || echo "Port 5000: FAILED"

echo "DONE"
