@echo off
title BilateralHR - Stop Local App

echo Opresc aplicatia BilateralHR...
echo.

call :kill_port 3000 "frontend Next.js"
call :kill_port 4001 "backend local"

echo.
echo Aplicatia a fost oprita.
pause
exit /b

:kill_port
set "PORT=%~1"
set "LABEL=%~2"
set "FOUND="

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do (
    set "FOUND=1"
    echo Opresc %LABEL% de pe portul %PORT%. PID: %%a
    taskkill /PID %%a /T /F
)

if not defined FOUND (
    echo Nu am gasit %LABEL% pornit pe portul %PORT%.
)

exit /b
