# How RWIA Works — End-to-End User Journey

> The single source of truth for **what the user sees**, **what the Keeper
> does behind the scenes**, and **what is guaranteed on-chain**. If you
> finish reading this and still don't know how to demo the product to a
> non-crypto person, the doc has failed — open an issue.

---

## TL;DR

A buyer signs one message (gratis, no gas, no RON). They pay you with
their card / Pix / Pago Móvil / Binance Pay / whatever fiat or off-chain
rail you support. Minutes later the NFT shows up in their wallet. The
buyer never touches a DEX, never approves a token, never pays gas.

Behind the scenes, you (the Keeper) hold the NFT inventory and the gas
budget. The on-chain contract just verifies the buyer's EIP-712
signature and atomically transfers the NFT from your wallet to theirs.

---

## The problem we solve

Standard NFT purchase on Ronin today, for a brand-new user:

1. Install Ronin Wallet
2. Buy RON (faucet, exchange, bridge)
3. Buy the payment token (WRON, USDC) on a DEX
4. Approve the token to the marketplace contract
5. Sign the marketplace tx + wait + pay gas

Five frictions, each one a potential abandonment.

## What RWIA collapses it to

For the buyer:

1. **Sign** a message (free, no gas, no RON)
2. **Pay** you off-chain (Stripe, MercadoPago, bank transfer, etc.)

That's it. The NFT lands in their wallet automatically. **The buyer
never holds crypto on-chain except to receive the NFT.**

---

## Three perspectives

### 1. The Buyer (end user) — what they actually do

```
┌─ Step 1 ──────────────────────────────────────────────────┐
│ Visit https://your-domain/app                              │
│ Click "Connect wallet"                                     │
│  → Ronin Wallet (window.ronin) is preferred                │
│  → Ronin Waypoint shown if NEXT_PUBLIC_WAYPOINT_CLIENT_ID  │
│    is configured (social login: Google, email, no install) │
└────────────────────────────────────────────────────────────┘

┌─ Step 2 ──────────────────────────────────────────────────┐
│ If the wallet is on a different chain, the UI forces a    │
│ switch to Ronin Mainnet (chainId 2020). EIP-712 signatures │
│ must be produced on the same chain the contract lives on. │
└────────────────────────────────────────────────────────────┘

┌─ Step 3 ──────────────────────────────────────────────────┐
│ Fill in the form:                                          │
│   - NFT contract  (address or .ron name)                   │
│   - Token id                                               │
│   - Payment token (e.g. WRON / USDC) + decimals            │
│   - Amount they're paying off-chain                        │
│   - Deadline (default 60 min)                              │
└────────────────────────────────────────────────────────────┘

┌─ Step 4 ──────────────────────────────────────────────────┐
│ Click "Review & sign" → modal shows EVERY field of the    │
│ intent the wallet will see. No surprises.                  │
│ Click "Sign in wallet" → wallet popup → user approves.    │
│ This is a SIGNATURE, not a transaction. ZERO gas.          │
└────────────────────────────────────────────────────────────┘

┌─ Step 5 ──────────────────────────────────────────────────┐
│ UI shows "Queued · job abc123 · status pending"            │
│ The signature + intent is POSTed to your /api/intent       │
└────────────────────────────────────────────────────────────┘

┌─ Step 6 (OUTSIDE THIS REPO) ──────────────────────────────┐
│ Your business charges the buyer in fiat / off-chain crypto │
│ via Stripe / MercadoPago / Binance Pay / bank transfer.    │
│ When the payment confirms, you tell your Keeper "go".      │
└────────────────────────────────────────────────────────────┘

┌─ Step 7 ──────────────────────────────────────────────────┐
│ Keeper executes on-chain (see "Keeper" perspective below). │
│ UI polls /api/intent/[jobId] every 2s and shows:           │
│   pending → validating → queued → broadcasting → confirmed │
│ Final message: "Confirmed · tx 0x… · block N"              │
└────────────────────────────────────────────────────────────┘

┌─ Step 8 ──────────────────────────────────────────────────┐
│ The NFT is now in the buyer's wallet. Visible in Ronin     │
│ Wallet / Mavis Market / any wallet that reads ERC-721.     │
└────────────────────────────────────────────────────────────┘
```

### 2. The Keeper (the operator — that's you)

You run this infra. You have a hot wallet (`KEEPER_ADDRESS`) that:

- Holds NFT inventory (either pre-bought from the secondary market or
  minted by you)
- Holds RON for gas (a few RON covers hundreds of executions)
- Has `setApprovalForAll(IntentAggregator, true)` granted on every NFT
  collection you want to deliver

When `/api/intent` receives a signed intent:

| Stage          | What the relayer does                                              |
| -------------- | ------------------------------------------------------------------ |
| `pending`      | Stored in the in-memory queue, idempotency key = intentHash        |
| `validating`   | Re-derives EIP-712 digest, recovers signer, checks deadline/amount |
| `queued`       | Calls `simulateContract` — surfaces deterministic reverts free     |
| `broadcasting` | `writeContract` with explicit nonce from `getTransactionCount`     |
| `confirmed`    | `waitForTransactionReceipt` succeeded, NFT delivered               |
| `failed`       | Validation or broadcast error — `error` field has the reason       |

**Nonce management:** the queue is single-flight (one in-flight tx at a
time per Keeper wallet) so we never hit `nonce too low` /
`replacement transaction underpriced`. For higher throughput, shard
across multiple Keeper EOAs (one queue each).

**Idempotency:** if the same `intent + signature` is submitted twice,
the second request returns the same `jobId`. The on-chain
`executedIntents[intentHash]` mapping is the second line of defense.

### 3. The NFT collection / marketplace integrator

If you're a collection or marketplace wanting to offer fiat checkout to
your users:

1. Mint or transfer NFTs to the Keeper wallet
2. The Keeper calls `setApprovalForAll(IntentAggregator, true)` once
3. You point your fiat-checkout button to your RWIA frontend (or call
   `/api/intent` from your own UI with the user's signature)

You keep your contract, your branding, your royalties. RWIA is just the
delivery rail.

---

## On-chain vs off-chain split

| Concern               | On-chain (the contract) | Off-chain (you, the Keeper)            |
| --------------------- | ----------------------- | -------------------------------------- |
| Signature validity    | ✅ EIP-712, ECDSA       | ✅ Pre-validated to save gas           |
| Deadline enforcement  | ✅ Strict `<` check     | ✅ Pre-checked before broadcast        |
| Replay protection     | ✅ `executedIntents`    | ✅ Queue idempotency                   |
| Payment collection    | ❌                      | ✅ Stripe / PSP / bank                  |
| NFT inventory         | ❌ (just transfers)     | ✅ You pre-acquire                     |
| Gas funding           | ❌                      | ✅ Keeper wallet pays                  |
| Refunds               | ❌                      | ✅ Fiat refund via your PSP            |
| Pricing               | ❌ (records amount)     | ✅ You set the markup over inventory   |

---

## What's guaranteed on-chain

- **NFT can only go to the wallet that signed.** Signature recovers to
  `intent.user`; the transfer destination is `intent.user`. The Keeper
  cannot deliver to anyone else.
- **A signature is single-use.** `executedIntents[intentHash] = true`
  before the transfer; re-submission reverts with `IntentAlreadyExecuted`.
- **Expired signatures die.** Anything past `deadline` reverts with
  `IntentExpired(deadline, now)`.
- **Only KEEPER_ROLE can execute.** Random third parties cannot drain
  your inventory by replaying signatures from elsewhere.
- **Admin can pause.** If the Keeper key leaks, admin pauses the
  contract from a multisig; KEEPER_ROLE is revoked; new Keeper rotated.
- **Upgrades are time-locked.** `UPGRADER_ROLE` is held by a
  `TimelockController`, not an EOA. Schedule → wait delay → execute.
  Gives users time to exit if something controversial is queued.

---

## What we explicitly DON'T do (so reviewers don't get confused)

- We do **not** process the user's fiat payment. That's your PSP.
- We do **not** custody the user's funds in any token. Off-chain
  payment flows directly to your business account.
- We do **not** buy NFTs from a marketplace at execution time. The
  Keeper pre-acquires inventory. (V2 may add just-in-time market buys.)
- We do **not** bridge across chains in V1. The roadmap V2 introduces
  Chainlink CCIP via UUPS upgrade — see `contracts/v2-roadmap/`.

---

## Live deployment — Ronin Mainnet (chainId 2020)

| Contract                  | Address                                       | Explorer |
| ------------------------- | --------------------------------------------- | -------- |
| IntentAggregator proxy    | `0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5`  | <https://app.roninchain.com/address/0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5> |
| IntentAggregator impl     | `0x1e2cA35cc4CC6036FcCAac4B84F4825dA95e1479`  | <https://app.roninchain.com/address/0x1e2cA35cc4CC6036FcCAac4B84F4825dA95e1479> |
| TimelockController        | `0x7862E95164a9F5a9A87Ce9019fD73b6Fe3004123`  | <https://app.roninchain.com/address/0x7862E95164a9F5a9A87Ce9019fD73b6Fe3004123> |
| TestNFT                   | `0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2`  | <https://app.roninchain.com/address/0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2> |
| Keeper EOA                | `0x3006c0EefbCdC8AFF12D3D455376FD97d1266A5e`  | <https://app.roninchain.com/address/0x3006c0EefbCdC8AFF12D3D455376FD97d1266A5e> |

The Keeper holds TestNFT ids 1-5 and has `setApprovalForAll` granted on
the proxy `0x2D3E5B…`.

⚠️ Earlier broken deploy `0x4828…` is the implementation **bricked** by
`_disableInitializers()` — do NOT use it. Always point clients at the
proxy `0x2D3E5B…`.

---

## Smoke test — end-to-end in 5 minutes

> Prerequisites: `app/.env.local` has the values above; KEEPER_PRIVATE_KEY
> is set; you have a Ronin Wallet on chain 2020.

```powershell
# 1. Start the app
cd app
npm run dev
# Open http://localhost:3000/app

# 2. (Sanity) Confirm the relayer is up
curl http://localhost:3000/api/health
# Expected: {"ready":true,"chainId":2020,"aggregator":"0x4828…","keeperAddress":"0x3006…"}

# 3. In the browser:
#    - Connect Ronin Wallet → make sure it switches to chain 2020
#    - NFT contract: 0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2
#    - Token id: 1 (or 2, 3, 4, 5)
#    - Payment token: 0xe514d9DEB7966c8BE0ca922de8a064264eA6bcd4  (WRON mainnet)
#    - Decimals: 18
#    - Amount: 1 (you "paid" 1 WRON off-chain, this is just for the log)
#    - Click Review & sign → confirm in wallet
#
# 4. The job advances pending → broadcasting → confirmed.
#    Check your wallet — the NFT (token id 1) should be there.
#    Check Ronin Explorer for the IntentAggregator address —
#    you'll see an IntentExecuted event.
```

If `simulateContract` reverts at the Keeper stage with
`ERC721InsufficientApproval` or `ERC721NonexistentToken`, that means
the Keeper does NOT own token id N or hasn't granted approval —
mint/transfer/approve from the Keeper EOA and retry.

---

## FAQ

**Q: Does the buyer need any crypto at all?**
A: No RON, no tokens. Just a wallet address (which they get for free by
installing Ronin Wallet, or for free via Waypoint social login).

**Q: What if the Keeper disappears with the user's fiat?**
A: The deadline kills the signature, but the on-chain contract cannot
refund fiat. This is why the Keeper role is operationally critical —
it requires reputation / escrow / regulation depending on jurisdiction.

**Q: Can two users buy the same NFT in parallel?**
A: Only one will succeed. The Keeper owns the NFT; once transferred,
the second `executeLocalIntent` reverts at `safeTransferFrom`. The
relayer surfaces this in `simulateContract` BEFORE spending gas, so
the failing user gets a clean `failed` status without losing money.

**Q: Why not just use a marketplace's built-in fiat checkout?**
A: Most don't have one for Ronin yet, and where they exist they are
opaque about settlement. RWIA is open-source, the contract is
verifiable, and you own the rail.

**Q: What about gas costs for the Keeper?**
A: ~150k gas per execution at current Ronin prices = a few cents.
Negligible compared to the markup you charge over inventory cost.
