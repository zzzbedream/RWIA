/**
 * SAFE (Ronin Multisig) helper stub.
 *
 * Detection: Ronin Wallet Safe app injects window.safe? or exposes a postMessage
 * channel. When integrating with the SAFE Core SDK (\@safe-global/protocol-kit),
 * import the SDK only in the SAFE context to avoid bundle bloat for normal
 * users.
 *
 * Recommended flow for production:
 *   1. Detect whether running inside the Ronin Safe iframe (window.parent !== window)
 *   2. Dynamically import "@safe-global/safe-apps-sdk"
 *   3. Use SDK.txs.send([...]) instead of wagmi writeContract
 *
 * This module exports a feature-flag helper today and a placeholder hook so
 * components can branch on Safe context.
 */

export function isInsideSafeApp(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.parent !== window;
    } catch {
        return false;
    }
}

export type SafeContext = {inSafe: boolean};

export function useSafeContext(): SafeContext {
    return {inSafe: isInsideSafeApp()};
}
