import {MockPaymentProvider} from "./mock";
import {TransakProvider} from "./transak";
import type {PaymentProvider} from "./types";

let cached: PaymentProvider | null = null;

/**
 * Resolves the PSP adapter based on env. Add new providers (Stripe,
 * MercadoPago, Onramper) by registering them here.
 */
export function paymentProvider(): PaymentProvider {
    if (cached) return cached;
    const choice = (process.env.RWIA_PAYMENT_PROVIDER ?? "mock").toLowerCase();
    switch (choice) {
        case "transak":
            cached = new TransakProvider();
            break;
        case "mock":
        case "":
            cached = new MockPaymentProvider();
            break;
        default:
            throw new Error(`Unknown RWIA_PAYMENT_PROVIDER=${choice}. Allowed: mock, transak.`);
    }
    return cached;
}

export type {PaymentProvider, PaymentSession, PaymentSessionInput, PaymentEvent} from "./types";
