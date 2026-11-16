Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
TrayScript = fso.BuildPath(ScriptDir, "tray.ps1")
Cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & TrayScript & """"
WshShell.Run Cmd, 0, False
