import {isAddress, type Address, type Hex} from "viem";
import {ronin, roninSaigon} from "@/lib/chains";

export type RelayerConfig = {
    chainId: number;
    chain: typeof ronin | typeof roninSaigon;
    rpcUrl: string;
    aggregatorAddress: Address;
    /** Ordered list of keeper private keys. Length ≥ 1. */
    keeperPrivateKeys: Hex[];
};

let cached: RelayerConfig | null = null;

/**
 * Server-side relayer configuration. Reads from env at first call and caches.
 *
 * `KEEPER_PRIVATE_KEYS` (plural, comma-separated) wins over `KEEPER_PRIVATE_KEY`
 * (singular) and unlocks multi-keeper sharding so the relayer can dispatch
 * concurrent intents without nonce collisions. With only the singular set,
 * behaviour is unchanged (single-flight queue).
 *
 * Neither var may be prefixed with `NEXT_PUBLIC_`.
 */
export function relayerConfig(): RelayerConfig {
    if (cached) return cached;

    const chainIdRaw = process.env.RELAYER_CHAIN_ID ?? process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? "2020";
    const chainId = Number(chainIdRaw);
    if (chainId !== ronin.id && chainId !== roninSaigon.id) {
        throw new Error(`Unsupported RELAYER_CHAIN_ID=${chainId} (expected 2020 or 202601)`);
    }
    const chain = chainId === ronin.id ? ronin : roninSaigon;
    const rpcUrl = process.env.RELAYER_RPC_URL ?? chain.rpcUrls.default.http[0];

    const aggregatorAddress = process.env.RELAYER_AGGREGATOR_ADDRESS ?? process.env.NEXT_PUBLIC_AGGREGATOR_ADDRESS;
    if (!aggregatorAddress || !isAddress(aggregatorAddress)) {
        throw new Error("RELAYER_AGGREGATOR_ADDRESS (or NEXT_PUBLIC_AGGREGATOR_ADDRESS) missing or invalid");
    }

    const keeperPrivateKeys = parseKeeperKeys();
    if (keeperPrivateKeys.length === 0) {
        throw new Error("KEEPER_PRIVATE_KEY(S) missing or malformed (must be 0x + 64 hex)");
    }

    cached = {
        chainId,
        chain,
        rpcUrl,
        aggregatorAddress: aggregatorAddress as Address,
        keeperPrivateKeys,
    };
    return cached;
}

function parseKeeperKeys(): Hex[] {
    const plural = process.env.KEEPER_PRIVATE_KEYS;
    const singular = process.env.KEEPER_PRIVATE_KEY;
    const source = plural && plural.trim() ? plural : singular ?? "";
    return source
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^0x[0-9a-fA-F]{64}$/.test(s)) as Hex[];
}

/**
 * `true` iff the server is configured to relay. Lets the health endpoint
 * report status without crashing on misconfiguration.
 */
export function isRelayerReady(): boolean {
    try {
        relayerConfig();
        return true;
    } catch {
        return false;
    }
}
