import type {Address} from "viem";

/**
 * Provider-agnostic payment adapter. Every PSP we plug in (Transak, Stripe,
 * MercadoPago, mock) must implement this interface so the rest of the
 * relayer stays oblivious to the rails.
 */
export type PaymentSessionInput = {
    intentHash: `0x${string}`;
    user: Address;
    tokenAddress: Address;
    amount: bigint;
    tokenDecimals: number;
    nftContract: Address;
    tokenId: bigint;
    returnUrl?: string;
};

export type PaymentSession = {
    /** Provider-specific session id (Stripe ci_..., Transak orderId, etc.) */
    providerSessionId: string;
    /** URL the buyer is redirected to in order to complete payment */
    checkoutUrl: string;
    /** Echoed back so we can correlate the webhook */
    intentHash: `0x${string}`;
    provider: string;
    expiresAt?: number;
};

export type PaymentEvent =
    | {kind: "payment_succeeded"; intentHash: `0x${string}`; providerSessionId: string; amountPaid: bigint}
    | {kind: "payment_failed"; intentHash: `0x${string}`; providerSessionId: string; reason: string}
    | {kind: "payment_refunded"; intentHash: `0x${string}`; providerSessionId: string};

export interface PaymentProvider {
    readonly name: string;
    /** Create a checkout session and return its URL */
    createSession(input: PaymentSessionInput): Promise<PaymentSession>;
    /**
     * Verify and parse an incoming webhook payload.
     * Implementations MUST verify the request signature (Stripe-Signature header,
     * Transak HMAC, etc.) before returning an event.
     */
    parseWebhook(rawBody: string, headers: Record<string, string>): Promise<PaymentEvent>;
}

/**
 * What status do we report back to the frontend after creating a session?
 */
export type PaymentSessionResponse = {
    checkoutUrl: string;
    provider: string;
    providerSessionId: string;
    intentHash: `0x${string}`;
};
