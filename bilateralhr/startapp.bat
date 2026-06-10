@echo off
title BilateralHR - Local App

set "FRONTEND_DIR=%~dp0"
for %%I in ("%FRONTEND_DIR%..") do set "ROOT_DIR=%%~fI"
set "BACKEND_DIR=%ROOT_DIR%\backend"

echo Pornesc aplicatia BilateralHR cu backend local...
echo.

if not exist "%BACKEND_DIR%\package.json" (
    echo Nu gasesc backend-ul la: %BACKEND_DIR%
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%package.json" (
    echo Nu gasesc frontend-ul la: %FRONTEND_DIR%
    pause
    exit /b 1
)

echo Curat porturile aplicatiei, ca sa nu deschidem un server vechi sau alt proiect...
call :kill_port 3000 "frontend Next.js"
call :kill_port 4001 "backend local"
echo.

if exist "%FRONTEND_DIR%.next" (
    echo Curat cache-ul Next.js...
    rmdir /s /q "%FRONTEND_DIR%.next"
)

echo Pornesc backend-ul local pe http://localhost:4001...
start "BilateralHR Backend API" /D "%BACKEND_DIR%" cmd /k "set PORT=4001&& npm.cmd run start"

echo.
echo Pornesc frontend-ul Next.js pe http://localhost:3000...
start "BilateralHR Frontend" /D "%FRONTEND_DIR%" cmd /k "set PORT=3000&& npm.cmd run dev -- --port 3000"

echo.
echo Astept cateva secunde, apoi deschid browserul...
call :wait_for_url "http://localhost:3000" 20
if errorlevel 1 (
    echo Frontend-ul inca porneste. Deschid browserul oricum; daca pagina nu apare imediat, asteapta cateva secunde si da refresh.
)

echo Deschid browserul la pagina de login...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process 'http://localhost:3000/login'" >nul 2>nul
if errorlevel 1 (
    start "" "http://localhost:3000/login"
)

echo.
echo Aplicatia a fost pornita.
echo Frontend: http://localhost:3000
echo Backend:  http://localhost:4001
pause
exit /b

:kill_port
set "PORT=%~1"
set "LABEL=%~2"
set "FOUND="

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do (
    set "FOUND=1"
    echo Opresc %LABEL% de pe portul %PORT%. PID: %%a
    taskkill /PID %%a /T /F >nul 2>nul
)

if not defined FOUND (
    echo Nu am gasit %LABEL% pornit pe portul %PORT%.
)

exit /b 0

:wait_for_url
set "URL=%~1"
set "TRIES=%~2"

for /l %%i in (1,1,%TRIES%) do (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
    if not errorlevel 1 (
        echo Frontend-ul este gata.
        exit /b 0
    )
    timeout /t 1 >nul
)

exit /b 1
