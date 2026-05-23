#!/usr/bin/env node
/**
 * End-to-end smoke for CI: signs an EIP-712 intent as a "buyer", posts it
 * to the running relayer, and asserts the NFT moved to the buyer's wallet.
 *
 * Requires anvil running on $ANVIL_RPC, the Next.js relayer on
 * http://127.0.0.1:3000, and a Mock ERC-721 deployed by the script itself.
 */
import {execSync} from "node:child_process";
import {
    createPublicClient,
    createWalletClient,
    encodeFunctionData,
    http,
    keccak256,
    toBytes,
    parseAbi,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {anvil} from "viem/chains";

const RPC = process.env.ANVIL_RPC ?? "http://127.0.0.1:8545";
const RELAYER = "http://127.0.0.1:3000";
const AGGREGATOR = process.env.AGGREGATOR_PROXY;
const KEEPER_PK = process.env.KEEPER_PRIVATE_KEY;
const USER_PK = process.env.USER_PRIVATE_KEY;
if (!AGGREGATOR || !KEEPER_PK || !USER_PK) throw new Error("AGGREGATOR_PROXY / KEEPER_PRIVATE_KEY / USER_PRIVATE_KEY required");

const chain = {...anvil, id: 2020};
const pc = createPublicClient({chain, transport: http(RPC)});
const keeper = privateKeyToAccount(KEEPER_PK);
const user = privateKeyToAccount(USER_PK);
const keeperWallet = createWalletClient({chain, account: keeper, transport: http(RPC)});

console.log("E2E: deploying MockERC721 from keeper");
// Minimal MockERC721 bytecode is too long for an inline string. Instead use the
// foundry-built artifact via forge create:
const nftAddr = execSync(
    `forge create test/mocks/MockERC721.sol:MockERC721 --rpc-url ${RPC} --private-key ${KEEPER_PK} --broadcast --json`,
    {cwd: "../contracts"},
);
const nftAddress = JSON.parse(nftAddr.toString()).deployedTo;
console.log("MockERC721 at", nftAddress);

const erc721Abi = parseAbi([
    "function mint(address to, uint256 tokenId) external",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function setApprovalForAll(address operator, bool approved) external",
]);

// Keeper mints token 1 to itself and approves the aggregator.
await keeperWallet.writeContract({
    address: nftAddress,
    abi: erc721Abi,
    functionName: "mint",
    args: [keeper.address, 1n],
});
await keeperWallet.writeContract({
    address: nftAddress,
    abi: erc721Abi,
    functionName: "setApprovalForAll",
    args: [AGGREGATOR, true],
});
console.log("minted + approved");

// User signs an EIP-712 intent to receive token id 1.
const intent = {
    user: user.address,
    tokenAddress: nftAddress,
    amount: 1n,
    nftContract: nftAddress,
    tokenId: 1n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    nonce: BigInt(Date.now()),
};
const signature = await (
    createWalletClient({chain, account: user, transport: http(RPC)})
).signTypedData({
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
console.log("signed");

// POST /api/intent
const submitRes = await fetch(`${RELAYER}/api/intent`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
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
    }),
});
if (!submitRes.ok) {
    console.error("submit failed:", submitRes.status, await submitRes.text());
    process.exit(1);
}
const job = await submitRes.json();
console.log("queued", job.jobId, job.status);

// Poll until terminal
let finalStatus = job;
for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2_000));
    const r = await fetch(`${RELAYER}/api/intent/${job.jobId}`);
    finalStatus = await r.json();
    console.log("status:", finalStatus.status, finalStatus.txHash ?? "");
    if (finalStatus.status === "confirmed" || finalStatus.status === "failed") break;
}
if (finalStatus.status !== "confirmed") {
    console.error("FAILED: final =", finalStatus);
    process.exit(1);
}

// Assert ownership
const owner = await pc.readContract({
    address: nftAddress,
    abi: erc721Abi,
    functionName: "ownerOf",
    args: [1n],
});
if (owner.toLowerCase() !== user.address.toLowerCase()) {
    console.error(`FAILED: NFT owner is ${owner}, expected ${user.address}`);
    process.exit(1);
}
console.log("✅ E2E pass — NFT moved to buyer", user.address);
