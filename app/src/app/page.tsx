"use client";

import {useRouter} from "next/navigation";
import {useCallback, useRef, useState} from "react";
import {motion, useScroll, useSpring, useMotionValue, useMotionValueEvent} from "framer-motion";
import {Activity, ArrowRight, ChevronRight, Layers, ShieldCheck, Zap} from "lucide-react";
import {ConnectWallet} from "@/components/ConnectWallet";
import {Logo} from "@/components/Logo";
import {LocaleSwitch, useI18n} from "@/lib/i18n";

const MagneticButton = ({
    children,
    className = "",
    onClick,
}: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
}) => {
    const ref = useRef<HTMLButtonElement>(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const springX = useSpring(x, {stiffness: 150, damping: 15, mass: 0.1});
    const springY = useSpring(y, {stiffness: 150, damping: 15, mass: 0.1});
    return (
        <motion.button
            ref={ref}
            onMouseMove={(e) => {
                if (!ref.current) return;
                const {width, height, left, top} = ref.current.getBoundingClientRect();
                x.set(e.clientX - (left + width / 2));
                y.set(e.clientY - (top + height / 2));
            }}
            onMouseLeave={() => {
                x.set(0);
                y.set(0);
            }}
            onClick={onClick}
            style={{x: springX, y: springY}}
            className={`relative overflow-hidden rounded-full font-medium transition-all group ${className}`}
        >
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-500 rounded-full" />
            {children}
        </motion.button>
    );
};

const Card = ({children, className = ""}: {children: React.ReactNode; className?: string}) => (
    <div
        className={`relative rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl overflow-hidden ${className}`}
    >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.15] to-transparent" />
        {children}
    </div>
);

function Navbar() {
    const {scrollY} = useScroll();
    const [isScrolled, setIsScrolled] = useState(false);
    useMotionValueEvent(scrollY, "change", (v) => setIsScrolled(v > 80));
    const {t} = useI18n();
    return (
        <div className="fixed top-0 inset-x-0 z-[100] flex justify-center p-4 px-6 pointer-events-none">
            <nav
                className={`pointer-events-auto flex justify-between items-center w-full max-w-7xl transition-all duration-500 rounded-[2rem] ${
                    isScrolled
                        ? "py-3 px-6 bg-white/[0.04] border border-white/10 backdrop-blur-2xl"
                        : "py-4 px-2 bg-transparent"
                }`}
            >
                <a href="/" className="flex items-center gap-2 text-white font-semibold tracking-tight text-xl">
                    <Logo className="w-7 h-7" />
                    <span>
                        Waypoint <span className="text-white/40 font-normal">/ RWIA</span>
                    </span>
                </a>
                <div className="hidden md:flex items-center gap-8 text-[13px] font-medium tracking-wide text-white/60">
                    <a href="#mechanics" className="hover:text-white transition-colors">
                        {t("nav.protocol")}
                    </a>
                    <a href="#howto" className="hover:text-white transition-colors">
                        {t("hero.howItWorks")}
                    </a>
                    <a href="#roadmap" className="hover:text-white transition-colors">
                        {t("road.title")}
                    </a>
                    <a href="/dashboard" className="hover:text-white transition-colors">
                        {t("nav.dashboard")}
                    </a>
                    <a
                        href="https://github.com/zzzbedream/RWIA"
                        className="hover:text-white transition-colors"
                        rel="noreferrer"
                        target="_blank"
                    >
                        {t("nav.docs")}
                    </a>
                </div>
                <div className="flex items-center gap-3">
                    <LocaleSwitch />
                    <ConnectWallet />
                </div>
            </nav>
        </div>
    );
}

function Hero({onLaunch}: {onLaunch: () => void}) {
    const {t} = useI18n();
    return (
        <section className="relative min-h-[90vh] flex flex-col justify-center px-6 overflow-hidden">
            <div className="absolute inset-0 z-0">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.18),transparent_60%)] blur-3xl" />
                <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black to-transparent pointer-events-none" />
            </div>
            <div className="max-w-7xl w-full mx-auto relative z-10 pt-24">
                <div className="flex flex-col items-start text-left space-y-8 max-w-3xl">
                    <motion.div
                        initial={{opacity: 0, y: 8}}
                        animate={{opacity: 1, y: 0}}
                        transition={{duration: 0.6}}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/[0.04]"
                    >
                        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
                        <span className="text-xs font-mono font-medium tracking-widest uppercase text-white/60">
                            {t("hero.eyebrow")}
                        </span>
                    </motion.div>
                    <motion.h1
                        initial={{opacity: 0, x: -20}}
                        animate={{opacity: 1, x: 0}}
                        transition={{duration: 0.9, ease: [0.16, 1, 0.3, 1]}}
                        className="text-5xl md:text-[6.5rem] font-bold tracking-tighter leading-[0.95] text-white"
                    >
                        {t("hero.title.1")} <br />
                        {t("hero.title.2")}
                    </motion.h1>
                    <motion.p
                        initial={{opacity: 0, x: -16}}
                        animate={{opacity: 1, x: 0}}
                        transition={{duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1]}}
                        className="text-lg md:text-xl text-white/70 font-medium tracking-tight max-w-2xl"
                    >
                        {t("hero.subtitle")}
                    </motion.p>
                    <motion.div
                        initial={{opacity: 0, y: 12}}
                        animate={{opacity: 1, y: 0}}
                        transition={{duration: 0.9, delay: 0.2}}
                        className="flex flex-col sm:flex-row items-center gap-6 pt-4"
                    >
                        <MagneticButton
                            onClick={onLaunch}
                            className="bg-white text-black border border-white px-8 py-4 text-lg font-semibold tracking-tight flex items-center gap-2 hover:bg-transparent hover:text-white transition-all"
                        >
                            {t("hero.launch")} <ArrowRight className="w-5 h-5" />
                        </MagneticButton>
                        <a
                            href="#howto"
                            className="text-[15px] font-medium tracking-tight text-white/70 hover:text-white transition-colors flex items-center gap-1"
                        >
                            {t("hero.howItWorks")} <ChevronRight className="w-4 h-4" />
                        </a>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

function Architecture() {
    const {t} = useI18n();
    return (
        <section id="mechanics" className="py-32 px-6 relative z-20">
            <div className="max-w-7xl mx-auto space-y-20">
                <div className="text-center space-y-6">
                    <h2 className="text-4xl md:text-6xl font-bold tracking-tighter text-white">
                        {t("mech.title.1")} <br />
                        {t("mech.title.2")}
                    </h2>
                    <p className="text-xl text-white/60 max-w-2xl mx-auto font-medium tracking-tight">
                        {t("mech.subtitle")}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[280px]">
                    <Card className="md:col-span-2 md:row-span-2 p-10 flex flex-col justify-between">
                        <div>
                            <div className="w-12 h-12 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center mb-6">
                                <Zap className="w-5 h-5 text-white/80" />
                            </div>
                            <h3 className="text-3xl font-bold tracking-tight mb-4 text-white">
                                {t("mech.card1.title")}
                            </h3>
                            <p className="text-white/60 text-lg max-w-md leading-relaxed">
                                {t("mech.card1.body")}
                            </p>
                        </div>
                        <div className="font-mono text-xs text-white/40 leading-6">
                            <div>struct UserIntent &#123;</div>
                            <div className="pl-4">address user; address tokenAddress;</div>
                            <div className="pl-4">uint256 amount; address nftContract;</div>
                            <div className="pl-4">uint256 tokenId; uint256 deadline;</div>
                            <div className="pl-4">uint256 nonce;</div>
                            <div>&#125;</div>
                        </div>
                    </Card>

                    <Card className="p-8 flex flex-col justify-between">
                        <div>
                            <div className="w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center mb-6">
                                <ShieldCheck className="w-4 h-4 text-white/70" />
                            </div>
                            <h3 className="text-xl font-semibold tracking-tight mb-2 text-white">
                                {t("mech.card2.title")}
                            </h3>
                            <p className="text-white/60 text-sm leading-relaxed">
                                {t("mech.card2.body")}
                            </p>
                        </div>
                    </Card>

                    <Card className="p-8 flex flex-col justify-between">
                        <div>
                            <div className="w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center mb-6">
                                <Layers className="w-4 h-4 text-white/70" />
                            </div>
                            <h3 className="text-xl font-semibold tracking-tight mb-2 text-white">
                                {t("mech.card3.title")}
                            </h3>
                            <p className="text-white/60 text-sm leading-relaxed">
                                {t("mech.card3.body")}
                            </p>
                        </div>
                    </Card>

                    <Card className="md:col-span-3 min-h-[220px] p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="max-w-xl">
                            <h3 className="text-3xl font-bold tracking-tight mb-4 text-white">
                                {t("mech.card4.title")}
                            </h3>
                            <p className="text-white/60 text-lg leading-relaxed">
                                {t("mech.card4.body")}
                            </p>
                        </div>
                        <div className="flex flex-col items-start gap-3 bg-white/[0.04] border border-white/10 p-6 rounded-2xl min-w-[260px]">
                            <div className="flex items-center gap-2 text-xs font-mono text-white/50 uppercase tracking-widest">
                                <Activity className="w-3 h-3" /> Roadmap
                            </div>
                            <div className="font-mono text-sm text-white/80">V1 → Native NFT settlement</div>
                            <div className="h-px w-full bg-white/10 my-1" />
                            <div className="font-mono text-xs text-white/50">
                                V2 → CCIP cross-chain · DLQ · multi-token
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </section>
    );
}

function HowItWorks() {
    const {t} = useI18n();
    const steps: Array<{titleKey: import("@/lib/i18n").StringKey; bodyKey: import("@/lib/i18n").StringKey}> = [
        {titleKey: "howto.step1.title", bodyKey: "howto.step1.body"},
        {titleKey: "howto.step2.title", bodyKey: "howto.step2.body"},
        {titleKey: "howto.step3.title", bodyKey: "howto.step3.body"},
        {titleKey: "howto.step4.title", bodyKey: "howto.step4.body"},
        {titleKey: "howto.step5.title", bodyKey: "howto.step5.body"},
    ];

    return (
        <section id="howto" className="py-32 px-6 relative z-20">
            <div className="max-w-6xl mx-auto space-y-16">
                <div className="text-center space-y-6">
                    <h2 className="text-4xl md:text-6xl font-bold tracking-tighter text-white">
                        {t("howto.title")}
                    </h2>
                    <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto font-medium tracking-tight">
                        {t("howto.subtitle")}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {steps.map((step, i) => (
                        <motion.div
                            key={step.titleKey}
                            initial={{opacity: 0, y: 12}}
                            whileInView={{opacity: 1, y: 0}}
                            viewport={{once: true}}
                            transition={{duration: 0.5, delay: i * 0.05}}
                        >
                            <Card className="h-full p-6 flex flex-col gap-3">
                                <div className="text-3xl font-bold text-white/15 tabular-nums">
                                    {String(i + 1).padStart(2, "0")}
                                </div>
                                <h3 className="text-base font-semibold text-white tracking-tight">
                                    {t(step.titleKey)}
                                </h3>
                                <p className="text-sm text-white/55 leading-relaxed">
                                    {t(step.bodyKey)}
                                </p>
                            </Card>
                        </motion.div>
                    ))}
                </div>

                <Card className="p-8 md:p-12">
                    <div className="flex flex-col md:flex-row gap-6 md:gap-12">
                        <div className="md:w-1/3 shrink-0">
                            <div className="text-xs font-mono uppercase tracking-widest text-emerald-300/80 mb-3">
                                {t("howto.value.title")}
                            </div>
                            <Logo className="w-12 h-12" />
                        </div>
                        <p className="md:w-2/3 text-base md:text-lg text-white/70 leading-relaxed">
                            {t("howto.value.body")}
                        </p>
                    </div>
                </Card>
            </div>
        </section>
    );
}

function Roadmap() {
    const {t} = useI18n();
    const phases: Array<{
        tagKey: import("@/lib/i18n").StringKey;
        titleKey: import("@/lib/i18n").StringKey;
        risksKey?: import("@/lib/i18n").StringKey;
        items: import("@/lib/i18n").StringKey[];
        tone: string;
    }> = [
        {
            tagKey: "road.phase0.tag",
            titleKey: "road.phase0.title",
            items: ["road.phase0.item1", "road.phase0.item2", "road.phase0.item3", "road.phase0.item4"],
            tone: "border-emerald-400/30 text-emerald-300",
        },
        {
            tagKey: "road.phase1.tag",
            titleKey: "road.phase1.title",
            risksKey: "road.phase1.risks",
            items: ["road.phase1.item1", "road.phase1.item2", "road.phase1.item3", "road.phase1.item4"],
            tone: "border-indigo-400/30 text-indigo-300",
        },
        {
            tagKey: "road.phase2.tag",
            titleKey: "road.phase2.title",
            risksKey: "road.phase2.risks",
            items: ["road.phase2.item1", "road.phase2.item2", "road.phase2.item3", "road.phase2.item4"],
            tone: "border-violet-400/30 text-violet-300",
        },
        {
            tagKey: "road.phase3.tag",
            titleKey: "road.phase3.title",
            items: ["road.phase3.item1", "road.phase3.item2", "road.phase3.item3"],
            tone: "border-white/20 text-white/70",
        },
    ];

    return (
        <section id="roadmap" className="py-32 px-6 relative z-20">
            <div className="max-w-7xl mx-auto space-y-16">
                <div className="text-center space-y-6">
                    <h2 className="text-4xl md:text-6xl font-bold tracking-tighter text-white">
                        {t("road.title")}
                    </h2>
                    <p className="text-lg md:text-xl text-white/60 max-w-3xl mx-auto font-medium tracking-tight">
                        {t("road.subtitle")}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {phases.map((phase, i) => (
                        <motion.div
                            key={phase.titleKey}
                            initial={{opacity: 0, y: 12}}
                            whileInView={{opacity: 1, y: 0}}
                            viewport={{once: true}}
                            transition={{duration: 0.5, delay: i * 0.05}}
                        >
                            <Card className="h-full p-6 md:p-8 flex flex-col gap-4">
                                <div
                                    className={`inline-flex self-start items-center text-[10px] font-mono uppercase tracking-widest rounded-full border px-3 py-1 ${phase.tone}`}
                                >
                                    {t(phase.tagKey)}
                                </div>
                                <h3 className="text-xl md:text-2xl font-bold tracking-tight text-white">
                                    {t(phase.titleKey)}
                                </h3>
                                {phase.risksKey && (
                                    <div className="text-xs text-amber-300/80 font-medium">
                                        {t(phase.risksKey)}
                                    </div>
                                )}
                                <ul className="space-y-2 mt-2">
                                    {phase.items.map((itemKey) => (
                                        <li key={itemKey} className="flex gap-3 text-sm text-white/65 leading-relaxed">
                                            <span className="text-white/30 mt-1 shrink-0">·</span>
                                            <span>{t(itemKey)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function FinalCta({onLaunch}: {onLaunch: () => void}) {
    const {t} = useI18n();
    return (
        <section className="py-32 px-6 relative z-20 overflow-hidden text-center">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-indigo-500/10 blur-[150px] rounded-full pointer-events-none" />
            <div className="max-w-4xl mx-auto relative z-10 flex flex-col items-center">
                <Logo className="w-16 h-16 mb-10" />
                <h2 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 leading-[0.95] text-white">
                    {t("cta.title")}
                </h2>
                <p className="text-xl text-white/60 mb-12 max-w-2xl font-medium tracking-tight">
                    {t("cta.subtitle")}
                </p>
                <MagneticButton
                    onClick={onLaunch}
                    className="border border-white/20 bg-white/[0.04] backdrop-blur-xl px-10 py-5 text-white text-xl font-medium tracking-tight hover:bg-white hover:text-black hover:scale-105"
                >
                    {t("cta.launch")}
                </MagneticButton>
            </div>
        </section>
    );
}

function Footer() {
    const {t} = useI18n();
    return (
        <footer className="border-t border-white/5 py-12 px-6 relative z-20 bg-black/50 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="text-white font-semibold tracking-tight flex items-center gap-2">
                    <Logo className="w-6 h-6" /> {t("footer.brand")}
                </div>
                <div className="flex gap-8 text-[13px] text-white/40 font-medium tracking-wide uppercase">
                    <span>{t("footer.tag.mainnet")}</span>
                    <span>{t("footer.tag.eip712")}</span>
                    <span>{t("footer.tag.uups")}</span>
                </div>
            </div>
        </footer>
    );
}

export default function HomePage() {
    const router = useRouter();
    const handleLaunch = useCallback(() => router.push("/app"), [router]);
    return (
        <div className="min-h-screen bg-black text-white selection:bg-white/20 relative overflow-hidden">
            <Navbar />
            <Hero onLaunch={handleLaunch} />
            <Architecture />
            <HowItWorks />
            <Roadmap />
            <FinalCta onLaunch={handleLaunch} />
            <Footer />
        </div>
    );
}
