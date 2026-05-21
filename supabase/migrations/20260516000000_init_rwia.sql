-- ╭───────────────────────────────────────────────────────────────╮
-- │ RWIA · Supabase schema (V1)                                   │
-- │                                                                │
-- │ Persistent backing for the off-chain relayer. Tables:          │
-- │   intents          — signed UserIntents + status               │
-- │   payments         — PSP webhook events                        │
-- │   events           — on-chain IntentExecuted / Paused indexer  │
-- │   keeper_balances  — periodic RON balance snapshots for ops    │
-- │                                                                │
-- │ Concurrency: workers claim work with                           │
-- │   SELECT … FOR UPDATE SKIP LOCKED                              │
-- │ so multiple keeper processes never deliver the same intent.    │
-- ╰───────────────────────────────────────────────────────────────╯

create extension if not exists pgcrypto;

-- ─── intents ──────────────────────────────────────────────────────
create type intent_status as enum (
    'pending',
    'awaiting_payment',
    'validating',
    'queued',
    'broadcasting',
    'confirmed',
    'failed'
);

create type dlq_reason as enum (
    'simulate_revert',
    'broadcast_error',
    'confirm_timeout',
    'tx_reverted',
    'executor_timeout',
    'executor_crash'
);

create table if not exists intents (
    job_id            text primary key,
    intent_hash       bytea not null unique,
    chain_id          int  not null,
    aggregator        bytea not null,
    user_address      bytea not null,
    token_address     bytea not null,
    amount            numeric(78,0) not null,
    nft_contract      bytea not null,
    token_id          numeric(78,0) not null,
    deadline          timestamptz not null,
    nonce             numeric(78,0) not null,
    signature         bytea not null,
    status            intent_status not null default 'pending',
    paid              boolean not null default false,
    shard_index       int,
    claimed_by        text,
    claimed_at        timestamptz,
    tx_hash           bytea,
    block_number      bigint,
    error             text,
    dlq_reason        dlq_reason,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

-- Hot path: claim the next intent for this shard.
create index if not exists idx_intents_claim_lane
    on intents (shard_index, status, paid, created_at)
    where status in ('pending', 'awaiting_payment') and paid = true;

-- Dashboards
create index if not exists idx_intents_user on intents (user_address, created_at desc);
create index if not exists idx_intents_status on intents (status, updated_at desc);
create index if not exists idx_intents_dlq on intents (status, dlq_reason, updated_at desc)
    where status = 'failed';

-- Auto-bump updated_at on UPDATE
create or replace function bump_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger trg_intents_updated_at before update on intents
for each row execute function bump_updated_at();

-- ─── payments ─────────────────────────────────────────────────────
create type payment_kind as enum (
    'payment_succeeded',
    'payment_failed',
    'payment_refunded'
);

create table if not exists payments (
    id                 uuid primary key default gen_random_uuid(),
    intent_hash        bytea not null references intents (intent_hash) on delete cascade,
    provider           text not null,
    provider_session   text not null,
    kind               payment_kind not null,
    amount_paid        numeric(78,0),
    raw_payload        jsonb,
    received_at        timestamptz not null default now(),
    unique (provider, provider_session, kind)
);

create index if not exists idx_payments_intent on payments (intent_hash, received_at desc);

-- ─── events (chain indexer) ───────────────────────────────────────
create type chain_event_kind as enum ('IntentExecuted', 'Paused', 'Unpaused', 'RoleGranted', 'RoleRevoked');

create table if not exists events (
    id                bigserial primary key,
    kind              chain_event_kind not null,
    intent_hash       bytea,
    tx_hash           bytea not null,
    block_number      bigint not null,
    block_timestamp   timestamptz not null,
    payload           jsonb not null,
    unique (tx_hash, kind, intent_hash)
);

create index if not exists idx_events_block on events (block_number desc);
create index if not exists idx_events_intent on events (intent_hash, block_number desc);

-- ─── keeper_balances (telemetry) ──────────────────────────────────
create table if not exists keeper_balances (
    id              bigserial primary key,
    keeper_address  bytea not null,
    chain_id        int not null,
    balance_wei     numeric(78,0) not null,
    status          text not null check (status in ('ok','degraded','critical')),
    observed_at     timestamptz not null default now()
);

create index if not exists idx_keeper_balances_latest
    on keeper_balances (keeper_address, observed_at desc);

-- ─── claim_next() RPC ─────────────────────────────────────────────
-- Idempotent, race-safe pick of the next job for a given shard. Wraps
-- the FOR UPDATE SKIP LOCKED pattern so the Node relayer just calls this
-- function once per tick.
create or replace function claim_next_intent(p_shard int, p_claimed_by text)
returns intents as $$
declare
    target_id text;
    r intents;
begin
    select job_id
      into target_id
      from intents
     where shard_index = p_shard
       and paid = true
       and status in ('pending','awaiting_payment')
       and (claimed_by is null or claimed_at < now() - interval '5 minutes')
     order by created_at asc
     for update skip locked
     limit 1;

    if target_id is null then return null; end if;

    update intents
       set claimed_by = p_claimed_by,
           claimed_at = now(),
           status     = 'validating'
     where job_id = target_id
    returning * into r;
    return r;
end;
$$ language plpgsql;

-- ─── RLS (defense in depth) ───────────────────────────────────────
-- Only the service role can write. Anon role can read aggregated views.
alter table intents enable row level security;
alter table payments enable row level security;
alter table events enable row level security;
alter table keeper_balances enable row level security;

drop policy if exists "service_role_all" on intents;
create policy "service_role_all" on intents for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "service_role_all" on payments;
create policy "service_role_all" on payments for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "service_role_all" on events;
create policy "service_role_all" on events for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "service_role_all" on keeper_balances;
create policy "service_role_all" on keeper_balances for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

-- ─── Read views for the dashboard ─────────────────────────────────
create or replace view daily_volume as
select
    date_trunc('day', e.block_timestamp) as day,
    count(*)                              as intents_executed,
    sum((e.payload->>'amount')::numeric)  as total_amount
from events e
where e.kind = 'IntentExecuted'
group by 1
order by 1 desc;

create or replace view keeper_latest_balance as
select distinct on (keeper_address)
    keeper_address, chain_id, balance_wei, status, observed_at
from keeper_balances
order by keeper_address, observed_at desc;
