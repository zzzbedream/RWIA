"use client";

import {useCallback, useMemo, useState} from "react";
import {useAccount, useSignTypedData} from "wagmi";
import {isAddress, parseUnits, type Address, type Hex} from "viem";

import Link from "next/link";

import {ConnectWallet} from "@/components/ConnectWallet";
import {Logo} from "@/components/Logo";
import {RnsAddressInput, type ResolvedAddress} from "@/components/RnsAddressInput";
import {SignPreviewModal, type SignPreview} from "@/components/SignPreviewModal";
import {INTENT_TYPES, buildIntentDomain, sanitizeIntent, type UserIntent} from "@/lib/eip712";
import {LocaleSwitch, useI18n} from "@/lib/i18n";

const AGGREGATOR_ADDRESS = (process.env.NEXT_PUBLIC_AGGREGATOR_ADDRESS ?? "") as Address;
const INTENT_ENDPOINT = process.env.NEXT_PUBLIC_INTENT_ENDPOINT ?? "/api/intent";
const DEFAULT_PAYMENT_TOKEN = (process.env.NEXT_PUBLIC_DEFAULT_PAYMENT_TOKEN ??
    "0x0000000000000000000000000000000000000000") as Address;
const DEFAULT_PAYMENT_DECIMALS = Number(process.env.NEXT_PUBLIC_DEFAULT_PAYMENT_DECIMALS ?? 6);
const REQUIRED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? 2020);

type SubmittedIntent = {
    intent: UserIntent;
    signature: Hex;
};

type JobStatusResponse = {
    jobId: string;
    status:
        | "pending"
        | "awaiting_payment"
        | "validating"
        | "queued"
        | "broadcasting"
        | "confirmed"
        | "failed";
    paid?: boolean;
    txHash?: Hex;
    blockNumber?: string;
    intentHash?: Hex;
    error?: string;
    dlqReason?: string;
};

type UiResult =
    | {kind: "idle"}
    | {kind: "progress"; status: string; jobId: string; txHash?: Hex}
    | {
          kind: "success";
          txHash: Hex;
          blockNumber: string;
          nftContract: Address;
          tokenId: bigint;
      }
    | {kind: "error"; message: string; dlqReason?: string};

const RONIN_EXPLORER = "https://app.roninchain.com";

export default function AppPage() {
    // IMPORTANT: useChainId() reflects the wagmi-config default, not the live
    // wallet chain. We need the real wallet chain so the guard can detect when
    // the user is on a network that doesn't match the deployed contract.
    const {address, isConnected, chainId} = useAccount();
    const {signTypedDataAsync} = useSignTypedData();
    const {t} = useI18n();

    const [nftContractInput, setNftContractInput] = useState("");
    const [nftContractResolved, setNftContractResolved] = useState<ResolvedAddress | null>(null);
    const [tokenId, setTokenId] = useState("");
    const [paymentToken, setPaymentToken] = useState<string>(DEFAULT_PAYMENT_TOKEN);
    const [paymentDecimals, setPaymentDecimals] = useState(String(DEFAULT_PAYMENT_DECIMALS));
    const [amount, setAmount] = useState("0");
    const [deadlineMinutes, setDeadlineMinutes] = useState("60");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<UiResult>({kind: "idle"});
    const [preview, setPreview] = useState<SignPreview | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);

    const aggregatorOk = isAddress(AGGREGATOR_ADDRESS);
    const wrongChain = isConnected && chainId !== REQUIRED_CHAIN_ID;

    const canSubmit = useMemo(
        () =>
            Boolean(
                isConnected &&
                    !wrongChain &&
                    aggregatorOk &&
                    nftContractResolved?.address &&
                    tokenId &&
                    isAddress(paymentToken) &&
                    Number(amount) > 0,
            ),
        [isConnected, wrongChain, aggregatorOk, nftContractResolved, tokenId, paymentToken, amount],
    );

    const onPreview = useCallback(() => {
        if (!address || !nftContractResolved?.address) return;
        const decimals = Math.max(0, Math.min(36, Number(paymentDecimals) || 0));
        const p: SignPreview = {
            tokenAddress: paymentToken as Address,
            amount: parseUnits(amount, decimals),
            tokenDecimals: decimals,
            nftContract: nftContractResolved.address,
            tokenId: BigInt(tokenId),
            deadline: BigInt(Math.floor(Date.now() / 1000) + Number(deadlineMinutes) * 60),
            nonce: BigInt(Date.now()), // millisecond timestamp for uniqueness
        };
        setPreview(p);
        setPreviewOpen(true);
    }, [address, nftContractResolved, paymentToken, paymentDecimals, amount, deadlineMinutes, tokenId]);

    async function confirmAndSign() {
        if (!address || !aggregatorOk || !preview) return;
        setPreviewOpen(false);
        const nftContract = preview.nftContract;
        const tokenId = preview.tokenId;
        try {
            setBusy(true);
            setResult({kind: "progress", status: "Building intent…", jobId: ""});
            const intent = sanitizeIntent({
                user: address,
                tokenAddress: preview.tokenAddress,
                amount: preview.amount,
                nftContract: preview.nftContract,
                tokenId: preview.tokenId,
                deadline: preview.deadline,
                nonce: preview.nonce,
            });
            // Domain chainId MUST equal the deployed-contract chainId AND the
            // wallet's active chain. The chain guard above ensures wallet matches.
            const domain = buildIntentDomain(REQUIRED_CHAIN_ID, AGGREGATOR_ADDRESS);
            setResult({kind: "progress", status: "Awaiting wallet signature…", jobId: ""});
            const signature: Hex = await signTypedDataAsync({
                domain,
                types: INTENT_TYPES,
                primaryType: "UserIntent",
                message: intent,
            });

            const submitted: SubmittedIntent = {intent, signature};
            setResult({kind: "progress", status: "Submitting to Keeper…", jobId: ""});
            const job = await postIntent(submitted);
            setResult({kind: "progress", status: job.status, jobId: job.jobId, txHash: job.txHash});
            await pollUntilTerminal(job.jobId, nftContract, tokenId);
        } catch (err) {
            setResult({kind: "error", message: err instanceof Error ? err.message : String(err)});
        } finally {
            setBusy(false);
        }
    }

    async function postIntent(submitted: SubmittedIntent): Promise<JobStatusResponse> {
        const body = JSON.stringify(
            {
                intent: {
                    user: submitted.intent.user,
                    tokenAddress: submitted.intent.tokenAddress,
                    amount: submitted.intent.amount.toString(),
                    nftContract: submitted.intent.nftContract,
                    tokenId: submitted.intent.tokenId.toString(),
                    deadline: submitted.intent.deadline.toString(),
                    nonce: submitted.intent.nonce.toString(),
                },
                signature: submitted.signature,
            },
        );
        const res = await fetch(INTENT_ENDPOINT, {
            method: "POST",
            headers: {"content-type": "application/json"},
            body,
        });
        if (res.status === 429) throw new Error("Too many requests — try again in a minute");
        if (!res.ok) {
            const detail = await res.json().catch(() => ({error: "unknown"}));
            throw new Error(`Keeper rejected (${res.status}): ${JSON.stringify(detail)}`);
        }
        return (await res.json()) as JobStatusResponse;
    }

    async function pollUntilTerminal(jobId: string, nftContract: Address, tokenId: bigint) {
        for (let i = 0; i < 60; i++) {
            await new Promise((r) => setTimeout(r, 2_000));
            const res = await fetch(`${INTENT_ENDPOINT}/${jobId}`);
            if (!res.ok) {
                setResult({kind: "error", message: `Poll failed: HTTP ${res.status}`});
                return;
            }
            const job = (await res.json()) as JobStatusResponse;
            if (job.status === "confirmed" && job.txHash) {
                setResult({
                    kind: "success",
                    txHash: job.txHash,
                    blockNumber: job.blockNumber ?? "?",
                    nftContract,
                    tokenId,
                });
                return;
            }
            if (job.status === "failed") {
                setResult({
                    kind: "error",
                    message: job.error ?? "unknown error",
                    dlqReason: job.dlqReason,
                });
                return;
            }
            setResult({kind: "progress", status: job.status, jobId, txHash: job.txHash});
        }
        setResult({kind: "error", message: "Polling timed out — check the explorer manually"});
    }

    function resetForm() {
        setResult({kind: "idle"});
        setTokenId("");
        setAmount("0");
    }

    return (
        <main className="min-h-screen bg-black text-white">
            <nav className="sticky top-0 z-40 border-b border-white/5 bg-black/70 backdrop-blur-xl">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
                    <Link href="/" className="flex items-center gap-2 text-white font-semibold tracking-tight">
                        <Logo className="w-7 h-7" />
                        <span className="text-base sm:text-lg">
                            Waypoint <span className="text-white/40 font-normal">/ RWIA</span>
                        </span>
                    </Link>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <LocaleSwitch />
                        <ConnectWallet />
                    </div>
                </div>
            </nav>
            <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-12 space-y-6 sm:space-y-8">
                <header>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("page.title")}</h1>
                    <p className="text-white/60 text-sm mt-2">{t("page.subtitle")}</p>
                </header>

                {!aggregatorOk ? (
                    <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/[0.08] p-6">
                        <div className="font-semibold mb-2">{t("warn.aggregator.title")}</div>
                        <div className="text-sm text-white/70">{t("warn.aggregator.body")}</div>
                    </div>
                ) : wrongChain ? (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] p-6 space-y-3">
                        <div className="font-semibold">
                            {t("warn.wrongChain", {
                                chainId: chainId ?? "?",
                                required: REQUIRED_CHAIN_ID,
                            })}
                        </div>
                        <div className="text-sm text-white/70">{t("warn.wrongChain.help")}</div>
                        <div className="text-xs font-mono text-amber-300/80">
                            {t("warn.wrongChain.detected", {
                                chainId: chainId ?? "unknown",
                                required: REQUIRED_CHAIN_ID,
                            })}
                        </div>
                    </div>
                ) : (
                    <section className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-8">
                        <Field label={t("field.nftContract")}>
                            <RnsAddressInput
                                value={nftContractInput}
                                onChange={setNftContractInput}
                                onResolved={setNftContractResolved}
                                placeholder="0x… or collection.ron"
                            />
                        </Field>
                        <Field label={t("field.tokenId")}>
                            <input
                                value={tokenId}
                                onChange={(e) => setTokenId(e.target.value)}
                                inputMode="numeric"
                                placeholder="1337"
                                className="input"
                            />
                        </Field>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label={t("field.paymentToken")}>
                                <input
                                    value={paymentToken}
                                    onChange={(e) => setPaymentToken(e.target.value)}
                                    placeholder="0x…"
                                    className="input"
                                />
                            </Field>
                            <Field label={t("field.paymentDecimals")}>
                                <input
                                    value={paymentDecimals}
                                    onChange={(e) => setPaymentDecimals(e.target.value)}
                                    inputMode="numeric"
                                    className="input"
                                />
                            </Field>
                        </div>
                        <Field label={t("field.amount")}>
                            <input
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                inputMode="decimal"
                                className="input"
                            />
                        </Field>
                        <Field label={t("field.deadline")}>
                            <input
                                value={deadlineMinutes}
                                onChange={(e) => setDeadlineMinutes(e.target.value)}
                                inputMode="numeric"
                                className="input"
                            />
                        </Field>

                        <button
                            disabled={!canSubmit || busy || result.kind === "success"}
                            onClick={onPreview}
                            className="w-full rounded-full bg-white text-black px-6 py-3 font-semibold disabled:opacity-50"
                        >
                            {busy ? t("btn.working") : t("btn.reviewSign")}
                        </button>

                        <ResultCard
                            result={result}
                            buyerAddress={address}
                            onReset={resetForm}
                        />
                    </section>
                )}

                <style>{`
                    .input {
                        width: 100%;
                        background: rgba(255,255,255,0.04);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 12px;
                        padding: 10px 14px;
                        font-family: ui-monospace, monospace;
                        color: white;
                        outline: none;
                    }
                    .input:focus { border-color: rgba(99,102,241,0.6); }
                `}</style>
            </div>

            <SignPreviewModal
                open={previewOpen}
                preview={preview}
                onConfirm={confirmAndSign}
                onCancel={() => setPreviewOpen(false)}
            />
        </main>
    );
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <label className="block space-y-1.5">
            <span className="text-xs uppercase tracking-widest text-white/50">{label}</span>
            {children}
        </label>
    );
}

const STATUS_COPY: Record<string, string> = {
    pending: "Queued for the Keeper",
    awaiting_payment: "Waiting for payment confirmation",
    validating: "Validating signature on the relayer",
    queued: "Pre-flight simulation OK — about to broadcast",
    broadcasting: "Broadcasting to Ronin Mainnet…",
};

function ResultCard({
    result,
    buyerAddress,
    onReset,
}: {
    result: UiResult;
    buyerAddress?: Address;
    onReset: () => void;
}) {
    if (result.kind === "idle") return null;

    if (result.kind === "progress") {
        return (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
                <div className="flex items-center gap-3">
                    <Spinner />
                    <div>
                        <div className="text-sm font-semibold text-white">
                            {STATUS_COPY[result.status] ?? result.status}
                        </div>
                        <div className="text-[11px] text-white/40 font-mono mt-0.5">
                            job {result.jobId || "…"}
                        </div>
                    </div>
                </div>
                {result.txHash && (
                    <a
                        href={`${RONIN_EXPLORER}/tx/${result.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs font-mono text-indigo-300 hover:text-indigo-200 underline break-all"
                    >
                        Track tx: {result.txHash}
                    </a>
                )}
            </div>
        );
    }

    if (result.kind === "error") {
        return (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/[0.08] p-5 space-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-red-400 text-lg">✕</span>
                    <div className="text-sm font-semibold text-red-200">Intent failed</div>
                </div>
                {result.dlqReason && (
                    <div className="text-[11px] uppercase tracking-widest text-red-300/80">
                        {result.dlqReason.replace(/_/g, " ")}
                    </div>
                )}
                <div className="text-xs font-mono text-white/60 break-all">{result.message}</div>
                <button
                    onClick={onReset}
                    className="rounded-full border border-white/15 text-white/80 hover:text-white px-4 py-2 text-xs"
                >
                    Try again
                </button>
            </div>
        );
    }

    // success
    return (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] p-6 space-y-5">
            <div className="flex items-center gap-3">
                <span className="text-emerald-400 text-2xl">✓</span>
                <div>
                    <div className="text-base font-semibold text-white">NFT delivered</div>
                    <div className="text-xs text-white/60 mt-0.5">
                        Token #{result.tokenId.toString()} is now in your wallet
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
                <Detail label="Transaction" value={result.txHash} explorer={`/tx/${result.txHash}`} />
                <Detail label="Block" value={result.blockNumber} explorer={`/block/${result.blockNumber}`} />
                <Detail
                    label="NFT contract"
                    value={result.nftContract}
                    explorer={`/address/${result.nftContract}`}
                />
                {buyerAddress && (
                    <Detail
                        label="Recipient"
                        value={buyerAddress}
                        explorer={`/address/${buyerAddress}`}
                    />
                )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                <a
                    href={`${RONIN_EXPLORER}/tx/${result.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-white text-black px-4 py-2 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                    View on Ronin Explorer ↗
                </a>
                {buyerAddress && (
                    <a
                        href={`${RONIN_EXPLORER}/address/${buyerAddress}?type=nft`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-white/20 text-white/90 hover:text-white px-4 py-2 text-xs font-medium"
                    >
                        View NFTs in my wallet ↗
                    </a>
                )}
                <button
                    onClick={onReset}
                    className="rounded-full border border-white/15 text-white/70 hover:text-white px-4 py-2 text-xs"
                >
                    Buy another
                </button>
            </div>
        </div>
    );
}

function Detail({label, value, explorer}: {label: string; value: string; explorer: string}) {
    const short = value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
    return (
        <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">{label}</div>
            <a
                href={`${RONIN_EXPLORER}${explorer}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/90 hover:text-emerald-300 font-mono break-all"
                title={value}
            >
                {short}
            </a>
        </div>
    );
}

function Spinner() {
    return (
        <svg className="animate-spin h-5 w-5 text-indigo-300" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
    );
}

