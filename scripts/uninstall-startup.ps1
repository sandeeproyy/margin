$ErrorActionPreference = 'Stop'

$StartupFolder = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$ShortcutPath = Join-Path $StartupFolder "Margin.lnk"

if (Test-Path $ShortcutPath) {
    Remove-Item -Path $ShortcutPath -Force
    Write-Host "Margin startup shortcut removed from $ShortcutPath"
} else {
    Write-Host "Margin startup shortcut was not found in $ShortcutPath"
}
