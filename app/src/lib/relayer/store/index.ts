import {InMemoryJobStore} from "./memory";
import {SupabaseJobStore} from "./supabase";
import type {JobStore} from "./types";

let cached: JobStore | null = null;

/**
 * Resolve the active job store based on `RWIA_JOB_STORE` env.
 *
 *   memory   (default) — in-process, dev-friendly, no persistence
 *   supabase           — Postgres-backed, multi-worker safe
 *
 * The queue/executor depend only on the interface, so switching is one env var.
 */
export function jobStore(): JobStore {
    if (cached) return cached;
    const choice = (process.env.RWIA_JOB_STORE ?? "memory").toLowerCase();
    if (choice === "supabase") cached = new SupabaseJobStore();
    else cached = new InMemoryJobStore();
    return cached;
}

export type {JobStore} from "./types";
