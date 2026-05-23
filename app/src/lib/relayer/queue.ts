import type {IntentJob} from "./types";

/**
 * In-memory sharded job queue.
 *
 * Each keeper EOA gets its own single-flight chain so two intents cannot
 * race for the same `nonce`. Jobs are assigned to a shard deterministically
 * from `intentHash` (first byte mod numShards) so re-submitting the same
 * intent always lands on the same keeper — preserves the on-chain replay
 * guard's intent.
 *
 * Why not one giant queue: when traffic spikes, single-flight bottlenecks
 * at the keeper's TX confirmation latency (~1–2s on Ronin). With N
 * keepers, throughput scales linearly until the RPC endpoint becomes the
 * bottleneck. For production scale beyond N=16, move to a Goldsky/Gelato
 * pool or a distributed queue (BullMQ + Redis).
 *
 * Persistence: jobs live in process memory. A restart drops in-flight
 * work; the on-chain `executedIntents` mapping is the source of truth so
 * replays are idempotent.
 */

const JOB_TTL_MS = 60 * 60 * 1000;
const MAX_JOBS = 1_000;
/** Hard ceiling for a single job's full lifecycle (simulate + broadcast + wait). */
const JOB_TIMEOUT_MS = 180_000;

export type ShardedExecutor = (job: IntentJob, shardIndex: number) => Promise<void>;

const jobs = new Map<string, IntentJob>();
const intentHashIndex = new Map<string, string>(); // intentHash -> jobId
const shardChains: Promise<void>[] = []; // one promise chain per shard
let executor: ShardedExecutor | null = null;
let pruneTimer: ReturnType<typeof setInterval> | null = null;

export function registerExecutor(fn: ShardedExecutor, numShards: number) {
    if (numShards < 1) throw new Error("numShards must be >= 1");
    executor = fn;
    shardChains.length = numShards;
    for (let i = 0; i < numShards; i++) shardChains[i] = Promise.resolve();
    if (!pruneTimer) {
        pruneTimer = setInterval(prune, 5 * 60 * 1000);
        if (typeof pruneTimer === "object" && "unref" in pruneTimer) (pruneTimer as {unref: () => void}).unref();
    }
}

export function enqueueJob(job: IntentJob): IntentJob {
    const existingId = intentHashIndex.get(job.intentHash);
    if (existingId) {
        const existing = jobs.get(existingId);
        if (existing) return existing;
    }
    if (jobs.size >= MAX_JOBS) prune(true);
    if (job.shardIndex === undefined) job.shardIndex = pickShard(job.intentHash);
    jobs.set(job.jobId, job);
    intentHashIndex.set(job.intentHash, job.jobId);
    if (job.paid) startExecution(job);
    return job;
}

export function getJob(jobId: string): IntentJob | undefined {
    return jobs.get(jobId);
}

export function getJobByIntentHash(intentHash: string): IntentJob | undefined {
    const id = intentHashIndex.get(intentHash);
    return id ? jobs.get(id) : undefined;
}

export function updateJob(jobId: string, patch: Partial<IntentJob>) {
    const j = jobs.get(jobId);
    if (!j) return;
    Object.assign(j, patch, {updatedAt: Date.now()});
}

export function releasePaidJob(intentHash: string): boolean {
    const j = getJobByIntentHash(intentHash);
    if (!j) return false;
    if (j.paid) return true;
    j.paid = true;
    j.updatedAt = Date.now();
    j.status = "pending";
    startExecution(j);
    return true;
}

function pickShard(intentHash: string): number {
    const n = shardChains.length || 1;
    if (n === 1) return 0;
    // First byte of the hex hash is a uniform-ish random — good enough sharding.
    const firstByte = parseInt(intentHash.slice(2, 4), 16);
    return Number.isNaN(firstByte) ? 0 : firstByte % n;
}

function startExecution(job: IntentJob) {
    const shard = job.shardIndex ?? 0;
    const prev = shardChains[shard] ?? Promise.resolve();
    shardChains[shard] = prev.then(() => runJob(job)).catch(() => undefined);
}

async function runJob(job: IntentJob) {
    if (!executor) {
        updateJob(job.jobId, {
            status: "failed",
            error: "executor not registered",
            dlqReason: "executor_crash",
        });
        return;
    }
    // Race the executor against a hard timeout so a hung shard cannot block
    // subsequent jobs on the same chain. The shard's promise chain only
    // awaits this race; whatever happens inside the executor after the
    // timeout completes is logged but does not delay anyone else.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), JOB_TIMEOUT_MS);
        if (typeof timer === "object" && "unref" in timer) (timer as {unref: () => void}).unref();
    });
    try {
        const winner = await Promise.race([
            executor(job, job.shardIndex ?? 0).then(() => "done" as const),
            timeout,
        ]);
        if (winner === "timeout") {
            updateJob(job.jobId, {
                status: "failed",
                error: `executor exceeded ${JOB_TIMEOUT_MS}ms budget`,
                dlqReason: "executor_timeout",
            });
        }
    } catch (err) {
        updateJob(job.jobId, {
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
            dlqReason: "executor_crash",
        });
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * Returns all jobs currently in the Dead Letter Queue (failed terminal
 * state). Newest first. Read-only — operators decide what to do with each.
 */
export function listDlqJobs(limit = 100): IntentJob[] {
    const out: IntentJob[] = [];
    for (const j of jobs.values()) {
        if (j.status === "failed") out.push(j);
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out.slice(0, limit);
}

function prune(force = false) {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, j] of jobs) {
        const isTerminal = j.status === "confirmed" || j.status === "failed";
        if (force || (isTerminal && j.updatedAt < cutoff)) {
            jobs.delete(id);
            intentHashIndex.delete(j.intentHash);
            if (!force && jobs.size < MAX_JOBS / 2) break;
        }
    }
}
