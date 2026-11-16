param(
    [int]$Port = 0
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "  $Message" -ForegroundColor DarkGray
}

function Read-EnvPort {
    $envPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
    if (-not (Test-Path -LiteralPath $envPath)) { return $null }

    foreach ($line in Get-Content -LiteralPath $envPath -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $index = $trimmed.IndexOf('=')
        if ($index -lt 1) { continue }
        $key = $trimmed.Substring(0, $index).Trim()
        if ($key -ne 'PORT') { continue }
        $value = $trimmed.Substring($index + 1).Trim()
        $value = $value.Trim('"').Trim("'")
        if ($value -match '^\d+$') { return [int]$value }
    }

    return $null
}

if (-not $Port -or $Port -le 0) {
    if ($env:PORT -match '^\d+$') {
        $Port = [int]$env:PORT
    } else {
        $envPort = Read-EnvPort
        if ($envPort) { $Port = $envPort } else { $Port = 3000 }
    }
}

$cloudflared = $null
$command = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($command) {
    $cloudflared = $command.Source
} else {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'cloudflared\cloudflared.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'cloudflared\cloudflared.exe')
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            $cloudflared = $candidate
            break
        }
    }
}

if (-not $cloudflared) {
    Write-Host ""
    Write-Host "  cloudflared is not installed yet." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Install it once with:"
    Write-Host "    winget install --id Cloudflare.cloudflared" -ForegroundColor White
    Write-Host ""
    Write-Host "  Then open a new terminal and run npm run share again."
    Write-Host ""
    exit 1
}

$healthUrl = "http://127.0.0.1:$Port/api/health"
$roomIsUp = $false
try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 4
    $roomIsUp = $response.StatusCode -eq 200
} catch {
    $roomIsUp = $false
}

if (-not $roomIsUp) {
    Write-Host ""
    Write-Host "  The print room is not answering on port $Port." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Start Margin first, in another terminal:"
    Write-Host "    npm start" -ForegroundColor White
    Write-Host ""
    Write-Host "  Leave it running, then come back and run npm run share."
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "  m a r g i n  /  tunnel" -ForegroundColor White
Write-Host ""
Write-Host "  The print room is awake on port $Port."
Write-Host "  Starting a Cloudflare quick tunnel..."
Write-Host ""
Write-Host "  Watch for a https://...trycloudflare.com address below." -ForegroundColor DarkGray
Write-Host "  Open that exact address on your phone. Keep this window open."
Write-Host "  Press Ctrl+C when you are finished printing."
Write-Host ""

& $cloudflared tunnel --url "http://127.0.0.1:$Port"
exit $LASTEXITCODE
