# ---------------------------------------------------------------
# PocketGroove Studio -- Dev Stop
# Usage:  .\scripts\dev-stop.ps1     (depuis la racine du monorepo)
#         npm run dev:stop           (raccourci)
# ---------------------------------------------------------------

$ErrorActionPreference = "SilentlyContinue"

$Root = Split-Path -Parent $PSScriptRoot

function Write-Step  { param([string]$msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "   [OK] $msg" -ForegroundColor Green }

Write-Step "Arret de PocketGroove Studio..."

# Arreter d'abord les services Docker Compose
try {
    $dockerCheck = Start-Process -FilePath "docker" -ArgumentList "version" -PassThru -NoNewWindow -ErrorAction Stop
    $completed = $dockerCheck.WaitForExit(2000)
    if ($completed -and $dockerCheck.ExitCode -eq 0) {
        & cmd.exe /c "docker compose -f `"$(Join-Path $Root 'docker-compose.yml')`" down" 2>$null
        Write-Ok "Services Docker arretes"
    } else {
        if (-not $completed) { try { $dockerCheck.Kill() } catch {} }
    }
} catch {}

# Liberer les ports applicatifs Node/Expo (sans toucher au moteur Docker/WSL)
foreach ($port in @(3000, 8081, 19000, 8000, 8001)) {
    $lines = netstat -ano | Select-String ":$port\s"
    if ($lines) {
        $pids = $lines | ForEach-Object {
            $parts = ($_ -split '\s+') | Where-Object { $_ -ne "" }
            if ($parts.Count -ge 5) { [int]$parts[-1] }
        } | Select-Object -Unique
        foreach ($procId in $pids) {
            if ($procId -gt 4) {
                $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
                if ($proc -and $proc.Name -notmatch "System|Idle|wsl|docker") {
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                    Write-Ok "Port $port libere ($($proc.Name))"
                }
            }
        }
    }
}

Write-Host "`nTout est arrete !" -ForegroundColor Green
Write-Host ""
