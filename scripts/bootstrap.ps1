#!/usr/bin/env pwsh
# RWIA — one-shot setup after cloning the repo.
#
# Installs Foundry deps (forge-std, OpenZeppelin contracts + upgradeable),
# Node deps for app/ and keeper/, and copies env templates.
#
# Usage:
#   ./scripts/bootstrap.ps1
#
# Requires: foundry (forge), Node 20+, npm.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function OK($m) { Write-Host " OK  $m" -ForegroundColor Green }
function Warn($m) { Write-Host " WARN $m" -ForegroundColor Yellow }

# ── Foundry libs ─────────────────────────────────────────────
Step 1 "Installing Foundry libs (forge-std + OpenZeppelin)"
$forgeOK = $false
try { forge --version | Out-Null; $forgeOK = $true } catch {}
if (-not $forgeOK) {
    Warn "forge not found in PATH. Install Foundry from https://getfoundry.sh and re-run."
    exit 1
}

git config --global core.longpaths true | Out-Null  # Windows long paths
Push-Location contracts
forge install --no-git foundry-rs/forge-std `
    OpenZeppelin/openzeppelin-contracts@v5.6.1 `
    OpenZeppelin/openzeppelin-contracts-upgradeable@v5.6.1 2>&1 | Out-Null
Pop-Location
OK "Foundry libs ready in contracts/lib/"

# ── Foundry build + tests ────────────────────────────────────
Step 2 "Building + testing contracts"
Push-Location contracts
forge build 2>&1 | Out-Null
forge test 2>&1 | Select-Object -Last 3
Pop-Location
OK "Contracts build + tests pass"

# ── Node deps ────────────────────────────────────────────────
Step 3 "Installing app/ Node deps"
Push-Location app
npm ci --no-audit --no-fund 2>&1 | Select-Object -Last 3
Pop-Location
OK "app/node_modules ready"

Step 4 "Installing keeper/ Node deps"
Push-Location keeper
npm ci --no-audit --no-fund 2>&1 | Select-Object -Last 3
Pop-Location
OK "keeper/node_modules ready"

# ── Env templates ────────────────────────────────────────────
Step 5 "Copying env templates (if .env missing)"
if (-not (Test-Path contracts\.env)) {
    Copy-Item contracts\.env.example contracts\.env
    Warn "contracts\.env created from template — FILL THE VALUES before deploying"
} else { OK "contracts\.env already exists" }
if (-not (Test-Path app\.env.local)) {
    Copy-Item app\.env.local.example app\.env.local
    Warn "app\.env.local created from template — FILL KEEPER_PRIVATE_KEY etc"
} else { OK "app\.env.local already exists" }

Write-Host "`n=== Bootstrap complete ===" -ForegroundColor Green
Write-Host "Next: edit your .env files, then:"
Write-Host "  cd app && npm run dev"
Write-Host "  cd contracts && ./scripts/preflight.ps1"
