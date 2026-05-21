import type {IntentJob} from "../types";
import type {JobStore} from "./types";

/**
 * Single-process in-memory job store. Drop-in implementation of the
 * `JobStore` interface backed by Maps. Used today for development and
 * the current single-instance Vercel deployment.
 *
 * Limitations:
 *   - No persistence: a restart drops everything in flight.
 *   - Single process: cannot scale horizontally.
 *
 * The on-chain `executedIntents` mapping is the source of truth, so a
 * restart re-broadcasting the same intent is idempotent (the simulate
 * will revert with `IntentAlreadyExecuted` and the job ends up in DLQ).
 */
export class InMemoryJobStore implements JobStore {
    readonly kind = "memory" as const;

    private readonly jobs = new Map<string, IntentJob>();
    private readonly intentHashIndex = new Map<string, string>();

    async put(job: IntentJob): Promise<IntentJob> {
        const existingId = this.intentHashIndex.get(job.intentHash);
        if (existingId) {
            const existing = this.jobs.get(existingId);
            if (existing) return existing;
        }
        this.jobs.set(job.jobId, job);
        this.intentHashIndex.set(job.intentHash, job.jobId);
        return job;
    }

    async get(jobId: string): Promise<IntentJob | undefined> {
        return this.jobs.get(jobId);
    }

    async getByIntentHash(intentHash: string): Promise<IntentJob | undefined> {
        const id = this.intentHashIndex.get(intentHash);
        return id ? this.jobs.get(id) : undefined;
    }

    async update(jobId: string, patch: Partial<IntentJob>): Promise<void> {
        const j = this.jobs.get(jobId);
        if (!j) return;
        Object.assign(j, patch, {updatedAt: Date.now()});
    }

    async release(intentHash: string): Promise<IntentJob | undefined> {
        const j = await this.getByIntentHash(intentHash);
        if (!j) return undefined;
        if (j.paid) return j;
        j.paid = true;
        j.status = "pending";
        j.updatedAt = Date.now();
        return j;
    }

    /**
     * In-memory implementation: O(n) scan for the first paid/pending job on
     * this shard. Acceptable for N < 1000 in-flight jobs (the prune ceiling).
     * Postgres impl will use FOR UPDATE SKIP LOCKED instead.
     */
    async claimNext(shardIndex: number): Promise<IntentJob | undefined> {
        for (const j of this.jobs.values()) {
            if (
                j.paid &&
                (j.shardIndex ?? 0) === shardIndex &&
                (j.status === "pending" || j.status === "awaiting_payment")
            ) {
                return j;
            }
        }
        return undefined;
    }

    async listDlq(limit: number): Promise<IntentJob[]> {
        const out: IntentJob[] = [];
        for (const j of this.jobs.values()) if (j.status === "failed") out.push(j);
        out.sort((a, b) => b.updatedAt - a.updatedAt);
        return out.slice(0, limit);
    }

    async prune(olderThanMs: number): Promise<number> {
        const cutoff = Date.now() - olderThanMs;
        let removed = 0;
        for (const [id, j] of this.jobs) {
            const isTerminal = j.status === "confirmed" || j.status === "failed";
            if (isTerminal && j.updatedAt < cutoff) {
                this.jobs.delete(id);
                this.intentHashIndex.delete(j.intentHash);
                removed += 1;
            }
        }
        return removed;
    }
}
