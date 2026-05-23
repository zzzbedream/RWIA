import {
    createPublicClient,
    createWalletClient,
    http,
    type PublicClient,
    type WalletClient,
    type Address,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {intentAggregatorAbi} from "@/lib/intentAggregator.abi";
import {relayerConfig} from "./config";
import {updateJob} from "./queue";
import type {DlqReason, IntentJob} from "./types";

type Shard = {
    publicClient: PublicClient;
    walletClient: WalletClient;
    keeperAddress: Address;
};

let shards: Shard[] | null = null;

function getShards(): Shard[] {
    if (shards) return shards;
    const cfg = relayerConfig();
    shards = cfg.keeperPrivateKeys.map((pk) => {
        const account = privateKeyToAccount(pk);
        const publicClient = createPublicClient({chain: cfg.chain, transport: http(cfg.rpcUrl)});
        const walletClient = createWalletClient({chain: cfg.chain, account, transport: http(cfg.rpcUrl)});
        return {publicClient, walletClient, keeperAddress: account.address};
    });
    return shards;
}

export function numShards(): number {
    return getShards().length;
}

export function shardKeeperAddresses(): Address[] {
    return getShards().map((s) => s.keeperAddress);
}

function failJob(job: IntentJob, reason: DlqReason, detail: string) {
    updateJob(job.jobId, {status: "failed", dlqReason: reason, error: `${reason}: ${detail}`});
}

/**
 * Execute one queued intent on-chain.
 *
 * Pre-flight (free): simulate the call. If it reverts → DLQ with
 * `simulate_revert`, no RON spent, the shard moves on to the next job.
 *
 * Broadcast (costs gas): explicit nonce from `getTransactionCount('pending')`.
 *
 * Confirm (waits): bounded by `waitForTransactionReceipt` timeout. If the
 * receipt never arrives → DLQ with `confirm_timeout`.
 *
 * Every failure case has a specific `dlqReason` so dashboards can tell
 * deterministic reverts from transient infra issues.
 */
export async function executeIntentJob(job: IntentJob, shardIndex: number): Promise<void> {
    const shard = getShards()[shardIndex] ?? getShards()[0];
    if (!shard) {
        failJob(job, "executor_crash", "no keeper shards configured");
        return;
    }
    const {publicClient: pc, walletClient: wc, keeperAddress} = shard;
    const cfg = relayerConfig();
    const aggregator = cfg.aggregatorAddress;

    updateJob(job.jobId, {status: "validating"});

    const args = [
        {
            user: job.intent.user,
            tokenAddress: job.intent.tokenAddress,
            amount: job.intent.amount,
            nftContract: job.intent.nftContract,
            tokenId: job.intent.tokenId,
            deadline: job.intent.deadline,
            nonce: job.intent.nonce,
        },
        job.signature,
    ] as const;

    // ─── 1. Pre-flight simulation (free) ─────────────────────────────────
    try {
        await pc.simulateContract({
            account: keeperAddress,
            address: aggregator,
            abi: intentAggregatorAbi,
            functionName: "executeLocalIntent",
            args,
        });
    } catch (err) {
        // DETERMINISTIC FAILURE: would revert on-chain. Park it, don't waste gas.
        failJob(job, "simulate_revert", err instanceof Error ? err.message : String(err));
        return;
    }

    updateJob(job.jobId, {status: "queued"});

    // ─── 2. Broadcast (costs gas) ────────────────────────────────────────
    let txNonce: number;
    try {
        txNonce = await pc.getTransactionCount({address: keeperAddress, blockTag: "pending"});
    } catch (err) {
        failJob(job, "broadcast_error", `nonce fetch failed: ${err instanceof Error ? err.message : String(err)}`);
        return;
    }

    updateJob(job.jobId, {status: "broadcasting"});

    let txHash: `0x${string}`;
    try {
        txHash = await wc.writeContract({
            chain: wc.chain,
            account: wc.account ?? keeperAddress,
            address: aggregator,
            abi: intentAggregatorAbi,
            functionName: "executeLocalIntent",
            args,
            nonce: txNonce,
        });
    } catch (err) {
        failJob(job, "broadcast_error", err instanceof Error ? err.message : String(err));
        return;
    }

    updateJob(job.jobId, {txHash});

    // ─── 3. Confirm (bounded wait) ───────────────────────────────────────
    try {
        const receipt = await pc.waitForTransactionReceipt({hash: txHash, timeout: 120_000});
        if (receipt.status !== "success") {
            failJob(job, "tx_reverted", `tx ${txHash} reverted in block ${receipt.blockNumber}`);
            updateJob(job.jobId, {blockNumber: receipt.blockNumber.toString()});
            return;
        }
        updateJob(job.jobId, {status: "confirmed", blockNumber: receipt.blockNumber.toString()});
    } catch (err) {
        failJob(job, "confirm_timeout", err instanceof Error ? err.message : String(err));
    }
}
