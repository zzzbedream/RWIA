import {createHmac, timingSafeEqual} from "node:crypto";

import type {PaymentEvent, PaymentProvider, PaymentSession, PaymentSessionInput} from "./types";

/**
 * Transak adapter — Transak is Ronin's official fiat-to-crypto + NFT
 * checkout partner (announced 2025-01). Docs: https://docs.transak.com
 *
 * This implementation uses Transak's One Order Widget URL pattern so we
 * don't need a server-side SDK; the buyer is redirected to Transak's
 * hosted UI and the webhook tells us when payment clears.
 *
 * Required env:
 *   TRANSAK_API_KEY          - public/partner API key
 *   TRANSAK_HMAC_SECRET      - shared secret used to sign webhooks
 *   TRANSAK_ENV              - "STAGING" | "PRODUCTION" (default STAGING)
 */
export class TransakProvider implements PaymentProvider {
    readonly name = "transak";

    constructor(
        private readonly apiKey = process.env.TRANSAK_API_KEY ?? "",
        private readonly hmacSecret = process.env.TRANSAK_HMAC_SECRET ?? "",
        private readonly env = (process.env.TRANSAK_ENV ?? "STAGING").toUpperCase(),
    ) {
        if (!this.apiKey || !this.hmacSecret) {
            throw new Error("Transak adapter requires TRANSAK_API_KEY and TRANSAK_HMAC_SECRET");
        }
    }

    async createSession(input: PaymentSessionInput): Promise<PaymentSession> {
        // Use intentHash as Transak's partner-orderId so the webhook is
        // self-correlating. Transak echoes this back unchanged.
        const partnerOrderId = input.intentHash;
        const baseHost = this.env === "PRODUCTION" ? "global.transak.com" : "global-stg.transak.com";
        const params = new URLSearchParams({
            apiKey: this.apiKey,
            partnerOrderId,
            walletAddress: input.user,
            // Transak takes the cryptocurrency amount the buyer is "receiving"
            // and computes the fiat equivalent at checkout time. For an NFT
            // purchase use cryptoCurrencyCode=USDC + cryptoAmount = price,
            // OR pass nftData if using NFT Checkout.
            cryptoCurrencyCode: process.env.TRANSAK_DEFAULT_CRYPTO ?? "USDC",
            cryptoAmount: formatUnits(input.amount, input.tokenDecimals),
            network: "ronin",
            disableWalletAddressForm: "true",
            ...(input.returnUrl ? {redirectURL: input.returnUrl} : {}),
        });
        return {
            providerSessionId: partnerOrderId,
            checkoutUrl: `https://${baseHost}?${params.toString()}`,
            intentHash: input.intentHash,
            provider: this.name,
        };
    }

    async parseWebhook(rawBody: string, headers: Record<string, string>): Promise<PaymentEvent> {
        const signature = headers["x-transak-signature"] ?? headers["X-Transak-Signature"];
        if (!signature) throw new Error("missing x-transak-signature header");

        const computed = createHmac("sha256", this.hmacSecret).update(rawBody).digest("hex");
        const a = Buffer.from(computed, "utf8");
        const b = Buffer.from(signature, "utf8");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
            throw new Error("signature mismatch");
        }

        const payload = JSON.parse(rawBody) as {
            eventID?: string;
            webhookData?: {
                status?: string;
                partnerOrderId?: string;
                id?: string;
                cryptoAmount?: string;
            };
            data?: {
                status?: string;
                partnerOrderId?: string;
                id?: string;
                cryptoAmount?: string;
            };
        };
        const data = payload.webhookData ?? payload.data;
        if (!data?.partnerOrderId) throw new Error("malformed webhook: no partnerOrderId");

        const intentHash = data.partnerOrderId as `0x${string}`;
        const providerSessionId = data.id ?? intentHash;

        const status = (data.status ?? "").toUpperCase();
        if (status === "COMPLETED" || status === "ORDER_COMPLETED") {
            return {
                kind: "payment_succeeded",
                intentHash,
                providerSessionId,
                amountPaid: BigInt(Math.floor(Number(data.cryptoAmount ?? 0) * 1e6)),
            };
        }
        if (status === "FAILED" || status === "EXPIRED" || status === "CANCELLED") {
            return {kind: "payment_failed", intentHash, providerSessionId, reason: status};
        }
        if (status === "REFUNDED") {
            return {kind: "payment_refunded", intentHash, providerSessionId};
        }
        throw new Error(`unhandled Transak status: ${status}`);
    }
}

function formatUnits(amount: bigint, decimals: number): string {
    if (decimals === 0) return amount.toString();
    const base = 10n ** BigInt(decimals);
    const whole = amount / base;
    const frac = amount % base;
    return frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(decimals, "0")}`;
}
