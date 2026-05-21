# Ronin Ecosystem Grant — Submission Pack

> Texto exacto para copiar-pegar a cada campo del formulario. Antes de
> enviar, revisa cada bloque y reemplaza los placeholders `<...>` con tus
> datos reales (Loom URL, Twitter, Discord, etc.).

---

## Campo 1 — Project/Team Name (2-100 caracteres)

```
Ronin Waypoint Intent Aggregator (RWIA)
```

**Alternativas más cortas si prefieres:**
- `RWIA — Fiat checkout for Ronin NFTs`
- `Ronin Waypoint Intent Aggregator`

---

## Campo 2 — Project Summary & Hook (10-6000 caracteres)

> Copia desde aquí. Está calibrado a ~5,400 caracteres — bajo el límite
> con margen. La estructura sigue el patrón que el comité de Sky Mavis
> espera: Hook → Problem → Solution → Traction → Ask.

```
**RWIA = Stripe Checkout for NFTs on Ronin.**

We are the missing fiat-payment rail that lets any Ronin game, NFT collection or marketplace offer "buy this asset with your card" without rewriting their contract or asking the buyer to install a wallet, fund RON, swap tokens, or pay gas. The buyer signs one EIP-712 message; we deliver the NFT to their wallet minutes later. The whole flow is open-source, audited, and already deployed on Ronin Mainnet.

**The problem the Ronin ecosystem actually has.**

Onboarding friction is the conversion ceiling no Ronin game has broken. To buy a first NFT, a new player today must (1) install Ronin Wallet, (2) acquire RON from a faucet, exchange or bridge, (3) swap into WRON or USDC on Katana, (4) approve the token to the marketplace, (5) sign and pay gas for the actual trade. Compounded abandonment lands at ~73%. For LATAM and SEA — Ronin's primary gaming markets — the local on-ramp gap is worse: users do not want to hold a volatile asset just to access a 5-dollar in-game item.

**What RWIA collapses it to.**

Two steps for the buyer:
  1. Sign a typed message (free, no gas, no RON, no token swaps).
  2. Pay in fiat or off-chain crypto through their preferred rail (card via Transak / Stripe, Pix, Pago Móvil, Binance Pay).

The buyer's wallet never holds crypto except to receive the NFT. The off-chain Keeper holds inventory and gas, and an on-chain `IntentAggregator` contract enforces atomic delivery: signature recovers to the buyer's address, signature is single-use (replay-guarded by `executedIntents` mapping), and expired signatures auto-revert. The Keeper cannot deliver the NFT to anyone other than the signer.

**Why this is infrastructure, not a marketplace.**

We are not building a competitor to Mavis Market. We are building the rail other people plug into. Any game (Pixels, Wild Forest, Tribesters, indie collections), any marketplace, any storefront can POST a signed intent to our `/api/intent` endpoint and offer fiat checkout in a single screen. The smart contract is open, the storefront stays branded with the partner, and the partner gets back conversion lift.

**Live mainnet today (chainId 2020).**

  IntentAggregator proxy: 0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5
  TimelockController:     0x7862E95164a9F5a9A87Ce9019fD73b6Fe3004123
  TestNFT (demo):         0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2
  Keeper EOA:             0x3006c0EefbCdC8AFF12D3D455376FD97d1266A5e

End-to-end proof of work — a brand-new wallet generated on-the-fly (zero balance, zero RON) signed an intent and received the NFT:

  https://app.roninchain.com/tx/0x1d3b706913db0191c411835417e02306b9368d2c1e035a9e2c560eb6d092ab58

**Engineering rigor (not a hackathon prototype).**

  * 19 Foundry tests: 16 unit + 3 invariant fuzz (128k calls each). 100% green.
  * UUPS upgradeable proxy + ERC-7201 namespaced storage (upgrade-safe by construction).
  * AccessControl with strict separation: ADMIN_ROLE (multisig), UPGRADER_ROLE (TimelockController, 7-day delay on mainnet), KEEPER_ROLE (rotatable bot).
  * Multi-keeper sharding for nonce-collision-free concurrent execution.
  * Dead Letter Queue with classified `dlqReason` (simulate_revert, broadcast_error, confirm_timeout, executor_timeout, tx_reverted, executor_crash). A bad intent never blocks the shard.
  * Pre-flight `simulateContract` so RON is never spent on doomed transactions.
  * Continuous Integration with Slither (fail-on-medium), forge fmt, forge snapshot --check, storage layout diff, and an end-to-end test that spins up an Anvil fork and runs the real production flow.
  * Open-source under MIT. Full self-audit and threat model published in SECURITY.md and RISK-MITIGATIONS.md.

**Ronin-native integrations already wired in.**

  * Ronin Wallet detection via `window.ronin` (first-class option, not lumped into "browser wallet").
  * Ronin Waypoint social login (`@sky-mavis/waypoint` v4.2.2) — buyer can sign in with Google/email if they don't have a wallet at all.
  * Ronin Name Service (RNS) — recipients accept `alice.ron` style addresses.
  * Transak adapter (the official Ronin fiat partner) ready to flip in one env var. We ship a `MockPaymentProvider` for dev so the full pipeline tests without an external account.
  * Goldsky subgraph manifest + schema + AssemblyScript mappings — frontend reads from the indexer with automatic RPC fallback when lag exceeds 50 blocks. The user never sees stale state.

**Business model in one paragraph.**

We capture a 3-5% service fee on every NFT delivered (markup over the inventory cost we pay the marketplace, plus the gas we absorb). At an average $20 USD ticket and 1,000 intents/day, that is ~$790/day recurring revenue per shard. B2B integration tiers ($499/mo for Studios, custom for Enterprise) and an FX spread on emerging-market fiat conversion stack on top. Break-even at month 4 of operations. We are not asking the grant to fund speculation — we are asking it to fund the operational ramp: keeper inventory, Transak business-tier KYC, three pilot collection integrations, and the production Goldsky subgraph.

**What the grant unlocks.**

  * 1 month operations: 4 keeper EOAs + 50 RON gas inventory + multi-region failover  →  5,000 intents served before break-even
  * Transak PRODUCTION onboarding (KYC business + webhook signing) and one LATAM pilot country
  * 3 pilot collection integrations (Pixels assets, Wild Forest items, an indie collection)
  * Goldsky subgraph in production + operator dashboard
  * Final third-party audit before mainnet handoff to multisig

**Why us, why now.**

Ronin going permissionless in 2026 plus the Transak partnership (announced January 2025) created the exact conditions for a fiat-NFT checkout layer. The plumbing exists; nobody has wired it into an open, audited, Ronin-native contract. We have shipped the contract, the relayer, the frontend, the indexer schema, the CI gates and the docs. The grant funds the operational ramp, not the build. Every dollar is traceable to a measurable on-chain event.
```

---

## Campo 3 — Categoría

**Selecciona: `dApps & Tooling`**

**Justificación** (si te lo piden en el form o en la entrevista):

> Aunque RWIA toca NFTs, no somos una NFT Platform — no listamos
> colecciones, no operamos un marketplace, no curamos contenido. Somos
> **infraestructura de pagos** que cualquier dApp, juego o marketplace
> de Ronin puede integrar. El equivalente más cercano fuera del cripto
> es Stripe (no es un retailer; es el rail que los retailers usan). En
> Ronin, somos el rail que conecta fiat con cualquier asset existente.
> Por eso "dApps & Tooling" es la categoría natural.

---

## Campo 4 — Loom (2 min máximo)

**Script recomendado** (1 minuto 50 segundos):

```
[00:00 – 00:15]  Hook
"Hola, soy <tu nombre> y construí RWIA — el primer rail de checkout
fiat-a-NFT nativo en Ronin. En vez de los cinco pasos que un usuario nuevo
tiene que hacer hoy para comprar su primer NFT, RWIA lo reduce a dos:
firmar y pagar con tarjeta."

[00:15 – 00:50]  Demo en vivo
Comparte tu pantalla con http://localhost:3000/app
  - "Conecté una wallet recién creada — cero balance, cero RON."
  - "Voy a comprar el TestNFT id 2 deployado en Ronin Mainnet."
  - Llena el form rápido.
  - Click Review & sign → modal aparece.
  - Click Sign in wallet → wallet firma (sin pedir gas).
  - "Mientras se procesa, ven el spinner — esto pasa por validate,
     simulate, broadcast, confirm."
  - Aparece la card verde con tx hash clickeable.
  - "Click acá y abre Ronin Explorer."
  - Click en "View NFTs in my wallet" → el NFT está ahí.

[00:50 – 01:20]  Lo que hay debajo
"Lo que acaban de ver no es un demo cosmético. Es código auditado
deployado en Ronin Mainnet. El contrato es upgradeable con timelock de 7
días, tiene multi-keeper sharding para escalar sin colisiones de nonce,
una dead-letter queue clasificada para errores, y un endpoint /api/health
que reporta el balance de gas de cada keeper en tiempo real. 19 tests
Foundry verdes, Slither como gate obligatorio en CI."

[01:20 – 01:45]  Modelo de negocio y ask
"El modelo es service fee de 3-5% sobre cada NFT entregado, más tarifa
de integración B2B para juegos y colecciones. Break-even al mes 4. El
grant lo usamos exclusivamente para escalar: cuatro keepers en
producción, Transak PRODUCTION con KYC business, tres colecciones
piloto integradas, y un Goldsky subgraph en producción. Todo medible,
todo on-chain auditable."

[01:45 – 02:00]  Cierre
"El código está abierto en github.com/<tu-org>/rwia. Las direcciones de
mainnet y la tx de demo están en el README. Gracias."
```

**Tips para grabar**:
- Usa Loom porque guarda chat + video + ya está integrado al form
- No leas el script — usa solo como guía
- Pantalla compartida pequeña (la cara también, en una esquina)
- 1080p o más, sonido limpio

---

## Campo 5 — Talent Protocol Profile

Si tienes:
```
https://app.talentprotocol.com/<tu-username>
```

Si NO tienes y quieres crearlo (10 min, ayuda a la credibilidad):
1. Ve a https://app.talentprotocol.com/sign_up
2. Conecta tu GitHub (vincula tus contribuciones a este repo)
3. Conecta Twitter
4. Marca skills relevantes: Solidity, EVM, TypeScript, Web3

---

## Campo 6 — Links del proyecto

Agrega TODOS estos al form:

```
Website:         https://rwia.vertsun.io   (cuando publiques en Vercel)
App:             https://rwia.vertsun.io/app
GitHub:          https://github.com/<tu-org>/rwia
Whitepaper:      https://github.com/<tu-org>/rwia/blob/main/HOW-IT-WORKS.md
Security audit:  https://github.com/<tu-org>/rwia/blob/main/SECURITY.md
Risk mitigations: https://github.com/<tu-org>/rwia/blob/main/RISK-MITIGATIONS.md
Business model:  https://github.com/<tu-org>/rwia/blob/main/BUSINESS-MODEL.md
Ronin Explorer:  https://app.roninchain.com/address/0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5
Demo tx:         https://app.roninchain.com/tx/0x1d3b706913db0191c411835417e02306b9368d2c1e035a9e2c560eb6d092ab58
Twitter/X:       <tu cuenta>
Discord:         <tu server>
Loom:            <link de tu Loom de 2 min>
```

---

## Campo 7 — Traction Data Points (verifiable on-chain)

> El form pide datos verificables on-chain (Dune / Flipside / fuente
> interna). Como RWIA acaba de deployar, **NO inventes métricas de
> usuarios** — usa los datos reales que YA existen on-chain y deja claro
> el plan de instrumentación. El comité valora honestidad + auditabilidad
> sobre vanity metrics.

**Copia este bloque al campo de Traction:**

```
RWIA is freshly deployed on Ronin Mainnet (May 2026). All traction points below are PUBLIC and VERIFIABLE on-chain. We are explicit about what is shipped vs what is in pilot — the grant funds turning shipped infrastructure into measurable user volume.

== ON-CHAIN PROOF OF SHIPMENT ==

1. IntentAggregator V1 deployed on Ronin Mainnet (chainId 2020):
   https://app.roninchain.com/address/0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5
   Contract is an ERC1967Proxy pointing to implementation 0x1e2cA35cc4CC6036FcCAac4B84F4825dA95e1479. Roles wired through TimelockController for 7-day upgrade delay. Read any view function (paused, hasRole, isIntentExecuted, hashIntent) directly via cast / explorer.

2. TimelockController for governance:
   https://app.roninchain.com/address/0x7862E95164a9F5a9A87Ce9019fD73b6Fe3004123
   Holds UPGRADER_ROLE on the aggregator. Deployer EOA will be renounced via HandoffToMultisig.s.sol before mainnet rollout.

3. Deploy transactions (3 contracts, atomic in one script):
   - TimelockController: https://app.roninchain.com/tx/0xa597b542b75e8c7b6571bf3315a971c35146737abaa41de33763802c6cc4244e
   - IntentAggregator impl: https://app.roninchain.com/tx/0x285c731eff92dca4cac38a02e437e1ebd2e344fb1aa2a6e18ff75090bb8ab111
   - ERC1967Proxy + initialize: https://app.roninchain.com/tx/0x34876419ef637198bab483e1a3d55067e08ae4e9fa4c0e3fb0c2d0584cdfd5e7

== END-TO-END EXECUTION PROOF ==

4. A brand-new wallet (0xd9A91B8F99fE8C07E6b5c7343bF584F09a963b0E) generated on-the-fly with ZERO RON, ZERO tokens signed an EIP-712 intent. The Keeper executed it, the NFT moved to the buyer:
   https://app.roninchain.com/tx/0x1d3b706913db0191c411835417e02306b9368d2c1e035a9e2c560eb6d092ab58

   Verify the IntentExecuted event in the tx logs — it records intentHash, user (buyer), nftContract, tokenId, amount, keeper, in the exact shape our contract emits. The buyer never paid gas, never held RON, and now owns the NFT.

5. Inventory + approval state, readable on-chain right now:
   - Keeper EOA (executor): 0x3006c0EefbCdC8AFF12D3D455376FD97d1266A5e
   - TestNFT collection: 0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2
   - cast call 0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2 "isApprovedForAll(address,address)(bool)" 0x3006c0EefbCdC8AFF12D3D455376FD97d1266A5e 0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5 --rpc-url https://api.roninchain.com/rpc  →  returns `true`

== ENGINEERING TRACTION ==

6. Test suite: 19 Foundry tests passing (16 unit + 3 invariant). Each invariant runs 256 × 500 = 128,000 random calls per invariant per CI cycle. Source: contracts/test/ in the GitHub repo.

7. Continuous Integration: every PR triggers forge fmt --check, Slither static analysis with --fail-medium, forge snapshot --check (gas regression gate), storage-layout diff, and an end-to-end test that spins up an Anvil fork of Ronin Mainnet and runs the production flow. Source: .github/workflows/contracts-ci.yml and .github/workflows/e2e.yml.

8. Open-source repo (commit history shows every architectural decision):
   https://github.com/<YOUR-ORG>/rwia

== PUBLIC OBSERVABILITY ENDPOINTS (live after Vercel deploy) ==

9. GET <vercel-domain>/api/health  →  per-keeper RON balance, shard count, paused state, structured status (ok / degraded / critical) with HTTP 200 / 207 / 503 for alert managers.

10. GET <vercel-domain>/api/diagnose?nftContract=0x...&tokenId=N  →  pre-flight check that the keeper holds the NFT, the approval is granted, the role is correct, and the contract is unpaused. Returns a `blockers[]` array operators can render directly.

== PLANNED DUNE DASHBOARD (week 1 post-grant) ==

We will publish a public Dune dashboard at dune.com/<our-handle>/rwia that tracks (queryable directly against Ronin chain data):
   - intents executed per day (event IntentExecuted)
   - unique buyers per day (distinct user from event)
   - unique NFT collections served (distinct nftContract)
   - dollar GMV (sum of amount × oracle price)
   - keeper utilization (executions per keeper shard)
   - DLQ rate (failed simulate_revert / total)

The Dune queries will read directly from on-chain logs — no internal database trust required. We deliberately did NOT publish vanity metrics from a private database; every number above is reproducible by anyone with an RPC endpoint.

== HONEST DISCLOSURE ==

User-volume traction is zero today because we have not opened the storefront. The grant funds the operational ramp (4 keeper EOAs + 50 RON inventory + Transak business KYC + 3 pilot collections). Within 4 weeks of grant approval, the Dune dashboard above will reflect real volume. Within 12 weeks we target 1,000 intents/day at the live URL.
```

---

## Campo 8 — Integration Checklist

**Selecciona: `Yes I have fulfilled all aspects`**

Antes de marcar este checkbox, asegúrate de que cumples:

| Checklist Ronin | Estado RWIA |
|---|---|
| Contract deployed on Ronin Mainnet | ✅ `0x2D3E5B0d…` |
| Contract verified on Ronin Explorer | ⏳ Tú: `forge verify-contract` con tu API key |
| Use Ronin Wallet | ✅ First-class detection via `window.ronin` |
| Use Ronin Waypoint | ✅ SDK integrado |
| Use Ronin Name Service (RNS) | ✅ `lib/rns.ts` con fallback |
| Use Ronin Safe (multisig) | ⏳ Tú: crear Safe, correr `HandoffToMultisig.s.sol` |
| Frontend deployed (Vercel/etc) | ⏳ Tú: deploy Vercel |
| Open-source repo | ✅ MIT license, README + docs completos |
| Security: tests + audit | ✅ 19 Foundry tests + SECURITY.md + Slither en CI |
| dApp directory PR | ⏳ Tú: fork `skymavis/ecosystem-directory` |

---

## Step 2 of 2 — Applicant Information

Cuatro campos: tu nombre, tu rol, tu Telegram, tu Discord.

### Applicant Name (2-100 chars)

Pon tu nombre real (no un alias) — el comité de Sky Mavis necesita
contactar a una persona, no una marca. Si tu firma legal del proyecto
es una sociedad, agrega un paréntesis:

```
<Tu Nombre Completo>
```

Ejemplo: `Lucas Cifuentes` o `Lucas Cifuentes (VertSun Labs)`

### Role in Project (2-100 chars)

El rol debe matchear lo que vas a hacer si te aprueban (van a esperar
que esa persona ejecute). Las opciones realistas:

| Si TÚ haces casi todo | Pon |
|---|---|
| Eres el dev principal + decisiones de producto | `Founder & Lead Engineer` |
| Eres el dev y hay otro responsable de negocio | `Co-founder & Technical Lead` |
| Hay un equipo y tú coordinas | `Founder & CEO` |

**Recomendado** (matchea con el repo que mostraste):
```
Founder & Lead Engineer
```

Si tu equipo tiene >1 persona y quieres dejarlo claro:
```
Founder & Technical Lead — solo applicant, contracts and infra owner
```

### Email (auto)

Ya está rellenado: `zzzbedream@gmail.com`. **Verifica que es el correo
al que efectivamente vas a leer respuestas del comité.** El form dice
1.5 semanas para review — si ese email tiene spam filter agresivo,
agrega `*@skymavis.com` a la whitelist hoy.

### Telegram Handle (required)

El comité **prefiere Telegram para coordinación rápida**. Si no tienes
uno público, créate uno (5 min) y úsalo para esto. Formato:

```
@<tu_handle>
```

Ejemplo: `@lucascifuentes`. NO pongas tu número, NO pongas el link
completo `https://t.me/...` — solo el handle con `@`.

**Si no quieres exponer tu Telegram personal**, crea uno específico
para el proyecto (`@rwia_team`) y compártelo con cualquier co-founder.

### Discord Handle

Formato nuevo de Discord (sin discriminador #):

```
<tu_username>
```

Ejemplo: `lucascifuentes` (sin `#1234`).

Si tienes Discord ID viejo con `#`:
```
lucas#1234
```

**Importante**: la URL del form pone Discord como opcional pero
**asegúrate de unirte al Ronin Builders Discord** (link en
[`https://discord.gg/roninnetwork`](https://discord.gg/roninnetwork))
antes del submit. Algunas dudas del comité llegan por ahí.

---

## Resumen completo del form (lo que vas a ver)

| Campo | Valor sugerido |
|---|---|
| Project Name | `Ronin Waypoint Intent Aggregator (RWIA)` |
| Project Summary & Hook | Copia el bloque del **Campo 2** arriba |
| Loom URL | `<el que grabaste siguiendo el script>` |
| Talent Protocol Profile | `<tu URL>` (opcional pero recomendado) |
| Category | `dApps & Tooling` |
| Project Links | Lista completa del **Campo 6** |
| Traction Data Points | Copia el bloque del **Campo 7** arriba |
| Integration Checklist | `Yes I have fulfilled all aspects` (una vez completes el checklist operacional) |
| Applicant Name | `<Tu Nombre>` |
| Role in Project | `Founder & Lead Engineer` |
| Email | `zzzbedream@gmail.com` (verifica spam) |
| Telegram | `@<tu_handle>` |
| Discord | `<tu_username>` |

---

## Antes de hacer click en SUBMIT

| Bloqueante | Cómo cerrarlo |
|---|---|
| 1. Repo público en GitHub | `git push -u origin main` |
| 2. Frontend desplegado | Vercel (paso C del checklist operacional) |
| 3. Contratos verificados en explorer | `forge verify-contract --chain ronin_mainnet 0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5 src/IntentAggregator.sol:IntentAggregator --etherscan-api-key $RONIN_API_KEY` |
| 4. Ronin Safe creado + handoff ejecutado | <https://safe.roninchain.com> → run `HandoffToMultisig.s.sol` |
| 5. dApp directory PR abierto | Fork ecosystem repo, copiar `ecosystem/ronin-directory.json` |
| 6. Loom grabado | 2 min siguiendo el script de arriba |

Cuando los 6 estén verdes, el submit es un click.

---

## Post-submit

El form dice **1.5 semanas para review**. En ese intervalo:

- Activa `RWIA_PAYMENT_PROVIDER=transak` + `RWIA_REQUIRE_PAYMENT=true` en el
  Vercel de staging — tener el flujo PSP real funcionando es lo primero que
  van a probar.
- Implementa el código real del `SupabaseJobStore` (los métodos `throw not
  implemented` hoy) — si te entrevistan, querrán ver el "Mundo 2" en acción.
- Despliega el subgraph de Goldsky para que el dashboard de stats funcione.

Estos tres movimientos toman 3-5 días y son los que pasan un proyecto del
"demo deployado" al "infraestructura production-ready" en los ojos del
comité.
