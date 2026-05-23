"use client";

import {createConnector} from "wagmi";
import {getAddress, UserRejectedRequestError, type Address, type EIP1193Provider} from "viem";

import {getWaypointProvider, isWaypointConfigured} from "./waypoint";

export type WaypointConnectorParams = {
    chainId?: number;
};

waypointConnector.type = "waypoint" as const;
export function waypointConnector(params: WaypointConnectorParams = {}) {
    return createConnector<EIP1193Provider>((config) => ({
        id: "waypoint",
        name: "Ronin Waypoint",
        type: waypointConnector.type,
        async connect(opts) {
            if (!isWaypointConfigured()) throw new Error("Waypoint clientId not configured");
            const targetChainId = opts?.chainId ?? params.chainId ?? config.chains[0]?.id ?? 202601;
            const provider = getWaypointProvider(targetChainId);
            try {
                const {address} = await provider.connect();
                return {accounts: [getAddress(address)] as readonly Address[], chainId: targetChainId} as never;
            } catch (err) {
                throw new UserRejectedRequestError(err as Error);
            }
        },
        async disconnect() {
            if (!isWaypointConfigured()) return;
            const provider = getWaypointProvider(params.chainId ?? config.chains[0]?.id ?? 202601);
            provider.disconnect();
        },
        async getAccounts() {
            if (!isWaypointConfigured()) return [];
            const provider = getWaypointProvider(params.chainId ?? config.chains[0]?.id ?? 202601);
            const accounts = (await provider.request<Address[]>({method: "eth_accounts"})) ?? [];
            return accounts.map((a) => getAddress(a));
        },
        async getChainId() {
            const provider = getWaypointProvider(params.chainId ?? config.chains[0]?.id ?? 202601);
            return provider.chainId;
        },
        async getProvider({chainId} = {}) {
            return getWaypointProvider(chainId ?? params.chainId ?? config.chains[0]?.id ?? 202601) as unknown as EIP1193Provider;
        },
        async isAuthorized() {
            if (!isWaypointConfigured()) return false;
            try {
                const accounts = await this.getAccounts();
                return accounts.length > 0;
            } catch {
                return false;
            }
        },
        async switchChain({chainId}) {
            const target = config.chains.find((c) => c.id === chainId);
            if (!target) throw new Error(`Unsupported chain ${chainId}`);
            // WaypointProvider is instantiated per chainId; rebuild and emit.
            getWaypointProvider(chainId);
            config.emitter.emit("change", {chainId});
            return target;
        },
        onAccountsChanged(accounts) {
            if (accounts.length === 0) config.emitter.emit("disconnect");
            else config.emitter.emit("change", {accounts: accounts.map((a) => getAddress(a as Address))});
        },
        onChainChanged(chain) {
            const id = Number(chain);
            config.emitter.emit("change", {chainId: id});
        },
        onDisconnect() {
            config.emitter.emit("disconnect");
        },
    }));
}
