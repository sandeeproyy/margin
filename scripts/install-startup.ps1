$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$VbsPath = Join-Path $ScriptDir "start-hidden.vbs"
$StartupFolder = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$ShortcutPath = Join-Path $StartupFolder "Margin.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$VbsPath`""
$Shortcut.WorkingDirectory = (Split-Path -Parent $ScriptDir)
$Shortcut.Description = "Margin Print Room (Background Tray)"
$Shortcut.Save()

Write-Host "Margin startup shortcut created:"
Write-Host "  Path: $ShortcutPath"
Write-Host "  Target: $VbsPath"
Write-Host "Margin will now start automatically in the hidden icons tray when you log in."
