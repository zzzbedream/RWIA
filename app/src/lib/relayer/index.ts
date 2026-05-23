import {createPublicClient, encodeAbiParameters, http, keccak256, type Hex} from "viem";

import {relayerConfig} from "./config";
import {executeIntentJob, numShards} from "./executor";
import {enqueueJob, getJob, registerExecutor, releasePaidJob} from "./queue";
import {parseSubmitIntent, type IntentJob, type SubmitIntentInput} from "./types";
import {validateIntent} from "./validator";
import {intentAggregatorAbi} from "@/lib/intentAggregator.abi";

/**
 * When `RWIA_REQUIRE_PAYMENT=true` (default), intents wait for the payment
 * webhook to release them before execution. Set to `false` for direct-trust
 * dev mode where intents fire immediately after validation.
 */
function paymentRequired(): boolean {
    return (process.env.RWIA_REQUIRE_PAYMENT ?? "true").toLowerCase() !== "false";
}

let registered = false;
function ensureExecutor() {
    if (!registered) {
        registerExecutor(executeIntentJob, numShards());
        registered = true;
    }
}

/**
 * Public entry-point for POST /api/intent. Returns the created (or
 * idempotently-returned) job.
 */
export async function submitIntent(input: SubmitIntentInput): Promise<
    | {ok: true; job: IntentJob}
    | {ok: false; status: number; code: string; detail?: string}
> {
    ensureExecutor();

    const cfg = relayerConfig(); // throws if misconfigured
    const {parsed, signature} = parseSubmitIntent(input);

    const validation = await validateIntent(parsed, signature);
    if (!validation.ok) {
        return {ok: false, status: 400, code: validation.error, detail: validation.detail};
    }

    const intentHash = await computeIntentHash(parsed, cfg.aggregatorAddress);
    const requirePayment = paymentRequired();
    const job: IntentJob = {
        jobId: deriveJobId(intentHash),
        intent: parsed,
        signature,
        intentHash,
        status: requirePayment ? "awaiting_payment" : "pending",
        paid: !requirePayment,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    return {ok: true, job: enqueueJob(job)};
}

export function getJobStatus(jobId: string): IntentJob | undefined {
    return getJob(jobId);
}

/**
 * Called by the payment webhook once the PSP confirms the buyer paid.
 * Idempotent: returns true if the intent existed and is now released (or was
 * already released); false if the intent hash isn't tracked.
 */
export function markIntentPaid(intentHash: `0x${string}`): boolean {
    return releasePaidJob(intentHash);
}

function deriveJobId(intentHash: Hex): string {
    // 16 hex chars is enough entropy to be unique without leaking the full hash.
    return intentHash.slice(2, 18);
}

/**
 * Compute the EIP-712 digest that the on-chain contract uses. We re-derive it
 * via simulateContract.read because viem doesn't expose namehash-style helpers
 * for arbitrary domains; this matches `hashIntent()` on the aggregator.
 */
async function computeIntentHash(
    intent: ReturnType<typeof parseSubmitIntent>["parsed"],
    aggregator: `0x${string}`,
): Promise<Hex> {
    const cfg = relayerConfig();
    const pc = createPublicClient({chain: cfg.chain, transport: http(cfg.rpcUrl)});
    try {
        const hash = await pc.readContract({
            address: aggregator,
            abi: intentAggregatorAbi,
            functionName: "hashIntent",
            args: [
                {
                    user: intent.user,
                    tokenAddress: intent.tokenAddress,
                    amount: intent.amount,
                    nftContract: intent.nftContract,
                    tokenId: intent.tokenId,
                    deadline: intent.deadline,
                    nonce: intent.nonce,
                },
            ],
        });
        return hash;
    } catch {
        // Fallback: derive locally so we still get an idempotency key even if
        // the aggregator is unreachable. The keys won't collide because the
        // off-chain derivation uses the same fields.
        return keccak256(
            encodeAbiParameters(
                [
                    {type: "address"},
                    {type: "address"},
                    {type: "uint256"},
                    {type: "address"},
                    {type: "uint256"},
                    {type: "uint256"},
                    {type: "uint256"},
                ],
                [
                    intent.user,
                    intent.tokenAddress,
                    intent.amount,
                    intent.nftContract,
                    intent.tokenId,
                    intent.deadline,
                    intent.nonce,
                ],
            ),
        );
    }
}
