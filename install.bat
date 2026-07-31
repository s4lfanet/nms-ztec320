@echo off
chcp 65001 >nul
title Salfanet NMS — Installer

echo ═══════════════════════════════════════════════════════
echo   Salfanet NMS — ZTE OLT Management System
echo   Installer for Windows
echo ═══════════════════════════════════════════════════════
echo.

:: Check Python
where py >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python 3.12+ from https://python.org
    pause
    exit /b 1
)

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js 22+ from https://nodejs.org
    pause
    exit /b 1
)

echo [1/5] Creating Python virtual environment...
if not exist ".venv" (
    py -3 -m venv .venv
)
call .venv\Scripts\activate.bat

echo [2/5] Installing Python dependencies...
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Python dependencies.
    pause
    exit /b 1
)

echo [3/5] Installing frontend dependencies...
pushd frontend
call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install frontend dependencies.
    popd
    pause
    exit /b 1
)

echo [4/5] Building frontend...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Failed to build frontend.
    popd
    pause
    exit /b 1
)
popd

echo [5/5] Creating .env configuration...
if not exist ".env" (
    copy .env.example .env >nul
    echo   Created .env from .env.example
    echo   Please edit .env with your settings before running.
) else (
    echo   .env already exists, skipping.
)

echo.
echo ═══════════════════════════════════════════════════════
echo   ✅ Installation Complete!
echo ═══════════════════════════════════════════════════════
echo.
echo   To start the server:
echo     .venv\Scripts\activate
echo     python run_server.py
echo.
echo   App:       http://127.0.0.1:5000
echo   API Docs:  http://127.0.0.1:8765/docs
echo   Login:     admin / admin123
echo.
pause
