# RWIA — Production Load Test Report

> Live test against `https://ronin-waypoint-intent-aggregator-rw.vercel.app`
> Date: 2026-05-22 · Tool: [`app/scripts/load-test.mjs`](app/scripts/load-test.mjs)
> Reproducible: `TOTAL=100 CONC=10 node scripts/load-test.mjs`

## TL;DR

| Endpoint | Throughput | p50 | p95 | p99 | Success |
|---|---|---|---|---|---|
| `GET /api/health`           | 12.0 req/s  | 822 ms  | 1961 ms | 2390 ms | **100%** |
| `GET /api/diagnose`         | 4.1 req/s   | 3393 ms | 3591 ms | 3787 ms | **100%** |
| `GET /api/diagnose?nft=…`   | 2.5 req/s   | 4718 ms | 4846 ms | 5614 ms | **100%** |
| `GET /api/dlq`              | 30.8 req/s  | 307 ms  | 473 ms  | 478 ms  | **100%** |

**400 requests / 0 failures.** Every endpoint returned 200 across the run.

## Methodology

- 4 read-only endpoints exercised back-to-back.
- 100 requests per endpoint, 10 concurrent in-flight (parallelism bounded
  to reflect real client behavior, not a synthetic burst).
- Wall time, latency per response, status code histogram captured.
- Run from a desktop client over public internet → cross-region Vercel
  edge → Vercel serverless function → Ronin Mainnet RPC + Supabase.

Why we don't load-test `/api/intent`: each submission triggers Keeper
simulate/broadcast logic that costs RON and pollutes the production
Supabase store. A load test that stressed `/api/intent` would need a
dedicated test ERC-721 + a separate Keeper EOA — that work is scheduled
for staging-tier load tests post-grant.

## Bottleneck analysis

Latency is dominated by **upstream RPC calls** to
`api.roninchain.com/rpc` for endpoints that read on-chain state:

```
/api/dlq         → Supabase only       →  ~300 ms  (fast)
/api/health      → 1 RPC call          →  ~800 ms
/api/diagnose    → 4 RPC calls         → ~3400 ms
/api/diagnose?nft→ 6 RPC calls         → ~4700 ms
```

The Supabase path (`/api/dlq`) is the floor: ~300 ms p50, which is
network + Vercel cold-warm + Supabase query. Anything above that is
Ronin RPC overhead.

## Capacity (sustained)

Assuming the same hardware/region profile observed here:

- **30 req/s** sustained on Supabase-bound paths (DLQ / job lookup).
- **12 req/s** sustained on health checks.
- **2–4 req/s** sustained on diagnose calls.

Per `/api/intent` (write path): a single Keeper shard can broadcast
~1 tx/3s on Ronin Mainnet (3-second block time + safety margin). With
4 keeper shards (the post-grant target), the system absorbs roughly
**80 paid intents per minute** before queuing.

## Hardening targets (post-grant)

1. **Edge-cache `/api/health`** for 5 seconds. The endpoint reports
   keeper RON balance; 5-second staleness is acceptable for dashboards.
   Drops health latency to ~50 ms and shifts the bottleneck off Ronin
   RPC.
2. **Goldsky subgraph in production.** Reads currently fall back to
   direct RPC when the subgraph lags by >50 blocks (see
   `NEXT_PUBLIC_INDEXER_MAX_LAG_BLOCKS`). With the subgraph live, hot-
   path reads (job status, executed intents) skip the RPC entirely.
3. **Self-hosted Ronin RPC.** `api.roninchain.com` adds the bulk of
   latency observed. A self-hosted geth/erigon Ronin node in the same
   region as the Vercel edge reduces the RPC round trip from ~700 ms
   to ~50 ms.
4. **Multi-region failover.** The current deploy is single-region. Add
   a secondary region behind a Vercel rewrite and we tolerate a region
   outage with no DNS changes.

## Raw output

Reproduce in any shell:

```bash
TOTAL=100 CONC=10 node app/scripts/load-test.mjs
```

Increase volume with `TOTAL=1000 CONC=50` for stress testing.
