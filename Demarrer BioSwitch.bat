@echo off
title BioSwitch Dashboard
mode con: cols=52 lines=16
cls
color 1F

echo.
echo   ==========================================
echo.
echo        B I O S W I T C H
echo        Tableau de bord administrateur
echo.
echo   ==========================================
echo.

cd /d "%~dp0"

:: Always rebuild to pick up latest changes
echo   Construction de la derniere version...
echo.
call npm run build
if %errorlevel% neq 0 (
    color 4F
    echo   ERREUR : echec du build.
    echo   Relancez install.bat et reessayez.
    pause
    exit /b 1
)
cls
color 1F
echo.
echo   ==========================================
echo.
echo        B I O S W I T C H
echo        Tableau de bord administrateur
echo.
echo   ==========================================
echo.

:: Kill anything already on port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Start server as a silent hidden process (no window, survives close)
wscript "%~dp0start-server.vbs" "%~dp0"

:: Animated spinner — waits until server actually responds
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bioswitch-loader.ps1"
if %errorlevel% neq 0 (
    color 4F
    echo   ERREUR : le serveur n'a pas demarre.
    echo   Verifiez que Node.js est installe.
    pause
    exit /b 1
)

:: Open browser
start "" "http://localhost:3000"

echo.
echo   Vous pouvez fermer cette fenetre.
echo.
timeout /t 3 /nobreak >nul
exit
