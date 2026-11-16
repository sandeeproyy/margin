param(
    [int]$Port = 3000
)

$ErrorActionPreference = 'SilentlyContinue'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $ScriptDir
$LogsDir = Join-Path $RootDir "logs"
$LogFile = Join-Path $LogsDir "margin.log"

if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
}

$Global:NodeProcess = $null

function Start-MarginBackend {
    if ($Global:NodeProcess -and -not $Global:NodeProcess.HasExited) {
        return
    }

    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path $LogFile -Value "[$timestamp] [tray] Starting Margin backend..."

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "node.exe"
    $startInfo.Arguments = "server/index.js"
    $startInfo.WorkingDirectory = $RootDir
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $Global:NodeProcess = New-Object System.Diagnostics.Process
    $Global:NodeProcess.StartInfo = $startInfo

    # Event handlers for log redirection
    Register-ObjectEvent -InputObject $Global:NodeProcess -EventName OutputDataReceived -Action {
        if ($EventArgs.Data) {
            Add-Content -Path $using:LogFile -Value $EventArgs.Data
        }
    } | Out-Null

    Register-ObjectEvent -InputObject $Global:NodeProcess -EventName ErrorDataReceived -Action {
        if ($EventArgs.Data) {
            Add-Content -Path $using:LogFile -Value "[ERROR] $($EventArgs.Data)"
        }
    } | Out-Null

    try {
        $started = $Global:NodeProcess.Start()
        if ($started) {
            $Global:NodeProcess.BeginOutputReadLine()
            $Global:NodeProcess.BeginErrorReadLine()
            Add-Content -Path $LogFile -Value "[$timestamp] [tray] Backend started with PID $($Global:NodeProcess.Id)"
        } else {
            Add-Content -Path $LogFile -Value "[$timestamp] [tray] Failed to start backend process."
        }
    } catch {
        Add-Content -Path $LogFile -Value "[$timestamp] [tray] Exception starting backend: $_"
    }
}

function Stop-MarginBackend {
    if ($Global:NodeProcess -and -not $Global:NodeProcess.HasExited) {
        $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        Add-Content -Path $LogFile -Value "[$timestamp] [tray] Stopping backend (PID $($Global:NodeProcess.Id))..."
        try {
            $Global:NodeProcess.Kill()
            $Global:NodeProcess.WaitForExit(3000)
        } catch {}
    }
    $Global:NodeProcess = $null
}

function Restart-MarginBackend {
    Stop-MarginBackend
    Start-Sleep -Milliseconds 800
    Start-MarginBackend
    $Global:NotifyIcon.ShowBalloonTip(3000, "Margin", "Margin print room restarted.", [System.Windows.Forms.ToolTipIcon]::Info)
}

# Create Tray Icon Bitmap (Vermillion square with registration cross)
$iconBitmap = New-Object System.Drawing.Bitmap 32, 32
$graphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Background: warm vermillion circle
$brushBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(239, 84, 47))
$graphics.FillEllipse($brushBg, 2, 2, 28, 28)

# Center registration mark: warm paper color
$penMark = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(241, 237, 227)), 2
$graphics.DrawLine($penMark, 16, 6, 16, 26)
$graphics.DrawLine($penMark, 6, 16, 26, 16)
$graphics.DrawEllipse($penMark, 11, 11, 10, 10)

$graphics.Dispose()
$iconHandle = $iconBitmap.GetHicon()
$appIcon = [System.Drawing.Icon]::FromHandle($iconHandle)

# Create NotifyIcon
$Global:NotifyIcon = New-Object System.Windows.Forms.NotifyIcon
$Global:NotifyIcon.Icon = $appIcon
$Global:NotifyIcon.Text = "Margin Print Room (Active)"
$Global:NotifyIcon.Visible = $true

# Context Menu
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
        [System.Windows.Forms.MessageBox]::Show("Log file not created yet.", "Margin")
    }
})

$contextMenu.Items.Add("-") | Out-Null

$menuExit = $contextMenu.Items.Add("Exit Margin")
$menuExit.add_Click({
    Stop-MarginBackend
    $Global:NotifyIcon.Visible = $false
    $Global:NotifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

$Global:NotifyIcon.ContextMenuStrip = $contextMenu

# Double click opens Margin
$Global:NotifyIcon.add_DoubleClick({
    Start-Process "http://localhost:$Port"
})

# Start backend
Start-MarginBackend

# Show startup balloon
$Global:NotifyIcon.ShowBalloonTip(3000, "Margin", "Print room is running in background at http://localhost:$Port", [System.Windows.Forms.ToolTipIcon]::Info)

# Run message loop
[System.Windows.Forms.Application]::Run()
