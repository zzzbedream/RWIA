#!/usr/bin/env pwsh
# Bulk-setup of Vercel environment variables for RWIA.
#
# Usage:
#   cd app
#   ./scripts/vercel-env-setup.ps1
#
# Requires: vercel CLI installed + `vercel link` already done.
#
# Public vars (NEXT_PUBLIC_*) are written non-interactively.
# Secrets (KEEPER_PRIVATE_KEY, SUPABASE_SECRET_KEY) are read with masked
# input — Vercel CLI never echoes them and they never touch this script.

# Don't use "Stop" here — Vercel CLI prints a benign WARNING on stderr for
# NEXT_PUBLIC_* vars, which PowerShell 5.1 wraps as a NativeCommandError and
# would abort the script. We check $LASTEXITCODE manually instead.
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot\..

if (-not (Test-Path .vercel/project.json)) {
    Write-Host "ERROR: .vercel/project.json missing. Run 'vercel link' first." -ForegroundColor Red
    exit 1
}

# Pipe value to `vercel env add` via stdin. We don't redirect stderr —
# PS 5.1 wraps native stderr as ErrorRecord when merged, which trips
# $ErrorActionPreference. Stderr goes to the console naturally.
function AddPublic($name, $value) {
    Write-Host "  $name = $value" -ForegroundColor DarkGray
    $value | & vercel env add $name production --force | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    WARN: vercel exit=$LASTEXITCODE (may already exist)" -ForegroundColor Yellow
    }
}

function AddSecretInteractive($name, $description) {
    Write-Host "`n  $name" -ForegroundColor Yellow
    Write-Host "    $description" -ForegroundColor DarkGray
    Write-Host "    Paste the value (input is hidden) and press Enter:" -ForegroundColor DarkGray
    $secure = Read-Host -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    if (-not $plain) { Write-Host "    SKIPPED (empty)" -ForegroundColor Red; return }
    $plain | & vercel env add $name production --force | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    WARN: vercel exit=$LASTEXITCODE (may already exist)" -ForegroundColor Yellow
    } else {
        Write-Host "    set" -ForegroundColor Green
    }
}

Write-Host "=== Public NEXT_PUBLIC_* ===" -ForegroundColor Cyan
AddPublic "NEXT_PUBLIC_AGGREGATOR_ADDRESS"     "0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5"
AddPublic "NEXT_PUBLIC_DEFAULT_CHAIN_ID"       "2020"
AddPublic "NEXT_PUBLIC_DEFAULT_PAYMENT_TOKEN"  "0xe514d9DEB7966c8BE0ca922de8a064264eA6bcd4"
AddPublic "NEXT_PUBLIC_DEFAULT_PAYMENT_DECIMALS" "18"
AddPublic "NEXT_PUBLIC_INDEXER_MAX_LAG_BLOCKS" "50"

Write-Host "`n=== Server-side (non-secret) ===" -ForegroundColor Cyan
AddPublic "RELAYER_CHAIN_ID"                   "2020"
AddPublic "RELAYER_AGGREGATOR_ADDRESS"         "0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5"
AddPublic "RWIA_JOB_STORE"                     "supabase"
AddPublic "RWIA_PAYMENT_PROVIDER"              "mock"
AddPublic "RWIA_REQUIRE_PAYMENT"               "false"
AddPublic "RWIA_KEEPER_HEALTHY_RON"            "1.0"
AddPublic "RWIA_KEEPER_CRITICAL_RON"           "0.1"

Write-Host "`n=== Secrets (paste manually, hidden input) ===" -ForegroundColor Cyan
AddSecretInteractive "KEEPER_PRIVATE_KEY" "The 0x... private key of the Keeper EOA (paste from contracts/.env, NOT the placeholder zeros)"
AddSecretInteractive "SUPABASE_URL"       "https://<your-ref>.supabase.co  (from Supabase Settings -> API -> Project URL)"
AddSecretInteractive "SUPABASE_SECRET_KEY" "The sb_secret_... key you generated (Supabase Settings -> API -> Secret keys)"

# Last: the public app URL needs the deploy URL Vercel just assigned.
Write-Host "`n=== Final ===" -ForegroundColor Cyan
$appUrl = Read-Host "Enter your Vercel deploy URL (e.g. https://rwia.vercel.app) [optional, leave empty for now]"
if ($appUrl) {
    $appUrl | & vercel env add "NEXT_PUBLIC_APP_URL" production --force | Out-Null
    Write-Host "  NEXT_PUBLIC_APP_URL = $appUrl" -ForegroundColor DarkGray
}

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "Next: run  vercel --prod  to deploy"
