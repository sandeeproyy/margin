param(
    [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $ScriptDir
$LogsDir = Join-Path $RootDir "logs"
$LogFile = Join-Path $LogsDir "margin.log"
$PreviousLogFile = Join-Path $LogsDir "margin.previous.log"
$ErrorLogFile = Join-Path $LogsDir "margin-error.log"

if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
}

$script:NodeProcess = $null
$script:TunnelProcess = $null
$script:TunnelRecovery = $null
$script:TunnelFailures = 0
$script:LastTunnelRecovery = [DateTime]::MinValue
$script:Stopping = $false
$script:Mutex = $null
$CloudflaredPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"

function Write-MarginLog {
    param([string]$Message)
    try {
        $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        [System.IO.File]::AppendAllText(
            $LogFile,
            "[$timestamp] [tray] $Message`r`n",
            [System.Text.Encoding]::UTF8
        )
    } catch {
        # Logging must never stop the print room.
    }
}

# Keep a single tray instance per Windows session.
try {
    $script:Mutex = New-Object System.Threading.Mutex($false, "Local\MarginTray")
    $acquired = $false
    try {
        $acquired = $script:Mutex.WaitOne(0)
    } catch [System.Threading.AbandonedMutexException] {
        $acquired = $true
    }
    if (-not $acquired) {
        exit 0
    }
} catch {
    Write-MarginLog "Could not create the single-instance lock: $_"
}

function Start-MarginBackend {
    if ($script:Stopping) { return $false }
    if ($script:NodeProcess -and -not $script:NodeProcess.HasExited) {
        return $true
    }

    if ($script:NodeProcess) {
        try { $script:NodeProcess.Dispose() } catch {}
        $script:NodeProcess = $null
    }

    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { "node.exe" }

    try {
        if (Test-Path $LogFile) {
            Copy-Item -LiteralPath $LogFile -Destination $PreviousLogFile -Force
        }
        $process = Start-Process -FilePath $nodePath `
            -ArgumentList "server/index.js" `
            -WorkingDirectory $RootDir `
            -WindowStyle Hidden `
            -RedirectStandardOutput $LogFile `
            -RedirectStandardError $ErrorLogFile `
            -PassThru -ErrorAction Stop
        $script:NodeProcess = $process
        Write-MarginLog "Backend started with PID $($process.Id)."
        return $true
    } catch {
        Write-MarginLog "Backend could not start: $_"
        return $false
    }
}

function Stop-MarginBackend {
    if ($script:NodeProcess) {
        try {
            if (-not $script:NodeProcess.HasExited) {
                Write-MarginLog "Stopping backend (PID $($script:NodeProcess.Id))."
                $script:NodeProcess.Kill()
                $script:NodeProcess.WaitForExit(3000) | Out-Null
            }
        } catch {
            Write-MarginLog "Backend did not stop cleanly: $_"
        }
        try { $script:NodeProcess.Dispose() } catch {}
        $script:NodeProcess = $null
    }
}

function Restart-MarginBackend {
    Stop-MarginBackend
    Start-Sleep -Milliseconds 800
    if (Start-MarginBackend) {
        $script:NotifyIcon.ShowBalloonTip(3000, "Margin", "The print room restarted.", [System.Windows.Forms.ToolTipIcon]::Info)
    } else {
        $script:NotifyIcon.ShowBalloonTip(5000, "Margin", "The print room could not restart. Open the logs to see why.", [System.Windows.Forms.ToolTipIcon]::Error)
    }
}

function Start-MarginTunnel {
    if ($script:Stopping) { return $false }
    if ($script:TunnelProcess -and -not $script:TunnelProcess.HasExited) {
        return $true
    }

    if ($script:TunnelProcess) {
        try { $script:TunnelProcess.Dispose() } catch {}
        $script:TunnelProcess = $null
    }

    if (-not (Test-Path $CloudflaredPath)) {
        Write-MarginLog "cloudflared was not found. The public API will stay offline."
        return $false
    }

    try {
        $process = Start-Process -FilePath $CloudflaredPath `
            -ArgumentList "tunnel --url http://127.0.0.1:$Port --no-autoupdate --logfile logs\tunnel.log --loglevel info" `
            -WorkingDirectory $RootDir `
            -WindowStyle Hidden `
            -PassThru -ErrorAction Stop
        $script:TunnelProcess = $process
        Write-MarginLog "Tunnel started with PID $($process.Id)."
        return $true
    } catch {
        Write-MarginLog "Tunnel could not start: $_"
        return $false
    }
}

function Stop-MarginTunnel {
    if ($script:TunnelProcess) {
        try {
            if (-not $script:TunnelProcess.HasExited) {
                Write-MarginLog "Stopping tunnel (PID $($script:TunnelProcess.Id))."
                $script:TunnelProcess.Kill()
                $script:TunnelProcess.WaitForExit(3000) | Out-Null
            }
        } catch {
            Write-MarginLog "Tunnel did not stop cleanly: $_"
        }
        try { $script:TunnelProcess.Dispose() } catch {}
        $script:TunnelProcess = $null
    }
}

function Get-PublicApiUrl {
    try {
        $envPath = Join-Path $RootDir ".env"
        if (-not (Test-Path -LiteralPath $envPath)) { return $null }
        $text = [System.IO.File]::ReadAllText($envPath)
        $match = [regex]::Match($text, '(?m)^MARGIN_PUBLIC_API_URL=(.+)$')
        if (-not $match.Success) { return $null }
        return $match.Groups[1].Value.Trim().TrimEnd('/')
    } catch {
        return $null
    }
}

# The public origin (the Vercel deployment) reads the tunnel from its own
# environment. Checking both ends tells us which half broke: a dead tunnel vs a
# deployment still pointing at an old tunnel name.
function Get-PublicOrigin {
    try {
        $envPath = Join-Path $RootDir ".env"
        if (-not (Test-Path -LiteralPath $envPath)) { return $null }
        $text = [System.IO.File]::ReadAllText($envPath)
        $match = [regex]::Match($text, '(?m)^MARGIN_PUBLIC_ORIGIN=(.+)$')
        if (-not $match.Success) { return $null }
        return $match.Groups[1].Value.Trim().TrimEnd('/')
    } catch {
        return $null
    }
}

function Test-MarginHealth {
    param([string]$Url, [int]$TimeoutSec = 8)
    if (-not $Url) { return $false }
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "$Url/api/health" -TimeoutSec $TimeoutSec
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Start-TunnelSync {
    param([switch]$Force)
    if ($script:TunnelRecovery -and -not $script:TunnelRecovery.HasExited) { return }

    $syncScript = Join-Path $ScriptDir "sync-tunnel.ps1"
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$syncScript`" -WaitSeconds 150"
    if ($Force) { $arguments += " -Force" }
    try {
        $script:TunnelRecovery = Start-Process -FilePath "powershell.exe" `
            -ArgumentList $arguments `
            -WorkingDirectory $RootDir `
            -WindowStyle Hidden `
            -PassThru -ErrorAction Stop
        Write-MarginLog "Tunnel sync started with PID $($script:TunnelRecovery.Id) (force=$([bool]$Force))."
    } catch {
        Write-MarginLog "Tunnel sync could not start: $_"
        $script:TunnelRecovery = $null
    }
}

# A Cloudflare quick tunnel can be revoked while cloudflared is still running.
# The process then retries "Tunnel not found" forever, so checking the process
# alone is not enough. Probe the public address; when it stays dark, replace the
# tunnel and let sync-tunnel.ps1 repoint Vercel at the new name.
function Repair-MarginTunnel {
    if ($script:Stopping) { return }
    if ($script:TunnelRecovery -and -not $script:TunnelRecovery.HasExited) { return }
    if ((Get-Date) - $script:LastTunnelRecovery -lt [TimeSpan]::FromMinutes(2)) {
        return
    }

    Write-MarginLog "Public tunnel is not answering. Replacing it and re-syncing Vercel."
    $script:LastTunnelRecovery = Get-Date
    $script:TunnelFailures = 0

    Stop-MarginTunnel

    # Start the sync first so it sees the URL the fresh tunnel writes.
    Start-TunnelSync
    Start-MarginTunnel | Out-Null
}

# Create the tray icon: vermillion disc with a registration cross.
$iconBitmap = New-Object System.Drawing.Bitmap 32, 32
$graphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$brushBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(239, 84, 47))
$graphics.FillEllipse($brushBg, 2, 2, 28, 28)

$penMark = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(241, 237, 227)), 2
$graphics.DrawLine($penMark, 16, 6, 16, 26)
$graphics.DrawLine($penMark, 6, 16, 26, 16)
$graphics.DrawEllipse($penMark, 11, 11, 10, 10)

$graphics.Dispose()
$iconHandle = $iconBitmap.GetHicon()
$appIcon = [System.Drawing.Icon]::FromHandle($iconHandle)

$script:NotifyIcon = New-Object System.Windows.Forms.NotifyIcon
$script:NotifyIcon.Icon = $appIcon
$script:NotifyIcon.Text = "Margin print room"
$script:NotifyIcon.Visible = $true

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip

$menuOpen = $contextMenu.Items.Add("Open Margin in Browser")
$menuOpen.Font = New-Object System.Drawing.Font($menuOpen.Font, [System.Drawing.FontStyle]::Bold)
$menuOpen.add_Click({
    Start-Process "http://localhost:$Port"
})

$menuRestart = $contextMenu.Items.Add("Restart Backend")
$menuRestart.add_Click({
    Restart-MarginBackend
})

$menuLogs = $contextMenu.Items.Add("View Logs")
$menuLogs.add_Click({
    if (Test-Path $LogFile) {
        Start-Process "notepad.exe" $LogFile
    } else {
        [System.Windows.Forms.MessageBox]::Show("The log file has not been created yet.", "Margin")
    }
})

$menuFolder = $contextMenu.Items.Add("Open Data Folder")
$menuFolder.add_Click({
    $dataDir = Join-Path $RootDir "data"
    if (-not (Test-Path $dataDir)) {
        New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    }
    Start-Process "explorer.exe" $dataDir
})

$contextMenu.Items.Add("-") | Out-Null

$menuExit = $contextMenu.Items.Add("Exit Margin")
$menuExit.add_Click({
    $script:Stopping = $true
    [System.Windows.Forms.Application]::Exit()
})

$script:NotifyIcon.ContextMenuStrip = $contextMenu

$script:NotifyIcon.add_DoubleClick({
    Start-Process "http://localhost:$Port"
})

# Supervise the backend. A crash or an accidental close is repaired on the
# next tick instead of waiting for someone to notice the room is dark.
$script:Watchdog = New-Object System.Windows.Forms.Timer
$script:Watchdog.Interval = 10000
$script:Watchdog.add_Tick({
    if ($script:Stopping) { return }
    if (-not $script:NodeProcess -or $script:NodeProcess.HasExited) {
        $code = "unknown"
        if ($script:NodeProcess) {
            try { $code = $script:NodeProcess.ExitCode } catch {}
        }
        Write-MarginLog "Backend is not running (exit $code). Restarting it."
        if (Start-MarginBackend) {
            $script:NotifyIcon.ShowBalloonTip(2000, "Margin", "The print room is back online.", [System.Windows.Forms.ToolTipIcon]::Info)
        }
    }
    if (-not $script:TunnelProcess -or $script:TunnelProcess.HasExited) {
        Write-MarginLog "Tunnel is not running. Restarting it."
        Start-MarginTunnel | Out-Null
    }
})

# Separate, slower watchdog for the public path. The backend can be healthy
# while the tunnel name is dead, which is exactly what members see when a login
# fails with a gateway error.
$script:TunnelWatchdog = New-Object System.Windows.Forms.Timer
$script:TunnelWatchdog.Interval = 30000
$script:TunnelWatchdog.add_Tick({
    if ($script:Stopping) { return }
    if ($script:TunnelRecovery) {
        if (-not $script:TunnelRecovery.HasExited) { return }
        try { $script:TunnelRecovery.Dispose() } catch {}
        $script:TunnelRecovery = $null
        $script:TunnelFailures = 0
    }
    if (-not $script:TunnelProcess -or $script:TunnelProcess.HasExited) { return }

    $tunnelUrl = Get-PublicApiUrl
    $originUrl = Get-PublicOrigin
    if (-not $tunnelUrl -and -not $originUrl) { return }

    $tunnelUp = Test-MarginHealth $tunnelUrl 6
    $originUp = Test-MarginHealth $originUrl 8

    if ($originUp) {
        $script:TunnelFailures = 0
        return
    }

    if ($tunnelUp) {
        # The tunnel answers but the public deployment does not. That is a
        # stale Vercel environment, not a dead tunnel: redeploy against the
        # current address instead of replacing a working tunnel.
        $script:TunnelFailures += 1
        Write-MarginLog "Public origin health check failed while the tunnel is up ($($script:TunnelFailures)/2)."
        if ($script:TunnelFailures -ge 2) {
            if ((Get-Date) - $script:LastTunnelRecovery -ge [TimeSpan]::FromMinutes(2)) {
                $script:LastTunnelRecovery = Get-Date
                $script:TunnelFailures = 0
                Write-MarginLog "Re-syncing Vercel with the current healthy tunnel."
                Start-TunnelSync -Force
            }
        }
        return
    }

    $script:TunnelFailures += 1
    Write-MarginLog "Public tunnel health check failed ($($script:TunnelFailures)/2)."
    if ($script:TunnelFailures -ge 2) {
        Repair-MarginTunnel
    }
})

$started = Start-MarginBackend
Start-MarginTunnel | Out-Null
if ($started) {
    $script:NotifyIcon.ShowBalloonTip(3000, "Margin", "Print room is running in the background at http://localhost:$Port", [System.Windows.Forms.ToolTipIcon]::Info)
} else {
    $script:NotifyIcon.ShowBalloonTip(6000, "Margin", "The print room could not start. Right-click the tray icon and choose View Logs.", [System.Windows.Forms.ToolTipIcon]::Error)
}
$script:Watchdog.Start()
$script:TunnelWatchdog.Start()

try {
    [System.Windows.Forms.Application]::Run()
} finally {
    $script:Stopping = $true
    try { $script:Watchdog.Stop() } catch {}
    try { $script:TunnelWatchdog.Stop() } catch {}
    Stop-MarginTunnel
    Stop-MarginBackend
    try {
        $script:NotifyIcon.Visible = $false
        $script:NotifyIcon.Dispose()
    } catch {}
    if ($script:Mutex) {
        try { $script:Mutex.ReleaseMutex() } catch {}
        try { $script:Mutex.Dispose() } catch {}
    }
}
