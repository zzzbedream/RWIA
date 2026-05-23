#!/usr/bin/env node
/**
 * Local E2E smoke test — simulates an external buyer end-to-end.
 *
 * What it does:
 *   1. Generates a brand-new "buyer" wallet (random PK, no funding needed
 *      — the buyer pays NO gas in this flow).
 *   2. Signs an EIP-712 UserIntent for the buyer to receive a TestNFT.
 *   3. POSTs the signed intent to the local relayer (/api/intent).
 *   4. Polls /api/intent/[jobId] until terminal status.
 *   5. Asserts the NFT moved from the Keeper to the buyer's address.
 *
 * Run:
 *   node scripts/local-e2e-buyer.mjs [tokenId]
 *
 * Env (defaults shown):
 *   RELAYER_URL      = http://localhost:3000
 *   AGGREGATOR       = 0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5
 *   NFT_CONTRACT     = 0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2
 *   WRON             = 0xe514d9DEB7966c8BE0ca922de8a064264eA6bcd4
 *   RONIN_RPC        = https://api.roninchain.com/rpc
 */

import {createPublicClient, http, parseAbi} from "viem";
import {generatePrivateKey, privateKeyToAccount, signTypedData} from "viem/accounts";

const RELAYER = process.env.RELAYER_URL ?? "http://localhost:3000";
const AGGREGATOR = (process.env.AGGREGATOR ?? "0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5").toLowerCase();
const NFT = (process.env.NFT_CONTRACT ?? "0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2").toLowerCase();
const WRON = (process.env.WRON ?? "0xe514d9DEB7966c8BE0ca922de8a064264eA6bcd4").toLowerCase();
const RPC = process.env.RONIN_RPC ?? "https://api.roninchain.com/rpc";

const tokenIdArg = process.argv[2];
const TOKEN_ID = BigInt(tokenIdArg ?? "1");

const chain = {
    id: 2020,
    name: "Ronin",
    nativeCurrency: {name: "RON", symbol: "RON", decimals: 18},
    rpcUrls: {default: {http: [RPC]}, public: {http: [RPC]}},
};

const erc721 = parseAbi(["function ownerOf(uint256) view returns (address)"]);

function header(s) {
    console.log("\n" + "=".repeat(60));
    console.log(s);
    console.log("=".repeat(60));
}

async function main() {
    header("RWIA local E2E — simulating an external buyer");
    console.log(`Relayer:    ${RELAYER}`);
    console.log(`Aggregator: ${AGGREGATOR}`);
    console.log(`NFT:        ${NFT} #${TOKEN_ID}`);

    // ── 1. Health probe ────────────────────────────────────────────────
    header("1. Health probe");
    const health = await fetch(`${RELAYER}/api/health`).then((r) => r.json());
    console.log(JSON.stringify(health, null, 2));
    if (health.status !== "ok") {
        console.error("❌ Relayer not healthy — fix env or fund the keeper before retrying");
        process.exit(1);
    }

    // ── 2. Diagnose for the specific NFT we'll buy ─────────────────────
    header(`2. Diagnose for tokenId ${TOKEN_ID}`);
    const diag = await fetch(`${RELAYER}/api/diagnose?nftContract=${NFT}&tokenId=${TOKEN_ID}`).then((r) =>
        r.json(),
    );
    console.log(JSON.stringify(diag, null, 2));
    if (!diag.ready || diag.blockers?.length) {
        console.error("❌ Pre-flight blockers exist — resolve them and retry");
        process.exit(1);
    }

    // ── 3. Generate a fresh buyer wallet ───────────────────────────────
    header("3. Generating a brand-new buyer wallet");
    const buyerPk = generatePrivateKey();
    const buyer = privateKeyToAccount(buyerPk);
    console.log(`Buyer address: ${buyer.address}`);
    console.log(`(This wallet has ZERO crypto. It only signs — no gas, no balance.)`);

    // ── 4. Build and sign the intent ───────────────────────────────────
    header("4. Signing EIP-712 UserIntent");
    const intent = {
        user: buyer.address,
        tokenAddress: WRON,
        amount: 1_000_000_000_000_000_000n, // 1 WRON (off-chain payment record)
        nftContract: NFT,
        tokenId: TOKEN_ID,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 3600), // +1 hour
        nonce: BigInt(Date.now()),
    };
    console.log(JSON.stringify(intent, jsonBigIntReplacer, 2));

    const signature = await signTypedData({
        privateKey: buyerPk,
        domain: {
            name: "RoninWaypointIntentAggregator",
            version: "1",
            chainId: 2020,
            verifyingContract: AGGREGATOR,
        },
        types: {
            UserIntent: [
                {name: "user", type: "address"},
                {name: "tokenAddress", type: "address"},
                {name: "amount", type: "uint256"},
                {name: "nftContract", type: "address"},
                {name: "tokenId", type: "uint256"},
                {name: "deadline", type: "uint256"},
                {name: "nonce", type: "uint256"},
            ],
        },
        primaryType: "UserIntent",
        message: intent,
    });
    console.log(`Signature: ${signature}`);

    // ── 5. Submit to relayer ───────────────────────────────────────────
    header("5. POST /api/intent");
    const body = JSON.stringify({
        intent: {
            user: intent.user,
            tokenAddress: intent.tokenAddress,
            amount: intent.amount.toString(),
            nftContract: intent.nftContract,
            tokenId: intent.tokenId.toString(),
            deadline: intent.deadline.toString(),
            nonce: intent.nonce.toString(),
        },
        signature,
    });
    const submit = await fetch(`${RELAYER}/api/intent`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body,
    });
    if (!submit.ok) {
        console.error("❌ Submit failed:", submit.status, await submit.text());
        process.exit(1);
    }
    const job = await submit.json();
    console.log(JSON.stringify(job, null, 2));

    // ── 6. Poll until terminal ─────────────────────────────────────────
    header("6. Polling /api/intent/[jobId] every 2s");
    let final = job;
    for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const res = await fetch(`${RELAYER}/api/intent/${job.jobId}`);
        if (!res.ok) {
            console.error(`Poll ${i + 1}: HTTP ${res.status}`);
            continue;
        }
        final = await res.json();
        console.log(`  [${String(i + 1).padStart(2)}] status=${final.status}${final.txHash ? ` tx=${final.txHash.slice(0, 12)}…` : ""}`);
        if (final.status === "confirmed" || final.status === "failed") break;
    }

    // ── 7. Assert on-chain ownership ───────────────────────────────────
    header("7. On-chain assertion");
    const client = createPublicClient({chain, transport: http(RPC)});
    const owner = await client.readContract({
        address: NFT,
        abi: erc721,
        functionName: "ownerOf",
        args: [TOKEN_ID],
    });
    console.log(`ownerOf(${TOKEN_ID}) = ${owner}`);
    console.log(`expected           = ${buyer.address}`);

    if (final.status !== "confirmed") {
        console.error(`\n❌ FAILED — final status: ${final.status} · dlqReason: ${final.dlqReason ?? "n/a"}`);
        console.error(`   error: ${final.error ?? "(no error message)"}`);
        process.exit(1);
    }
    if (owner.toLowerCase() !== buyer.address.toLowerCase()) {
        console.error(`\n❌ FAILED — NFT did not land at buyer (got ${owner}, expected ${buyer.address})`);
        process.exit(1);
    }

    header("✅ E2E PASS");
    console.log(`Buyer ${buyer.address} now owns ${NFT} #${TOKEN_ID}`);
    console.log(`Tx: ${final.txHash}`);
    console.log(`Block: ${final.blockNumber}`);
    console.log(`\nRonin Explorer: https://app.roninchain.com/tx/${final.txHash}`);
}

function jsonBigIntReplacer(_key, value) {
    return typeof value === "bigint" ? value.toString() : value;
}

main().catch((e) => {
    console.error("\n❌ Unexpected error:", e);
    process.exit(1);
});
