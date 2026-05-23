import {defineChain} from "viem";

/**
 * Ronin Saigon Testnet (chainId 202601 since the 2026-02-05 hardfork that
 * migrated Saigon to Optimism stack; previously 2021).
 * Block explorer: https://saigon-app.roninchain.com
 */
export const roninSaigon = defineChain({
    id: 202601,
    name: "Ronin Saigon",
    network: "ronin-saigon",
    nativeCurrency: {name: "RON", symbol: "RON", decimals: 18},
    rpcUrls: {
        default: {
            http: [
                "https://saigon-testnet.roninchain.com/rpc",
                "https://api-gateway.skymavis.com/rpc/testnet",
            ],
        },
        public: {
            http: ["https://saigon-testnet.roninchain.com/rpc"],
        },
    },
    blockExplorers: {
        default: {
            name: "Ronin Saigon Explorer",
            url: "https://saigon-app.roninchain.com",
        },
    },
    testnet: true,
});

/**
 * Ronin Mainnet (chainId 2020).
 */
export const ronin = defineChain({
    id: 2020,
    name: "Ronin",
    network: "ronin",
    nativeCurrency: {name: "RON", symbol: "RON", decimals: 18},
    rpcUrls: {
        default: {
            http: ["https://api.roninchain.com/rpc", "https://api-gateway.skymavis.com/rpc"],
        },
        public: {http: ["https://api.roninchain.com/rpc"]},
    },
    blockExplorers: {
        default: {name: "Ronin Explorer", url: "https://app.roninchain.com"},
    },
});

export const SUPPORTED_CHAINS = [roninSaigon, ronin] as const;
