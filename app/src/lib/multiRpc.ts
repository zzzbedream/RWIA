import {createPublicClient, http, type Chain, type PublicClient} from "viem";

/**
 * Multi-RPC consensus client. Issues the same read across N endpoints and only
 * returns a value if at least `quorum` endpoints agree on the JSON-serialised result.
 *
 * Use for high-trust reads such as final nonce checks before broadcasting an intent
 * or fetching the current allowlist state — never trust a single RPC for these.
 */
export class MultiRpcConsensus {
    private readonly clients: PublicClient[];

    constructor(
        private readonly chain: Chain,
        rpcUrls: string[],
        private readonly quorum: number = Math.ceil((rpcUrls.length || 1) / 2 + 0.5),
    ) {
        if (rpcUrls.length === 0) throw new Error("multiRpc: at least one rpcUrl required");
        if (quorum > rpcUrls.length) throw new Error("multiRpc: quorum exceeds endpoints");
        this.clients = rpcUrls.map((url) => createPublicClient({chain, transport: http(url)}));
    }

    /**
     * Run an async read against every endpoint in parallel. Returns the value
     * that achieved `quorum` agreement; throws if no value reached quorum.
     */
    async read<T>(fn: (client: PublicClient) => Promise<T>): Promise<T> {
        const results = await Promise.allSettled(this.clients.map(fn));
        const counts = new Map<string, {count: number; value: T}>();
        for (const r of results) {
            if (r.status !== "fulfilled") continue;
            const key = serialize(r.value);
            const existing = counts.get(key);
            if (existing) existing.count += 1;
            else counts.set(key, {count: 1, value: r.value});
        }
        let best: {count: number; value: T} | undefined;
        for (const entry of counts.values()) {
            if (!best || entry.count > best.count) best = entry;
        }
        if (!best || best.count < this.quorum) {
            const errors = results
                .filter((r): r is PromiseRejectedResult => r.status === "rejected")
                .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
            throw new Error(
                `multiRpc: no consensus (best=${best?.count ?? 0}/${this.clients.length}, quorum=${this.quorum})` +
                    (errors.length ? ` errors=${errors.join("|")}` : ""),
            );
        }
        return best.value;
    }
}

function serialize(v: unknown): string {
    return JSON.stringify(v, (_, val) => (typeof val === "bigint" ? `${val.toString()}n` : val));
}
