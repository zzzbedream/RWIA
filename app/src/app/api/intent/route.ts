import {NextRequest, NextResponse} from "next/server";

import {submitIntent} from "@/lib/relayer";
import {submitIntentSchema, serializeJob} from "@/lib/relayer/types";
import {rateLimit} from "@/lib/relayer/rateLimit";

// Stay on the Node.js runtime — viem + private-key signing aren't safe in Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    let payload: unknown;
    try {
        payload = await req.json();
    } catch {
        return NextResponse.json({error: "invalid_json"}, {status: 400});
    }

    const parsed = submitIntentSchema.safeParse(payload);
    if (!parsed.success) {
        return NextResponse.json(
            {error: "schema_invalid", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)},
            {status: 400},
        );
    }

    const rlKey = `${ip}:${parsed.data.intent.user}`;
    const rl = rateLimit(rlKey);
    if (!rl.ok) {
        return NextResponse.json(
            {error: "rate_limited", retryAfterSec: rl.retryAfterSec},
            {status: 429, headers: {"Retry-After": String(rl.retryAfterSec)}},
        );
    }

    try {
        const result = await submitIntent(parsed.data);
        if (!result.ok) {
            return NextResponse.json({error: result.code, detail: result.detail}, {status: result.status});
        }
        return NextResponse.json(serializeJob(result.job), {status: 202});
    } catch (err) {
        return NextResponse.json(
            {error: "relayer_unavailable", detail: err instanceof Error ? err.message : String(err)},
            {status: 503},
        );
    }
}

