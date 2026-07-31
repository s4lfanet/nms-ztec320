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
    echo "[ERROR] Python 3 not found. Please install Python 3.12+."
    exit 1
fi

# Check Node.js
if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js not found. Please install Node.js 22+ from https://nodejs.org"
    exit 1
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
