#!/bin/bash
# ═══════════════════════════════════════════════════════
# Salfanet NMS — ZTE OLT Management System
# Installer for Linux / macOS
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
    exit 1
fi
echo "  Python: $PY_VERSION"

# Check Node.js
if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js not found. Please install Node.js 22+ from https://nodejs.org"
    exit 1
fi
echo "  Node.js: $(node --version)"

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
npm install --no-audit --no-fund

echo "[4/5] Building frontend..."
npm run build
cd ..

echo "[5/5] Creating .env configuration..."
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
echo "  App:       http://127.0.0.1:5000"
echo "  API Docs:  http://127.0.0.1:8765/docs"
echo "  Login:     admin / admin123"
echo ""
