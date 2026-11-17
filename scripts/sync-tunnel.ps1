param(
    [int]$WaitSeconds = 180
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $ScriptDir
$LogsDir = Join-Path $RootDir "logs"
$LogFile = Join-Path $LogsDir "sync.log"
$TunnelLogFile = Join-Path $LogsDir "tunnel.log"
$EnvFile = Join-Path $RootDir ".env"
$MarkerFile = Join-Path $LogsDir ".tunnel-synced"

if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
}

function Write-SyncLog {
    param([string]$Message)
    try {
        $line = "[{0}] {1}" -f (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"), $Message
        [System.IO.File]::AppendAllText(
            $LogFile,
            "$line`r`n",
            [System.Text.Encoding]::UTF8
        )
    } catch {
        # Logging must never break the sync.
    }
}

# Only accept a tunnel URL written after this run started, so a stale URL
# from a previous tunnel can never be published.
$started = [DateTime]::UtcNow.AddSeconds(-5)
$url = $null

for ($i = 0; $i -lt $WaitSeconds; $i++) {
    if (Test-Path $TunnelLogFile) {
        $lines = Get-Content -LiteralPath $TunnelLogFile -Tail 300 -ErrorAction SilentlyContinue
        foreach ($line in $lines) {
            $match = [regex]::Match($line, 'https://[a-z0-9-]+\.trycloudflare\.com')
            if (-not $match.Success) { continue }

            $timeMatch = [regex]::Match($line, '"time":"([^"]+)"')
            if (-not $timeMatch.Success) { continue }

            try {
                $when = [DateTime]::Parse(
                    $timeMatch.Groups[1].Value,
                    [System.Globalization.CultureInfo]::InvariantCulture,
                    [System.Globalization.DateTimeStyles]::RoundtripKind
                ).ToUniversalTime()
            } catch {
                continue
            }

            if ($when -ge $started) {
                $url = $match.Value
            }
        }
    }

    if ($url) { break }
    Start-Sleep -Seconds 1
}

if (-not $url) {
    Write-SyncLog "No new quick-tunnel URL appeared within $WaitSeconds seconds."
    exit 1
}

Write-SyncLog "Current tunnel: $url"

$text = [System.IO.File]::ReadAllText($EnvFile)
$currentMatch = [regex]::Match($text, '(?m)^MARGIN_PUBLIC_API_URL=(.*)$')
$currentUrl = if ($currentMatch.Success) {
    $currentMatch.Groups[1].Value.Trim()
} else {
    ''
}

$envChanged = $false
if ($currentUrl -ne $url) {
    if ($currentMatch.Success) {
        $updated = [regex]::Replace(
            $text,
            '(?m)^MARGIN_PUBLIC_API_URL=.*$',
            "MARGIN_PUBLIC_API_URL=$url"
        )
    } else {
        $updated = $text.TrimEnd() + "`r`nMARGIN_PUBLIC_API_URL=$url`r`n"
    }
    [System.IO.File]::WriteAllText(
        $EnvFile,
        $updated,
        (New-Object System.Text.UTF8Encoding($false))
    )
    $envChanged = $true
    Write-SyncLog "Updated MARGIN_PUBLIC_API_URL in .env."
}

$synced = ''
if (Test-Path $MarkerFile) {
    $synced = ([System.IO.File]::ReadAllText($MarkerFile)).Trim()
}

if (-not $envChanged -and $synced -eq $url) {
    Write-SyncLog "Vercel already points at this tunnel."
    exit 0
}

Push-Location $RootDir
$previousErrorAction = $ErrorActionPreference
# Vercel writes its banner to stderr. Windows PowerShell treats redirected
# native stderr as a terminating error when ErrorActionPreference is Stop.
$ErrorActionPreference = 'Continue'
try {
    Write-SyncLog "Updating the Vercel production tunnel variable."
    $envOutput = & npx.cmd vercel env add MARGIN_TUNNEL_URL --environment production --value $url --force --yes 2>&1
    $envCode = $LASTEXITCODE
    Write-SyncLog ($envOutput -join ' ')
    if ($envCode -ne 0) {
        Write-SyncLog "Vercel environment update failed (exit $envCode)."
        exit 1
    }

    Write-SyncLog "Deploying production with the new tunnel."
    $deployOutput = & npx.cmd vercel --prod --yes 2>&1
    $deployCode = $LASTEXITCODE
    Write-SyncLog ($deployOutput -join ' ')
    if ($deployCode -ne 0) {
        Write-SyncLog "Vercel deployment failed (exit $deployCode)."
        exit 1
    }
} finally {
    $ErrorActionPreference = $previousErrorAction
    Pop-Location
}

[System.IO.File]::WriteAllText(
    $MarkerFile,
    $url,
    (New-Object System.Text.UTF8Encoding($false))
)
Write-SyncLog "Vercel now points at the current tunnel."

# The public upload URL is read from .env, so restart the backend after the
# file changes. The tray watchdog starts it again within ten seconds.
$node = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CommandLine -like '*server/index.js*'
} | Select-Object -First 1

if ($node) {
    Stop-Process -Id $node.ProcessId -Force
    Write-SyncLog "Stopped backend PID $($node.ProcessId) so it reloads .env."
}

Start-Sleep -Seconds 12
try {
    $health = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3000/api/health" -TimeoutSec 10
    Write-SyncLog "Backend health: $($health.StatusCode)."
} catch {
    Write-SyncLog "Backend health check failed: $($_.Exception.Message)"
}
