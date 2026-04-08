@echo off
setlocal enabledelayedexpansion

REM ============================================================================
REM Stoneforge Setup Script for Windows
REM One command to install, build, and initialize Stoneforge.
REM
REM Usage:
REM   git clone https://github.com/stoneforge-ai/stoneforge.git
REM   cd stoneforge
REM   setup.bat
REM ============================================================================

echo.
echo ======================================
echo        Stoneforge Setup
echo   Multi-Agent Orchestration Platform
echo ======================================
echo.

REM --------------------------------------------------------------------------
REM Step 1: Check Node.js
REM --------------------------------------------------------------------------
echo [info]  Checking Node.js...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [error] Node.js is not installed.
    echo         Download and install from: https://nodejs.org/
    echo         You need version 18 or higher.
    exit /b 1
)

for /f "tokens=1 delims=." %%a in ('node -v') do set NODE_RAW=%%a
set NODE_MAJOR=%NODE_RAW:v=%
if %NODE_MAJOR% lss 18 (
    echo [error] Node.js 18+ required. You have:
    node -v
    echo         Update from: https://nodejs.org/
    exit /b 1
)

for /f %%v in ('node -v') do echo [ok]    Node.js %%v

REM --------------------------------------------------------------------------
REM Step 2: Check git
REM --------------------------------------------------------------------------
echo [info]  Checking git...

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [error] Git is not installed.
    echo         Download from: https://git-scm.com/
    exit /b 1
)

for /f "tokens=3" %%v in ('git --version') do echo [ok]    git %%v

REM --------------------------------------------------------------------------
REM Step 3: Install pnpm (if needed)
REM --------------------------------------------------------------------------
echo [info]  Checking pnpm...

where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo [warn]  pnpm not found. Installing...
    call npm install -g pnpm@8
    where pnpm >nul 2>nul
    if %errorlevel% neq 0 (
        echo [error] Failed to install pnpm. Try: npm install -g pnpm
        exit /b 1
    )
)

for /f %%v in ('pnpm --version') do echo [ok]    pnpm %%v

REM --------------------------------------------------------------------------
REM Step 4: Install dependencies
REM --------------------------------------------------------------------------
echo [info]  Installing dependencies (this may take a minute)...
call pnpm install
if %errorlevel% neq 0 (
    echo [error] pnpm install failed.
    exit /b 1
)
echo [ok]    Dependencies installed

REM --------------------------------------------------------------------------
REM Step 5: Build all packages
REM --------------------------------------------------------------------------
echo [info]  Building packages (this may take 1-2 minutes)...
call pnpm build
if %errorlevel% neq 0 (
    echo [error] Build failed.
    exit /b 1
)
echo [ok]    Build complete

REM --------------------------------------------------------------------------
REM Step 6: Create sf.bat wrapper
REM --------------------------------------------------------------------------
echo [info]  Setting up sf command...

set SF_BIN=%~dp0packages\smithy\dist\bin\sf.js

if not exist "%SF_BIN%" (
    echo [error] Build did not produce sf CLI at %SF_BIN%
    exit /b 1
)

echo @echo off> "%~dp0sf.bat"
echo node "%SF_BIN%" %%*>> "%~dp0sf.bat"

echo [ok]    Created sf.bat

REM Add repo folder to user PATH so "sf" works from anywhere
echo [info]  Adding Stoneforge to PATH...
set "REPO_DIR=%~dp0"
REM Remove trailing backslash for cleaner PATH entry
if "%REPO_DIR:~-1%"=="\" set "REPO_DIR=%REPO_DIR:~0,-1%"

echo %PATH% | findstr /i /c:"%REPO_DIR%" >nul 2>nul
if %errorlevel% neq 0 (
    for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%B"
    if defined USER_PATH (
        setx PATH "%USER_PATH%;%REPO_DIR%" >nul 2>nul
    ) else (
        setx PATH "%REPO_DIR%" >nul 2>nul
    )
    set "PATH=%PATH%;%REPO_DIR%"
    echo [ok]    Added to PATH
) else (
    echo [ok]    Already in PATH
)

REM --------------------------------------------------------------------------
REM Step 7: Initialize workspace
REM --------------------------------------------------------------------------
echo [info]  Initializing Stoneforge workspace...

if exist "%~dp0.stoneforge\stoneforge.db" (
    echo [ok]    Workspace already initialized
) else (
    call node "%SF_BIN%" init
    echo [ok]    Workspace initialized
)

REM --------------------------------------------------------------------------
REM Step 8: Check for Claude Code
REM --------------------------------------------------------------------------
echo.

where claude >nul 2>nul
if %errorlevel% equ 0 (
    echo [ok]    Claude Code CLI detected
) else (
    echo [warn]  Claude Code is NOT installed.
    echo.
    echo         Agents need Claude Code to run. Install it:
    echo.
    echo           npm install -g @anthropic-ai/claude-code
    echo.
    echo         Then sign in by running: claude
    echo         Get a subscription at: https://claude.ai/settings/billing
    echo.
)

REM --------------------------------------------------------------------------
REM Done!
REM --------------------------------------------------------------------------
echo.
echo ======================================
echo   Setup complete!
echo ======================================
echo.
echo   IMPORTANT: Close this terminal and open a new one!
echo   (This is needed so your computer can find the "sf" command.)
echo.
echo   Then run:
echo.
echo     sf serve
echo.
echo   Then open http://localhost:3457 in your browser.
echo.
echo   What's next:
echo   1. Close this terminal, open a new one
echo   2. Run: sf serve
echo   3. Open http://localhost:3457 in your browser
echo   4. Go to Work -^> Tasks -^> + New Task
echo   5. Create a task and watch your agents work
echo.
echo   Read more: GETTING_STARTED.md
echo.

endlocal
