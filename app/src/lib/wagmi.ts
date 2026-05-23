import {http, createConfig} from "wagmi";
import {injected} from "wagmi/connectors";
import {ronin, roninSaigon} from "./chains";
import {waypointConnector} from "./waypointConnector";
import {isWaypointConfigured} from "./waypoint";

// Default chain comes first; falls back to mainnet if env not set.
const defaultChainId = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? 2020);
const orderedChains =
    defaultChainId === roninSaigon.id ? ([roninSaigon, ronin] as const) : ([ronin, roninSaigon] as const);

// Each injected connector exposes ONE wallet at a time. We register multiple
// targets so the user picker shows them as discrete options.
//
// Casts to `never`: wagmi's `Target.id` is a closed union of known wallet IDs
// and the provider type is over-narrowed. Our targets are runtime-valid
// (EIP-1193) and the IDs ("ronin", "metaMaskSDK", "browser") are accepted
// by wagmi at runtime — only the compile-time type is overly strict.
function roninTarget() {
    if (typeof window === "undefined") return undefined;
    const w = window as unknown as {ronin?: {provider?: unknown}};
    if (!w.ronin?.provider) return undefined;
    return {id: "ronin", name: "Ronin Wallet", provider: w.ronin.provider} as never;
}

function metaMaskTarget() {
    if (typeof window === "undefined") return undefined;
    const w = window as unknown as {ethereum?: {isMetaMask?: boolean; isRonin?: boolean}};
    if (!w.ethereum?.isMetaMask || w.ethereum?.isRonin) return undefined;
    return {id: "metaMaskSDK", name: "MetaMask", provider: w.ethereum} as never;
}

function genericBrowserTarget() {
    if (typeof window === "undefined") return undefined;
    const w = window as unknown as {
        ethereum?: {isMetaMask?: boolean; isRonin?: boolean; isCoinbaseWallet?: boolean};
    };
    if (!w.ethereum) return undefined;
    if (w.ethereum.isMetaMask || w.ethereum.isRonin) return undefined; // covered by dedicated connectors
    const name = w.ethereum.isCoinbaseWallet ? "Coinbase Wallet" : "Browser Wallet";
    return {id: "browser", name, provider: w.ethereum} as never;
}

export const wagmiConfig = createConfig({
    chains: orderedChains,
    connectors: [
        injected({target: roninTarget, shimDisconnect: true}),
        injected({target: metaMaskTarget, shimDisconnect: true}),
        injected({target: genericBrowserTarget, shimDisconnect: true}),
        ...(isWaypointConfigured() ? [waypointConnector()] : []),
    ],
    transports: {
        [roninSaigon.id]: http(),
        [ronin.id]: http(),
    },
    ssr: true,
});
