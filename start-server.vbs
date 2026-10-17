Dim oShell, dir
Set oShell = WScript.CreateObject("WScript.Shell")
dir = WScript.Arguments(0)
oShell.Run "node """ & dir & "node_modules\next\dist\bin\next"" start -p 3000", 0, False
Set oShell = Nothing
