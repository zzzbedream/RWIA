import {NextRequest, NextResponse} from "next/server";

import {markIntentPaid} from "@/lib/relayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/payments/mock-confirm?intent=0x...
 *
 * Dev-only auto-confirm route used by the MockPaymentProvider. Opens a
 * page that immediately marks the intent as paid so the keeper releases
 * it. Returns 403 in production to prevent accidental abuse.
 */
export async function GET(req: NextRequest) {
    if (process.env.NODE_ENV === "production" && process.env.RWIA_PAYMENT_PROVIDER !== "mock") {
        return NextResponse.json({error: "mock provider disabled in production"}, {status: 403});
    }
    const intentHash = req.nextUrl.searchParams.get("intent");
    if (!intentHash || !/^0x[0-9a-fA-F]{64}$/.test(intentHash)) {
        return NextResponse.json({error: "invalid intent hash"}, {status: 400});
    }
    const ok = markIntentPaid(intentHash as `0x${string}`);
    if (!ok) return NextResponse.json({error: "intent not found"}, {status: 404});
    return NextResponse.json({mockConfirmed: true, intentHash});
}
