import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    parseAbiItem,
    type Address,
    type Hex,
    type Log,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";

const ronin = defineChain({
    id: 2020,
    name: "Ronin",
    network: "ronin",
    nativeCurrency: {name: "RON", symbol: "RON", decimals: 18},
    rpcUrls: {
        default: {http: ["https://api.roninchain.com/rpc"]},
        public: {http: ["https://api.roninchain.com/rpc"]},
    },
});

const roninSaigon = defineChain({
    // chainId 202601 post-Feb-2026 hardfork (was 2021)
    id: 202601,
    name: "Ronin Saigon",
    network: "ronin-saigon",
    nativeCurrency: {name: "RON", symbol: "RON", decimals: 18},
    rpcUrls: {
        default: {http: ["https://saigon-testnet.roninchain.com/rpc"]},
        public: {http: ["https://saigon-testnet.roninchain.com/rpc"]},
    },
});

const NETWORK = (process.env.RWIA_NETWORK ?? "mainnet").toLowerCase();
const chain = NETWORK === "saigon" ? roninSaigon : ronin;
const RPC_URL =
    process.env.RWIA_RPC_URL ?? (NETWORK === "saigon" ? roninSaigon.rpcUrls.default.http[0] : ronin.rpcUrls.default.http[0]);
const AGGREGATOR = process.env.AGGREGATOR_ADDRESS as Address | undefined;
const POLL_MS = Number(process.env.KEEPER_POLL_MS ?? 15_000);
const KEEPER_PK = process.env.KEEPER_PRIVATE_KEY as Hex | undefined;

if (!AGGREGATOR) {
    console.error("Set AGGREGATOR_ADDRESS in env.");
    process.exit(1);
}

const publicClient = createPublicClient({chain, transport: http(RPC_URL)});
const walletClient = KEEPER_PK
    ? createWalletClient({chain, account: privateKeyToAccount(KEEPER_PK), transport: http(RPC_URL)})
    : null;

const executedEvent = parseAbiItem(
    "event IntentExecuted(bytes32 indexed intentHash, address indexed user, address indexed nftContract, uint256 tokenId, address tokenAddress, uint256 amount, address keeper)",
);
const pausedEvent = parseAbiItem("event Paused(address account)");

let lastBlock: bigint | undefined;

async function tick() {
    const head = await publicClient.getBlockNumber();
    const fromBlock = lastBlock ?? head - 200n;
    if (head < fromBlock) return;

    const [executed, paused]: [Log[], Log[]] = await Promise.all([
        publicClient.getLogs({address: AGGREGATOR, event: executedEvent, fromBlock, toBlock: head}),
        publicClient.getLogs({address: AGGREGATOR, event: pausedEvent, fromBlock, toBlock: head}),
    ]);

    for (const log of executed) {
        const args = (log as Log & {args?: Record<string, unknown>}).args ?? {};
        console.log("[executed]", log.transactionHash, {
            user: args.user,
            nftContract: args.nftContract,
            tokenId: args.tokenId?.toString(),
            amount: args.amount?.toString(),
        });
    }

    if (paused.length > 0) {
        // Pause is a critical signal — wire RWIA_ALERT_WEBHOOK to a Slack /
        // PagerDuty incoming webhook to page on-call. Left as console.warn so
        // a missing webhook still surfaces the event in `npm start` logs.
        console.warn("[ALERT] Aggregator paused — admin action required.");
        const alertUrl = process.env.RWIA_ALERT_WEBHOOK;
        if (alertUrl) {
            fetch(alertUrl, {
                method: "POST",
                headers: {"content-type": "application/json"},
                body: JSON.stringify({text: `:rotating_light: RWIA aggregator paused on ${NETWORK}`}),
            }).catch((e) => console.error("alert webhook failed:", e));
        }
    }

    lastBlock = head + 1n;
}

console.log(`RWIA keeper · network=${NETWORK} · rpc=${RPC_URL} · poll=${POLL_MS}ms`);
console.log(`  aggregator=${AGGREGATOR}`);
console.log(`  walletClient=${walletClient ? "ready" : "read-only (no KEEPER_PRIVATE_KEY)"}`);

setInterval(() => {
    tick().catch((e) => console.error("tick error", e));
}, POLL_MS);
tick().catch((e) => console.error("initial tick error", e));
