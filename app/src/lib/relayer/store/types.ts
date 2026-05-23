import type {IntentJob} from "../types";

/**
 * Storage-agnostic job store.
 *
 * Two implementations:
 *   - InMemoryJobStore   (dev, single-process, no persistence)
 *   - SupabaseJobStore   (multi-process, persistent, Postgres-backed)
 *
 * The relayer's queue/executor only talk to this interface; switching
 * back-ends is one env var (`RWIA_JOB_STORE=memory|supabase`).
 *
 * Concurrency contract: `claimNext` MUST atomically mark a job as in-flight
 * so that two relayer processes cannot deliver the same intent twice.
 * The Postgres impl uses `SELECT … FOR UPDATE SKIP LOCKED` (Postgres-native
 * row locking that simply skips rows another transaction has already
 * locked, ideal for queue workers).
 */
export interface JobStore {
    readonly kind: "memory" | "supabase";

    /** Insert a new job. Idempotent on `intentHash`: re-insert returns existing. */
    put(job: IntentJob): Promise<IntentJob>;

    get(jobId: string): Promise<IntentJob | undefined>;
    getByIntentHash(intentHash: string): Promise<IntentJob | undefined>;

    /** Partial update — only the fields present in `patch` change. */
    update(jobId: string, patch: Partial<IntentJob>): Promise<void>;

    /**
     * Mark an intent as paid AND atomically claim it for execution. Returns
     * the job if the caller now owns it, undefined if someone else already
     * claimed it or the job doesn't exist.
     *
     * Postgres impl: `UPDATE intents SET paid=true, claimed_by=$1 WHERE
     * intent_hash=$2 AND claimed_by IS NULL RETURNING *`.
     */
    release(intentHash: string, claimedBy: string): Promise<IntentJob | undefined>;

    /**
     * Atomically claim the next job ready for execution by this shard.
     * Reads the row with `FOR UPDATE SKIP LOCKED` so concurrent workers
     * never see the same job.
     *
     * Returns undefined if the shard has nothing to do (queue empty or all
     * eligible rows are claimed by peers).
     */
    claimNext(shardIndex: number, claimedBy: string): Promise<IntentJob | undefined>;

    /** Failed-terminal jobs for the operator dashboard. Newest first. */
    listDlq(limit: number): Promise<IntentJob[]>;

    /** TTL prune of confirmed/failed jobs older than `olderThanMs`. */
    prune(olderThanMs: number): Promise<number>;
}
