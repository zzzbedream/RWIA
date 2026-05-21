"use client";

import {useEffect, useState} from "react";
import {useAccount, useConnect, useDisconnect, useSwitchChain} from "wagmi";
import {toHex} from "viem";
import {ronin, roninSaigon} from "@/lib/chains";

const PREFERRED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? 2020);
const preferredChain = PREFERRED_CHAIN_ID === roninSaigon.id ? roninSaigon : ronin;

type WalletKind = "ronin" | "metamask" | "browser" | "waypoint";

type WalletOption = {
    kind: WalletKind;
    label: string;
    detected: boolean;
    installUrl?: string;
};

function detectWallets(): {ronin: boolean; metamask: boolean; browser: boolean} {
    if (typeof window === "undefined") return {ronin: false, metamask: false, browser: false};
    const w = window as unknown as {
        ronin?: {provider?: unknown};
        ethereum?: {isMetaMask?: boolean; isRonin?: boolean};
    };
    const hasRonin = Boolean(w.ronin?.provider);
    const hasMetaMask = Boolean(w.ethereum?.isMetaMask && !w.ethereum?.isRonin);
    const hasBrowser = Boolean(w.ethereum) && !hasMetaMask && !hasRonin;
    return {ronin: hasRonin, metamask: hasMetaMask, browser: hasBrowser};
}

export function ConnectWallet() {
    const {address, isConnected, chainId, connector} = useAccount();
    const {connectors, connect, isPending} = useConnect();
    const {switchChainAsync, isPending: isSwitching} = useSwitchChain();
    const {disconnect} = useDisconnect();
    const [menuOpen, setMenuOpen] = useState(false);
    const [available, setAvailable] = useState({ronin: false, metamask: false, browser: false});
    const [switchError, setSwitchError] = useState<string | null>(null);

    useEffect(() => {
        setAvailable(detectWallets());
    }, []);

    const options: WalletOption[] = [
        {
            kind: "ronin",
            label: "Ronin Wallet",
            detected: available.ronin,
            installUrl: "https://wallet.roninchain.com",
        },
        {
            kind: "metamask",
            label: "MetaMask",
            detected: available.metamask,
            installUrl: "https://metamask.io/download/",
        },
        ...(available.browser ? [{kind: "browser" as const, label: "Browser Wallet", detected: true}] : []),
        ...(connectors.some((c) => c.id === "waypoint")
            ? [{kind: "waypoint" as const, label: "Ronin Waypoint (Email/Social)", detected: true}]
            : []),
    ];

    function pickConnector(kind: WalletKind) {
        // Map our UI kind to the wagmi connector id (set in wagmi.ts).
        const targetId =
            kind === "ronin"
                ? "ronin"
                : kind === "metamask"
                  ? "metaMaskSDK"
                  : kind === "browser"
                    ? "browser"
                    : "waypoint";
        return connectors.find((c) => c.id === targetId);
    }

    function onPick(option: WalletOption) {
        setMenuOpen(false);
        if (!option.detected && option.installUrl) {
            window.open(option.installUrl, "_blank", "noopener,noreferrer");
            return;
        }
        const c = pickConnector(option.kind);
        if (c) connect({connector: c});
    }

    async function handleSwitch() {
        setSwitchError(null);
        try {
            await switchChainAsync({chainId: preferredChain.id});
        } catch (err) {
            try {
                const provider = (await connector?.getProvider?.()) as
                    | {request: (args: {method: string; params: unknown[]}) => Promise<unknown>}
                    | undefined;
                if (!provider?.request) throw err;
                await provider.request({
                    method: "wallet_addEthereumChain",
                    params: [
                        {
                            chainId: toHex(preferredChain.id),
                            chainName: preferredChain.name,
                            nativeCurrency: preferredChain.nativeCurrency,
                            rpcUrls: [...preferredChain.rpcUrls.default.http],
                            blockExplorerUrls: preferredChain.blockExplorers?.default.url
                                ? [preferredChain.blockExplorers.default.url]
                                : [],
                        },
                    ],
                });
            } catch (addErr) {
                setSwitchError(addErr instanceof Error ? addErr.message : String(addErr));
            }
        }
    }

    if (!isConnected) {
        return (
            <div className="relative">
                <button
                    onClick={() => setMenuOpen((v) => !v)}
                    disabled={isPending}
                    className="rounded-full bg-white text-black px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                    {isPending ? "Connecting…" : "Connect wallet"}
                </button>
                {menuOpen && (
                    <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-white/10 bg-[#0c0c0e] shadow-2xl overflow-hidden z-50">
                        {options.map((opt) => (
                            <button
                                key={opt.kind}
                                onClick={() => onPick(opt)}
                                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm text-left hover:bg-white/[0.04] border-b border-white/5 last:border-b-0"
                            >
                                <div className="flex items-center gap-3">
                                    <WalletIcon kind={opt.kind} />
                                    <span className="text-white">{opt.label}</span>
                                </div>
                                <span
                                    className={`text-[10px] uppercase tracking-widest ${
                                        opt.detected ? "text-emerald-400" : "text-white/40"
                                    }`}
                                >
                                    {opt.detected ? "Detected" : "Install"}
                                </span>
                            </button>
                        ))}
                        <div className="px-4 py-2 text-[11px] text-white/40 bg-black/40">
                            Tip: Ronin Wallet is the smoothest on Ronin Mainnet.
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (chainId !== preferredChain.id) {
        return (
            <div className="flex flex-col items-end gap-1">
                <button
                    onClick={handleSwitch}
                    disabled={isSwitching}
                    className="rounded-full bg-amber-400 text-black px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                    {isSwitching ? "Switching…" : `Switch to ${preferredChain.name}`}
                </button>
                <span className="text-[10px] font-mono text-amber-300/80">
                    wallet on chain {chainId ?? "?"} · need {preferredChain.id}
                </span>
                {switchError && (
                    <span className="text-[10px] font-mono text-red-300 max-w-xs truncate" title={switchError}>
                        {switchError}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-white/70 bg-white/[0.04] border border-white/10 rounded-full px-3 py-1.5">
                {address?.slice(0, 6)}…{address?.slice(-4)}
            </span>
            <button
                onClick={() => disconnect()}
                className="rounded-full border border-white/15 text-white/80 hover:text-white px-3 py-1.5 text-xs"
            >
                Disconnect
            </button>
        </div>
    );
}

function WalletIcon({kind}: {kind: WalletKind}) {
    const color =
        kind === "ronin" ? "#3b82f6" : kind === "metamask" ? "#f6851b" : kind === "waypoint" ? "#a855f7" : "#737373";
    return (
        <span
            className="inline-block w-5 h-5 rounded-md flex-shrink-0"
            style={{background: `linear-gradient(135deg, ${color}, ${color}aa)`}}
        />
    );
}
