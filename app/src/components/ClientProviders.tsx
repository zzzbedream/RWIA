"use client";

import {ReactNode, useState} from "react";
import {WagmiProvider} from "wagmi";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";

import {wagmiConfig} from "@/lib/wagmi";
import {I18nProvider} from "@/lib/i18n";

export default function ClientProviders({children}: {children: ReactNode}) {
    const [queryClient] = useState(() => new QueryClient());
    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <I18nProvider>{children}</I18nProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
