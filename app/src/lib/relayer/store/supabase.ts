import {createClient, type SupabaseClient} from "@supabase/supabase-js";
import {hexToBytes, bytesToHex} from "viem";

import type {IntentJob} from "../types";
import type {JobStore} from "./types";

// Postgres JobStore backed by Supabase.
// Concurrency via claim_next_intent(shard, claimed_by) (SELECT ... FOR UPDATE SKIP LOCKED).
// Schema: supabase/migrations/20260516000000_init_rwia.sql.

type IntentRow = {
    job_id: string;
    intent_hash: string;          // bytea -> hex string from supabase-js
    chain_id: number;
    aggregator: string;
    user_address: string;
    token_address: string;
    amount: string;               // numeric -> string
    nft_contract: string;
    token_id: string;
    deadline: string;             // timestamptz ISO
    nonce: string;
    signature: string;            // bytea -> hex
    status: IntentJob["status"];
    paid: boolean;
    shard_index: number | null;
    claimed_by: string | null;
    claimed_at: string | null;
    tx_hash: string | null;
    block_number: number | null;
    error: string | null;
    dlq_reason: IntentJob["dlqReason"] | null;
    created_at: string;
    updated_at: string;
};

export class SupabaseJobStore implements JobStore {
    readonly kind = "supabase" as const;
    private readonly client: SupabaseClient;

    constructor() {
        const url = process.env.SUPABASE_URL;
        // Support both legacy (SUPABASE_SERVICE_ROLE_KEY) and new (SUPABASE_SECRET_KEY) names.
        const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url) throw new Error("SUPABASE_URL missing");
        if (!secret) throw new Error("SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) missing");
        this.client = createClient(url, secret, {
            auth: {persistSession: false, autoRefreshToken: false},
        });
    }

    async put(job: IntentJob): Promise<IntentJob> {
        // Idempotent insert keyed on intent_hash.
        const row = jobToRow(job);
        const {data, error} = await this.client
            .from("intents")
            .upsert(row, {onConflict: "intent_hash", ignoreDuplicates: false})
            .select()
            .single();
        if (error) throw new Error(`supabase.put: ${error.message}`);
        return rowToJob(data as IntentRow);
    }

    async get(jobId: string): Promise<IntentJob | undefined> {
        const {data, error} = await this.client
            .from("intents")
            .select("*")
            .eq("job_id", jobId)
            .maybeSingle();
        if (error) throw new Error(`supabase.get: ${error.message}`);
        return data ? rowToJob(data as IntentRow) : undefined;
    }

    async getByIntentHash(intentHash: string): Promise<IntentJob | undefined> {
        const {data, error} = await this.client
            .from("intents")
            .select("*")
            .eq("intent_hash", toBytea(intentHash))
            .maybeSingle();
        if (error) throw new Error(`supabase.getByIntentHash: ${error.message}`);
        return data ? rowToJob(data as IntentRow) : undefined;
    }

    async update(jobId: string, patch: Partial<IntentJob>): Promise<void> {
        const rowPatch = patchToRow(patch);
        const {error} = await this.client.from("intents").update(rowPatch).eq("job_id", jobId);
        if (error) throw new Error(`supabase.update: ${error.message}`);
    }

    async release(intentHash: string, _claimedBy: string): Promise<IntentJob | undefined> {
        // Flip paid=true once. Conditional update guards duplicate webhooks.
        const {data, error} = await this.client
            .from("intents")
            .update({paid: true, status: "pending", updated_at: new Date().toISOString()})
            .eq("intent_hash", toBytea(intentHash))
            .eq("paid", false)
            .select()
            .maybeSingle();
        if (error) throw new Error(`supabase.release: ${error.message}`);
        return data ? rowToJob(data as IntentRow) : undefined;
    }

    async claimNext(shardIndex: number, claimedBy: string): Promise<IntentJob | undefined> {
        const {data, error} = await this.client.rpc("claim_next_intent", {
            p_shard: shardIndex,
            p_claimed_by: claimedBy,
        });
        if (error) throw new Error(`supabase.claimNext: ${error.message}`);
        if (!data || (Array.isArray(data) && data.length === 0)) return undefined;
        const row = Array.isArray(data) ? data[0] : data;
        return rowToJob(row as IntentRow);
    }

    async listDlq(limit: number): Promise<IntentJob[]> {
        const {data, error} = await this.client
            .from("intents")
            .select("*")
            .eq("status", "failed")
            .order("updated_at", {ascending: false})
            .limit(limit);
        if (error) throw new Error(`supabase.listDlq: ${error.message}`);
        return (data ?? []).map((r) => rowToJob(r as IntentRow));
    }

    async prune(olderThanMs: number): Promise<number> {
        const cutoff = new Date(Date.now() - olderThanMs).toISOString();
        const {error, count} = await this.client
            .from("intents")
            .delete({count: "exact"})
            .in("status", ["confirmed", "failed"])
            .lt("updated_at", cutoff);
        if (error) throw new Error(`supabase.prune: ${error.message}`);
        return count ?? 0;
    }
}

// Mappers

function toBytea(hex: string): string {
    return hex.startsWith("0x") ? hex : `0x${hex}`;
}

function fromBytea(value: string | null): `0x${string}` | undefined {
    if (!value) return undefined;
    if (value.startsWith("\\x")) return (`0x${value.slice(2)}`) as `0x${string}`;
    if (value.startsWith("0x")) return value as `0x${string}`;
    return (`0x${value}`) as `0x${string}`;
}

function jobToRow(job: IntentJob): Partial<IntentRow> {
    return {
        job_id: job.jobId,
        intent_hash: toBytea(job.intentHash),
        chain_id: Number(process.env.RELAYER_CHAIN_ID ?? process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? 2020),
        aggregator: toBytea(process.env.NEXT_PUBLIC_AGGREGATOR_ADDRESS ?? "0x"),
        user_address: toBytea(job.intent.user),
        token_address: toBytea(job.intent.tokenAddress),
        amount: job.intent.amount.toString(),
        nft_contract: toBytea(job.intent.nftContract),
        token_id: job.intent.tokenId.toString(),
        deadline: new Date(Number(job.intent.deadline) * 1000).toISOString(),
        nonce: job.intent.nonce.toString(),
        signature: toBytea(job.signature),
        status: job.status,
        paid: job.paid,
        shard_index: job.shardIndex ?? 0,
        tx_hash: job.txHash ? toBytea(job.txHash) : null,
        block_number: job.blockNumber ? Number(job.blockNumber) : null,
        error: job.error ?? null,
        dlq_reason: job.dlqReason ?? null,
    };
}

function patchToRow(patch: Partial<IntentJob>): Partial<IntentRow> {
    const out: Partial<IntentRow> = {updated_at: new Date().toISOString()};
    if (patch.status !== undefined) out.status = patch.status;
    if (patch.paid !== undefined) out.paid = patch.paid;
    if (patch.txHash !== undefined) out.tx_hash = patch.txHash ? toBytea(patch.txHash) : null;
    if (patch.blockNumber !== undefined) out.block_number = patch.blockNumber ? Number(patch.blockNumber) : null;
    if (patch.error !== undefined) out.error = patch.error ?? null;
    if (patch.dlqReason !== undefined) out.dlq_reason = patch.dlqReason ?? null;
    if (patch.shardIndex !== undefined) out.shard_index = patch.shardIndex;
    return out;
}

function rowToJob(row: IntentRow): IntentJob {
    return {
        jobId: row.job_id,
        intentHash: fromBytea(row.intent_hash)!,
        signature: fromBytea(row.signature)!,
        intent: {
            user: fromBytea(row.user_address)!,
            tokenAddress: fromBytea(row.token_address)!,
            amount: BigInt(row.amount),
            nftContract: fromBytea(row.nft_contract)!,
            tokenId: BigInt(row.token_id),
            deadline: BigInt(Math.floor(new Date(row.deadline).getTime() / 1000)),
            nonce: BigInt(row.nonce),
        },
        status: row.status,
        paid: row.paid,
        shardIndex: row.shard_index ?? 0,
        txHash: fromBytea(row.tx_hash),
        blockNumber: row.block_number?.toString(),
        error: row.error ?? undefined,
        dlqReason: row.dlq_reason ?? undefined,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
    };
}

export const __viemHelpers = {hexToBytes, bytesToHex};
