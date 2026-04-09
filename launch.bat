@echo off
setlocal enabledelayedexpansion
title Stoneforge

REM ============================================================================
REM Stoneforge Launcher
REM Double-click this file to start the dashboard.
REM ============================================================================

echo.
echo   Starting Stoneforge...
echo.

REM Check if Node.js is available
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo   Node.js is not installed!
    echo.
    echo   Download it from: https://nodejs.org/
    echo   Install the LTS version, then double-click this file again.
    echo.
    pause
    exit /b 1
)

REM Check if setup is needed (no built CLI or no dependencies)
set "SF_BIN=%~dp0packages\smithy\dist\bin\sf.js"
if not exist "%SF_BIN%" goto :run_setup
if not exist "%~dp0node_modules" goto :run_setup
goto :skip_setup

:run_setup
echo   First-time setup detected. This takes 2-3 minutes...
echo   (Installing dependencies and building packages)
echo.
set "SF_LAUNCHED=1"
call "%~dp0setup.bat"
if %errorlevel% neq 0 (
    echo.
    echo   Setup failed! See the errors above.
    echo.
    pause
    exit /b 1
)
echo.
echo   Setup complete! Starting server...
echo.

:skip_setup

REM Check if server is already running on port 3457
netstat -ano | findstr ":3457 " | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 (
    echo   Stoneforge is already running!
    echo   Opening dashboard...
    start http://localhost:3457
    timeout /t 2 /nobreak >nul
    exit /b 0
)

REM Initialize workspace if needed
if not exist "%~dp0.stoneforge\stoneforge.db" (
    echo   First run - initializing workspace...
    node "%SF_BIN%" init
    echo.
)

REM Start server in a minimized window
echo   Starting server...
start "Stoneforge Server" /min cmd /c "node "%SF_BIN%" serve"

REM Wait for server to be ready (up to 15 seconds)
echo   Waiting for server to be ready...
for /l %%i in (1,1,15) do (
    timeout /t 1 /nobreak >nul
    netstat -ano | findstr ":3457 " | findstr "LISTENING" >nul 2>nul
    if !errorlevel! equ 0 goto :ready
)

echo   Server is taking longer than expected. Opening browser anyway...
goto :open

:ready
echo   Server is ready!

:open
echo.
echo   Opening dashboard in your browser...
start http://localhost:3457
echo.
echo   ==========================================
echo   Stoneforge is running!
echo   ==========================================
echo.
echo   Dashboard: http://localhost:3457
echo.
echo   To stop: close the "Stoneforge Server" window.
echo   You can close THIS window - the server keeps running.
echo.
pause

endlocal
