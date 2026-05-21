/**
 * Resilient indexer client.
 *
 * Strategy:
 *   1. Try the subgraph first (fast, paginated, GraphQL).
 *   2. Read the indexer's own `_meta { block { number } }` field to know
 *      how far behind it is.
 *   3. Read the chain's current head via the RPC.
 *   4. If `headBlock - indexedBlock > MAX_LAG_BLOCKS`, fall back to a
 *      direct RPC `getLogs` so users see real-time data even when the
 *      subgraph is degraded.
 *
 * Users always get an answer — degraded subgraph never produces stale UI.
 */

import {createPublicClient, http, parseAbiItem, type Address, type PublicClient} from "viem";
import {ronin, roninSaigon} from "@/lib/chains";

const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL ?? "";
const AGGREGATOR = (process.env.NEXT_PUBLIC_AGGREGATOR_ADDRESS ?? "") as Address;
const DEFAULT_CHAIN_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? 2020);
const MAX_LAG_BLOCKS = Number(process.env.NEXT_PUBLIC_INDEXER_MAX_LAG_BLOCKS ?? 50);

export type DataSource = "subgraph" | "rpc-fallback" | "subgraph-only" | "none";

export type IntentExecutedRow = {
    intentHash: `0x${string}`;
    user: Address;
    nftContract: Address;
    tokenId: string;
    amount: string;
    keeper: Address;
    txHash: `0x${string}`;
    blockNumber: number;
    blockTimestamp: number;
    source: DataSource;
};

const intentExecutedEvent = parseAbiItem(
    "event IntentExecuted(bytes32 indexed intentHash, address indexed user, address indexed nftContract, uint256 tokenId, address tokenAddress, uint256 amount, address keeper)",
);

function rpcClient(): PublicClient {
    const chain = DEFAULT_CHAIN_ID === roninSaigon.id ? roninSaigon : ronin;
    return createPublicClient({chain, transport: http()});
}

/**
 * Fetch recent `IntentExecuted` events for a user. Uses the subgraph when
 * fresh; degrades gracefully to RPC when the subgraph is stale or missing.
 */
export async function fetchUserIntents(
    user: Address,
    opts: {limit?: number} = {},
): Promise<{rows: IntentExecutedRow[]; source: DataSource; lagBlocks?: number}> {
    const limit = opts.limit ?? 25;

    if (!SUBGRAPH_URL) {
        const rows = await rpcFetch(user, limit);
        return {rows, source: rows.length ? "rpc-fallback" : "none"};
    }

    // Race subgraph against a fast head check
    let head = 0n;
    try {
        head = await rpcClient().getBlockNumber();
    } catch {
        // RPC down too — best-effort: serve whatever the subgraph has
    }

    try {
        const {rows, indexedBlock} = await subgraphFetch(user, limit);
        const lag = head > 0n ? Number(head) - indexedBlock : 0;
        if (lag <= MAX_LAG_BLOCKS) {
            return {rows: rows.map((r) => ({...r, source: "subgraph"})), source: "subgraph", lagBlocks: lag};
        }
        // Subgraph too stale — fall back
        console.warn(`[indexer] subgraph ${lag} blocks behind; falling back to RPC`);
        const fresh = await rpcFetch(user, limit);
        return {rows: fresh, source: "rpc-fallback", lagBlocks: lag};
    } catch (err) {
        console.warn("[indexer] subgraph failed, RPC fallback:", err);
        const rows = await rpcFetch(user, limit);
        return {rows, source: "rpc-fallback"};
    }
}

async function subgraphFetch(
    user: Address,
    limit: number,
): Promise<{rows: Omit<IntentExecutedRow, "source">[]; indexedBlock: number}> {
    const query = `
        query Recent($user: Bytes!, $limit: Int!) {
            _meta { block { number } }
            intentExecuteds(
                first: $limit
                where: { user: $user }
                orderBy: blockTimestamp
                orderDirection: desc
            ) {
                intentHash
                user
                nftContract
                tokenId
                amount
                keeper
                transactionHash
                blockNumber
                blockTimestamp
            }
        }
    `;
    const res = await fetch(SUBGRAPH_URL, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({query, variables: {user: user.toLowerCase(), limit}}),
    });
    if (!res.ok) throw new Error(`subgraph http ${res.status}`);
    const json = (await res.json()) as {
        data?: {
            _meta?: {block: {number: number}};
            intentExecuteds?: Array<{
                intentHash: string;
                user: string;
                nftContract: string;
                tokenId: string;
                amount: string;
                keeper: string;
                transactionHash: string;
                blockNumber: string;
                blockTimestamp: string;
            }>;
        };
        errors?: unknown;
    };
    if (json.errors) throw new Error(`subgraph errors: ${JSON.stringify(json.errors)}`);
    const indexedBlock = json.data?._meta?.block.number ?? 0;
    const rows = (json.data?.intentExecuteds ?? []).map((r) => ({
        intentHash: r.intentHash as `0x${string}`,
        user: r.user as Address,
        nftContract: r.nftContract as Address,
        tokenId: r.tokenId,
        amount: r.amount,
        keeper: r.keeper as Address,
        txHash: r.transactionHash as `0x${string}`,
        blockNumber: Number(r.blockNumber),
        blockTimestamp: Number(r.blockTimestamp),
    }));
    return {rows, indexedBlock};
}

async function rpcFetch(user: Address, limit: number): Promise<IntentExecutedRow[]> {
    if (!AGGREGATOR) return [];
    const client = rpcClient();
    const head = await client.getBlockNumber();
    // Limit the scan to the last ~14 days at 3s blocks ≈ 400k blocks. The
    // typical free Ronin RPC tolerates this range; for older history you
    // need the subgraph.
    const fromBlock = head > 400_000n ? head - 400_000n : 0n;
    const logs = await client.getLogs({
        address: AGGREGATOR,
        event: intentExecutedEvent,
        fromBlock,
        toBlock: head,
        args: {user},
    });
    const recent = logs.slice(-limit).reverse();
    const blocks = new Map<bigint, bigint>();
    for (const log of recent) {
        if (!blocks.has(log.blockNumber!)) {
            const b = await client.getBlock({blockNumber: log.blockNumber!});
            blocks.set(b.number!, b.timestamp);
        }
    }
    return recent.map<IntentExecutedRow>((log) => {
        const args = (log.args ?? {}) as {
            intentHash: `0x${string}`;
            user: Address;
            nftContract: Address;
            tokenId: bigint;
            amount: bigint;
            keeper: Address;
        };
        return {
            intentHash: args.intentHash,
            user: args.user,
            nftContract: args.nftContract,
            tokenId: args.tokenId.toString(),
            amount: args.amount.toString(),
            keeper: args.keeper,
            txHash: log.transactionHash!,
            blockNumber: Number(log.blockNumber!),
            blockTimestamp: Number(blocks.get(log.blockNumber!) ?? 0n),
            source: "rpc-fallback",
        };
    });
}
