$ErrorActionPreference = 'SilentlyContinue'

Write-Host "Stopping Margin processes..."

# Stop node process running margin server/index.js
Get-CimInstance Win32_Process | Where-Object { 
    $_.CommandLine -match 'node(\.exe)?\s+server/index\.js' -or
    ($_.CommandLine -match 'server/index\.js' -and $_.Name -match 'node')
} | ForEach-Object {
    Write-Host "Stopping Node server (PID $($_.ProcessId))..."
    Stop-Process -Id $_.ProcessId -Force
}

# Stop tray powershell script
Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -match 'tray\.ps1'
} | ForEach-Object {
    Write-Host "Stopping Margin Tray (PID $($_.ProcessId))..."
    Stop-Process -Id $_.ProcessId -Force
}

# Stop the Cloudflare tunnel this tray started.
Get-CimInstance Win32_Process | Where-Object {
    $_.Name -like '*cloudflared*' -and
    $_.CommandLine -match '127\.0\.0\.1:3000'
} | ForEach-Object {
    Write-Host "Stopping Cloudflare tunnel (PID $($_.ProcessId))..."
    Stop-Process -Id $_.ProcessId -Force
}

Write-Host "Margin stopped."
