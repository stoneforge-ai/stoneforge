# Stoneforge Windows Setup Script
# Run this in PowerShell (as Administrator for best results)
# Usage: .\setup.ps1

$ErrorActionPreference = "Stop"

function Write-Info  { Write-Host "[info]  $args" -ForegroundColor Cyan }
function Write-Ok    { Write-Host "[ok]    $args" -ForegroundColor Green }
function Write-Warn  { Write-Host "[warn]  $args" -ForegroundColor Yellow }
function Write-Fail  { Write-Host "[error] $args" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "======================================" -ForegroundColor White
Write-Host "       Stoneforge Setup               " -ForegroundColor White
Write-Host "  Multi-Agent Orchestration Platform  " -ForegroundColor White
Write-Host "======================================" -ForegroundColor White
Write-Host ""

# --------------------------------------------------------------------------
# Step 1: Check Node.js
# --------------------------------------------------------------------------
Write-Info "Checking Node.js..."

try {
    $nodeVersion = node -v 2>$null
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($nodeMajor -lt 18) {
        Write-Fail "Node.js version 18+ required. You have $nodeVersion. Download from: https://nodejs.org/"
    }
    Write-Ok "Node.js $nodeVersion"
} catch {
    Write-Fail "Node.js is not installed. Download and install from: https://nodejs.org/ (get the LTS version)"
}

# --------------------------------------------------------------------------
# Step 2: Check git
# --------------------------------------------------------------------------
Write-Info "Checking git..."

try {
    $gitVersion = git --version 2>$null
    Write-Ok "$gitVersion"
} catch {
    Write-Fail "Git is not installed. Download from: https://git-scm.com/"
}

# --------------------------------------------------------------------------
# Step 3: Install pnpm (if needed)
# --------------------------------------------------------------------------
Write-Info "Checking pnpm..."

$pnpmInstalled = $null -ne (Get-Command pnpm -ErrorAction SilentlyContinue)

if (-not $pnpmInstalled) {
    Write-Warn "pnpm not found. Installing..."
    npm install -g pnpm@8
    $pnpmInstalled = $null -ne (Get-Command pnpm -ErrorAction SilentlyContinue)
    if (-not $pnpmInstalled) {
        Write-Fail "Failed to install pnpm. Try running PowerShell as Administrator."
    }
}

$pnpmVersion = pnpm --version
Write-Ok "pnpm $pnpmVersion"

# --------------------------------------------------------------------------
# Step 4: Install dependencies
# --------------------------------------------------------------------------
Write-Info "Installing dependencies (this may take a minute)..."
pnpm install --reporter=silent
Write-Ok "Dependencies installed"

# --------------------------------------------------------------------------
# Step 5: Build all packages
# --------------------------------------------------------------------------
Write-Info "Building packages (this may take 1-2 minutes)..."
pnpm build
Write-Ok "Build complete"

# --------------------------------------------------------------------------
# Step 6: Create sf.bat wrapper
# --------------------------------------------------------------------------
Write-Info "Setting up sf command..."

$sfBin = Join-Path $PSScriptRoot "packages\smithy\dist\bin\sf.js"

if (-not (Test-Path $sfBin)) {
    Write-Fail "Build did not produce sf CLI at $sfBin"
}

# Create sf.bat in the repo root so you can run "sf" from anywhere inside it
$sfBat = Join-Path $PSScriptRoot "sf.bat"
$sfBatContent = "@echo off`nnode `"$sfBin`" %*"
Set-Content -Path $sfBat -Value $sfBatContent -Encoding ASCII
Write-Ok "Created sf.bat in repo folder"

# Also try to add to PATH permanently (requires admin, will warn if it fails)
try {
    $currentPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    if ($currentPath -notlike "*$PSScriptRoot*") {
        [System.Environment]::SetEnvironmentVariable("PATH", "$currentPath;$PSScriptRoot", "User")
        Write-Ok "Added Stoneforge folder to your PATH (restart PowerShell to take effect)"
    } else {
        Write-Ok "Stoneforge folder already in PATH"
    }
} catch {
    Write-Warn "Could not add to PATH automatically. You can run 'sf' using '.\sf' from the stoneforge folder."
}

# --------------------------------------------------------------------------
# Step 7: Initialize workspace
# --------------------------------------------------------------------------
Write-Info "Initializing Stoneforge workspace..."

$dbPath = Join-Path $PSScriptRoot ".stoneforge\stoneforge.db"
if (Test-Path $dbPath) {
    Write-Ok "Workspace already initialized"
} else {
    node $sfBin init
    Write-Ok "Workspace initialized"
}

# --------------------------------------------------------------------------
# Step 8: Check for Claude Code
# --------------------------------------------------------------------------
Write-Host ""
$claudeInstalled = $null -ne (Get-Command claude -ErrorAction SilentlyContinue)

if ($claudeInstalled) {
    Write-Ok "Claude Code CLI detected"
} else {
    Write-Warn "Claude Code is NOT installed."
    Write-Host ""
    Write-Host "  Agents need Claude Code to run. Install it:" -ForegroundColor White
    Write-Host ""
    Write-Host "    npm install -g @anthropic-ai/claude-code" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Then sign in by running: claude" -ForegroundColor White
    Write-Host "  Get a subscription at: https://claude.ai/settings/billing" -ForegroundColor White
    Write-Host ""
}

# --------------------------------------------------------------------------
# Done!
# --------------------------------------------------------------------------
Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Start the dashboard:" -ForegroundColor White
Write-Host ""
Write-Host "    .\sf serve" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Then open http://localhost:3457 in your browser." -ForegroundColor White
Write-Host ""
Write-Host "  What's next:" -ForegroundColor White
Write-Host "  1. Open the dashboard" -ForegroundColor White
Write-Host "  2. Go to Work -> Tasks -> + New Task" -ForegroundColor White
Write-Host "  3. Create a task and watch your agents work" -ForegroundColor White
Write-Host ""
Write-Host "  Read more: GETTING_STARTED.md" -ForegroundColor Cyan
Write-Host ""
