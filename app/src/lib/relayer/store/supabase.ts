import type {IntentJob} from "../types";
import type {JobStore} from "./types";

/**
 * Supabase / Postgres-backed JobStore.
 *
 * Uses `FOR UPDATE SKIP LOCKED` so multiple keeper processes can poll the
 * same table concurrently without two workers ever claiming the same row.
 *
 * Status: STUB — wire-ready interface, runtime SQL is documented in
 * `supabase/migrations/` and the `pickClaimSql` helper below. To activate:
 *
 *   1. `npm install @supabase/supabase-js postgres`
 *   2. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RWIA_JOB_STORE=supabase`
 *   3. Run the migrations in `supabase/migrations/`
 *   4. Replace the `not-implemented` throws with the postgres queries below
 *
 * We keep it as a stub rather than half-wiring it because the project
 * runs single-instance today; flipping the env will fail-loud and force
 * the operator to read this doc.
 */
export class SupabaseJobStore implements JobStore {
    readonly kind = "supabase" as const;

    constructor() {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error("SupabaseJobStore requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
        }
    }

    async put(_job: IntentJob): Promise<IntentJob> {
        throw new Error("SupabaseJobStore.put not implemented — run migrations + wire @supabase/supabase-js");
    }
    async get(_jobId: string): Promise<IntentJob | undefined> {
        throw new Error("SupabaseJobStore.get not implemented");
    }
    async getByIntentHash(_h: string): Promise<IntentJob | undefined> {
        throw new Error("SupabaseJobStore.getByIntentHash not implemented");
    }
    async update(_id: string, _patch: Partial<IntentJob>): Promise<void> {
        throw new Error("SupabaseJobStore.update not implemented");
    }
    async release(_h: string): Promise<IntentJob | undefined> {
        throw new Error("SupabaseJobStore.release not implemented");
    }
    async claimNext(_shard: number): Promise<IntentJob | undefined> {
        throw new Error("SupabaseJobStore.claimNext not implemented — see pickClaimSql");
    }
    async listDlq(_limit: number): Promise<IntentJob[]> {
        throw new Error("SupabaseJobStore.listDlq not implemented");
    }
    async prune(_olderThanMs: number): Promise<number> {
        throw new Error("SupabaseJobStore.prune not implemented");
    }
}

/**
 * Reference SQL for the future implementation. The `FOR UPDATE SKIP LOCKED`
 * clause is what makes multi-worker safe: peer workers see the row as
 * locked and immediately skip to the next eligible row, avoiding both
 * spinning and double-claim.
 */
export const pickClaimSql = `
WITH next_job AS (
  SELECT job_id
  FROM intents
  WHERE shard_index = $1
    AND paid = true
    AND status IN ('pending', 'awaiting_payment')
    AND (claimed_by IS NULL OR claimed_at < now() - interval '5 minutes')
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE intents AS i
SET claimed_by = $2,
    claimed_at = now(),
    status     = 'validating',
    updated_at = now()
FROM next_job
WHERE i.job_id = next_job.job_id
RETURNING i.*;
` as const;
