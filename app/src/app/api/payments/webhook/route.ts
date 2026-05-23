import {NextRequest, NextResponse} from "next/server";

import {paymentProvider} from "@/lib/payments";
import {markIntentPaid} from "@/lib/relayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/webhook
 *
 * PSP fires this when payment state changes. We MUST verify the signature
 * inside `provider.parseWebhook` before mutating any state — otherwise an
 * attacker could trigger NFT delivery by faking a webhook.
 */
export async function POST(req: NextRequest) {
    const rawBody = await req.text();
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
    });

    let event;
    try {
        event = await paymentProvider().parseWebhook(rawBody, headers);
    } catch (err) {
        return NextResponse.json(
            {error: "webhook_invalid", detail: err instanceof Error ? err.message : String(err)},
            {status: 400},
        );
    }

    if (event.kind === "payment_succeeded") {
        const ok = markIntentPaid(event.intentHash);
        return NextResponse.json({received: true, released: ok});
    }
    // Other event kinds are logged but don't trigger execution. The intent
    // remains queued; the caller can poll /api/intent/[jobId] and see the
    // final status (which will time out via deadline if never paid).
    return NextResponse.json({received: true, kind: event.kind});
}
