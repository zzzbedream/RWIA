import type {Metadata} from "next";
import {Geist} from "next/font/google";
import "./globals.css";
import ClientProviders from "@/components/ClientProviders";

const geist = Geist({subsets: ["latin"]});

export const metadata: Metadata = {
    title: "Ronin Waypoint Intent Aggregator",
    description: "Gasless NFT purchases on Ronin via EIP-712 intents · Sign once, settle on-chain",
    keywords: ["Ronin", "NFT", "EIP-712", "gasless", "intent", "Waypoint", "Mainnet"],
};

export default function RootLayout({children}: {children: React.ReactNode}) {
    return (
        <html lang="en">
            <body className={`${geist.className} bg-[#0a0a0a] text-white`}>
                <ClientProviders>{children}</ClientProviders>
            </body>
        </html>
    );
}
