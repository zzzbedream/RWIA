import {createPublicClient, http, type Address} from "viem";
import {ronin, roninSaigon} from "./chains";

/**
 * delegate.xyz v2 registry helper.
 *
 * delegate.xyz publishes the same registry address across most EVM chains:
 *   0x00000000000000447e69651d841bD8D104Bed493 (Ronin mainnet & Saigon mirror,
 *   subject to confirmation in production — read from
 *   https://docs.delegate.xyz for the canonical value).
 *
 * Set NEXT_PUBLIC_DELEGATE_REGISTRY_RONIN / _SAIGON in env to enable.
 */

const REGISTRY_MAINNET = (process.env.NEXT_PUBLIC_DELEGATE_REGISTRY_RONIN ?? "") as Address | "";
const REGISTRY_SAIGON = (process.env.NEXT_PUBLIC_DELEGATE_REGISTRY_SAIGON ?? "") as Address | "";

const registryAbi = [
    {
        type: "function",
        name: "checkDelegateForAll",
        stateMutability: "view",
        inputs: [
            {name: "to", type: "address"},
            {name: "from", type: "address"},
            {name: "rights", type: "bytes32"},
        ],
        outputs: [{type: "bool"}],
    },
] as const;

function registryFor(chainId: number): Address | "" {
    if (chainId === ronin.id) return REGISTRY_MAINNET;
    if (chainId === roninSaigon.id) return REGISTRY_SAIGON;
    return "";
}

/**
 * Returns true if `delegate` is authorized to act on behalf of `vault` via
 * delegate.xyz registry. Falls back to comparing addresses if the registry is
 * not configured.
 */
export async function isDelegate(
    delegate: Address,
    vault: Address,
    chainId: number,
    rights: `0x${string}` = "0x0000000000000000000000000000000000000000000000000000000000000000",
): Promise<boolean> {
    if (delegate.toLowerCase() === vault.toLowerCase()) return true;
    const registry = registryFor(chainId);
    if (!registry) return false;
    const chain = chainId === ronin.id ? ronin : roninSaigon;
    const client = createPublicClient({chain, transport: http()});
    try {
        return await client.readContract({
            address: registry,
            abi: registryAbi,
            functionName: "checkDelegateForAll",
            args: [delegate, vault, rights],
        });
    } catch {
        return false;
    }
}
