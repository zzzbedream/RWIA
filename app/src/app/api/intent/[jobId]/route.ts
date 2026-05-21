import {NextRequest, NextResponse} from "next/server";

import {getJobStatus} from "@/lib/relayer";
import {serializeJob} from "@/lib/relayer/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: {params: Promise<{jobId: string}>}) {
    const {jobId} = await ctx.params;
    if (!/^[0-9a-fA-F]{4,32}$/.test(jobId)) {
        return NextResponse.json({error: "invalid_job_id"}, {status: 400});
    }
    const job = getJobStatus(jobId);
    if (!job) return NextResponse.json({error: "not_found"}, {status: 404});
    return NextResponse.json(serializeJob(job));
}
