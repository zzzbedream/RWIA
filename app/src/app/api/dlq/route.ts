import {NextRequest, NextResponse} from "next/server";

import {listDlqJobs} from "@/lib/relayer/queue";
import {serializeJob} from "@/lib/relayer/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dlq
 *
 * Returns all jobs that ended in the Dead Letter Queue (status=failed).
 * Each job carries a `dlqReason` classifying the failure so operators can
 * tell deterministic reverts (simulate_revert, tx_reverted) from transient
 * issues (broadcast_error, confirm_timeout, executor_*).
 *
 * Auth: gated by `RWIA_OPS_TOKEN`. Send it as `Authorization: Bearer <token>`
 * or `?token=` (URL token only OK in trusted internal networks).
 */
export async function GET(req: NextRequest) {
    const required = process.env.RWIA_OPS_TOKEN;
    if (required) {
        const provided =
            req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
            req.nextUrl.searchParams.get("token") ??
            "";
        if (provided !== required) return NextResponse.json({error: "unauthorized"}, {status: 401});
    }
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = Math.max(1, Math.min(500, Number(limitRaw ?? 100)));
    const jobs = listDlqJobs(limit).map(serializeJob);
    return NextResponse.json({count: jobs.length, jobs});
}
