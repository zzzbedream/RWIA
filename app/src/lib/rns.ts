import {createPublicClient, http, keccak256, namehash, toBytes, type Address} from "viem";
import {ronin, roninSaigon} from "./chains";

const REGISTRY_MAINNET = (process.env.NEXT_PUBLIC_RNS_REGISTRY_MAINNET ?? "") as Address | "";
const REGISTRY_SAIGON = (process.env.NEXT_PUBLIC_RNS_REGISTRY_SAIGON ?? "") as Address | "";

const registryAbi = [
    {
        type: "function",
        name: "resolver",
        stateMutability: "view",
        inputs: [{name: "node", type: "bytes32"}],
        outputs: [{type: "address"}],
    },
] as const;

const resolverAbi = [
    {
        type: "function",
        name: "addr",
        stateMutability: "view",
        inputs: [{name: "node", type: "bytes32"}],
        outputs: [{type: "address"}],
    },
    {
        type: "function",
        name: "name",
        stateMutability: "view",
        inputs: [{name: "node", type: "bytes32"}],
        outputs: [{type: "string"}],
    },
] as const;

function registryFor(chainId: number): Address | "" {
    if (chainId === ronin.id) return REGISTRY_MAINNET;
    if (chainId === roninSaigon.id) return REGISTRY_SAIGON;
    return "";
}

export function isRnsName(input: string): boolean {
    return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(input) && (input.endsWith(".ron") || input.endsWith(".roninchain"));
}

/**
 * Resolve a Ronin Name Service name (e.g. "alice.ron") to an address.
 * Returns null if not configured, name not found, or any RPC error.
 */
export async function resolveRns(name: string, chainId: number): Promise<Address | null> {
    const registry = registryFor(chainId);
    if (!registry) return null;
    if (!isRnsName(name)) return null;

    const chain = chainId === ronin.id ? ronin : roninSaigon;
    const client = createPublicClient({chain, transport: http()});

    try {
        const node = namehash(name.toLowerCase());
        const resolver = await client.readContract({
            address: registry,
            abi: registryAbi,
            functionName: "resolver",
            args: [node],
        });
        if (!resolver || resolver === "0x0000000000000000000000000000000000000000") return null;
        const addr = await client.readContract({
            address: resolver as Address,
            abi: resolverAbi,
            functionName: "addr",
            args: [node],
        });
        if (!addr || addr === "0x0000000000000000000000000000000000000000") return null;
        return addr as Address;
    } catch {
        return null;
    }
}

/**
 * Reverse lookup: resolve an address to its primary RNS name. Returns null if unset.
 */
export async function reverseResolveRns(address: Address, chainId: number): Promise<string | null> {
    const registry = registryFor(chainId);
    if (!registry) return null;
    const chain = chainId === ronin.id ? ronin : roninSaigon;
    const client = createPublicClient({chain, transport: http()});

    try {
        const reverseLabel = address.slice(2).toLowerCase();
        const node = namehash(`${reverseLabel}.addr.reverse`);
        const resolver = await client.readContract({
            address: registry,
            abi: registryAbi,
            functionName: "resolver",
            args: [node],
        });
        if (!resolver || resolver === "0x0000000000000000000000000000000000000000") return null;
        const name = await client.readContract({
            address: resolver as Address,
            abi: resolverAbi,
            functionName: "name",
            args: [node],
        });
        return name || null;
    } catch {
        return null;
    }
}

// Re-export for callers that want to compute namehash without resolving.
export {namehash, keccak256, toBytes};
