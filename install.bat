@echo off
title BioSwitch - Installation
mode con: cols=52 lines=16
cls
color 1F

echo.
echo   ==========================================
echo.
echo        B I O S W I T C H
echo        Installation
echo.
echo   ==========================================
echo.

cd /d "%~dp0"

echo   [1/2] Installation des dependances...
echo.
call npm install
if %errorlevel% neq 0 (
    color 4F
    echo   ERREUR lors de npm install.
    pause
    exit /b 1
)

echo.
echo   [2/2] Construction de l'application...
echo.
call npm run build
if %errorlevel% neq 0 (
    color 4F
    echo   ERREUR lors du build.
    pause
    exit /b 1
)

echo.
color 2F
echo   ==========================================
echo   Installation terminee avec succes !
echo   Utilisez "Demarrer BioSwitch.bat" pour
echo   lancer le tableau de bord.
echo   ==========================================
echo.
pause
