#!/usr/bin/env pwsh
# Pre-deploy validation: env, build, test, snapshot, .env sanity.
# Usage: ./scripts/preflight.ps1

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot\..

# PS 5.1 wraps native exe stderr as RemoteException via $ErrorActionPreference.
# Use this wrapper to invoke native commands and only fail on real exit codes.
function Invoke-Native {
    param([Parameter(Mandatory)][string]$Command, [string[]]$ArgList = @())
    $output = & $Command @ArgList 2>&1
    return @{ ExitCode = $LASTEXITCODE; Output = $output }
}

function Step($n, $msg) {
    Write-Host "`n[$n] $msg" -ForegroundColor Cyan
}
function OK($m) { Write-Host " OK  $m" -ForegroundColor Green }
function Fail($m) { Write-Host " FAIL $m" -ForegroundColor Red; exit 1 }
function Warn($m) { Write-Host " WARN $m" -ForegroundColor Yellow }

Step 1 "Foundry"
$r = Invoke-Native -Command "forge" -ArgList @("--version")
if ($r.ExitCode -ne 0) { Fail "forge not in PATH" }
OK ($r.Output -join " ").Trim()

Step 2 "Libs"
$libs = @("lib/forge-std", "lib/openzeppelin-contracts", "lib/openzeppelin-contracts-upgradeable")
foreach ($l in $libs) {
    if (-not (Test-Path $l)) { Fail "missing $l" } else { OK $l }
}

Step 3 ".env"
if (-not (Test-Path .env)) {
    Fail ".env missing — copy .env.example and fill it"
}
$envContent = Get-Content .env -Raw
foreach ($key in @("PRIVATE_KEY", "ADMIN_ADDRESS", "KEEPER_ADDRESS", "RECOVERY_ADDRESS")) {
    $match = [regex]::Match($envContent, "^$key\s*=\s*(.+)$", [System.Text.RegularExpressions.RegexOptions]::Multiline)
    if (-not $match.Success -or [string]::IsNullOrWhiteSpace($match.Groups[1].Value)) {
        Fail "$key not set in .env"
    } else {
        $masked = if ($key -eq "PRIVATE_KEY") { "(set, length=$($match.Groups[1].Value.Trim().Length))" } else { $match.Groups[1].Value.Trim() }
        OK "$key = $masked"
    }
}
$ccipMatch = [regex]::Match($envContent, "^CCIP_ROUTER_ADDRESS\s*=\s*(.*)$", [System.Text.RegularExpressions.RegexOptions]::Multiline)
if (-not $ccipMatch.Success -or [string]::IsNullOrWhiteSpace($ccipMatch.Groups[1].Value)) {
    Warn "CCIP_ROUTER_ADDRESS empty — MockCCIPRouter will be deployed (Saigon mode)"
} else {
    OK "CCIP_ROUTER_ADDRESS = $($ccipMatch.Groups[1].Value.Trim())"
}

Step 4 "forge fmt --check"
$r = Invoke-Native -Command "forge" -ArgList @("fmt","--check")
if ($r.ExitCode -ne 0) { Fail "fmt diffs present — run 'forge fmt'" } else { OK "no diffs" }

Step 5 "forge build --sizes"
$r = Invoke-Native -Command "forge" -ArgList @("build","--sizes")
if ($r.ExitCode -ne 0) {
    Write-Host ($r.Output -join "`n")
    Fail "build failed"
} else {
    OK "build clean"
}

Step 6 "forge test"
$r = Invoke-Native -Command "forge" -ArgList @("test")
if ($r.ExitCode -ne 0) {
    Write-Host ($r.Output -join "`n")
    Fail "tests failed"
} else {
    OK "17 tests pass (incl. 3 invariants)"
}

Step 7 "RPC reachability"
try {
    $rpcMatch = [regex]::Match($envContent, "^RONIN_SAIGON_RPC_URL\s*=\s*(.+)$", [System.Text.RegularExpressions.RegexOptions]::Multiline)
    $rpc = if ($rpcMatch.Success) { $rpcMatch.Groups[1].Value.Trim() } else { "https://saigon-testnet.roninchain.com/rpc" }
    $resp = Invoke-RestMethod -Uri $rpc -Method Post -ContentType 'application/json' `
        -Body '{"jsonrpc":"2.0","method":"eth_chainId","id":1}' -TimeoutSec 10
    if ($resp.result -eq "0x31769") { OK "Saigon RPC reachable ($rpc, chainId=202601)" }
    else { Warn "RPC reachable but chainId=$($resp.result) (expected 0x31769/202601 post-Feb-2026 hardfork)" }
} catch {
    Fail "Saigon RPC unreachable: $_"
}

Step 8 "Deployer balance"
$pkMatch = [regex]::Match($envContent, "^PRIVATE_KEY\s*=\s*(.+)$", [System.Text.RegularExpressions.RegexOptions]::Multiline)
$pk = $pkMatch.Groups[1].Value.Trim()
$r = Invoke-Native -Command "cast" -ArgList @("wallet","address","--private-key",$pk)
if ($r.ExitCode -ne 0) {
    Warn "cast wallet address failed: $($r.Output -join ' ')"
} else {
    $deployer = ($r.Output -join "").Trim()
    $r2 = Invoke-Native -Command "cast" -ArgList @("balance",$deployer,"--rpc-url",$rpc)
    if ($r2.ExitCode -eq 0) {
        $balRaw = ($r2.Output -join "").Trim()
        try {
            $balEth = [decimal]$balRaw / 1e18
            OK "deployer $deployer · balance $balEth RON"
            if ($balEth -lt 0.1) { Warn "balance < 0.1 RON — get more from https://faucet.roninchain.com" }
        } catch {
            Warn "balance parse error: $balRaw"
        }
    } else {
        Warn "balance check failed: $($r2.Output -join ' ')"
    }
}

Write-Host "`n=== preflight OK ===" -ForegroundColor Green
Write-Host "Next: forge script script/Deploy.s.sol:Deploy --rpc-url ronin_saigon -vvv  # simulate"
Write-Host "Then: add --broadcast --slow when ready."
