"use client";

import {useRouter} from "next/navigation";
import {useCallback, useRef, useState} from "react";
import {motion, useScroll, useSpring, useMotionValue, useMotionValueEvent} from "framer-motion";
import {Activity, ArrowRight, ChevronRight, Layers, ShieldCheck, Zap} from "lucide-react";
import {ConnectWallet} from "@/components/ConnectWallet";

const Logo = ({className = "w-6 h-6"}: {className?: string}) => (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
        <defs>
            <linearGradient id="rw" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#60a5fa" />
                <stop offset="1" stopColor="#7c3aed" />
            </linearGradient>
        </defs>
        <path
            d="M16 2L4 8v12l12 10 12-10V8z"
            stroke="url(#rw)"
            strokeWidth="1.5"
            fill="rgba(99,102,241,0.10)"
        />
        <path d="M16 8L9 12v8l7 6 7-6v-8z" fill="url(#rw)" opacity="0.7" />
    </svg>
);

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

function Navbar({onLaunch: _onLaunch}: {onLaunch: () => void}) {
    const {scrollY} = useScroll();
    const [isScrolled, setIsScrolled] = useState(false);
    useMotionValueEvent(scrollY, "change", (v) => setIsScrolled(v > 80));
    return (
        <div className="fixed top-0 inset-x-0 z-[100] flex justify-center p-4 px-6 pointer-events-none">
            <nav
                className={`pointer-events-auto flex justify-between items-center w-full max-w-7xl transition-all duration-500 rounded-[2rem] ${
                    isScrolled ? "py-3 px-6 bg-white/[0.04] border border-white/10 backdrop-blur-2xl" : "py-4 px-2 bg-transparent"
                }`}
            >
                <div className="flex items-center gap-2 text-white font-semibold tracking-tight text-xl">
                    <Logo className="w-7 h-7" />
                    <span>
                        Waypoint <span className="text-white/40 font-normal">/ RWIA</span>
                    </span>
                </div>
                <div className="hidden md:flex items-center gap-8 text-[13px] font-medium tracking-wide text-white/60">
                    <a href="#mechanics" className="hover:text-white transition-colors">
                        Protocol
                    </a>
                    <a href="#mechanics" className="hover:text-white transition-colors">
                        Mechanics
                    </a>
                    <a href="https://github.com" className="hover:text-white transition-colors" rel="noreferrer">
                        Docs
                    </a>
                </div>
                <ConnectWallet />
            </nav>
        </div>
    );
}

function Hero({onLaunch}: {onLaunch: () => void}) {
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
                            Built on Ronin · EIP-712 Gasless Intents
                        </span>
                    </motion.div>
                    <motion.h1
                        initial={{opacity: 0, x: -20}}
                        animate={{opacity: 1, x: 0}}
                        transition={{duration: 0.9, ease: [0.16, 1, 0.3, 1]}}
                        className="text-5xl md:text-[6.5rem] font-bold tracking-tighter leading-[0.95] text-white"
                    >
                        Sign once. <br />
                        Settle anywhere.
                    </motion.h1>
                    <motion.p
                        initial={{opacity: 0, x: -16}}
                        animate={{opacity: 1, x: 0}}
                        transition={{duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1]}}
                        className="text-lg md:text-xl text-white/70 font-medium tracking-tight max-w-2xl"
                    >
                        The Ronin Waypoint Intent Aggregator lets users buy NFTs on Ronin without holding
                        RON for gas. Sign a gasless EIP-712 intent, pay off-chain, and the Keeper delivers
                        the NFT directly to your wallet.
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
                            Launch app <ArrowRight className="w-5 h-5" />
                        </MagneticButton>
                        <a
                            href="#mechanics"
                            className="text-[15px] font-medium tracking-tight text-white/70 hover:text-white transition-colors flex items-center gap-1"
                        >
                            How it works <ChevronRight className="w-4 h-4" />
                        </a>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

function Architecture() {
    return (
        <section id="mechanics" className="py-32 px-6 relative z-20">
            <div className="max-w-7xl mx-auto space-y-20">
                <div className="text-center space-y-6">
                    <h2 className="text-4xl md:text-6xl font-bold tracking-tighter text-white">
                        Gasless NFT purchases. <br />
                        Auditable on-chain delivery.
                    </h2>
                    <p className="text-xl text-white/60 max-w-2xl mx-auto font-medium tracking-tight">
                        Every intent is signed off-chain via EIP-712, validated on Ronin, and executed by a
                        trusted Keeper. No RON required — the user pays off-chain, the Keeper pays gas.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[280px]">
                    <Card className="md:col-span-2 md:row-span-2 p-10 flex flex-col justify-between">
                        <div>
                            <div className="w-12 h-12 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center mb-6">
                                <Zap className="w-5 h-5 text-white/80" />
                            </div>
                            <h3 className="text-3xl font-bold tracking-tight mb-4 text-white">
                                EIP-712 signed batches
                            </h3>
                            <p className="text-white/60 text-lg max-w-md leading-relaxed">
                                Users sign typed-data intents off-chain. The aggregator verifies each
                                EIP-712 signature, enforces per-user nonces, and the Keeper delivers
                                the NFT on-chain in a single atomic transaction.
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
                                UUPS + RBAC
                            </h3>
                            <p className="text-white/60 text-sm leading-relaxed">
                                AccessControl with ADMIN, UPGRADER, KEEPER roles. Implementation
                                disables initializers; storage uses ERC-7201 namespaces.
                            </p>
                        </div>
                    </Card>

                    <Card className="p-8 flex flex-col justify-between">
                        <div>
                            <div className="w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center mb-6">
                                <Layers className="w-4 h-4 text-white/70" />
                            </div>
                            <h3 className="text-xl font-semibold tracking-tight mb-2 text-white">
                                Keeper-gated execution
                            </h3>
                            <p className="text-white/60 text-sm leading-relaxed">
                                Only addresses with the KEEPER_ROLE can execute intents. The Keeper
                                holds NFTs in custody and delivers them after off-chain payment clears.
                            </p>
                        </div>
                    </Card>

                    <Card className="md:col-span-3 min-h-[220px] p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="max-w-xl">
                            <h3 className="text-3xl font-bold tracking-tight mb-4 text-white">
                                Upgrade-safe via UUPS
                            </h3>
                            <p className="text-white/60 text-lg leading-relaxed">
                                V1 settles NFT purchases natively on Ronin. The UUPS proxy with ERC-7201
                                namespaced storage enables a future V2 upgrade to Chainlink CCIP cross-chain
                                dispatch — without losing state or requiring migration.
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

function FinalCta({onLaunch}: {onLaunch: () => void}) {
    return (
        <section className="py-32 px-6 relative z-20 overflow-hidden text-center">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-indigo-500/10 blur-[150px] rounded-full pointer-events-none" />
            <div className="max-w-4xl mx-auto relative z-10 flex flex-col items-center">
                <Logo className="w-16 h-16 mb-10" />
                <h2 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 leading-[0.95] text-white">
                    Ready when you are.
                </h2>
                <p className="text-xl text-white/60 mb-12 max-w-2xl font-medium tracking-tight">
                    Connect your Ronin wallet and submit your first gasless NFT purchase intent on Ronin
                    Mainnet.
                </p>
                <MagneticButton
                    onClick={onLaunch}
                    className="border border-white/20 bg-white/[0.04] backdrop-blur-xl px-10 py-5 text-white text-xl font-medium tracking-tight hover:bg-white hover:text-black hover:scale-105"
                >
                    Launch app
                </MagneticButton>
            </div>
        </section>
    );
}

function Footer() {
    return (
        <footer className="border-t border-white/5 py-12 px-6 relative z-20 bg-black/50 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="text-white font-semibold tracking-tight flex items-center gap-2">
                    <Logo className="w-6 h-6" /> Ronin Waypoint
                </div>
                <div className="flex gap-8 text-[13px] text-white/40 font-medium tracking-wide uppercase">
                    <span>Ronin Mainnet</span>
                    <span>EIP-712 · Gasless</span>
                    <span>UUPS · ERC-7201</span>
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
            <Navbar onLaunch={handleLaunch} />
            <Hero onLaunch={handleLaunch} />
            <Architecture />
            <FinalCta onLaunch={handleLaunch} />
            <Footer />
        </div>
    );
}
