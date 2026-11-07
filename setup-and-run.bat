@echo off
REM Drony - runs the TEAMMATE_GUIDE setup steps (Part 1, steps 5-9) and then
REM starts the app (Part 2). Double-click this file from the Drony folder.
REM Everything is also written to setup-log.txt next to this file.
setlocal
cd /d "%~dp0"
set "LOG=%~dp0setup-log.txt"

echo Running Drony setup. This can take 5-15 minutes (pip installs PyTorch).
echo Progress is being written to setup-log.txt - please wait...
call :main > "%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
type "%LOG%"

if not "%RC%"=="0" (
  echo.
  echo ==== Stopped: a step failed. The error is above and in setup-log.txt ====
  pause
  exit /b 1
)

echo.
echo ==== Starting the app (Part 2) ====
start "Drony backend" /D "%~dp0backend" cmd /k npm run dev
timeout /t 5 /nobreak >nul
start "Drony frontend" /D "%~dp0frontend" cmd /k npm run dev
echo.
echo Two windows opened: "Drony backend" (port 5001) and "Drony frontend".
echo Open http://localhost:5173 in Chrome or Edge. Stop either with Ctrl+C.
pause
exit /b 0


:main
echo [%date% %time%] Drony setup started in %CD%

echo.
echo ==== [1] Checking tools ====
where node || (echo [X] Node.js not found. Install the LTS from https://nodejs.org & exit /b 1)
where python || (echo [X] Python not found. Install from python.org and tick "Add python.exe to PATH" & exit /b 1)
call node -v
call npm -v
python --version
where git && git --version

echo.
echo ==== Port 5001 check ====
netstat -ano | findstr /R /C:":5001 .*LISTENING" && (
  echo [X] Something is already listening on port 5001 - probably an old backend.
  echo     Close that window with Ctrl+C first, then run this file again.
  exit /b 1
)
echo Port 5001 is free.

echo.
echo ==== [5] Backend packages: npm install ====
cd /d "%~dp0backend"
if not exist ".env" (echo [X] backend\.env is missing - ask the team lead for the values & exit /b 1)
call npm install || (echo [X] backend npm install failed & exit /b 1)

echo.
echo ==== [7] Database: prisma generate ====
call npx --no prisma generate --config=database/prisma7.config.ts || (echo [X] prisma generate failed & exit /b 1)

echo.
echo ==== [7] Database: prisma migrate deploy ====
call npx --no prisma migrate deploy --config=database/prisma7.config.ts || (echo [X] prisma migrate deploy failed & exit /b 1)

echo.
echo ==== [8] Python packages: pip install -r ML\requirements.txt ====
python -m pip install -r ML\requirements.txt || (echo [X] pip install failed & exit /b 1)

echo.
echo ==== [9] Frontend packages: npm install ====
cd /d "%~dp0frontend"
call npm install || (echo [X] frontend npm install failed & exit /b 1)

echo.
echo [%date% %time%] All setup steps finished OK.
exit /b 0
