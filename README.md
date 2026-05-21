# Ronin Waypoint Intent Aggregator (RWIA) — V1

> **V1: Native NFT settlement on Ronin.** Users sign EIP-712 intents to buy a
> specific NFT and pay the Keeper off-chain (fiat or stablecoin). The Keeper —
> already in possession of the NFT — delivers it on-chain to the user's wallet,
> paying gas. No CCIP, no DLQ, no cross-chain hops.
>
> **V2 (roadmap).** Add Chainlink CCIP cross-chain dispatch. The UUPS proxy
> ensures V2 ships without state loss. The legacy CCIP code lives in
> [`contracts/v2-roadmap/`](contracts/v2-roadmap/) for reference.

## 👉 Start here: how does a user actually use this?

**Read [`HOW-IT-WORKS.md`](HOW-IT-WORKS.md) first.** It explains, with the
live mainnet addresses already wired up, exactly what the buyer sees,
what the Keeper does, and what is guaranteed on-chain. If you are
demoing this to a non-crypto person, that doc is the script.

TL;DR of the user flow:

| Step | User does | RWIA does                                         |
| ---- | --------- | ------------------------------------------------- |
| 1    | Connect Ronin Wallet (or Waypoint social login) | —                                                |
| 2    | Fill a tiny form: NFT contract, tokenId, amount | —                                                |
| 3    | Sign one EIP-712 message (NO gas, NO RON)       | POSTs `{intent, signature}` to `/api/intent`     |
| 4    | Pay you off-chain (Stripe / Pix / Binance Pay)  | Keeper validates, simulates, broadcasts          |
| 5    | (nothing — wait)                                | NFT lands in user's wallet, UI shows "Confirmed" |

## Why this matters (positioning)

1. **Churn funnel destruction.** Going from 5 user steps (install wallet,
   fund RON, swap on a DEX, approve token, pay gas) to 2 steps (sign for
   free + pay with card/local rail) lifts conversion brutally. For Ronin,
   higher conversion = more market volume = network growth.

2. **Complexity abstracted (UX).** The Keeper absorbs gas and holds
   inventory; the buyer experiences a Web2 checkout on Web3 rails.
   Same mental model as buying on Amazon — no wallet pain, no token
   shopping, no approve-then-pay dance.

3. **Reusable B2B2C infra.** We didn't build a store; we built the rails.
   Any Ronin game, marketplace or collection can hit `POST /api/intent`
   and offer fiat checkout to their players. We are the infrastructure
   provider — others ship the storefront.

## Live mainnet deployment

| Contract                  | Ronin Mainnet (chainId 2020)                  |
| ------------------------- | --------------------------------------------- |
| IntentAggregator proxy    | `0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5`  |
| IntentAggregator impl     | `0x1e2cA35cc4CC6036FcCAac4B84F4825dA95e1479`  |
| TimelockController        | `0x7862E95164a9F5a9A87Ce9019fD73b6Fe3004123`  |
| TestNFT (for demo)        | `0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2`  |
| Keeper EOA                | `0x3006c0EefbCdC8AFF12D3D455376FD97d1266A5e`  |

Deploy txs:
- TimelockController: `0xa597b542b75e8c7b6571bf3315a971c35146737abaa41de33763802c6cc4244e`
- IntentAggregator impl: `0x285c731eff92dca4cac38a02e437e1ebd2e344fb1aa2a6e18ff75090bb8ab111`
- ERC1967Proxy + initialize: `0x34876419ef637198bab483e1a3d55067e08ae4e9fa4c0e3fb0c2d0584cdfd5e7`
- TestNFT setApprovalForAll: `0xf95c21d86913c9e5e266420d241f877d3b24fdf5463cf7b8bc7bddf41160c84c`

See [`HOW-IT-WORKS.md`](HOW-IT-WORKS.md#smoke-test--end-to-end-en-5-minutos)
for the 5-minute smoke test you can run right now against this live
deployment.

## Why V1 first

- **Liquidity friction is the problem now.** Users without RON or stable
  crypto on Ronin can't transact. Native settlement with off-chain payment
  removes that wall.
- **Cross-chain infra is not blocking V1.** Chainlink CCIP does not ship a
  native router on Ronin Saigon (verified 2026-05-16 via
  [docs.chain.link/ccip/directory/testnet](https://docs.chain.link/ccip/directory/testnet)).
  Adding CCIP today would slow shipping without serving the V1 user.
- **UUPS is the bridge.** The aggregator is upgrade-safe (ERC-7201 storage,
  TimelockController-gated upgrades), so V2 inherits the V1 state.

## Architecture

```
User wallet              IntentAggregator V1            Keeper wallet
─────────────            ─────────────────────         ───────────────
   │                          │                              │
   │  sign EIP-712            │                              │
   ├─────────────────────────►│ (off-chain transport)        │
   │   UserIntent             │                              │
   │     · user               │                              │
   │     · tokenAddress       │                              │
   │     · amount             │                              │
   │     · nftContract        │                              │
   │     · tokenId            │                              │
   │     · deadline           │                              │
   │     · nonce              │                              │
   │                          │                              │
   │   fiat / off-chain $$    │                              │
   ├──────────────────────────┼─────────────────────────────►│
   │                          │                              │
   │                          │  executeLocalIntent          │
   │                          │◄─────────────────────────────┤
   │                          │  validates sig, deadline,    │
   │                          │  intent-hash uniqueness      │
   │                          │                              │
   │                          │  safeTransferFrom(keeper,    │
   │                          │       user, tokenId)         │
   │◄─────────────────────────┼──────────────────────────────┤
   │       NFT arrives        │                              │
```

## Layout

| Path                      | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `contracts/src/`          | V1 contracts: `IntentAggregator.sol`, `IntentTypes.sol` |
| `contracts/script/`       | `Deploy.s.sol` (Timelock + ERC1967Proxy)             |
| `contracts/test/`         | Foundry tests (16 unit + 2 invariant)                |
| `contracts/v2-roadmap/`   | Reference CCIP + DLQ code for V2 (NOT compiled)      |
| `app/`                    | Next.js 16 frontend (wagmi + viem + Waypoint SDK)    |
| `keeper/`                 | TypeScript watcher (event tail + alerts)             |
| `ecosystem/`              | Ronin dApp directory submission                      |
| `.github/`                | CI: Foundry build/test/snapshot, Slither, npm audit  |

## Smart contract surface

`IntentAggregator` (UUPS proxy):

- Roles: `ADMIN_ROLE`, `UPGRADER_ROLE` (Timelock), `KEEPER_ROLE`
- Pausable; `executeLocalIntent` reverts when paused
- ReentrancyGuard around the only state-changing external function
- EIP-712 `UserIntent` typed-data signing
- Replay protection via `mapping(bytes32 intentHash => bool executed)`
- Storage at ERC-7201 namespace `rwia.storage.IntentAggregatorV1` — root
  storage layout is empty, upgrade-safe by construction
- Custom errors throughout (no string reverts)

`IntentTypes` library exposes the `UserIntent` struct and the EIP-712 type
hash used by both on-chain verification and off-chain signing.

## Networks

| Network             | Chain ID | V1 target |
| ------------------- | -------- | --------- |
| Ronin Mainnet       | 2020     | yes       |
| Ronin Saigon Testnet | 202601 (post 2026-02-05 hardfork; was 2021) | smoke tests |

## Build, test, deploy

```powershell
cd contracts
forge build
forge test                # 18 tests (16 unit + 2 invariant × 128k calls)
./scripts/preflight.ps1   # validates env, build, tests, RPC, deployer balance
```

```powershell
copy .env.example .env
notepad .env              # PRIVATE_KEY, ADMIN_ADDRESS, KEEPER_ADDRESS
forge script script/Deploy.s.sol:Deploy --rpc-url ronin_mainnet -vvv     # simulate
forge script script/Deploy.s.sol:Deploy --rpc-url ronin_mainnet --broadcast --slow -vvv
```

See [`contracts/DEPLOY-CHECKLIST.md`](contracts/DEPLOY-CHECKLIST.md) for the
step-by-step deploy runbook including the post-deploy wiring, frontend env
setup and the end-to-end smoke test.

## Frontend

```powershell
cd app
npm install
copy .env.local.example .env.local
notepad .env.local        # set NEXT_PUBLIC_AGGREGATOR_ADDRESS
npm run dev
```

Stack: Next.js 16, wagmi v2, viem v2, Tailwind v4, `@sky-mavis/waypoint` 4.x.
The connect flow prefers **Ronin Wallet** (via `window.ronin`) with a
Waypoint social-login fallback when `NEXT_PUBLIC_WAYPOINT_CLIENT_ID` is set.
Receivers accept both raw addresses and RNS names (e.g. `alice.ron`). A
sign-preview modal renders the full EIP-712 payload before the wallet
prompt.

## Security

Full threat model and self-audit results in [`SECURITY.md`](SECURITY.md).

- Slither + Aderyn in CI with `fail-on: medium`
- `forge fmt --check`, gas snapshot diff, storage-layout artifacts
- `npm audit --audit-level=high` and Dependabot weekly
- CODEOWNERS routes `contracts/` PRs through the security team
- `_disableInitializers()` on the implementation
- `UPGRADER_ROLE` is a TimelockController, never an EOA
- CSP, X-Frame-Options, HSTS on every Next.js response

## Ecosystem submission

See [`ecosystem/`](ecosystem/) for the Ronin dApp directory JSON and PR
instructions. Paste the resulting PR URL here after submission:

```
Ronin Ecosystem PR: <https://github.com/...>
```

## Deployed addresses (Ronin Mainnet, chainId 2020)

| Contract                  | Address                                       |
| ------------------------- | --------------------------------------------- |
| IntentAggregator proxy    | `0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5`  |
| IntentAggregator impl     | `0x1e2cA35cc4CC6036FcCAac4B84F4825dA95e1479`  |
| TimelockController        | `0x7862E95164a9F5a9A87Ce9019fD73b6Fe3004123`  |
| TestNFT (for demo)        | `0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2`  |
| Keeper EOA                | `0x3006c0EefbCdC8AFF12D3D455376FD97d1266A5e`  |

> Note: an earlier broken deploy lives at `0x482816C7…` — it was `forge create`'d
> directly with no proxy and is bricked (no roles assigned). Always point clients
> at the proxy `0x2D3E5B0d…` above.

Saigon Testnet deployment will follow once Chainlink CCIP routes to V2
require it. See [`HOW-IT-WORKS.md`](HOW-IT-WORKS.md) for live links to
the explorer.

## License

MIT.
