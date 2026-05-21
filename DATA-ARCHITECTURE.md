# Data Architecture — "Two worlds" backing for RWIA

> Same code, two storage backends. Toggled by a single env var so we
> ship a dev experience that doesn't need a Supabase project and a prod
> experience that scales horizontally with multiple workers.

---

## The split

| Concern              | World 1 — Dev / single node | World 2 — Prod / multi-worker |
| -------------------- | --------------------------- | ----------------------------- |
| Job queue            | `InMemoryJobStore` (Map)    | `SupabaseJobStore` (Postgres) |
| Persistence          | None (process-local)        | Durable                       |
| Concurrent workers   | 1                           | N (workers race-safe via `SKIP LOCKED`) |
| Indexer for UI       | RPC reads via `/api/diagnose` | Goldsky subgraph + RPC fallback |
| PSP webhook log      | RAM only                    | `payments` table              |
| Keeper telemetry     | `/api/health` live read     | `keeper_balances` snapshots + view |
| Activation           | default                     | `RWIA_JOB_STORE=supabase`     |

The interface
[`app/src/lib/relayer/store/types.ts`](app/src/lib/relayer/store/types.ts)
isolates the choice. The queue/executor never know which back-end they
talk to.

---

## World 1 — Dev / single-node

What's running today on the live mainnet deployment:

```
Browser → Next.js API route (/api/intent)
              │
              ▼
         InMemoryJobStore  ──►  Queue (sharded by intentHash)
              │                       │
              │                       ▼
              │                  Executor → RPC (Ronin)
              ▼
        Map<jobId, job>          ↑
                                 │
                                 └ writes back via updateJob()
```

- Zero external dependencies (no Postgres, no Redis).
- Reboot = lose in-flight jobs. The on-chain `executedIntents` mapping
  is the source of truth so re-submitted intents land in DLQ as
  `simulate_revert` instead of double-delivering.
- Perfect for the demo and the grant smoke test.

---

## World 2 — Prod / Supabase

```
Browser → Next.js (POST /api/intent)
              │
              ▼
       SupabaseJobStore  ←──►  Postgres (intents, payments, events, keeper_balances)
              │                        ▲
              │                        │   FOR UPDATE SKIP LOCKED
              ▼                        │
   N keeper workers (each polls)  ──────┘
              │
              ▼
        Executor → RPC (Ronin)
              │
              ▼
      Subgraph (Goldsky) ◄── RWIA contract events  ──► RPC fallback (lag > N blocks)
```

- Each keeper worker is a stateless process. Restart-safe: the
  `claimed_at < now() - 5 min` clause reclaims orphaned rows.
- Multi-region / multi-host friendly. Two workers cannot dispatch the
  same intent because `SKIP LOCKED` returns different rows.
- The dashboard reads pre-aggregated views (`daily_volume`,
  `keeper_latest_balance`) instead of round-tripping the RPC for every
  card.

### Why `FOR UPDATE SKIP LOCKED`

Postgres native. Single-query atomic claim. No advisory locks, no
external coordinator, no Redis Lua script. The relevant SQL lives in
`supabase/migrations/20260516000000_init_rwia.sql`:

```sql
SELECT job_id FROM intents
 WHERE shard_index = $1 AND paid AND status IN ('pending','awaiting_payment')
   AND (claimed_by IS NULL OR claimed_at < now() - interval '5 minutes')
 ORDER BY created_at ASC
 FOR UPDATE SKIP LOCKED
 LIMIT 1;
```

Two workers running this at the same instant get **different** rows.
The losing query doesn't block — it picks the next eligible row. This
is the canonical pattern for queue workers on Postgres.

---

## Wiring the front-end to either world

The dashboard never talks to the store directly. It uses:

| Endpoint               | World 1 source            | World 2 source                       |
| ---------------------- | ------------------------- | ------------------------------------ |
| `GET /api/health`      | in-process snapshot       | RPC live + `keeper_latest_balance`   |
| `GET /api/intent/:id`  | `InMemoryJobStore.get`    | `SupabaseJobStore.get`               |
| `GET /api/dlq`         | `InMemoryJobStore.listDlq` | `SupabaseJobStore.listDlq`          |
| `GET /api/diagnose`    | RPC (same in both)        | RPC (same in both)                   |
| User intent history    | Direct RPC `eth_getLogs`  | Subgraph (with RPC fallback if lag)  |

The indexer fallback logic lives in
[`app/src/lib/indexer/client.ts`](app/src/lib/indexer/client.ts):
queries the subgraph, reads its `_meta.block.number`, compares to the
chain head, and falls back to `eth_getLogs` if the indexer is more than
`NEXT_PUBLIC_INDEXER_MAX_LAG_BLOCKS` (default 50, ~3 min on Ronin)
behind. The UI never serves stale data without surfacing the source.

---

## Migration path (today → Supabase)

1. Create Supabase project, copy URL + service role key.
2. Apply migrations: `supabase db push`.
3. Set in `app/.env.local`:
   ```
   RWIA_JOB_STORE=supabase
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
4. Wire the actual Postgres calls inside `SupabaseJobStore` (today it
   throws "not implemented" so a misconfiguration fails loud). The SQL
   is already documented; we kept it as a stub because the project still
   runs single-instance and we want the operator to consciously flip
   the switch.
5. Deploy the subgraph following [`indexer/README.md`](indexer/README.md).
6. Set `NEXT_PUBLIC_SUBGRAPH_URL` in the front-end env and the indexer
   client starts using it (with RPC fallback) automatically.

The smart contracts don't change. Storage is fully external.
