# Salfanet NMS — Frontend Deploy Script
# Usage: .\deploy\deploy-frontend.ps1
# Optional: .\deploy\deploy-frontend.ps1 -PurgeCF

param(
    [switch]$PurgeCF,
    [string]$VpsHost = "192.168.54.246",
    [string]$VpsUser = "root",
    [int]$VpsPort = 22,
    [string]$VpsPath = "/opt/fibernms/frontend/dist"
)

$ErrorActionPreference = "Stop"
$frontendDir = Join-Path $PSScriptRoot ".." "frontend"

Write-Host "=== Salfanet NMS Frontend Deploy ===" -ForegroundColor Cyan

# Step 1: Build
Write-Host "`n[1/4] Building frontend..." -ForegroundColor Yellow
Push-Location $frontendDir
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build FAILED!" -ForegroundColor Red
    exit 1
}
$distDir = Join-Path $frontendDir "dist"
$fileCount = (Get-ChildItem $distDir -Recurse -File).Count
Write-Host "  Build OK — $fileCount files" -ForegroundColor Green

# Step 2: Clean remote dist
Write-Host "`n[2/4] Cleaning remote dist..." -ForegroundColor Yellow
ssh -o StrictHostKeyChecking=no -p $VpsPort "${VpsUser}@${VpsHost}" "rm -rf ${VpsPath}/* 2>/dev/null && echo CLEANED"

# Step 3: Upload
Write-Host "`n[3/4] Uploading to VPS..." -ForegroundColor Yellow
scp -r -o StrictHostKeyChecking=no -P $VpsPort "${distDir}\*" "${VpsUser}@${VpsHost}:${VpsPath}/"
Write-Host "  Upload OK" -ForegroundColor Green

# Step 4: Reload nginx (no downtime)
Write-Host "`n[4/4] Reloading nginx..." -ForegroundColor Yellow
ssh -o StrictHostKeyChecking=no -p $VpsPort "${VpsUser}@${VpsHost}" "nginx -t 2>&1 && nginx -s reload 2>&1 && echo NGINX_OK"

# Optional: Purge Cloudflare cache
if ($PurgeCF) {
    Write-Host "`n[Purge] Purging Cloudflare cache..." -ForegroundColor Yellow
    # Read CF config from system_config via API
    $cfPurge = ssh -o StrictHostKeyChecking=no -p $VpsPort "${VpsUser}@${VpsHost}" "cd /opt/fibernms && python3 -c `"from models import SystemConfig; from app import app; ctx=app.app_context(); ctx.push(); zone=SystemConfig.query.filter_by(key='cf_zone_name').first(); token=SystemConfig.query.filter_by(key='cf_api_token').first(); print(f'{token.value if token else ''}|{zone.value if zone else ''}')`""
    $parts = $cfPurge -split '\|'
    $cfToken = $parts[0].Trim()
    $cfZone = $parts[1].Trim()
    
    if ($cfToken -and $cfZone) {
        # Purge via Cloudflare API
        $purgeBody = '{"files":["https://' + $cfZone + '/spa/index.html","https://' + $cfZone + '/spa/"]}'
        $result = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$cfZone/purge_cache" -Method Post -Headers @{"Authorization"="Bearer $cfToken"; "Content-Type"="application/json"} -Body $purgeBody -ErrorAction SilentlyContinue
        if ($result.success) {
            Write-Host "  Cloudflare cache purged!" -ForegroundColor Green
        } else {
            Write-Host "  CF purge failed (API token may lack permissions)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  CF config not found in system_config" -ForegroundColor Yellow
    }
}

Pop-Location

Write-Host "`n=== Deploy Complete ===" -ForegroundColor Green
Write-Host "  URL: https://salfanet-nms.salfa.my.id/spa/" -ForegroundColor Cyan
Write-Host "  Tip: If changes don't appear, do Ctrl+Shift+R (hard refresh)" -ForegroundColor DarkGray
