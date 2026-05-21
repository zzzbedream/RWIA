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

- Deployer EOA is used ONLY for the broadcast transaction; never holds the
  admin role on mainnet
- Admin is a 3-of-5 multisig (testnet) or 4-of-7 (mainnet)
- TimelockController delay: **2 days on testnet, 7 days on mainnet**
- Keeper bot key rotated quarterly; revocable on-chain via `revokeRole`
- The Keeper must `setApprovalForAll(IntentAggregator, true)` on every NFT
  contract it operates against — track this approval set in the Keeper
  runbook

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
