"use client";

import Link from "next/link";
import {useCallback, useEffect, useMemo, useState} from "react";
import {Activity, AlertTriangle, RefreshCcw, Server} from "lucide-react";

import {Logo} from "@/components/Logo";
import {LocaleSwitch, useI18n} from "@/lib/i18n";

type KeeperEntry = {
    address: string;
    balanceRON: number;
    status: "ok" | "degraded" | "critical";
};

type HealthResponse = {
    ready: boolean;
    status: "ok" | "degraded" | "critical";
    chainId: number;
    aggregator: string;
    shards: number;
    thresholds: {healthyRON: number; criticalRON: number};
    keepers: KeeperEntry[];
};

type DlqJob = {
    jobId: string;
    intentHash?: string;
    status: string;
    dlqReason?: string;
    error?: string;
    updatedAt?: number;
};

type DlqResponse = {count: number; jobs: DlqJob[]};

const REFRESH_MS = 15_000;
const RONIN_EXPLORER = "https://app.roninchain.com";

function statusTone(status: "ok" | "degraded" | "critical") {
    if (status === "ok") return "text-emerald-300 bg-emerald-400/10 border-emerald-400/20";
    if (status === "degraded") return "text-amber-300 bg-amber-400/10 border-amber-400/20";
    return "text-red-300 bg-red-400/10 border-red-400/20";
}

function shortenAddress(addr: string) {
    if (!addr || addr.length < 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function DashboardPage() {
    const {t, locale} = useI18n();
    const [health, setHealth] = useState<HealthResponse | null>(null);
    const [dlq, setDlq] = useState<DlqResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);

    const fetchAll = useCallback(async () => {
        setError(null);
        try {
            const [hRes, dRes] = await Promise.all([
                fetch("/api/health", {cache: "no-store"}),
                fetch("/api/dlq?limit=10", {cache: "no-store"}),
            ]);
            if (!hRes.ok) throw new Error(`health HTTP ${hRes.status}`);
            if (!dRes.ok) throw new Error(`dlq HTTP ${dRes.status}`);
            const h = (await hRes.json()) as HealthResponse;
            const d = (await dRes.json()) as DlqResponse;
            setHealth(h);
            setDlq(d);
            setLastUpdated(Date.now());
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
        const id = setInterval(fetchAll, REFRESH_MS);
        return () => clearInterval(id);
    }, [fetchAll]);

    const lastUpdatedLabel = useMemo(() => {
        if (!lastUpdated) return null;
        const localeMap: Record<string, string> = {en: "en-US", es: "es-AR", pt: "pt-BR"};
        return new Date(lastUpdated).toLocaleTimeString(localeMap[locale] ?? "en-US");
    }, [lastUpdated, locale]);

    return (
        <div className="min-h-screen bg-black text-white">
            <header className="sticky top-0 z-50 border-b border-white/5 bg-black/70 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
                    <Link href="/" className="flex items-center gap-2 text-white font-semibold tracking-tight">
                        <Logo className="w-7 h-7" />
                        <span className="text-base sm:text-lg">
                            Waypoint <span className="text-white/40 font-normal">/ RWIA</span>
                        </span>
                    </Link>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <button
                            type="button"
                            onClick={fetchAll}
                            disabled={loading}
                            className="hidden sm:inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-white/55 hover:text-white border border-white/15 rounded-full px-3 py-1.5 transition-colors disabled:opacity-50"
                        >
                            <RefreshCcw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                            {loading ? t("dash.refreshing") : t("dash.refresh")}
                        </button>
                        <LocaleSwitch />
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10">
                <section className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("dash.title")}</h1>
                        <p className="text-white/55 text-sm sm:text-base mt-2 max-w-2xl">{t("dash.subtitle")}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
                        <span className="text-emerald-300/80">{t("dash.live")}</span>
                        {lastUpdatedLabel && (
                            <span className="text-white/30 ml-2 normal-case tracking-normal">
                                {t("dash.lastUpdated", {time: lastUpdatedLabel})}
                            </span>
                        )}
                    </div>
                </section>

                {error && (
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 flex items-center gap-3 text-sm text-amber-200">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{t("dash.error")}</span>
                        <span className="font-mono text-amber-300/60 text-xs ml-auto">{error}</span>
                    </div>
                )}

                <section className="space-y-4">
                    <h2 className="text-lg font-semibold text-white/90 flex items-center gap-2">
                        <Server className="w-4 h-4 text-white/50" /> {t("dash.section.health")}
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <MetricCard label={t("dash.metric.chain")} value={health ? String(health.chainId) : "—"} />
                        <MetricCard
                            label={t("dash.metric.shards")}
                            value={health ? String(health.shards) : "—"}
                        />
                        <MetricCard
                            label={t("dash.metric.status")}
                            value={health ? health.status : "—"}
                            tone={health ? statusTone(health.status) : undefined}
                        />
                        <MetricCard
                            label={t("dash.metric.dlqCount")}
                            value={dlq ? String(dlq.count) : "—"}
                            tone={
                                dlq?.count
                                    ? "text-red-300 bg-red-400/10 border-red-400/20"
                                    : "text-white/70 bg-white/[0.03] border-white/10"
                            }
                        />
                    </div>
                    {health && (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
                            <div className="text-xs font-mono uppercase tracking-widest text-white/40 mb-2">
                                {t("dash.metric.aggregator")}
                            </div>
                            <a
                                href={`${RONIN_EXPLORER}/address/${health.aggregator}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-sm text-indigo-300 hover:text-indigo-200 break-all"
                            >
                                {health.aggregator}
                            </a>
                        </div>
                    )}
                </section>

                <section className="space-y-4">
                    <h2 className="text-lg font-semibold text-white/90 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-white/50" /> {t("dash.section.keepers")}
                    </h2>
                    {health && health.keepers.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {health.keepers.map((k) => (
                                <KeeperCard key={k.address} k={k} t={t} />
                            ))}
                        </div>
                    ) : (
                        <EmptyState label={t("dash.section.empty")} />
                    )}
                </section>

                <section className="space-y-4">
                    <h2 className="text-lg font-semibold text-white/90 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-white/50" /> {t("dash.section.dlq")}
                    </h2>
                    {dlq && dlq.count > 0 ? (
                        <div className="space-y-2">
                            {dlq.jobs.map((job) => (
                                <div
                                    key={job.jobId}
                                    className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6"
                                >
                                    <div className="font-mono text-xs text-white/60">{shortenAddress(job.jobId)}</div>
                                    <div className="text-xs text-white/40">
                                        {job.dlqReason ?? "unknown"}
                                    </div>
                                    {job.error && (
                                        <div className="text-xs text-red-300/80 truncate sm:flex-1">
                                            {job.error}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState label={t("dash.section.empty")} />
                    )}
                </section>
            </main>
        </div>
    );
}

function MetricCard({
    label,
    value,
    tone,
}: {
    label: string;
    value: string;
    tone?: string;
}) {
    return (
        <div className={`rounded-2xl border p-4 ${tone ?? "border-white/10 bg-white/[0.02]"}`}>
            <div className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-2">{label}</div>
            <div className="text-lg sm:text-xl font-semibold tracking-tight break-all">{value}</div>
        </div>
    );
}

function KeeperCard({k, t}: {k: KeeperEntry; t: (key: import("@/lib/i18n").StringKey) => string}) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
            <div className="flex items-center justify-between">
                <a
                    href={`${RONIN_EXPLORER}/address/${k.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm text-indigo-300 hover:text-indigo-200 break-all"
                >
                    {shortenAddress(k.address)}
                </a>
                <span
                    className={`text-[10px] font-mono uppercase tracking-widest rounded-full border px-2 py-0.5 ${statusTone(
                        k.status,
                    )}`}
                >
                    {k.status}
                </span>
            </div>
            <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{k.balanceRON.toFixed(2)}</span>
                <span className="text-xs text-white/40">RON · {t("dash.metric.balance")}</span>
            </div>
        </div>
    );
}

function EmptyState({label}: {label: string}) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-white/40 text-sm">
            {label}
        </div>
    );
}
