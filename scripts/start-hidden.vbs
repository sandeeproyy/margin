Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
TrayScript = fso.BuildPath(ScriptDir, "tray.ps1")
SyncScript = fso.BuildPath(ScriptDir, "sync-tunnel.ps1")
TrayCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & TrayScript & """"
SyncCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & SyncScript & """"
WshShell.Run TrayCmd, 0, False
' Give the tunnel a moment to start before the sync loop begins.
WScript.Sleep 5000
WshShell.Run SyncCmd, 0, False
