import type {Address, Hex} from "viem";
import {z} from "zod";

const hexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "invalid address");
const hexBytes = z.string().regex(/^0x[0-9a-fA-F]+$/, "invalid hex");
const decimalString = z.string().regex(/^\d+$/, "expected decimal integer string");

/**
 * Wire format accepted by POST /api/intent.
 *
 * BigInts are sent as decimal strings to survive JSON serialization.
 */
export const submitIntentSchema = z.object({
    intent: z.object({
        user: hexAddress,
        tokenAddress: hexAddress,
        amount: decimalString,
        nftContract: hexAddress,
        tokenId: decimalString,
        deadline: decimalString,
        nonce: decimalString,
    }),
    signature: hexBytes,
});

export type SubmitIntentInput = z.infer<typeof submitIntentSchema>;

export type ParsedIntent = {
    user: Address;
    tokenAddress: Address;
    amount: bigint;
    nftContract: Address;
    tokenId: bigint;
    deadline: bigint;
    nonce: bigint;
};

export type JobStatus =
    | "pending"
    | "awaiting_payment"
    | "validating"
    | "queued"
    | "broadcasting"
    | "confirmed"
    | "failed";

/**
 * Why a job ended in the Dead Letter Queue. Surfaces to operators so they
 * know whether the failure was deterministic (signature, role, NFT missing)
 * or transient (rpc timeout, congestion).
 */
export type DlqReason =
    | "simulate_revert" // tx would revert; never broadcast, no RON spent
    | "broadcast_error" // submission failed (RPC down, fee too low, etc.)
    | "confirm_timeout" // tx mined but receipt didn't arrive
    | "tx_reverted" // tx broadcast but reverted on-chain (rare in V1)
    | "executor_timeout" // the whole runJob exceeded its budget
    | "executor_crash"; // unexpected exception inside the executor

export type IntentJob = {
    jobId: string;
    intent: ParsedIntent;
    signature: Hex;
    intentHash: Hex;
    status: JobStatus;
    /** Set true by the payment webhook (or by 'mock' provider auto-confirm) */
    paid: boolean;
    /** Which keeper shard (single-flight queue) will execute this job */
    shardIndex?: number;
    createdAt: number;
    updatedAt: number;
    txHash?: Hex;
    blockNumber?: string;
    error?: string;
    /** When `status === 'failed'`, classifies the failure for ops. */
    dlqReason?: DlqReason;
};

export function parseSubmitIntent(input: SubmitIntentInput): {parsed: ParsedIntent; signature: Hex} {
    return {
        parsed: {
            user: input.intent.user as Address,
            tokenAddress: input.intent.tokenAddress as Address,
            amount: BigInt(input.intent.amount),
            nftContract: input.intent.nftContract as Address,
            tokenId: BigInt(input.intent.tokenId),
            deadline: BigInt(input.intent.deadline),
            nonce: BigInt(input.intent.nonce),
        },
        signature: input.signature as Hex,
    };
}

export function serializeJob(job: IntentJob) {
    return {
        jobId: job.jobId,
        status: job.status,
        paid: job.paid,
        shardIndex: job.shardIndex,
        txHash: job.txHash,
        blockNumber: job.blockNumber,
        intentHash: job.intentHash,
        error: job.error,
        dlqReason: job.dlqReason,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
    };
}
