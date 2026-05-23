import type {Address} from "viem";
import {z} from "zod";

/**
 * V1 UserIntent — NFT delivery against off-chain payment.
 *
 * `tokenAddress` + `amount` are recorded only for auditability of the
 * off-chain payment; the contract does NOT transfer them on-chain.
 */
export type UserIntent = {
    user: Address;
    tokenAddress: Address;
    amount: bigint;
    nftContract: Address;
    tokenId: bigint;
    deadline: bigint;
    nonce: bigint;
};

export const INTENT_TYPES = {
    UserIntent: [
        {name: "user", type: "address"},
        {name: "tokenAddress", type: "address"},
        {name: "amount", type: "uint256"},
        {name: "nftContract", type: "address"},
        {name: "tokenId", type: "uint256"},
        {name: "deadline", type: "uint256"},
        {name: "nonce", type: "uint256"},
    ],
} as const;

export const INTENT_DOMAIN_NAME = "RoninWaypointIntentAggregator";
export const INTENT_DOMAIN_VERSION = "1";

export function buildIntentDomain(chainId: number, verifyingContract: Address) {
    return {
        name: INTENT_DOMAIN_NAME,
        version: INTENT_DOMAIN_VERSION,
        chainId,
        verifyingContract,
    } as const;
}

const hexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "invalid address");

export const intentInputSchema = z.object({
    user: hexAddress,
    tokenAddress: hexAddress,
    amount: z.bigint().positive(),
    nftContract: hexAddress,
    tokenId: z.bigint().nonnegative(),
    deadline: z.bigint().positive(),
    nonce: z.bigint().nonnegative(),
});

export function sanitizeIntent(raw: unknown): UserIntent {
    const parsed = intentInputSchema.parse(raw);
    return {
        user: parsed.user as Address,
        tokenAddress: parsed.tokenAddress as Address,
        amount: parsed.amount,
        nftContract: parsed.nftContract as Address,
        tokenId: parsed.tokenId,
        deadline: parsed.deadline,
        nonce: parsed.nonce,
    };
}
