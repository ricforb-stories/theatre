@echo off
rem Puts a "Theatre" shortcut with the app icon on your desktop (a .bat file itself cannot have an icon).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Theatre.lnk'); $shortcut.TargetPath = '%~dp0start.bat'; $shortcut.WorkingDirectory = '%~dp0'; $shortcut.IconLocation = '%~dp0theatre.ico'; $shortcut.WindowStyle = 7; $shortcut.Description = 'Start Theatre'; $shortcut.Save()"
echo A Theatre shortcut with the pickle icon is now on your desktop.
pause
