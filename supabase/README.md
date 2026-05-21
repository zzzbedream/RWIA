# Supabase backing for RWIA

Persistent layer for the off-chain relayer. Activates the `SupabaseJobStore`
implementation so the system can run multi-worker (multiple Vercel
functions, multiple keeper hosts) without two processes ever delivering
the same intent.

## Bring-up

```bash
# 1. Create a Supabase project at https://supabase.com/dashboard
# 2. Push the schema:
supabase link --project-ref <your-ref>
supabase db push        # applies migrations/

# 3. In app/.env.local:
#    SUPABASE_URL=https://<ref>.supabase.co
#    SUPABASE_SERVICE_ROLE_KEY=<service role key from project settings>
#    RWIA_JOB_STORE=supabase
```

## Tables

| Table              | Purpose                                                  |
| ------------------ | -------------------------------------------------------- |
| `intents`          | Signed UserIntents + lifecycle status + claim columns    |
| `payments`         | Verified PSP webhook events (Transak, Stripe, mock)      |
| `events`           | On-chain `IntentExecuted` / `Paused` / role events       |
| `keeper_balances`  | Periodic RON balance snapshots — feeds /api/health       |

## Concurrency model — `FOR UPDATE SKIP LOCKED`

The hot path is `claim_next_intent(shard, claimed_by)` (Postgres function).
Two relayer workers polling the same shard hit this RPC in parallel:

```sql
select job_id from intents
 where shard_index = $1 and paid and status in ('pending','awaiting_payment')
   and (claimed_by is null or claimed_at < now() - interval '5 minutes')
 order by created_at asc
 for update skip locked
 limit 1;
```

The `SKIP LOCKED` clause is the crucial bit: peer transactions see the row
as locked by another transaction and **skip it** instead of blocking.
Each worker picks a different row; double-claim is impossible.

The 5-minute reclaim window covers worker crashes — if a process dies
mid-broadcast, its claim expires and another worker picks the job back up.

## RLS

The service role key can do anything. The anon role can read the public
views (`daily_volume`, `keeper_latest_balance`) for the dashboard but
cannot touch the raw tables. Front-end dashboard pages go through the
anon role; the Node relayer uses the service role.

## Cost / scale notes

- For ≤ 100k intents/month, the free Supabase tier is enough.
- The `intents` table is the only hot writer (~1 INSERT + 4-5 UPDATEs per
  intent). Index `idx_intents_claim_lane` is partial (only paid+pending
  rows) so it stays tiny.
- The `events` table grows linearly; consider rolling it monthly to a
  cold storage bucket once we have > 1M rows.

## Why not just keep it in-memory?

In-memory works today because we ship one Vercel function. The moment we
go multi-region or scale to several keepers on independent hosts, every
worker would re-discover jobs from the chain on restart and could race
on nonce. Persistent + `SKIP LOCKED` is the standard pattern for queue
workers; we're putting the rails in early instead of retrofitting later.
