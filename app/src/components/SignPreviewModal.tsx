"use client";

import {formatUnits, type Address} from "viem";

export type SignPreview = {
    tokenAddress: Address;
    amount: bigint;
    tokenDecimals: number;
    nftContract: Address;
    tokenId: bigint;
    deadline: bigint;
    nonce: bigint;
};

export function SignPreviewModal({
    open,
    preview,
    onConfirm,
    onCancel,
}: {
    open: boolean;
    preview: SignPreview | null;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    if (!open || !preview) return null;
    const deadlineDate = new Date(Number(preview.deadline) * 1000);
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0c0c0e] p-6 space-y-5">
                <div>
                    <h3 className="text-lg font-semibold text-white">Confirm purchase</h3>
                    <p className="text-xs text-white/50 mt-1">
                        You are about to sign an EIP-712 intent. The Keeper will deliver the NFT to
                        your wallet after the off-chain payment is settled.
                    </p>
                </div>
                <dl className="text-sm space-y-3 font-mono">
                    <Row k="NFT contract" v={preview.nftContract} />
                    <Row k="Token id" v={preview.tokenId.toString()} />
                    <Row
                        k="You pay (off-chain)"
                        v={`${formatUnits(preview.amount, preview.tokenDecimals)} (${preview.tokenAddress.slice(0, 8)}…)`}
                    />
                    <Row k="Nonce" v={preview.nonce.toString()} />
                    <Row k="Deadline" v={deadlineDate.toISOString()} />
                </dl>
                <div className="flex gap-3 pt-2">
                    <button
                        onClick={onCancel}
                        className="flex-1 rounded-full border border-white/15 text-white/80 px-4 py-2.5 text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 rounded-full bg-white text-black px-4 py-2.5 text-sm font-semibold"
                    >
                        Sign in wallet
                    </button>
                </div>
            </div>
        </div>
    );
}

function Row({k, v}: {k: string; v: string}) {
    return (
        <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-2">
            <dt className="text-white/50 text-[11px] uppercase tracking-widest">{k}</dt>
            <dd className="text-white/90 text-xs break-all text-right">{v}</dd>
        </div>
    );
}
