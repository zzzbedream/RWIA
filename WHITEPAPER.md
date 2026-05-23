# Ronin Waypoint Intent Aggregator (RWIA) — Whitepaper V1

> **Status:** Testnet-ready (Saigon) · Grant Application  
> **Authors:** RWIA Team  
> **Date:** May 2026  

---

## 1. Executive Summary

The Ronin Waypoint Intent Aggregator (RWIA) is an **intent-centric NFT settlement protocol** on Ronin. Users sign a gasless EIP-712 intent specifying which NFT they want to buy and at what price. After the off-chain payment clears (fiat or stablecoin), a permissioned Keeper delivers the NFT on-chain in a single atomic transaction.

**Problem:** New Ronin users face a cold-start liquidity trap — they cannot acquire NFTs without first obtaining RON for gas, creating a friction-filled onboarding experience that hemorrhages potential users.

**Solution:** RWIA separates the *intent to buy* from the *execution of the transfer*. The user never holds RON. The Keeper covers gas. The result is a Web2-like checkout experience with Web3-level self-custody.

---

## 2. Motivation & Problem Statement

### 2.1 The Cold-Start Problem on Ronin

New users entering the Ronin ecosystem through gaming or NFT marketplaces face a circular dependency:

1. To buy an NFT → need RON for gas
2. To get RON → need to bridge or swap from another chain
3. To bridge/swap → need gas on the source chain

This multi-step onboarding kills conversion rates. Analytics from comparable ecosystems show **60-70% drop-off** at the "fund wallet" step.

### 2.2 Why Intent-Centric Architecture?

Traditional on-chain order flows require the user to submit transactions directly, paying gas in the native token. An **intent** flips this model:

| Traditional Transaction | Intent-Based Settlement |
|---|---|
| User submits tx, pays gas | User signs off-chain message (free) |
| User needs native token | User pays off-chain (fiat/stable) |
| Atomic but expensive | Atomic but gasless for user |
| Single payment rail | Multiple payment rails possible |

The intent model enables a **Keeper-gated execution layer** where professional operators handle the on-chain complexity while users enjoy a frictionless experience.

---

## 3. Architecture

### 3.1 System Overview

```
┌──────────────┐     EIP-712      ┌──────────────┐
│  User Wallet │ ──── intent ────→ │  Keeper API  │
│  (no RON)    │     signature    │  (off-chain) │
└──────────────┘                   └──────┬───────┘
       ↑                                  │
       │ safeTransferFrom(NFT)            │ executeLocalIntent()
       │                                  ↓
┌──────────────┐                   ┌──────────────────┐
│  NFT Contract│ ←── transfer ─── │ IntentAggregator  │
│  (ERC-721)   │                   │  V1 (UUPS Proxy) │
└──────────────┘                   └──────────────────┘
                                           ↑
                                    Keeper pays gas (RON)
```

### 3.2 Smart Contract: IntentAggregator V1

**Inheritance chain:**
- `Initializable` — Proxy-safe initialization
- `UUPSUpgradeable` — Upgrade pattern (gated by TimelockController)
- `AccessControlUpgradeable` — RBAC with 3 roles
- `PausableUpgradeable` — Emergency stop
- `ReentrancyGuard` — Reentrancy protection
- `EIP712Upgradeable` — Typed-data signature verification

**Roles (RBAC):**

| Role | Purpose | Holder |
|---|---|---|
| `ADMIN_ROLE` | Pause/unpause, manage Keepers | Multi-sig or governance |
| `UPGRADER_ROLE` | Authorize V2 upgrades | TimelockController |
| `KEEPER_ROLE` | Execute intents on-chain | Keeper operator |

**Storage (ERC-7201 namespaced):**
```solidity
bytes32 constant STORAGE_SLOT =
    0x8f7ffa7830ed47936fdfb086a94b9b3d7c14998a38c285d9f30fbd1926fd4400;

struct IntentStorage {
    mapping(bytes32 => bool) executedIntents;
}
```

### 3.3 UserIntent Struct

```solidity
struct UserIntent {
    address user;          // Buyer's wallet
    address tokenAddress;  // Payment token (ERC-20 or zero for fiat)
    uint256 amount;        // Price in token units
    address nftContract;   // ERC-721 collection address
    uint256 tokenId;       // Specific NFT to purchase
    uint256 deadline;      // Unix timestamp expiry
    uint256 nonce;         // Unique per intent
}
```

### 3.4 Execution Flow

1. **Intent creation:** Frontend builds the `UserIntent` struct with user inputs
2. **EIP-712 signing:** Wallet signs typed data (no gas, no on-chain tx)
3. **Submission:** Frontend POSTs `{intent, signature}` to Keeper API
4. **Off-chain payment:** User pays via fiat on-ramp or stablecoin transfer
5. **Keeper execution:** Keeper calls `executeLocalIntent(intent, signature)`
6. **On-chain settlement:** Contract verifies signature, checks replay, transfers NFT via `safeTransferFrom`

### 3.5 Security Properties

| Property | Mechanism |
|---|---|
| **Replay protection** | `executedIntents` mapping prevents double-execution |
| **Expiry enforcement** | `deadline` field rejects stale intents |
| **Keeper gating** | `onlyRole(KEEPER_ROLE)` modifier |
| **Reentrancy guard** | `nonReentrant` modifier on execution |
| **Emergency pause** | `whenNotPaused` modifier + `ADMIN_ROLE` |
| **Upgrade safety** | UUPS with `TimelockController` as upgrader |
| **Storage isolation** | ERC-7201 namespace prevents storage collisions |

---

## 4. Gas Optimization

Tested with `forge test --gas-report` on Solc 0.8.24 / Cancun:

| Function | Gas Cost |
|---|---|
| `executeLocalIntent` (happy path) | ~149,500 |
| `executeLocalIntent` (rejection) | ~62,600 |
| `hashIntent` (view) | ~5,400 |
| `verifyIntentSignature` (view) | ~5,700 |

Custom errors instead of string reverts save ~3,000 gas per revert path.

---

## 5. Frontend Architecture

**Stack:** Next.js 16 (App Router) + wagmi v2 + viem + Framer Motion

| Feature | Implementation |
|---|---|
| Wallet connection | Ronin Waypoint connector + wagmi |
| RNS resolution | Forward (`alice.ron` → address) + reverse |
| EIP-712 signing | `useSignTypedData` with domain separation |
| Intent submission | POST to `/api/intent` Keeper endpoint |
| Job polling | 2s interval with 60-iteration timeout |
| Zod validation | Form field validation before signing |
| Security headers | CSP + X-Frame-Options + HSTS via `next.config.ts` |

---

## 6. V2 Roadmap (Post-Grant)

V1 is intentionally scoped to **native Ronin NFT settlement**. The UUPS proxy + ERC-7201 storage namespace enables a future V2 that introduces:

### 6.1 Chainlink CCIP Cross-Chain Dispatch
- Bridge assets cross-chain via CCIP router
- Allow users on Ethereum, Arbitrum, Base to buy Ronin NFTs without bridging
- `IRouterClient` integration with destination chain allowlist

### 6.2 Dead Letter Queue (DLQ)
- Failed CCIP messages parked with full payload
- Recovery operator can replay, settle, or drop
- Full audit trail of failed cross-chain operations

### 6.3 Batch Execution
- Process up to 16 intents per transaction
- Gas amortization reduces per-intent cost by ~40%

### 6.4 Multi-Token Support
- ERC-20, ERC-1155, and native RON payments
- Automated price oracle integration

---

## 7. DevOps & Deployment

### 7.1 Foundry Toolchain
- **Compiler:** Solc 0.8.24, Cancun EVM
- **Optimizer:** 200 runs
- **CI/CD:** GitHub Actions (forge build → test → snapshot)
- **Gas profiling:** `forge snapshot` on every PR

### 7.2 Deployment (Saigon Testnet)
```bash
# 1. Dry-run (simulation)
forge script script/Deploy.s.sol --rpc-url ronin_saigon --ffi

# 2. Broadcast (real deploy)
forge script script/Deploy.s.sol --rpc-url ronin_saigon --broadcast --private-key $PRIVATE_KEY --ffi

# 3. Verify on Ronin Explorer
forge verify-contract <PROXY_ADDRESS> IntentAggregator --rpc-url ronin_saigon --verifier ronin_saigon --watch
```

### 7.3 Deployment Checklist
Documented in `contracts/DEPLOY-CHECKLIST.md` with preflight validation script at `contracts/scripts/preflight.ps1`.

---

## 8. Grant Deliverables

| Milestone | Deliverable | Timeline |
|---|---|---|
| M1 | V1 contract deployed on Saigon + verified | Week 1 |
| M2 | Frontend live on Vercel with Waypoint auth | Week 2 |
| M3 | Keeper API running with job queue | Week 3 |
| M4 | End-to-end demo video (Loom) + documentation | Week 4 |
| M5 | dApp Directory PR submitted | Week 4 |

### Success Metrics
- [ ] 19/19 forge tests passing
- [ ] Contract verified on Saigon block explorer
- [ ] Gas per intent < 200,000 (currently ~149,500 ✓)
- [ ] End-to-end intent flow: sign → submit → confirm < 30 seconds
- [ ] Zero critical Slither findings

---

## 9. Audit Readiness

- **Slither config:** `slither.config.json` at repo root
- **Test coverage:** 17 unit tests + 2 invariant tests (replay protection + NFT ownership)
- **Fuzz testing:** 256 runs default, 1000 in CI profile
- **Storage layout:** Documented in `contracts/storage-layouts/IntentAggregator.json`
- **Known limitations:** V1 is single-chain only; no CCIP router on Ronin Saigon as of 2026-05-16

---

## 10. Conclusion

RWIA V1 solves the immediate cold-start liquidity problem on Ronin by making NFT purchases gasless through an intent-centric architecture. The protocol is upgrade-safe, auditable, and designed for incremental expansion to cross-chain CCIP dispatch in V2 — positioning Ronin as the first gaming chain with a native intent settlement layer.

*Built with Foundry · Next.js · wagmi · OpenZeppelin · EIP-712*