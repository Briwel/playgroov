# ---------------------------------------------------------------
# PocketGroove Studio -- Dev Launcher
# Usage:  .\scripts\dev.ps1          (depuis la racine du monorepo)
#         npm run dev                (raccourci LAN)
#         npm run dev:tunnel         (raccourci avec tunnel pour contourner la box)
#
# Ce script :
#   1. Libere les ports 3000, 8000, 8001 s'ils sont occupes
#   2. Detecte l'IP LAN et met a jour le .env de l'app mobile
#   3. Lance les services Docker (demucs + basic-pitch) en tache de fond
#   4. Lance le backend NestJS (port 3000 - ecoute sur 0.0.0.0)
#   5. Lance le serveur Expo (app mobile)
#
# Pour tout arreter :  Ctrl+C  (ou fermer le terminal)
# ---------------------------------------------------------------

param(
    [switch]$Tunnel
)

$ErrorActionPreference = "Stop"

function Write-Step  { param([string]$msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "   [OK] $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "   [!!] $msg" -ForegroundColor Yellow }

# -- Racine du projet --
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "apps\backend"
$MobileApp = Join-Path $Root "apps\mobile-app"

# -- 1. Liberer les ports applicatifs (sans toucher au moteur Docker/WSL) --
Write-Step "Nettoyage des ports (3000, 8000, 8001)..."

function Free-Port {
    param([int]$Port)
    $lines = netstat -ano | Select-String ":$Port\s"
    if ($lines) {
        $pids = $lines | ForEach-Object {
            $parts = ($_ -split '\s+') | Where-Object { $_ -ne "" }
            if ($parts.Count -ge 5) { [int]$parts[-1] }
        } | Select-Object -Unique

        $freed = $false
        foreach ($procId in $pids) {
            if ($procId -gt 4) {
                $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
                if ($proc -and $proc.Name -notmatch "System|Idle|wsl|docker") {
                    Write-Warn "Port $Port occupe par $($proc.Name) (PID $procId) - on le libere"
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                    $freed = $true
                } elseif ($proc -and $proc.Name -match "wsl|docker") {
                    Write-Ok "Port $Port utilise par $($proc.Name) (service Docker actif)"
                }
            }
        }
        if ($freed) { Write-Ok "Port $Port libere" }
    } else {
        Write-Ok "Port $Port deja libre"
    }
}

Free-Port 3000
Free-Port 8000
Free-Port 8001

Start-Sleep -Seconds 1

# -- 2. Detecter l'IP LAN et mettre a jour les .env --
Write-Step "Detection de l IP LAN..."

$lanIp = $null
try {
    # Trouver l'IP de l'interface reseau active (pas loopback, pas virtual)
    $lanIp = (
        Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object {
            $_.IPAddress -ne "127.0.0.1" -and
            $_.PrefixOrigin -ne "WellKnown" -and
            $_.SuffixOrigin -ne "WellKnown" -and
            $_.AddressState -eq "Preferred"
        } |
        Sort-Object -Property InterfaceIndex |
        Select-Object -First 1
    ).IPAddress
} catch {}

if (-not $lanIp) {
    # Fallback : methode socket UDP (fonctionne meme sans admin)
    try {
        $socket = [System.Net.Sockets.UdpClient]::new()
        $socket.Connect("8.8.8.8", 53)
        $lanIp = ($socket.Client.LocalEndPoint -as [System.Net.IPEndPoint]).Address.ToString()
        $socket.Close()
    } catch {
        $lanIp = "localhost"
        Write-Warn "Impossible de detecter l IP LAN - fallback sur localhost"
    }
}

Write-Ok "IP LAN detectee : $lanIp"

$backendUrl = "http://${lanIp}:3000"

# Mettre a jour le .env de l'app mobile
$mobileEnvFile = Join-Path $MobileApp ".env"
$envContent = "EXPO_PUBLIC_API_URL=$backendUrl"
Set-Content -Path $mobileEnvFile -Value $envContent -NoNewline
Write-Ok ".env mobile mis a jour : EXPO_PUBLIC_API_URL=$backendUrl"

# -- 3. Verifier et lancer automatiquement Docker si necessaire --
Write-Step "Verification de Docker..."

function Test-DockerReady {
    $proc = Start-Process -FilePath "docker" -ArgumentList "version" -PassThru -NoNewWindow -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    $finished = $proc.WaitForExit(2500)
    if ($finished -and $proc.ExitCode -eq 0) {
        return $true
    }
    if (-not $finished) {
        try { $proc.Kill() } catch {}
    }
    return $false
}

$dockerRunning = Test-DockerReady

if (-not $dockerRunning) {
    $dockerDesktopExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerDesktopExe) {
        Write-Host "   Docker Desktop n'est pas demarre. Lancement automatique..." -ForegroundColor Cyan
        Start-Process $dockerDesktopExe
        
        $maxAttempts = 20
        for ($i = 1; $i -le $maxAttempts; $i++) {
            Write-Host "   Attente du moteur Docker ($($i * 2)s / 40s)..." -ForegroundColor DarkGray
            Start-Sleep -Seconds 2
            if (Test-DockerReady) {
                $dockerRunning = $true
                break
            }
        }
    }
}

# -- 4. Lancer les services Docker (demucs + basic-pitch) --
if ($dockerRunning) {
    Write-Ok "Docker est actif et pret"
    Write-Step "Lancement des services Docker (demucs + basic-pitch)..."
    try {
        $dockerJob = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c", "docker compose -f `"$(Join-Path $Root 'docker-compose.yml')`" up -d" `
            -WorkingDirectory $Root `
            -NoNewWindow -PassThru -Wait
        if ($dockerJob.ExitCode -eq 0) {
            Write-Ok "Services Docker prets (demucs:8000 + basic-pitch:8001)"
        } else {
            Write-Warn "Docker compose a retourne un code erreur $($dockerJob.ExitCode)"
        }
    } catch {
        Write-Warn "Erreur Docker : $($_.Exception.Message)"
    }
} else {
    Write-Warn "Docker n'a pas pu etre contacte - les services audio ne seront pas disponibles"
    Write-Warn "Le backend et Expo demarrent normalement sans Docker"
}

# -- 5. Lancer le backend NestJS --
Write-Step "Lancement du backend NestJS (port 3000)..."

$backendProc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run start:dev" `
    -WorkingDirectory $Backend `
    -NoNewWindow -PassThru

Write-Ok "Backend lance (PID $($backendProc.Id)) - $backendUrl"

Start-Sleep -Seconds 2

# -- 6. Lancer Expo --
if ($Tunnel) {
    Write-Step "Lancement de l app mobile Expo (mode TUNNEL actif)..."
} else {
    Write-Step "Lancement de l app mobile Expo..."
}

$expoArgs = if ($Tunnel) { @("/c", "npx expo start --tunnel") } else { @("/c", "npx expo start") }

$expoProc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList $expoArgs `
    -WorkingDirectory $MobileApp `
    -NoNewWindow -PassThru

Write-Ok "Expo lance (PID $($expoProc.Id))"

# -- Resume --
Write-Host ""
Write-Host "================================================" -ForegroundColor Magenta
Write-Host "  PocketGroove Studio -- Tout est pret !        " -ForegroundColor Magenta
Write-Host "================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  IP LAN        -> $lanIp" -ForegroundColor White
Write-Host "  Backend API   -> $backendUrl" -ForegroundColor White
if ($dockerRunning) {
    Write-Host "  Demucs        -> http://${lanIp}:8000" -ForegroundColor White
    Write-Host "  Basic Pitch   -> http://${lanIp}:8001" -ForegroundColor White
}
Write-Host "  Expo          -> Scanne le QR code dans le terminal" -ForegroundColor White
Write-Host ""
Write-Host "  L app mobile pointe automatiquement vers $backendUrl" -ForegroundColor DarkGray
Write-Host "  Pour tout arreter : npm run dev:stop" -ForegroundColor DarkGray
Write-Host ""

# -- Garder le script en vie et attendre Ctrl+C --
Write-Host "Appuie sur Ctrl+C pour tout arreter..." -ForegroundColor DarkGray

try {
    while (!$backendProc.HasExited -and !$expoProc.HasExited) {
        Start-Sleep -Seconds 2
    }
} finally {
    Write-Host "`nArret en cours..." -ForegroundColor Yellow

    if (!$backendProc.HasExited) {
        & taskkill /PID $backendProc.Id /T /F 2>$null
        Write-Host "  Backend arrete" -ForegroundColor DarkGray
    }
    if (!$expoProc.HasExited) {
        & taskkill /PID $expoProc.Id /T /F 2>$null
        Write-Host "  Expo arrete" -ForegroundColor DarkGray
    }

    if ($dockerRunning) {
        Write-Host "  Arret des services Docker..." -ForegroundColor DarkGray
        & cmd.exe /c "docker compose -f `"$(Join-Path $Root 'docker-compose.yml')`" down" 2>$null
        Write-Host "  Docker arrete" -ForegroundColor DarkGray
    }

    Write-Host "`nA plus !" -ForegroundColor Green
}
