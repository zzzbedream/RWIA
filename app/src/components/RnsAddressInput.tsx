"use client";

import {useEffect, useMemo, useState} from "react";
import {isAddress, type Address} from "viem";
import {useChainId} from "wagmi";
import {isRnsName, resolveRns} from "@/lib/rns";

export type ResolvedAddress = {
    raw: string;
    address: Address | null;
    isRns: boolean;
    error?: string;
};

/**
 * Address input that accepts either a hex 0x… or an RNS name (alice.ron).
 *
 * Derivation strategy:
 *   - synchronous classification (hex / rns / invalid) lives in a useMemo;
 *     no state mutation needed.
 *   - asynchronous RNS resolution writes to a separate `resolved` state and
 *     bails on stale promises via a `cancelled` flag.
 *
 * Splitting sync vs async avoids the `react-hooks/set-state-in-effect`
 * pitfall — the effect only fires once per RNS lookup, never on every
 * keystroke.
 */
export function RnsAddressInput({
    value,
    onChange,
    onResolved,
    placeholder = "0x… or alice.ron",
}: {
    value: string;
    onChange: (v: string) => void;
    onResolved: (r: ResolvedAddress) => void;
    placeholder?: string;
}) {
    const chainId = useChainId();
    const [resolved, setResolved] = useState<Address | null>(null);
    const [resolveError, setResolveError] = useState<string | null>(null);

    const classification = useMemo<ResolvedAddress | null>(() => {
        const raw = value.trim();
        if (!raw) return {raw, address: null, isRns: false};
        if (isAddress(raw)) return {raw, address: raw as Address, isRns: false};
        if (isRnsName(raw)) return null; // needs async lookup
        return {raw, address: null, isRns: false, error: "Invalid address or RNS"};
    }, [value]);

    useEffect(() => {
        // Only run when we need an async RNS lookup
        const raw = value.trim();
        if (classification !== null || !isRnsName(raw)) return;

        let cancelled = false;
        setResolved(null);
        setResolveError(null);
        resolveRns(raw, chainId).then((addr) => {
            if (cancelled) return;
            setResolved(addr);
            setResolveError(addr ? null : "RNS name not found");
        });
        return () => {
            cancelled = true;
        };
    }, [value, chainId, classification]);

    // Final shape emitted to the caller
    const final = useMemo<ResolvedAddress>(() => {
        if (classification) return classification;
        const raw = value.trim();
        return {
            raw,
            address: resolved,
            isRns: true,
            error: resolveError ?? undefined,
        };
    }, [classification, value, resolved, resolveError]);

    // Notify parent on every change (cheap, parent guards re-render)
    useEffect(() => {
        onResolved(final);
    }, [final, onResolved]);

    return (
        <div className="space-y-1">
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="input"
            />
            {final.address && final.isRns && (
                <div className="text-[11px] font-mono text-emerald-400">
                    → {final.address.slice(0, 10)}…{final.address.slice(-8)}
                </div>
            )}
            {final.error && <div className="text-[11px] text-red-400">{final.error}</div>}
        </div>
    );
}
