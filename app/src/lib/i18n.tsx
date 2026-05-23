"use client";

import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from "react";

export type Locale = "en" | "es" | "pt";

const STRINGS = {
    en: {
        // Nav
        "nav.protocol": "Protocol",
        "nav.mechanics": "Mechanics",
        "nav.dashboard": "Dashboard",
        "nav.docs": "Docs",
        "nav.launch": "Launch app",

        // Landing hero
        "hero.eyebrow": "Built on Ronin · EIP-712 Gasless Intents",
        "hero.title.1": "Sign once.",
        "hero.title.2": "Settle anywhere.",
        "hero.subtitle":
            "RWIA lets users buy NFTs on Ronin without holding RON for gas. Sign a gasless EIP-712 intent, pay off-chain, and the Keeper delivers the NFT directly to your wallet.",
        "hero.launch": "Launch app",
        "hero.howItWorks": "How it works",

        // Mechanics
        "mech.title.1": "Gasless NFT purchases.",
        "mech.title.2": "Auditable on-chain delivery.",
        "mech.subtitle":
            "Every intent is signed off-chain via EIP-712, validated on Ronin, and executed by a trusted Keeper. No RON required — the user pays off-chain, the Keeper pays gas.",
        "mech.card1.title": "EIP-712 signed intents",
        "mech.card1.body":
            "Users sign typed-data intents off-chain. The aggregator verifies each EIP-712 signature, enforces per-user nonces, and the Keeper delivers the NFT on-chain in a single atomic transaction.",
        "mech.card2.title": "UUPS + RBAC",
        "mech.card2.body":
            "AccessControl with ADMIN, UPGRADER, KEEPER roles. Implementation disables initializers; storage uses ERC-7201 namespaces.",
        "mech.card3.title": "Keeper-gated execution",
        "mech.card3.body":
            "Only addresses with the KEEPER_ROLE can execute intents. The Keeper holds NFTs in custody and delivers them after off-chain payment clears.",
        "mech.card4.title": "Upgrade-safe via UUPS",
        "mech.card4.body":
            "V1 settles NFT purchases natively on Ronin. The UUPS proxy with ERC-7201 namespaced storage enables a future V2 upgrade to cross-chain dispatch without losing state or requiring migration.",

        // How to use (instructional)
        "howto.title": "How to use RWIA",
        "howto.subtitle":
            "Five steps from signing the intent to receiving the NFT. No RON, no gas, no token swaps.",
        "howto.step1.title": "1. Connect your wallet",
        "howto.step1.body":
            "Open the app, click Ronin Wallet (or browser wallet). If you don't have one, use Ronin Waypoint to sign in with email — no extension required.",
        "howto.step2.title": "2. Pick the NFT",
        "howto.step2.body":
            "Paste the NFT contract address (or a collection.ron name) and the token id. The system shows the current owner and confirms the Keeper has the inventory ready.",
        "howto.step3.title": "3. Sign the intent",
        "howto.step3.body":
            "Review the typed-data preview, then click Sign. Your wallet prompts a free EIP-712 signature — no gas, no on-chain transaction yet.",
        "howto.step4.title": "4. Pay off-chain",
        "howto.step4.body":
            "Pay with your preferred fiat or crypto rail (card, Pix, Pago Móvil, Binance Pay). Once payment clears, the Keeper triggers the on-chain delivery.",
        "howto.step5.title": "5. Receive the NFT",
        "howto.step5.body":
            "Watch the status card go from validating to confirmed. Click the tx hash to verify the transfer on Ronin Explorer. The NFT lands in the same wallet that signed.",
        "howto.value.title": "Why this matters",
        "howto.value.body":
            "Traditional NFT purchases force a new user through five steps: install wallet, acquire RON, swap to a payment token, approve, then pay gas. ~73% never finish. RWIA collapses that into one signature. The buyer's wallet never has to hold crypto except to receive the NFT — perfect for LATAM, SEA, and any market where users do not want gas-token exposure.",

        // Roadmap (risk-to-mitigation mapping)
        "road.title": "Roadmap 2026",
        "road.subtitle":
            "Honest engineering: every phase ties an identified risk to a concrete deliverable. V1 ships today on Ronin Mainnet; the grant funds Phases 1 and 2 to close the remaining gaps before we open public volume.",
        "road.phase0.tag": "V1 shipped",
        "road.phase0.title": "Already on Ronin Mainnet",
        "road.phase0.item1": "CI pipeline: forge fmt + test + Slither (fail-on-medium) + gas snapshot + storage layout",
        "road.phase0.item2": "_disableInitializers in implementation, TimelockController holds UPGRADER_ROLE (7-day delay)",
        "road.phase0.item3": "Pre-flight simulateContract guards every broadcast against deterministic reverts",
        "road.phase0.item4": "Sharded queue and claim_next_intent(shard) Postgres function ready in code",
        "road.phase1.tag": "Q3 2026 · grant Phase 1",
        "road.phase1.title": "Trust & key isolation",
        "road.phase1.risks": "Closes: hot-wallet key exposure, deployer = admin single-EOA risk",
        "road.phase1.item1": "Key isolation via KMS/HSM: KEEPER_PRIVATE_KEY out of env vars",
        "road.phase1.item2": "Multisig handoff executed (HandoffToMultisig.s.sol → 4-of-7 Safe)",
        "road.phase1.item3": "Transak PRODUCTION integration with signed webhooks",
        "road.phase1.item4": "Public Keeper reputation page (uptime, RON history, executed volume)",
        "road.phase2.tag": "Q4 2026 · grant Phase 2",
        "road.phase2.title": "Scale & resilience",
        "road.phase2.risks": "Closes: single-flight nonce bottleneck, in-memory state loss, regional SPOF",
        "road.phase2.item1": "Four sharded Keeper EOAs deployed in parallel (4× throughput, no nonce blocking)",
        "road.phase2.item2": "Persistent message queue (Redis Streams) replaces Supabase polling for hot-path jobs",
        "road.phase2.item3": "Goldsky subgraph in production with on-call alerts (DLQ rate, RON balance, latency)",
        "road.phase2.item4": "Multi-region failover behind Vercel rewrite, tolerates a region outage with no DNS change",
        "road.phase3.tag": "2027 · V2",
        "road.phase3.title": "Cross-chain dispatch",
        "road.phase3.item1": "Chainlink CCIP integration via UUPS upgrade (no state migration, manifest in v2-roadmap/)",
        "road.phase3.item2": "Cross-chain inventory aggregation: Keeper on chain A delivers NFT on chain B",
        "road.phase3.item3": "Optional: just-in-time market buys at execution time (post audit gate)",

        // Final CTA
        "cta.title": "Ready when you are.",
        "cta.subtitle":
            "Connect your Ronin wallet and submit your first gasless NFT purchase intent on Ronin Mainnet.",
        "cta.launch": "Launch app",

        // Footer
        "footer.brand": "Ronin Waypoint",
        "footer.tag.mainnet": "Ronin Mainnet",
        "footer.tag.eip712": "EIP-712 · Gasless",
        "footer.tag.uups": "UUPS · ERC-7201",

        // /app page
        "page.title": "Buy NFT with fiat",
        "page.subtitle":
            "Sign an EIP-712 intent. After your off-chain payment clears, the Keeper delivers the NFT directly to your wallet.",
        "warn.aggregator.title": "Set NEXT_PUBLIC_AGGREGATOR_ADDRESS",
        "warn.aggregator.body": "Configure the deployed aggregator address in app/.env.local.",
        "warn.wrongChain": "Your wallet is on chain {chainId}, but the contract lives on chain {required}.",
        "warn.wrongChain.help":
            "EIP-712 signatures must be produced on the same chain the contract is deployed to. Use the orange Switch to Ronin button in the header — it will prompt your wallet to switch (and add the network if needed).",
        "warn.wrongChain.detected": "Detected wallet chainId: {chainId} · required: {required}",
        "field.nftContract": "NFT contract (address or .ron)",
        "field.tokenId": "Token id",
        "field.paymentToken": "Payment token (ERC-20 used off-chain)",
        "field.paymentDecimals": "Token decimals",
        "field.amount": "Amount (will be charged off-chain)",
        "field.deadline": "Deadline (minutes)",
        "btn.reviewSign": "Review & sign",
        "btn.working": "Working…",
        "btn.reset": "Send another intent",

        // Dashboard
        "dash.title": "Operator dashboard",
        "dash.subtitle":
            "Real-time view of relayer health, keeper inventory, and recent intents. Pulls from the live production deployment.",
        "dash.live": "Live",
        "dash.refresh": "Refresh",
        "dash.refreshing": "Refreshing…",
        "dash.section.health": "Relayer health",
        "dash.section.keepers": "Keepers",
        "dash.section.dlq": "Dead Letter Queue",
        "dash.section.empty": "Nothing here yet.",
        "dash.metric.chain": "Chain",
        "dash.metric.aggregator": "Aggregator",
        "dash.metric.shards": "Shards",
        "dash.metric.status": "Status",
        "dash.metric.balance": "Balance",
        "dash.metric.dlqCount": "Failed jobs",
        "dash.error": "Could not load live data. Retrying…",
        "dash.lastUpdated": "Updated {time}",

        // Locale switch
        "lang.label": "Language",
    },

    es: {
        // Nav
        "nav.protocol": "Protocolo",
        "nav.mechanics": "Mecánica",
        "nav.dashboard": "Dashboard",
        "nav.docs": "Docs",
        "nav.launch": "Abrir app",

        // Landing hero
        "hero.eyebrow": "Construido en Ronin · Intents gasless EIP-712",
        "hero.title.1": "Firma una vez.",
        "hero.title.2": "Liquida en cualquier lugar.",
        "hero.subtitle":
            "RWIA permite comprar NFTs en Ronin sin tener RON para gas. Firmá un intent gasless EIP-712, pagá off-chain, y el Keeper entrega el NFT directo a tu wallet.",
        "hero.launch": "Abrir app",
        "hero.howItWorks": "Cómo funciona",

        // Mechanics
        "mech.title.1": "Compras de NFT sin gas.",
        "mech.title.2": "Entrega auditable on-chain.",
        "mech.subtitle":
            "Cada intent se firma off-chain con EIP-712, se valida en Ronin, y lo ejecuta un Keeper confiable. Sin RON — el usuario paga off-chain, el Keeper paga el gas.",
        "mech.card1.title": "Intents firmados EIP-712",
        "mech.card1.body":
            "Los usuarios firman intents typed-data off-chain. El aggregator verifica cada firma EIP-712, aplica nonces por usuario, y el Keeper entrega el NFT on-chain en una transacción atómica.",
        "mech.card2.title": "UUPS + RBAC",
        "mech.card2.body":
            "AccessControl con roles ADMIN, UPGRADER, KEEPER. La implementation deshabilita initializers; el storage usa namespaces ERC-7201.",
        "mech.card3.title": "Ejecución gated por Keeper",
        "mech.card3.body":
            "Solo addresses con KEEPER_ROLE pueden ejecutar intents. El Keeper mantiene los NFTs en custodia y los entrega cuando se confirma el pago off-chain.",
        "mech.card4.title": "Upgrade-safe vía UUPS",
        "mech.card4.body":
            "V1 liquida compras de NFT nativamente en Ronin. El proxy UUPS con storage namespaceado ERC-7201 permite un futuro upgrade V2 cross-chain sin perder estado ni requerir migración.",

        // How to use
        "howto.title": "Cómo usar RWIA",
        "howto.subtitle":
            "Cinco pasos desde firmar el intent hasta recibir el NFT. Sin RON, sin gas, sin swaps.",
        "howto.step1.title": "1. Conectá tu wallet",
        "howto.step1.body":
            "Abrí la app, click en Ronin Wallet (o browser wallet). Si no tenés wallet, usá Ronin Waypoint para iniciar sesión con email — sin necesidad de extensión.",
        "howto.step2.title": "2. Elegí el NFT",
        "howto.step2.body":
            "Pegá el contrato del NFT (o un nombre coleccion.ron) y el token id. El sistema te muestra el owner actual y confirma que el Keeper tiene el inventario listo.",
        "howto.step3.title": "3. Firmá el intent",
        "howto.step3.body":
            "Revisás el preview typed-data, click en Firmar. Tu wallet pide una firma EIP-712 gratis — sin gas, sin transacción on-chain todavía.",
        "howto.step4.title": "4. Pagá off-chain",
        "howto.step4.body":
            "Pagá con tu medio preferido (tarjeta, Pix, Pago Móvil, Binance Pay). Cuando se confirma el pago, el Keeper dispara la entrega on-chain.",
        "howto.step5.title": "5. Recibí el NFT",
        "howto.step5.body":
            "La card de estado pasa de validando a confirmado. Click en el tx hash para verificar la transferencia en Ronin Explorer. El NFT llega a la misma wallet que firmó.",
        "howto.value.title": "Por qué importa",
        "howto.value.body":
            "Una compra tradicional de NFT obliga al usuario nuevo a cinco pasos: instalar wallet, conseguir RON, swap a un token de pago, aprobar, y pagar gas. ~73% no termina. RWIA lo colapsa a una firma. La wallet del comprador nunca necesita tener cripto, salvo para recibir el NFT — ideal para LATAM, SEA, y cualquier mercado donde los usuarios no quieren exposición al gas-token.",

        // Roadmap
        "road.title": "Roadmap 2026",
        "road.subtitle":
            "Ingeniería honesta: cada fase conecta un riesgo identificado con un entregable concreto. V1 ya está en Ronin Mainnet; el grant financia las fases 1 y 2 para cerrar los gaps que quedan antes de abrir volumen público.",
        "road.phase0.tag": "V1 en vivo",
        "road.phase0.title": "Ya en Ronin Mainnet",
        "road.phase0.item1": "Pipeline CI: forge fmt + test + Slither (fail-on-medium) + gas snapshot + storage layout",
        "road.phase0.item2": "_disableInitializers en la implementation, TimelockController posee UPGRADER_ROLE (7 días)",
        "road.phase0.item3": "Pre-flight simulateContract previene cada broadcast contra reverts deterministas",
        "road.phase0.item4": "Cola sharded y función Postgres claim_next_intent(shard) ya en código",
        "road.phase1.tag": "Q3 2026 · grant Fase 1",
        "road.phase1.title": "Confianza y aislamiento de claves",
        "road.phase1.risks": "Cierra: clave hot-wallet expuesta, deployer = admin en una sola EOA",
        "road.phase1.item1": "Aislamiento de clave vía KMS/HSM: KEEPER_PRIVATE_KEY fuera de env vars",
        "road.phase1.item2": "Handoff multisig ejecutado (HandoffToMultisig.s.sol → Safe 4-de-7)",
        "road.phase1.item3": "Integración Transak PRODUCTION con webhooks firmados",
        "road.phase1.item4": "Página pública de reputación del Keeper (uptime, historial RON, volumen ejecutado)",
        "road.phase2.tag": "Q4 2026 · grant Fase 2",
        "road.phase2.title": "Escala y resiliencia",
        "road.phase2.risks": "Cierra: cuello de botella single-flight de nonces, pérdida de estado en memoria, SPOF regional",
        "road.phase2.item1": "Cuatro EOAs sharded del Keeper en paralelo (4× throughput, sin bloqueo de nonces)",
        "road.phase2.item2": "Message queue persistente (Redis Streams) reemplaza el polling de Supabase en el hot path",
        "road.phase2.item3": "Subgraph Goldsky en producción con alertas on-call (DLQ rate, saldo RON, latencia)",
        "road.phase2.item4": "Multi-región detrás de Vercel rewrite, tolera caída regional sin cambiar DNS",
        "road.phase3.tag": "2027 · V2",
        "road.phase3.title": "Dispatch cross-chain",
        "road.phase3.item1": "Integración Chainlink CCIP vía upgrade UUPS (sin migración de estado, manifest en v2-roadmap/)",
        "road.phase3.item2": "Agregación cross-chain de inventario: Keeper en chain A entrega NFT en chain B",
        "road.phase3.item3": "Opcional: compras just-in-time en el marketplace al ejecutar (tras audit)",

        // Final CTA
        "cta.title": "Listo cuando quieras.",
        "cta.subtitle":
            "Conectá tu wallet Ronin y enviá tu primer intent de compra gasless en Ronin Mainnet.",
        "cta.launch": "Abrir app",

        // Footer
        "footer.brand": "Ronin Waypoint",
        "footer.tag.mainnet": "Ronin Mainnet",
        "footer.tag.eip712": "EIP-712 · Gasless",
        "footer.tag.uups": "UUPS · ERC-7201",

        // /app page
        "page.title": "Comprá NFT con fiat",
        "page.subtitle":
            "Firmá un intent EIP-712. Cuando tu pago off-chain se confirme, el Keeper te entrega el NFT directamente a tu wallet.",
        "warn.aggregator.title": "Configurá NEXT_PUBLIC_AGGREGATOR_ADDRESS",
        "warn.aggregator.body": "Definí la dirección del aggregator deployado en app/.env.local.",
        "warn.wrongChain": "Tu wallet está en la chain {chainId}, pero el contrato vive en la chain {required}.",
        "warn.wrongChain.help":
            "Las firmas EIP-712 tienen que producirse en la misma chain donde está deployado el contrato. Usá el botón naranja Switch to Ronin en el header — te va a pedir cambiar de red.",
        "warn.wrongChain.detected": "ChainId detectado: {chainId} · requerido: {required}",
        "field.nftContract": "Contrato NFT (address o .ron)",
        "field.tokenId": "Token id",
        "field.paymentToken": "Token de pago (ERC-20 off-chain)",
        "field.paymentDecimals": "Decimales del token",
        "field.amount": "Monto (se cobra off-chain)",
        "field.deadline": "Deadline (minutos)",
        "btn.reviewSign": "Revisar y firmar",
        "btn.working": "Procesando…",
        "btn.reset": "Enviar otro intent",

        // Dashboard
        "dash.title": "Panel del operador",
        "dash.subtitle":
            "Vista en tiempo real de la salud del relayer, inventario del keeper, e intents recientes. Lee directo del deploy productivo.",
        "dash.live": "En vivo",
        "dash.refresh": "Actualizar",
        "dash.refreshing": "Actualizando…",
        "dash.section.health": "Salud del relayer",
        "dash.section.keepers": "Keepers",
        "dash.section.dlq": "Dead Letter Queue",
        "dash.section.empty": "Nada por acá todavía.",
        "dash.metric.chain": "Chain",
        "dash.metric.aggregator": "Aggregator",
        "dash.metric.shards": "Shards",
        "dash.metric.status": "Estado",
        "dash.metric.balance": "Saldo",
        "dash.metric.dlqCount": "Jobs fallidos",
        "dash.error": "No se pudo cargar la data en vivo. Reintentando…",
        "dash.lastUpdated": "Actualizado {time}",

        // Locale switch
        "lang.label": "Idioma",
    },

    pt: {
        // Nav
        "nav.protocol": "Protocolo",
        "nav.mechanics": "Mecânica",
        "nav.dashboard": "Painel",
        "nav.docs": "Docs",
        "nav.launch": "Abrir app",

        // Landing hero
        "hero.eyebrow": "Construído na Ronin · Intents EIP-712 sem gas",
        "hero.title.1": "Assine uma vez.",
        "hero.title.2": "Liquide em qualquer lugar.",
        "hero.subtitle":
            "O RWIA permite comprar NFTs na Ronin sem precisar de RON para gas. Assine um intent EIP-712, pague off-chain, e o Keeper entrega o NFT direto na sua wallet.",
        "hero.launch": "Abrir app",
        "hero.howItWorks": "Como funciona",

        // Mechanics
        "mech.title.1": "Compras de NFT sem gas.",
        "mech.title.2": "Entrega auditável on-chain.",
        "mech.subtitle":
            "Cada intent é assinado off-chain via EIP-712, validado na Ronin, e executado por um Keeper confiável. Sem RON — o usuário paga off-chain, o Keeper paga o gas.",
        "mech.card1.title": "Intents assinados EIP-712",
        "mech.card1.body":
            "Os usuários assinam intents typed-data off-chain. O aggregator verifica cada assinatura EIP-712, aplica nonces por usuário, e o Keeper entrega o NFT on-chain em uma transação atômica.",
        "mech.card2.title": "UUPS + RBAC",
        "mech.card2.body":
            "AccessControl com papéis ADMIN, UPGRADER, KEEPER. A implementation desabilita initializers; o storage usa namespaces ERC-7201.",
        "mech.card3.title": "Execução gated por Keeper",
        "mech.card3.body":
            "Apenas endereços com KEEPER_ROLE podem executar intents. O Keeper mantém os NFTs em custódia e entrega quando o pagamento off-chain é confirmado.",
        "mech.card4.title": "Upgrade-safe via UUPS",
        "mech.card4.body":
            "O V1 liquida compras de NFT nativamente na Ronin. O proxy UUPS com storage ERC-7201 permite um futuro upgrade V2 cross-chain sem perder estado nem exigir migração.",

        // How to use
        "howto.title": "Como usar o RWIA",
        "howto.subtitle":
            "Cinco passos da assinatura ao recebimento do NFT. Sem RON, sem gas, sem swaps.",
        "howto.step1.title": "1. Conecte sua wallet",
        "howto.step1.body":
            "Abra o app, clique em Ronin Wallet (ou browser wallet). Se você não tem wallet, use o Ronin Waypoint para entrar com e-mail — sem precisar de extensão.",
        "howto.step2.title": "2. Escolha o NFT",
        "howto.step2.body":
            "Cole o contrato do NFT (ou um nome colecao.ron) e o token id. O sistema mostra o dono atual e confirma que o Keeper tem o inventário pronto.",
        "howto.step3.title": "3. Assine o intent",
        "howto.step3.body":
            "Revise o preview typed-data, clique em Assinar. Sua wallet pede uma assinatura EIP-712 gratuita — sem gas, sem transação on-chain ainda.",
        "howto.step4.title": "4. Pague off-chain",
        "howto.step4.body":
            "Pague com seu meio preferido (cartão, Pix, Pago Móvil, Binance Pay). Quando o pagamento é confirmado, o Keeper dispara a entrega on-chain.",
        "howto.step5.title": "5. Receba o NFT",
        "howto.step5.body":
            "O card de status passa de validando para confirmado. Clique no tx hash para verificar a transferência no Ronin Explorer. O NFT chega na mesma wallet que assinou.",
        "howto.value.title": "Por que isso importa",
        "howto.value.body":
            "Uma compra tradicional de NFT obriga o novo usuário a cinco passos: instalar wallet, conseguir RON, fazer swap para um token de pagamento, aprovar, e pagar gas. ~73% nunca termina. O RWIA reduz para uma assinatura. A wallet do comprador nunca precisa segurar cripto, exceto para receber o NFT — ideal para LATAM, SEA, e qualquer mercado onde os usuários não querem exposição ao gas-token.",

        // Roadmap
        "road.title": "Roadmap 2026",
        "road.subtitle":
            "Engenharia honesta: cada fase conecta um risco identificado a uma entrega concreta. O V1 já está na Ronin Mainnet; o grant financia as fases 1 e 2 para fechar os gaps restantes antes de abrir volume público.",
        "road.phase0.tag": "V1 no ar",
        "road.phase0.title": "Já na Ronin Mainnet",
        "road.phase0.item1": "Pipeline CI: forge fmt + test + Slither (fail-on-medium) + gas snapshot + storage layout",
        "road.phase0.item2": "_disableInitializers na implementation, TimelockController detém UPGRADER_ROLE (7 dias)",
        "road.phase0.item3": "Pre-flight simulateContract protege cada broadcast contra reverts determinísticos",
        "road.phase0.item4": "Fila sharded e função Postgres claim_next_intent(shard) já no código",
        "road.phase1.tag": "Q3 2026 · grant Fase 1",
        "road.phase1.title": "Confiança e isolamento de chaves",
        "road.phase1.risks": "Fecha: chave hot-wallet exposta, deployer = admin em uma única EOA",
        "road.phase1.item1": "Isolamento de chave via KMS/HSM: KEEPER_PRIVATE_KEY fora das env vars",
        "road.phase1.item2": "Handoff multisig executado (HandoffToMultisig.s.sol → Safe 4-de-7)",
        "road.phase1.item3": "Integração Transak PRODUCTION com webhooks assinados",
        "road.phase1.item4": "Página pública de reputação do Keeper (uptime, histórico RON, volume executado)",
        "road.phase2.tag": "Q4 2026 · grant Fase 2",
        "road.phase2.title": "Escala e resiliência",
        "road.phase2.risks": "Fecha: gargalo single-flight de nonces, perda de estado em memória, SPOF regional",
        "road.phase2.item1": "Quatro EOAs sharded do Keeper em paralelo (4× throughput, sem bloqueio de nonces)",
        "road.phase2.item2": "Message queue persistente (Redis Streams) substitui o polling do Supabase no hot path",
        "road.phase2.item3": "Subgraph Goldsky em produção com alertas on-call (DLQ rate, saldo RON, latência)",
        "road.phase2.item4": "Multi-região atrás de Vercel rewrite, tolera queda regional sem trocar DNS",
        "road.phase3.tag": "2027 · V2",
        "road.phase3.title": "Dispatch cross-chain",
        "road.phase3.item1": "Integração Chainlink CCIP via upgrade UUPS (sem migração de estado, manifest em v2-roadmap/)",
        "road.phase3.item2": "Agregação cross-chain de inventário: Keeper na chain A entrega NFT na chain B",
        "road.phase3.item3": "Opcional: compras just-in-time no marketplace ao executar (após audit)",

        // Final CTA
        "cta.title": "Pronto quando você estiver.",
        "cta.subtitle":
            "Conecte sua wallet Ronin e envie seu primeiro intent de compra sem gas na Ronin Mainnet.",
        "cta.launch": "Abrir app",

        // Footer
        "footer.brand": "Ronin Waypoint",
        "footer.tag.mainnet": "Ronin Mainnet",
        "footer.tag.eip712": "EIP-712 · Sem gas",
        "footer.tag.uups": "UUPS · ERC-7201",

        // /app page
        "page.title": "Compre NFT com fiat",
        "page.subtitle":
            "Assine um intent EIP-712. Quando seu pagamento off-chain for confirmado, o Keeper entrega o NFT direto na sua wallet.",
        "warn.aggregator.title": "Configure NEXT_PUBLIC_AGGREGATOR_ADDRESS",
        "warn.aggregator.body": "Defina o endereço do aggregator em app/.env.local.",
        "warn.wrongChain": "Sua wallet está na chain {chainId}, mas o contrato está na chain {required}.",
        "warn.wrongChain.help":
            "Assinaturas EIP-712 precisam ser produzidas na mesma chain do contrato. Use o botão laranja Switch to Ronin no header — ele pede para sua wallet trocar de rede.",
        "warn.wrongChain.detected": "ChainId detectado: {chainId} · necessário: {required}",
        "field.nftContract": "Contrato NFT (endereço ou .ron)",
        "field.tokenId": "Token id",
        "field.paymentToken": "Token de pagamento (ERC-20 off-chain)",
        "field.paymentDecimals": "Decimais do token",
        "field.amount": "Valor (cobrado off-chain)",
        "field.deadline": "Deadline (minutos)",
        "btn.reviewSign": "Revisar e assinar",
        "btn.working": "Processando…",
        "btn.reset": "Enviar outro intent",

        // Dashboard
        "dash.title": "Painel do operador",
        "dash.subtitle":
            "Visão em tempo real da saúde do relayer, inventário do keeper, e intents recentes. Lê direto do deploy de produção.",
        "dash.live": "Ao vivo",
        "dash.refresh": "Atualizar",
        "dash.refreshing": "Atualizando…",
        "dash.section.health": "Saúde do relayer",
        "dash.section.keepers": "Keepers",
        "dash.section.dlq": "Dead Letter Queue",
        "dash.section.empty": "Nada por aqui ainda.",
        "dash.metric.chain": "Chain",
        "dash.metric.aggregator": "Aggregator",
        "dash.metric.shards": "Shards",
        "dash.metric.status": "Status",
        "dash.metric.balance": "Saldo",
        "dash.metric.dlqCount": "Jobs falhos",
        "dash.error": "Não foi possível carregar os dados ao vivo. Tentando novamente…",
        "dash.lastUpdated": "Atualizado {time}",

        // Locale switch
        "lang.label": "Idioma",
    },
} as const;

export type StringKey = keyof typeof STRINGS["en"];

type I18nContextValue = {
    locale: Locale;
    setLocale: (l: Locale) => void;
    t: (key: StringKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const LOCALES: Locale[] = ["en", "es", "pt"];

function isLocale(v: unknown): v is Locale {
    return v === "en" || v === "es" || v === "pt";
}

export function I18nProvider({children}: {children: ReactNode}) {
    const [locale, setLocaleState] = useState<Locale>("en");

    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) return;
            try {
                const stored = window.localStorage.getItem("rwia.locale");
                if (isLocale(stored)) setLocaleState(stored);
            } catch {
                // localStorage unavailable
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const setLocale = useCallback((l: Locale) => {
        setLocaleState(l);
        try {
            window.localStorage.setItem("rwia.locale", l);
        } catch {
            // ignore
        }
    }, []);

    const t = useCallback(
        (key: StringKey, vars?: Record<string, string | number>) => {
            const dict = STRINGS[locale] as Record<string, string>;
            let template = dict[key] ?? STRINGS.en[key] ?? key;
            if (vars) {
                for (const [k, v] of Object.entries(vars)) {
                    template = template.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
                }
            }
            return template;
        },
        [locale],
    );

    const value = useMemo(() => ({locale, setLocale, t}), [locale, setLocale, t]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error("useI18n must be used within I18nProvider");
    return ctx;
}

export function LocaleSwitch({className = ""}: {className?: string}) {
    const {locale, setLocale} = useI18n();
    return (
        <div className={`inline-flex items-center gap-0.5 rounded-full border border-white/15 bg-white/[0.03] p-0.5 ${className}`}>
            {LOCALES.map((l) => (
                <button
                    key={l}
                    type="button"
                    onClick={() => setLocale(l)}
                    className={`px-2.5 py-1 text-[11px] font-mono uppercase tracking-widest rounded-full transition-colors ${
                        locale === l
                            ? "bg-white text-black font-semibold"
                            : "text-white/55 hover:text-white"
                    }`}
                    aria-label={`Switch to ${l.toUpperCase()}`}
                    aria-pressed={locale === l}
                >
                    {l}
                </button>
            ))}
        </div>
    );
}
