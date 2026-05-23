# Security & Threat Model — RWIA V1

> Last reviewed: 2026-05-16 · Status: pre-audit · scope: `contracts/src/`

## 1. Scope

In-scope (V1):

- `src/IntentAggregator.sol` — UUPS proxy, RBAC, EIP-712, native NFT delivery
- `src/IntentTypes.sol` — EIP-712 typehash + struct hashing library
- `script/Deploy.s.sol` — TimelockController + ERC1967 proxy wiring

Out of scope:

- `v2-roadmap/` (CCIP + DLQ reference, NOT compiled in V1)
- The ERC-721 contracts the aggregator transfers (trust model: known
  collections only — operationally enforced by the Keeper, not on-chain)
- Frontend (`app/`) and Keeper (`keeper/`)

## 2. Trust model

| Actor                  | Trust              | Granted role              |
| ---------------------- | ------------------ | ------------------------- |
| Admin multisig         | Fully trusted      | `DEFAULT_ADMIN_ROLE`, `ADMIN_ROLE` |
| TimelockController     | Trusted (2–7 day delay) | `UPGRADER_ROLE`      |
| Keeper bot             | Highly trusted (custodial of NFTs + fiat) | `KEEPER_ROLE` |
| End user (signer)      | Untrusted          | Signs EIP-712 intents     |

The Keeper is **highly trusted**: they hold the NFTs before delivery and
they receive fiat from the user. The contract enforces that they cannot
deliver an NFT to anyone other than the user who signed the intent (the
signature recovers to `intent.user`, and the NFT is transferred to that
exact address), but they CAN choose not to deliver. Refund / dispute
handling is off-chain.

## 3. V1 asset flow

```
User wallet                Keeper wallet              IntentAggregator
─────────────              ───────────────            ─────────────────
 (signs intent off-chain)
 (pays Keeper off-chain)
                            (already holds NFT)
                            calls executeLocalIntent
                                                       check sig + deadline
                                                       check intentHash not used
                                                       mark intentHash executed
                                                       emit IntentExecuted
                                                       safeTransferFrom
                                                          keeper → user
 receives NFT ◄────────────────────────────────────────
```

## 4. Threats considered

| # | Threat                                | Mitigation |
| - | ------------------------------------- | ---------- |
| T1 | Signature replay                     | `mapping(intentHash => bool executed)` |
| T2 | Tampered intent post-signature       | EIP-712 typed-data: any field change recovers a different signer → reverts |
| T3 | Reentrancy via ERC-721 callback (`onERC721Received`) | `nonReentrant` modifier; state mutated BEFORE `safeTransferFrom` |
| T4 | Unauthorized upgrade                 | `UPGRADER_ROLE` granted only to TimelockController; admin is sole proposer |
| T5 | Storage collision on upgrade         | ERC-7201 namespaced storage; root layout is empty |
| T6 | Implementation initialization        | `_disableInitializers()` in constructor |
| T7 | Pause grief                          | Only `ADMIN_ROLE`; pause blocks execution |
| T8 | Stuck funds                          | Contract never holds tokens/NFTs — pull-and-transfer pattern from the Keeper's wallet |
| T9 | Expired intent execution             | `block.timestamp > deadline` strict check; seconds precision |
| T10 | Keeper refuses to deliver           | Off-chain SLA + fiat refund (out of scope of the contract) |
| T11 | Keeper delivers wrong NFT            | Token id is part of the signed payload; signature won't match if changed |
| T12 | Front-running                        | Only the Keeper can call `executeLocalIntent`; no public mempool race |

## 5. Self-audit results

### 5.1 Slither

Run locally and in CI: `slither contracts/ --filter-paths "lib/|test/|v2-roadmap/"`
with `fail-on: medium`. No medium/high findings as of 2026-05-16.

### 5.2 Aderyn

Advisory CI step. No medium/high blocking issues.

### 5.3 Foundry test coverage

| Suite                              | Tests | Notes                            |
| ---------------------------------- | ----: | -------------------------------- |
| `IntentAggregator.t.sol`           | 16    | Includes 2 fuzz tests (256 runs each) |
| `IntentAggregator.invariant.t.sol` | 2     | 256 runs × 500 calls each             |

Critical invariants validated:

- `noReplay` — no `intentHash` is ever executed more than once
- `nftOwnershipMatchesExecution` — NFT count owned by `user` matches the
  number of intents observed as executed

### 5.4 Manual review checklist

- [x] All external entry points have RBAC or signature-based auth
- [x] `executeLocalIntent` is `nonReentrant` with state writes before the
      external `safeTransferFrom` call
- [x] Custom errors used everywhere (no string reverts)
- [x] `_authorizeUpgrade` cannot be bypassed (gated by UPGRADER_ROLE →
      TimelockController)
- [x] `_disableInitializers()` in the implementation constructor
- [x] Storage uses ERC-7201 namespaces; root storage layout is empty
- [x] No `selfdestruct`, no `delegatecall` outside the OZ proxy
- [x] No unbounded loops over user-controlled input
- [x] Contract never holds tokens or NFTs — no recovery surface needed

## 6. Operational security

This section has two parts: the **current V1 launch posture** (what is
deployed today, with the risks we knowingly accept) and the **target
posture** the grant funds the transition to. We document both so a
reviewer can audit the gap directly.

### 6.1 V1 launch posture (current — 2026-05-22)

```
EOA 0x3006c0EefbCdC8AFF12D3D455376FD97d1266A5e
   │
   ├── DEFAULT_ADMIN_ROLE   (grantRole / revokeRole / role admin)
   ├── KEEPER_ROLE          (executeLocalIntent)
   └── Original deployer of: TimelockController + IntentAggregator
                             implementation + ERC1967Proxy

Contract 0x7862E95164a9F5a9A87Ce9019fD73b6Fe3004123 (TimelockController)
   │
   └── UPGRADER_ROLE        (_authorizeUpgrade is gated; 7-day delay)
```

**Risks we knowingly carry at V1:**

1. **Same EOA for admin + keeper.** If the keeper hot key leaks, the
   attacker also has admin power: they can `grantRole`, `pause()`,
   `revokeRole`. They CANNOT upgrade — `UPGRADER_ROLE` lives at the
   Timelock with a 7-day delay (the one role we already separated).
2. **Same EOA was the deployer.** No fresh deployer key exists; the
   broadcast EOA is the same one now running execution. There is no
   forensic separation between deploy artifacts and runtime hot key.

**Why this is acceptable for the V1 launch:**

- Inventory at risk is bounded — the Keeper only holds NFTs already paid
  for off-chain. The on-chain signature gate enforces that the Keeper
  *cannot* deliver an NFT to anyone other than the EIP-712 signer; an
  attacker with the keeper key can only execute *signed* intents, not
  drain to themselves.
- Upgrades are timelocked (7d). An attacker cannot upgrade in to
  arbitrary logic without giving the operator 7 days to detect and
  publicly revoke.
- The contract is `Pausable`. A compromised admin role *can* pause
  execution, which is contained (denial-of-service, not theft).
- This posture is the standard for production EVM apps with active
  operator monitoring (e.g. early-stage relayers across L2s).

### 6.2 Target posture (post-grant, 30-day transition)

```
Safe Multisig (4-of-7)                  Fresh deployer EOA (cold)
   │                                        │
   ├── DEFAULT_ADMIN_ROLE                   └── (no roles; renounced)
   └── ADMIN_ROLE

TimelockController (7d delay)            Keeper hot wallets (rotated)
   │                                        │
   └── UPGRADER_ROLE                        └── KEEPER_ROLE × N shards
```

**Concrete transition steps (`HandoffToMultisig.s.sol` already implements 1–4):**

1. Deploy a Sky Mavis Ronin Safe (4-of-7) at `safe.roninchain.com`.
2. From the current admin EOA, `grantRole(DEFAULT_ADMIN_ROLE, safe)`.
3. From the current admin EOA, `renounceRole(DEFAULT_ADMIN_ROLE, self)`.
4. Verify on-chain via `cast call ... hasRole(0x00, EOA)` returns `false`
   and `hasRole(0x00, safe)` returns `true`.
5. Rotate the keeper: generate a new EOA, transfer NFT inventory,
   `grantRole(KEEPER_ROLE, newKeeper)`, `revokeRole(KEEPER_ROLE, oldEOA)`.
6. Update Vercel `KEEPER_PRIVATE_KEY` to the new EOA, redeploy.
7. Funeral burn: the old EOA (deployer + V1 admin + V1 keeper) is
   formally retired and the key destroyed (documented in
   `incidents/2026-XX-XX-key-retirement.md`).

**Hard timeline commitment to the grant committee:**

| Milestone | Trigger | Days from grant approval |
| --- | --- | --- |
| Safe deployed + threshold confirmed | Multisig signers gathered | 0–7 |
| `HandoffToMultisig.s.sol` executed | Step 1 verified on-chain | 7–10 |
| Keeper rotation to fresh EOA | Step 4 verified | 10–14 |
| Old EOA retirement + post-mortem doc | Step 5 verified | 14–21 |

### 6.3 Always-on operational hygiene

- **TimelockController delay:** 7 days on mainnet (deployed), 2 days on
  testnet (config).
- **Keeper approvals tracked:** every collection the Keeper operates
  against requires `setApprovalForAll(IntentAggregator, true)`. The
  approval set is logged in the keeper runbook and surfaced through
  `/api/diagnose?nftContract=&tokenId=`.
- **Pause toggle drilled quarterly:** the on-call team runs a
  `pause()` / `unpause()` cycle on testnet every 90 days to keep the
  incident playbook fresh.

## 7. Incident playbook

1. **Detection** — Keeper alerts on `Paused` event or anomalous executions
2. **Containment** — admin multisig calls `pause()` on the aggregator
3. **Triage** — incident commander pulls Foundry artifacts, on-chain logs,
   draft public status update
4. **Remediation**
   - Stuck NFT or wrong delivery: handled off-chain by the Keeper (e.g.
     re-buy or refund)
   - Bug in contract: prepare upgrade, schedule via Timelock, wait delay,
     execute
5. **Post-mortem** — published in `incidents/<date>-<slug>.md` within 7 days

## 8. Reporting

Email `security@vertsun.io` with `[RWIA]` prefix. We respond within 48h.
Bounty program TBD.
