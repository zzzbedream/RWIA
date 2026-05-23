import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";

import {paymentProvider} from "@/lib/payments";
import {getJobStatus} from "@/lib/relayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
    jobId: z.string().min(4),
    returnUrl: z.string().url().optional(),
});

/**
 * POST /api/payments/create-session
 *
 * Called by the frontend AFTER /api/intent has accepted the signed intent.
 * Hands back a PSP checkout URL. The user follows the URL, pays, and the
 * PSP fires our webhook to release the intent for execution.
 */
export async function POST(req: NextRequest) {
    let payload: unknown;
    try {
        payload = await req.json();
    } catch {
        return NextResponse.json({error: "invalid_json"}, {status: 400});
    }
    const parsed = bodySchema.safeParse(payload);
    if (!parsed.success) {
        return NextResponse.json({error: "schema_invalid"}, {status: 400});
    }
    const job = getJobStatus(parsed.data.jobId);
    if (!job) return NextResponse.json({error: "job_not_found"}, {status: 404});

    try {
        const provider = paymentProvider();
        const session = await provider.createSession({
            intentHash: job.intentHash,
            user: job.intent.user,
            tokenAddress: job.intent.tokenAddress,
            amount: job.intent.amount,
            tokenDecimals: Number(process.env.NEXT_PUBLIC_DEFAULT_PAYMENT_DECIMALS ?? 6),
            nftContract: job.intent.nftContract,
            tokenId: job.intent.tokenId,
            returnUrl: parsed.data.returnUrl,
        });
        return NextResponse.json({
            provider: session.provider,
            checkoutUrl: session.checkoutUrl,
            providerSessionId: session.providerSessionId,
            intentHash: session.intentHash,
        });
    } catch (err) {
        return NextResponse.json(
            {error: "provider_failure", detail: err instanceof Error ? err.message : String(err)},
            {status: 502},
        );
    }
}
