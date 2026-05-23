import type {PaymentEvent, PaymentProvider, PaymentSession, PaymentSessionInput} from "./types";

/**
 * Mock provider for local development. `createSession` returns a fake URL
 * that, when opened, immediately fires a webhook to /api/payments/webhook
 * with a successful event. Useful for smoke-testing the full pipeline
 * without a real PSP account.
 *
 * NEVER expose in production. Guarded by RWIA_PAYMENT_PROVIDER=mock.
 */
export class MockPaymentProvider implements PaymentProvider {
    readonly name = "mock";

    async createSession(input: PaymentSessionInput): Promise<PaymentSession> {
        const id = `mock_${Date.now()}_${input.intentHash.slice(2, 10)}`;
        // The "checkout URL" is just a same-origin auto-confirm route.
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        const url = `${baseUrl}/api/payments/mock-confirm?session=${encodeURIComponent(id)}&intent=${input.intentHash}`;
        return {
            providerSessionId: id,
            checkoutUrl: url,
            intentHash: input.intentHash,
            provider: this.name,
            expiresAt: Math.floor(Date.now() / 1000) + 30 * 60,
        };
    }

    async parseWebhook(rawBody: string): Promise<PaymentEvent> {
        const json = JSON.parse(rawBody) as {
            intentHash: `0x${string}`;
            providerSessionId: string;
            amountPaid?: string;
        };
        return {
            kind: "payment_succeeded",
            intentHash: json.intentHash,
            providerSessionId: json.providerSessionId,
            amountPaid: BigInt(json.amountPaid ?? "0"),
        };
    }
}
