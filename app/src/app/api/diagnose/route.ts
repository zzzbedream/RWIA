import {NextRequest, NextResponse} from "next/server";
import {
    createPublicClient,
    http,
    isAddress,
    keccak256,
    toBytes,
    type Address,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {intentAggregatorAbi, erc721Abi} from "@/lib/intentAggregator.abi";
import {isRelayerReady, relayerConfig} from "@/lib/relayer/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const erc721Extra = [
    {
        type: "function",
        name: "isApprovedForAll",
        stateMutability: "view",
        inputs: [
            {name: "owner", type: "address"},
            {name: "operator", type: "address"},
        ],
        outputs: [{type: "bool"}],
    },
] as const;

// ERC-1967 implementation slot (eip1967.proxy.implementation - 1)
const ERC1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

/**
 * GET /api/diagnose?nftContract=0x...&tokenId=1
 *
 * Read-only health probe. Returns every signal an operator needs to verify
 * BEFORE asking a user to sign:
 *   - relayer configured
 *   - keeper PK derives to the expected address
 *   - aggregator is actually a proxy pointing to a live implementation
 *   - keeper holds KEEPER_ROLE (not stranded by a brick deploy)
 *   - aggregator is not paused
 *   - keeper owns NFT + has granted approval (per-tokenId optional)
 *
 * Returns `blockers` array with human-readable next steps when something
 * is wrong. The /app UI can render these directly.
 */
export async function GET(req: NextRequest) {
    if (!isRelayerReady()) {
        return NextResponse.json(
            {
                ready: false,
                blockers: [
                    "Relayer not configured. Set KEEPER_PRIVATE_KEY and NEXT_PUBLIC_AGGREGATOR_ADDRESS in app/.env.local and restart the dev server.",
                ],
            },
            {status: 503},
        );
    }
    const cfg = relayerConfig();
    // For diagnose, surface the FIRST shard. The full keeper list is reported via /api/health.
    const keeperAddress = privateKeyToAccount(cfg.keeperPrivateKeys[0]!).address;
    const client = createPublicClient({chain: cfg.chain, transport: http(cfg.rpcUrl)});
    const blockers: string[] = [];

    const out: Record<string, unknown> = {
        chainId: cfg.chainId,
        aggregator: cfg.aggregatorAddress,
        keeperAddress,
    };

    // ─── 1. Aggregator address has code ─────────────────────────────────
    const code = await client.getCode({address: cfg.aggregatorAddress});
    out.hasCode = Boolean(code) && code !== "0x";
    if (!out.hasCode) {
        blockers.push(
            `No contract code at ${cfg.aggregatorAddress}. Did you deploy to the right chain? RELAYER expects chainId=${cfg.chainId}.`,
        );
    }

    // ─── 2. Is it a proxy? Read ERC-1967 implementation slot ────────────
    try {
        const implSlot = await client.getStorageAt({address: cfg.aggregatorAddress, slot: ERC1967_IMPL_SLOT});
        const implAddress =
            implSlot && implSlot !== "0x" && implSlot !== `0x${"0".repeat(64)}`
                ? (`0x${implSlot.slice(-40)}` as Address)
                : null;
        out.proxyImplementation = implAddress;
        out.isProxy = Boolean(implAddress);
        if (!implAddress) {
            blockers.push(
                "Aggregator is NOT an ERC1967 proxy. You likely deployed the implementation directly with `forge create`. The constructor calls `_disableInitializers()` so the contract is bricked. Re-deploy with `forge script script/Deploy.s.sol:Deploy --rpc-url ronin_mainnet --broadcast --slow -vvv`.",
            );
        }
    } catch (err) {
        out.proxyCheck = `failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    // ─── 3. Keeper has KEEPER_ROLE? ─────────────────────────────────────
    try {
        const keeperRole = keccak256(toBytes("KEEPER_ROLE"));
        const hasRole = await client.readContract({
            address: cfg.aggregatorAddress,
            abi: intentAggregatorAbi,
            functionName: "hasRole",
            args: [keeperRole, keeperAddress],
        });
        out.hasKeeperRole = hasRole;
        if (!hasRole && out.isProxy) {
            blockers.push(
                `Keeper ${keeperAddress} does NOT have KEEPER_ROLE on the aggregator. Either fix KEEPER_PRIVATE_KEY in app/.env.local, or grant the role from the admin EOA: cast send ${cfg.aggregatorAddress} "grantRole(bytes32,address)" ${keeperRole} ${keeperAddress} --rpc-url ronin_mainnet --private-key <admin-pk>`,
            );
        }
    } catch (err) {
        out.hasKeeperRole = `read failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    // ─── 4. Paused? ─────────────────────────────────────────────────────
    try {
        const paused = await client.readContract({
            address: cfg.aggregatorAddress,
            abi: intentAggregatorAbi,
            functionName: "paused",
        });
        out.paused = paused;
        if (paused) blockers.push("Aggregator is paused — admin must call unpause() before intents can execute.");
    } catch (err) {
        out.paused = `read failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    // ─── 5. Keeper gas balance ─────────────────────────────────────────
    try {
        const balance = await client.getBalance({address: keeperAddress});
        out.keeperBalance = balance.toString();
        const wei = Number(balance) / 1e18;
        out.keeperBalanceRON = wei;
        if (wei < 0.05) {
            blockers.push(
                `Keeper ${keeperAddress} has ${wei.toFixed(6)} RON — top it up with at least 0.5 RON to broadcast intents.`,
            );
        }
    } catch (err) {
        out.keeperBalance = `read failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    // ─── 6. Per-NFT checks (optional) ───────────────────────────────────
    const nftContractRaw = req.nextUrl.searchParams.get("nftContract");
    const tokenIdRaw = req.nextUrl.searchParams.get("tokenId");
    if (nftContractRaw && tokenIdRaw && isAddress(nftContractRaw)) {
        const nftContract = nftContractRaw as Address;
        const tokenId = BigInt(tokenIdRaw);
        const nftDiag: Record<string, unknown> = {nftContract, tokenId: tokenId.toString()};
        try {
            const owner = await client.readContract({
                address: nftContract,
                abi: erc721Abi,
                functionName: "ownerOf",
                args: [tokenId],
            });
            nftDiag.ownerOf = owner;
            nftDiag.keeperOwnsIt = (owner as string).toLowerCase() === keeperAddress.toLowerCase();
            if (!nftDiag.keeperOwnsIt) {
                blockers.push(
                    `Keeper does not own ${nftContract} tokenId ${tokenId}. Current owner: ${owner}. Pick a tokenId the Keeper holds, or transfer/mint one to it.`,
                );
            }
        } catch (err) {
            nftDiag.ownerOf = `read failed: ${err instanceof Error ? err.message : String(err)}`;
            blockers.push(
                `Could not read ownerOf(${tokenId}) on ${nftContract} — token may not exist or contract is not ERC-721.`,
            );
        }
        try {
            const approved = await client.readContract({
                address: nftContract,
                abi: erc721Extra,
                functionName: "isApprovedForAll",
                args: [keeperAddress, cfg.aggregatorAddress],
            });
            nftDiag.approvalGranted = approved;
            if (!approved) {
                blockers.push(
                    `Keeper has not granted setApprovalForAll for collection ${nftContract}. From keeper EOA: cast send ${nftContract} "setApprovalForAll(address,bool)" ${cfg.aggregatorAddress} true --rpc-url ronin_mainnet --private-key <keeper-pk>`,
                );
            }
        } catch (err) {
            nftDiag.approvalGranted = `read failed: ${err instanceof Error ? err.message : String(err)}`;
        }
        out.nft = nftDiag;
    } else {
        out.nftCheckHint = "Pass ?nftContract=0x...&tokenId=N to also diagnose NFT ownership and approval.";
    }

    out.ready = blockers.length === 0;
    out.blockers = blockers;
    return NextResponse.json(out);
}
