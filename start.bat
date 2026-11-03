@echo off
REM Salfanet NMS - Docker quick start (Windows).
cd /d "%~dp0"

if not exist .env.docker (
    copy .env.docker.example .env.docker >nul
    echo [start] Created .env.docker - set SECRET_KEY and INTERNAL_API_KEY before production use.
)

docker compose --env-file .env.docker up -d --build %*
for /f "tokens=2 delims==" %%p in ('findstr /b "HTTP_PORT=" .env.docker') do set HTTP_PORT=%%p
echo [start] Salfanet NMS is up -^> http://localhost:%HTTP_PORT%
