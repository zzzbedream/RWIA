# Risk Mitigations — Pre-Grant-Submit Audit Response (v2)

> Honest response to four valid concerns raised in the technical review.
> Each risk has a **status today**, the **mitigation already in the repo**,
> and a **next step before mainnet rollout**. No theatre — if something is
> not done, it is marked as such.

---

## R1 · Keeper EOA single point of failure (mitigated)

**The risk.** A single Keeper EOA executes all intents → nonce collision
under concurrent load, single mempool slot, single key to rotate.

**Mitigation shipped in this repo.**

- `KEEPER_PRIVATE_KEYS` (plural, comma-separated) now unlocks multi-keeper
  sharding. See [`app/src/lib/relayer/config.ts`](app/src/lib/relayer/config.ts).
- One **single-flight queue per keeper** in
  [`app/src/lib/relayer/queue.ts`](app/src/lib/relayer/queue.ts) — each
  shard owns its own walletClient + nonce; two intents on the same key
  never race.
- Jobs are deterministically sharded by `intentHash` (first byte mod N)
  so re-submission of the same intent always lands on the same keeper
  (preserves the on-chain `executedIntents` replay guard).
- `/api/health` reports all keeper addresses + the shard count.

**What still needs to happen.**

- Provision **3–5 keeper EOAs**, fund each with ~5 RON, set
  `KEEPER_PRIVATE_KEYS=pk1,pk2,pk3,pk4,pk5` in production env.
- Grant `KEEPER_ROLE` on the aggregator to **each** keeper EOA via the
  admin multisig (1 call per keeper).
- Each keeper EOA must run `setApprovalForAll` on every NFT collection
  it will deliver.
- For load beyond ~50 intents/s, swap the in-memory queue for BullMQ +
  Redis or migrate to a managed relayer network (Gelato, OpenZeppelin
  Defender, Pimlico). The adapter contract in
  [`app/src/lib/relayer/executor.ts`](app/src/lib/relayer/executor.ts)
  is the only file that needs to change.

**Verification.** `curl http://localhost:3000/api/health` returns
`shards: N` after configuring N keepers.

---

## R2 · "Security theatre" Timelock (mitigation script shipped, deployment pending)

**The risk.** A TimelockController exists, but the deployer EOA
(`0x3006…`) is still its sole proposer + canceller. The Timelock cannot
protect users from an EOA that is the only one allowed to schedule
upgrades.

**Mitigation shipped in this repo.**

- New script
  [`contracts/script/HandoffToMultisig.s.sol`](contracts/script/HandoffToMultisig.s.sol).
- Atomically:
    1. Grants `PROPOSER_ROLE` + `CANCELLER_ROLE` to the multisig on the
       Timelock.
    2. Grants `DEFAULT_ADMIN_ROLE` + `ADMIN_ROLE` to the multisig on the
       aggregator.
    3. Renounces all those roles for the deployer EOA.
    4. Logs the post-handoff `hasRole` state so the operator can confirm.
- `SKIP_RENOUNCE=1` env flag for a staged migration where you keep the
  EOA temporarily as a safety net during the multisig setup.

**What still needs to happen.**

1. Deploy a [Ronin Safe](https://safe.roninchain.com) with at least 3-of-5
   threshold (4-of-7 recommended for mainnet).
2. Add the chosen signers (independent devices, different orgs).
3. Run the handoff script from the deployer EOA:
   ```bash
   AGGREGATOR_PROXY=0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5 \
   TIMELOCK_ADDRESS=0x7862E95164a9F5a9A87Ce9019fD73b6Fe3004123 \
   MULTISIG_ADDRESS=0xYourRoninSafe \
   forge script script/HandoffToMultisig.s.sol:HandoffToMultisig \
       --rpc-url ronin_mainnet --broadcast --slow \
       --private-key $PRIVATE_KEY -vvv
   ```
4. After the broadcast, re-verify with the diagnose endpoint and a
   `cast call hasRole` against both contracts.

**Why not done in this commit.** The multisig address is operational
configuration; we cannot pick it for the project team. The script is
ready; ship it once the Safe is provisioned.

---

## R3 · "Mock in production" (CI E2E pipeline shipped)

**The risk.** `RWIA_PAYMENT_PROVIDER=mock` and `RWIA_REQUIRE_PAYMENT=false`
shipped to the running mainnet relayer = the value-path is untested at
parity. Real PSPs (Transak, Stripe) have edge cases the mock doesn't.

**Mitigation shipped in this repo.**

- New CI workflow
  [`.github/workflows/e2e.yml`](.github/workflows/e2e.yml) that on every
  push:
    1. Spins up Anvil with `--fork-url <ronin-mainnet>` so the test runs
       against real protocol state.
    2. Runs `forge script Deploy --broadcast` against the fork.
    3. Boots the Next.js relayer with the real
       `/api/intent` + `/api/payments/*` endpoints.
    4. Executes [`scripts/e2e-intent.mjs`](scripts/e2e-intent.mjs) which
       deploys an ERC-721, mints to the keeper, signs an EIP-712 intent
       as a buyer, posts it, polls, and asserts the NFT moved.
- The same MockPaymentProvider that we use in dev runs in CI — but the
  rest of the pipeline (Solidity, EIP-712, relayer queue, executor) is
  the production code path.

**What still needs to happen.**

- Add a **second** CI job that flips `RWIA_PAYMENT_PROVIDER=transak` and
  uses Transak's STAGING API key (already supported via env in
  [`app/src/lib/payments/transak.ts`](app/src/lib/payments/transak.ts)).
  Requires a Transak sandbox account.
- Before flipping mainnet env to a real PSP, run a 24-hour shadow test:
  PSP fires real webhooks against staging URL, but executor stays in
  dry-run mode (`simulateContract` only).

---

## R4 · No indexer / RPC-only reads (subgraph stub shipped)

**The risk.** UI queries `/api/diagnose` which hits the RPC on each call.
At >100 intents/min the public Ronin RPC throttles; the dashboard freezes.

**Mitigation shipped in this repo.**

Full subgraph scaffold at [`indexer/`](indexer/):

- `subgraph.yaml` — manifest pointing at the deployed aggregator on Ronin
  Mainnet (chainId 2020), with handlers for `IntentExecuted`, `Paused`,
  `Unpaused`, `RoleGranted`, `RoleRevoked`.
- `schema.graphql` — entities `IntentExecuted`, `PauseEvent`,
  `RoleAssignment`, plus pre-aggregated `DailyVolume` and `KeeperStats`
  for fast dashboard reads.
- `mappings/aggregator.ts` — AssemblyScript handlers that translate
  events into entities and maintain the rollups (daily counts, per-keeper
  attribution).
- [`indexer/README.md`](indexer/README.md) — exact deploy commands for
  both Goldsky (native Ronin support) and The Graph hosted service.

**What still needs to happen.**

1. Generate ABIs (`cd contracts && forge build`) and copy
   `out/IntentAggregator.sol/IntentAggregator.json` to `indexer/abis/`.
2. `goldsky subgraph deploy rwia/v1 --path indexer`
3. Set `NEXT_PUBLIC_SUBGRAPH_URL` in the frontend env.
4. Swap the relevant React hooks to use `urql`/`@apollo/client` against
   the subgraph — `/api/diagnose` stays for ops health, but user-facing
   data goes through the GraphQL layer.

---

---

## v2 audit additions (post-review hardening)

### R5 · Off-chain Dead Letter Queue (shipped)

**The risk.** A single intent reverting in the EVM could block the
shard's single-flight queue forever. No off-chain isolation = one bad
signature stops all other buyers on that keeper.

**Mitigation in repo.**

- Executor split into three phases with **specific `dlqReason` values**
  (`simulate_revert`, `broadcast_error`, `tx_reverted`,
  `confirm_timeout`, `executor_timeout`, `executor_crash`). Each failure
  classifies its own root cause for ops. See
  [`app/src/lib/relayer/executor.ts`](app/src/lib/relayer/executor.ts).
- **Pre-flight `simulateContract`** runs FIRST. A deterministic revert
  (signature, role, NFT missing) puts the job in DLQ **without
  broadcasting**, so no RON is wasted.
- **Per-job timeout** in [`queue.ts`](app/src/lib/relayer/queue.ts):
  `Promise.race(executor, setTimeout(180_000))`. A hung executor cannot
  starve the rest of the shard's queue.
- **`GET /api/dlq`** endpoint
  ([route](app/src/app/api/dlq/route.ts)) returns failed jobs newest
  first, gated by `RWIA_OPS_TOKEN`. Operators see exactly which intents
  failed, why, and on which shard.

### R6 · Gas starvation telemetry (shipped)

**The risk.** Keeper EOAs run out of RON silently. `/api/health`
previously only reported addresses; an alert manager couldn't tell
when to top up.

**Mitigation in repo.**

- [`/api/health`](app/src/app/api/health/route.ts) now iterates **every**
  keeper, reads `getBalance`, classifies each as `ok | degraded |
  critical` against `RWIA_KEEPER_HEALTHY_RON` /
  `RWIA_KEEPER_CRITICAL_RON` thresholds, and rolls up to a top-level
  `status`.
- Returns HTTP **207** when degraded and **503** when any keeper is
  critical, so scrapers like Prometheus / UptimeRobot / Better Uptime
  page on-call without parsing JSON.

### R7 · Handoff safeguards (shipped)

**The risk.** `HandoffToMultisig.s.sol` could renounce to a zero
address / EOA / uninitialized contract = irreversible governance loss.

**Mitigation in repo.**

[`HandoffToMultisig.s.sol`](contracts/script/HandoffToMultisig.s.sol)
now refuses to broadcast unless:

1. `multisig.code.length > 0` — the destination is a deployed contract.
2. `staticcall(getOwners())` succeeds and returns `≥ 1` signer — the
   destination is an initialized Safe.
3. `staticcall(getThreshold())` returns `≥ 1` — the Safe has a sane
   threshold; a 1-of-1 surfaces an explicit `WARNING` log.

All three are pre-flight (in `view` context) so a misconfigured handoff
costs only the simulation's gas estimation — never the renounce.

### R8 · Subgraph lag fallback (shipped)

**The risk.** UI exclusively reads from the subgraph → users see stale
state during a Goldsky outage or chain reorg lag.

**Mitigation in repo.**

[`app/src/lib/indexer/client.ts`](app/src/lib/indexer/client.ts):
- Queries the subgraph WITH `_meta { block { number } }`.
- Reads the live chain head via RPC.
- If `head - indexedBlock > NEXT_PUBLIC_INDEXER_MAX_LAG_BLOCKS` (default
  50, ~3 min on Ronin), falls back to direct `eth_getLogs`.
- Each row carries a `source` field (`subgraph` / `rpc-fallback`) so
  the UI can render a "Showing live RPC data — indexer is X blocks
  behind" hint when degraded.

---

## Supabase data layer (preparation for prod scale)

R5-R8 cover behaviour-level safety; the next risk is **state-level
durability**. The current in-memory queue is fine for single-Vercel
deployment, but a restart drops everything in flight.

**Shipped:**

- Storage-agnostic
  [`JobStore`](app/src/lib/relayer/store/types.ts) interface.
- Two implementations:
  [`InMemoryJobStore`](app/src/lib/relayer/store/memory.ts) (today) and
  [`SupabaseJobStore`](app/src/lib/relayer/store/supabase.ts) (wire-ready
  stub).
- Full SQL schema in
  [`supabase/migrations/20260516000000_init_rwia.sql`](supabase/migrations/20260516000000_init_rwia.sql)
  with `intents`, `payments`, `events`, `keeper_balances` tables plus
  RLS, indexes, and the **`claim_next_intent(shard, claimed_by)`**
  Postgres function using `FOR UPDATE SKIP LOCKED` for race-safe
  multi-worker dequeue.
- [`DATA-ARCHITECTURE.md`](DATA-ARCHITECTURE.md) — explains the
  two-worlds split and the migration path.

Flip `RWIA_JOB_STORE=supabase` after running the migrations and the
relayer becomes multi-worker.

---

## CI / automation (shipped)

[`.github/workflows/contracts-ci.yml`](.github/workflows/contracts-ci.yml)
now runs on every PR with **four parallel jobs**:

| Job              | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| `test`           | `forge fmt --check` · `forge build --sizes` · `forge test` |
| `slither`        | Static analysis with `--fail-medium` (blocks PRs)          |
| `gas-snapshot`   | `forge snapshot --check` + diff vs `main` posted to PR     |
| `storage-layout` | Uploads layout artifact (manual upgrade-safety review)     |

And the existing
[`e2e.yml`](.github/workflows/e2e.yml) spins up Anvil with a Ronin
mainnet fork and runs the full intent flow end-to-end so we never
ship "mock-in-prod".

---

## Status matrix (one-page summary for the grant committee)

| Risk | Severity | In-repo mitigation | Operational step to close |
| ---- | -------- | ------------------ | ------------------------- |
| R0 Bricked direct deploy | **RESOLVED** | Re-deployed via `Deploy.s.sol` at `0x2D3E5B0d…` | n/a |
| R1 Keeper bottleneck / nonce collision | High | Multi-keeper sharding queue + executor | Provision N keepers, fund, grant role |
| R2 Timelock theatre | High | `HandoffToMultisig.s.sol` script with safeguards | Deploy Ronin Safe + run script |
| R3 Mock in prod / no E2E | Medium | CI workflow `e2e.yml` + `e2e-intent.mjs` | Add Transak STAGING job |
| R4 RPC-only reads | Medium | Subgraph in `indexer/` + frontend fallback | `goldsky subgraph deploy` |
| **R5 Shard blocking on revert** | High | DLQ classes + timeout + `/api/dlq` | Wire alerts to dashboard |
| **R6 Gas starvation telemetry** | High | `/api/health` per-keeper balance + status | Scrape with Prometheus/UptimeRobot |
| **R7 Handoff bricking** | High | Solidity `require(code.length>0)` + Safe `getOwners()`/`getThreshold()` checks | Deploy Safe + dry-run |
| **R8 Subgraph lag** | Medium | `indexer/client.ts` with RPC fallback on lag | Tune `MAX_LAG_BLOCKS` per env |
| State-level durability | Medium | `JobStore` interface + `SupabaseJobStore` stub + SQL with `SKIP LOCKED` | Apply migrations + flip env var |
| CI security gates | Medium | Slither mandatory + gas snapshot diff in PRs | Configure `RONIN_MAINNET_RPC_URL` secret |

The architecture in this repo is **future-proof** for each of the
operational steps above — none of them require contract changes. The
UUPS proxy can be upgraded via the timelock if a deeper refactor is
needed later.
