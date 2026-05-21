"use client";

import {createContext, useContext, useState, type ReactNode} from "react";
import {createElement} from "react";

const STRINGS = {
    en: {
        "nav.protocol": "Protocol",
        "nav.docs": "Docs",
        "cta.launch": "Launch app",
        "cta.connect": "Connect wallet",
        "intent.title": "Dispatch intent",
        "intent.subtitle": "Sign an EIP-712 intent and broadcast it via Chainlink CCIP.",
        "intent.signButton": "Review & sign",
    },
    es: {
        "nav.protocol": "Protocolo",
        "nav.docs": "Docs",
        "cta.launch": "Abrir app",
        "cta.connect": "Conectar wallet",
        "intent.title": "Enviar intent",
        "intent.subtitle": "Firma un intent EIP-712 y envíalo vía Chainlink CCIP.",
        "intent.signButton": "Revisar y firmar",
    },
    vi: {
        "nav.protocol": "Giao thức",
        "nav.docs": "Tài liệu",
        "cta.launch": "Mở ứng dụng",
        "cta.connect": "Kết nối ví",
        "intent.title": "Gửi intent",
        "intent.subtitle": "Ký một intent EIP-712 và phát qua Chainlink CCIP.",
        "intent.signButton": "Xem & ký",
    },
} as const;

export type Locale = keyof typeof STRINGS;
export type TranslationKey = keyof (typeof STRINGS)["en"];

const I18nContext = createContext<{locale: Locale; setLocale: (l: Locale) => void; t: (k: TranslationKey) => string}>({
    locale: "en",
    setLocale: () => {},
    t: (k) => STRINGS.en[k],
});

export function I18nProvider({children, initial = "en"}: {children: ReactNode; initial?: Locale}) {
    const [locale, setLocale] = useState<Locale>(initial);
    const t = (k: TranslationKey) => STRINGS[locale][k] ?? STRINGS.en[k];
    return createElement(I18nContext.Provider, {value: {locale, setLocale, t}}, children);
}

export function useI18n() {
    return useContext(I18nContext);
}

export const SUPPORTED_LOCALES = Object.keys(STRINGS) as Locale[];
