import {recoverTypedDataAddress, type Address, type Hex} from "viem";

import {INTENT_DOMAIN_NAME, INTENT_DOMAIN_VERSION, INTENT_TYPES} from "@/lib/eip712";
import {relayerConfig} from "./config";
import type {ParsedIntent} from "./types";

export type ValidationError =
    | "deadline_expired"
    | "amount_zero"
    | "nft_contract_zero"
    | "user_zero"
    | "signature_invalid"
    | "domain_mismatch";

export type ValidationResult =
    | {ok: true; signer: Address}
    | {ok: false; error: ValidationError; detail?: string};

/**
 * Validate an intent + signature off-chain BEFORE spending gas.
 *
 * Mirrors the on-chain checks in IntentAggregator.executeLocalIntent. Any
 * intent that fails here is rejected at the API boundary so the relayer
 * never broadcasts a doomed transaction.
 */
export async function validateIntent(intent: ParsedIntent, signature: Hex): Promise<ValidationResult> {
    if (intent.user === "0x0000000000000000000000000000000000000000") {
        return {ok: false, error: "user_zero"};
    }
    if (intent.nftContract === "0x0000000000000000000000000000000000000000") {
        return {ok: false, error: "nft_contract_zero"};
    }
    if (intent.amount === 0n) {
        return {ok: false, error: "amount_zero"};
    }
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (intent.deadline < now) {
        return {ok: false, error: "deadline_expired", detail: `deadline=${intent.deadline}, now=${now}`};
    }

    const cfg = relayerConfig();
    let signer: Address;
    try {
        signer = await recoverTypedDataAddress({
            domain: {
                name: INTENT_DOMAIN_NAME,
                version: INTENT_DOMAIN_VERSION,
                chainId: cfg.chainId,
                verifyingContract: cfg.aggregatorAddress,
            },
            types: INTENT_TYPES,
            primaryType: "UserIntent",
            message: {
                user: intent.user,
                tokenAddress: intent.tokenAddress,
                amount: intent.amount,
                nftContract: intent.nftContract,
                tokenId: intent.tokenId,
                deadline: intent.deadline,
                nonce: intent.nonce,
            },
            signature,
        });
    } catch (err) {
        return {ok: false, error: "signature_invalid", detail: err instanceof Error ? err.message : String(err)};
    }

    if (signer.toLowerCase() !== intent.user.toLowerCase()) {
        return {ok: false, error: "signature_invalid", detail: `signer=${signer} != user=${intent.user}`};
    }

    return {ok: true, signer};
}
