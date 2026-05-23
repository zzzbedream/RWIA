import {NextResponse} from "next/server";
import {createPublicClient, http} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {isRelayerReady, relayerConfig} from "@/lib/relayer/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-keeper RON thresholds. Defaults are conservative for Ronin Mainnet
 * (~150k gas per executeLocalIntent × ~21 gwei ≈ 0.003 RON/intent).
 *
 *   ok       balance ≥ HEALTHY_RON
 *   degraded balance ≥ CRITICAL_RON (alert, do not page yet)
 *   critical balance < CRITICAL_RON (page on-call, will run out soon)
 */
const HEALTHY_RON = Number(process.env.RWIA_KEEPER_HEALTHY_RON ?? "1.0");
const CRITICAL_RON = Number(process.env.RWIA_KEEPER_CRITICAL_RON ?? "0.1");

type KeeperStatus = "ok" | "degraded" | "critical";

function statusFromBalance(ron: number): KeeperStatus {
    if (ron >= HEALTHY_RON) return "ok";
    if (ron >= CRITICAL_RON) return "degraded";
    return "critical";
}

function worst(a: KeeperStatus, b: KeeperStatus): KeeperStatus {
    if (a === "critical" || b === "critical") return "critical";
    if (a === "degraded" || b === "degraded") return "degraded";
    return "ok";
}

/**
 * GET /api/health
 *
 * Static config (shards, addresses) is always included. Per-keeper balance
 * + status is reported when the RPC is reachable. If any single keeper is
 * `critical`, the top-level `status` is also `critical` (worst-case
 * aggregation, so an alert manager scraping this endpoint pages immediately).
 *
 * Status codes:
 *   200 — fully ready
 *   207 — partial (degraded balances or RPC issue)
 *   503 — relayer not configured (env missing/malformed)
 */
export async function GET() {
    if (!isRelayerReady()) {
        return NextResponse.json(
            {
                ready: false,
                status: "critical",
                missing: "KEEPER_PRIVATE_KEY(S) or RELAYER_AGGREGATOR_ADDRESS",
            },
            {status: 503},
        );
    }
    const cfg = relayerConfig();
    const client = createPublicClient({chain: cfg.chain, transport: http(cfg.rpcUrl)});

    const keeperAddresses = cfg.keeperPrivateKeys.map((pk) => privateKeyToAccount(pk).address);

    const keepers = await Promise.all(
        keeperAddresses.map(async (address) => {
            try {
                const wei = await client.getBalance({address});
                const ron = Number(wei) / 1e18;
                return {
                    address,
                    balanceWei: wei.toString(),
                    balanceRON: ron,
                    status: statusFromBalance(ron),
                };
            } catch (err) {
                return {
                    address,
                    balanceWei: null,
                    balanceRON: null,
                    status: "degraded" as KeeperStatus,
                    error: err instanceof Error ? err.message : String(err),
                };
            }
        }),
    );

    const overall = keepers.reduce<KeeperStatus>((acc, k) => worst(acc, k.status), "ok");
    const httpStatus = overall === "critical" ? 503 : overall === "degraded" ? 207 : 200;

    return NextResponse.json(
        {
            ready: overall !== "critical",
            status: overall,
            chainId: cfg.chainId,
            aggregator: cfg.aggregatorAddress,
            shards: keepers.length,
            thresholds: {healthyRON: HEALTHY_RON, criticalRON: CRITICAL_RON},
            keepers,
            // Legacy fields for older callers
            keeperAddress: keeperAddresses[0],
            keeperAddresses,
        },
        {status: httpStatus},
    );
}
