export const metadata = {title: "Privacy — Ronin Waypoint Intent Aggregator"};

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-black text-white px-6 py-16">
            <article className="max-w-3xl mx-auto prose prose-invert">
                <h1 className="text-3xl font-bold">Privacy & data handling</h1>
                <p className="text-white/70">Effective date: 2026-05-16.</p>

                <h2 className="mt-8 text-xl font-semibold">What we collect</h2>
                <ul className="list-disc pl-6 text-white/70 space-y-1">
                    <li>
                        <strong>Wallet address.</strong> When you connect a wallet or sign in via
                        Ronin Waypoint, your public Ronin address is read to display your nonce and
                        balances. It is never sent to our servers.
                    </li>
                    <li>
                        <strong>Public on-chain data.</strong> All intent broadcasts and CCIP
                        message ids are publicly visible on the Ronin chain. We do not anonymise
                        them.
                    </li>
                    <li>
                        <strong>RPC requests.</strong> Your browser issues requests to public Ronin
                        RPC endpoints and the Waypoint service. We do not log these.
                    </li>
                </ul>

                <h2 className="mt-8 text-xl font-semibold">What we do NOT collect</h2>
                <ul className="list-disc pl-6 text-white/70 space-y-1">
                    <li>Cookies, analytics, or tracking pixels.</li>
                    <li>Email addresses or personal identifiers (Ronin Waypoint handles its own auth).</li>
                    <li>Private keys — they never leave your wallet.</li>
                </ul>

                <h2 className="mt-8 text-xl font-semibold">Third parties</h2>
                <p className="text-white/70">
                    The app communicates with: Ronin/Sky Mavis RPC, Chainlink CCIP, and your wallet
                    provider. Each has its own privacy policy.
                </p>

                <h2 className="mt-8 text-xl font-semibold">Contact</h2>
                <p className="text-white/70">
                    Reach us at <code>security@vertsun.io</code> for any privacy-related question.
                </p>
            </article>
        </main>
    );
}
