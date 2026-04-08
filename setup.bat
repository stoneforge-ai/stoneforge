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

echo [ok]    Created sf.bat (run "sf" from this folder)

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
echo   Start the dashboard:
echo.
echo     sf serve
echo.
echo   Then open http://localhost:3457 in your browser.
echo.
echo   What's next:
echo   1. Open the dashboard
echo   2. Go to Work -^> Tasks -^> + New Task
echo   3. Create a task and watch your agents work
echo.
echo   Read more: GETTING_STARTED.md
echo.

endlocal
