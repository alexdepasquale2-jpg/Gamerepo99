' Runs sync.ps1 with no window. Task Scheduler calls this every 5 minutes.
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -File """ & dir & "\sync.ps1""", 0, True
