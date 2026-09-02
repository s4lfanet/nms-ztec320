#!/bin/bash
# ═══════════════════════════════════════════════════════
# Salfanet NMS — ZTE OLT Management System
# Installer for Linux / macOS (repo already cloned)
# For a fresh Ubuntu VPS (system packages + systemd + nginx),
# use install-vps.sh instead.
# ═══════════════════════════════════════════════════════
set -e

echo "═════════════════════════════════════════════════════"
echo "  Salfanet NMS — ZTE OLT Management System"
echo "  Installer for Linux / macOS"
echo "═════════════════════════════════════════════════════"
echo

# Check Python
if ! command -v python3 &>/dev/null; then
    echo "[ERROR] Python 3 not found. Please install Python 3.10+."
    exit 1
fi

# Check Python version >= 3.10
PY_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")')
PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
if [ "$PY_MAJOR" -lt 3 ] || ([ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]); then
    echo "[ERROR] Python 3.10+ required, found $PY_VERSION"
    echo "        (uvicorn>=0.34/fastapi>=0.115 in requirements.txt don't support older Python)"
    exit 1
fi
echo "  Python: $PY_VERSION"

# Check Node.js
if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js not found. Please install Node.js 22+ from https://nodejs.org"
    exit 1
fi
echo "  Node.js: $(node --version)"

# Check pnpm (frontend package manager — pnpm-lock.yaml is the source of truth)
if ! command -v pnpm &>/dev/null; then
    echo "  pnpm not found, installing..."
    corepack enable pnpm 2>/dev/null || npm install -g pnpm
fi
echo "  pnpm: $(pnpm --version)"

# Auto-install python3-venv on Debian/Ubuntu if missing
if ! python3 -c 'import ensurepip' &>/dev/null; then
    echo "  python3-venv not found, installing..."
    if command -v apt-get &>/dev/null; then
        PY_VER=$(python3 -c 'import sys; print(f"python{sys.version_info[0]}.{sys.version_info[1]}")')
        apt-get update -qq && apt-get install -y -qq "${PY_VER}-venv"
    else
        echo "[ERROR] python3-venv is not installed. Please install it manually."
        exit 1
    fi
fi

echo "[1/5] Creating Python virtual environment..."
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate

echo "[2/5] Installing Python dependencies..."
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet

echo "[3/5] Installing frontend dependencies..."
cd frontend

# Optional faster mirror for slow/regional connections to the default npm
# registry — opt-in only, e.g.: PNPM_REGISTRY=https://registry.npmmirror.com bash install.sh
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
    echo "         cd frontend && pnpm install"
    exit 1
fi

echo "[4/5] Building frontend..."
timeout 300 pnpm build
cd ..

echo "[5/5] Creating .env configuration..."
mkdir -p instance
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "  Created .env from .env.example"
    echo "  Please edit .env with your settings before running."
else
    echo "  .env already exists, skipping."
fi

echo ""
echo "═════════════════════════════════════════════════════"
echo "  ✅ Installation Complete!"
echo "═════════════════════════════════════════════════════"
echo ""
echo "  To start the server:"
echo "    source .venv/bin/activate"
echo "    python run_server.py"
echo ""
echo "  App:       http://<your-ip>:5000"
echo "  API Docs:  http://<your-ip>:8765/docs"
echo "  Login:     admin / admin123"
echo ""

# Auto-start option
if [ "$1" = "--start" ]; then
    echo "Starting server..."
    pkill -f "python run_server.py" 2>/dev/null || true
    pkill -f "uvicorn" 2>/dev/null || true
    sleep 1
    nohup python run_server.py > /tmp/nms.log 2>&1 &
    echo "  Server PID: $!"
    sleep 4
    if pgrep -f "run_server.py" > /dev/null; then
        echo "  ✅ Server running!"
        echo "  Logs: tail -f /tmp/nms.log"
    else
        echo "  ❌ Server failed to start. Check /tmp/nms.log"
        tail -10 /tmp/nms.log
    fi
    echo ""
fi
