# Business Model — RWIA

> Por qué este producto importa, quién paga, cuánto, y cómo crece. Sin jerga
> de marketing — solo el flujo de valor real.

---

## 1. El problema que resolvemos (datos, no humo)

**Ronin tiene un techo de conversión que ningún juego ha podido romper:** la
fricción de onboarding cripto.

Para que un jugador nuevo de Pixels, Axie Infinity, Forgotten Runiverse o
cualquier dApp Ronin compre su primer NFT necesita:

| Paso | Tiempo típico | Tasa de abandono |
|---|---|---|
| 1. Instalar Ronin Wallet | 2–5 min | ~30% |
| 2. Adquirir RON (bridge / exchange / faucet) | 10–30 min | ~40% |
| 3. Comprar el token de pago (WRON, USDC) en Katana DEX | 5–10 min | ~25% |
| 4. Aprobar token al marketplace | 30 s | ~10% |
| 5. Firmar y pagar gas para la compra | 1 min | ~5% |

**Conversion compuesta**: ~0.7 × 0.6 × 0.75 × 0.9 × 0.95 ≈ **27%** llega al
final. Tres de cada cuatro buyers que tocan tu landing **nunca compran**.

Para mercados emergentes (LATAM, sudeste asiático — los principales mercados
de Ronin), el problema es peor: no tienen acceso a exchanges centralizados
con buen on-ramp local, ni quieren manejar gas en una moneda que oscila.

---

## 2. Lo que vendemos

**RWIA es un rail de checkout fiat → NFT.** El comprador firma un mensaje
(gratis) y paga en su moneda local con su método preferido (tarjeta, Pix,
Pago Móvil, Binance Pay). El NFT aparece en su wallet minutos después.

**No somos un marketplace**. Somos la "Stripe Checkout" del NFT en Ronin.
Cualquier juego, colección o marketplace existente puede plug-and-play
nuestra API y ofrecer checkout fiat sin tocar su contrato ni cambiar su UX.

| Quién | Qué obtiene |
|---|---|
| El **buyer** | Compra un NFT en 2 acciones (firmar + pagar fiat), sin instalar nada cripto |
| El **juego / marketplace** | +60-70% conversión sin tocar su stack; integración via API REST |
| El **Keeper (nosotros)** | Margen entre precio fiat y costo de inventario + tx fee |
| **Ronin** | Más volumen on-chain, más usuarios activos, más fees para validators |

---

## 3. ¿Dónde está la ganancia? (modelo de ingresos)

Tres rieles, complementarios, NO mutuamente exclusivos:

### 3.1 Markup transaccional (B2C primario)

Por cada NFT entregado al buyer, cobramos un fee + margen:

```
Precio total al buyer  = Precio inventario  +  Service fee  +  Gas absorbido
                         (lo que pagó el     (3-5% del       (~0.003 RON =
                          Keeper en el       precio nominal) <$0.01 a precio
                          marketplace)                        actual de RON)
```

- A precio Ronin actual: **service fee 4%** sobre una compra promedio de $20
  USD = **$0.80 USD por intent**.
- Gas que absorbemos: ~150k gas × 21 gwei ≈ $0.005 USD. **Margen neto: ~$0.79
  USD por intent**.
- A 1.000 intents/día: **$790/día = $24K/mes recurrente**.

### 3.2 Tarifa de integración (B2B)

Juegos / colecciones que quieren listar el checkout en sus storefronts pagan
un fee de integración + revenue share:

| Tier | Fee inicial | Rev share | Cobertura |
|---|---|---|---|
| **Studio** | $0 | 1% del GMV | NFT colecciones independientes |
| **Pro** | $499/mes | 0.5% del GMV | Juegos AAA, custom branding |
| **Enterprise** | Custom | Negociable | SLA dedicado, multi-region, Slack support |

Pago menor sobre la primera vertical (markup transaccional) pero adopción
viral: cada juego que integra trae sus jugadores que se convierten en buyers
recurrentes.

### 3.3 Spread de FX en mercados emergentes

Conversión fiat → token de pago (WRON/USDC) la procesamos internamente
con un spread del 1-1.5% sobre tasas Transak. Específico para LATAM donde
la tasa oficial vs paralelo deja margen real.

---

## 4. ¿Cuánto puede crecer? (cálculo de mercado)

| Métrica | Valor |
|---|---|
| Usuarios activos Ronin (DAU) | ~600,000 (Pixels + Axie + otros) |
| % que actualmente compra NFTs/mes | ~3% |
| Compradores activos/mes | ~18,000 |
| GMV NFT Ronin estimado | ~$25M/mes |
| Si RWIA captura 5% del flujo nuevo | **$1.25M/mes GMV** |
| Service fee 4% sobre eso | **$50K/mes recurring revenue** |

A 18 meses con expansión a Pixels + 2 colecciones más: **MRR objetivo $200K**.

Nuestra **moat** es la integración B2B + las direcciones de Keeper warm
en Ronin con reputación (NFTs comprados al por mayor con descuento de
volumen al marketplace). Conforme procesamos más, mejor precio negociamos.

---

## 5. ¿Por qué Ronin y no Polygon/Base?

| Razón | Detalle |
|---|---|
| **Audiencia gamer concentrada** | Ronin tiene la mayor densidad on-chain de gaming wallets del mundo (Axie, Pixels, Wild Forest, Tribesters) |
| **Fee estructura predecible** | Gas a 21 gwei estable; podemos prometer al buyer "$0 gas" sin perder dinero |
| **Transak partnership oficial** | Enero 2025 anunció soporte NFT-checkout nativo en Ronin — el rail fiat ya existe, falta el plumbing del intent layer (somos nosotros) |
| **Permissionless 2026** | Sky Mavis abrió la red, no necesitamos KYC para deployar; cualquier integración tampoco |
| **Mercados emergentes** | LATAM, SEA son los mercados primarios de Ronin gaming — coincide con donde el fiat onboarding cripto es más doloroso |

---

## 6. Por qué el comité del grant debe creer esto

Ya no es slideware. Es código deployado con tx reales:

- IntentAggregator proxy: [`0x2D3E5B0d…`](https://app.roninchain.com/address/0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5) en Ronin Mainnet
- Test E2E real con buyer generado on-the-fly:
  [tx `0x1d3b706913…`](https://app.roninchain.com/tx/0x1d3b706913db0191c411835417e02306b9368d2c1e035a9e2c560eb6d092ab58)
  — wallet sin balance recibió un NFT a través del flujo completo
- 19 tests Foundry (unit + invariant) verdes
- Auditoría interna documentada (8 riesgos identificados, 8 con mitigación
  ya en código): `RISK-MITIGATIONS.md`

El **grant nos compra ejecución, no idea**:

| Uso del grant | Resultado medible |
|---|---|
| 1 mes de operaciones (4 keepers, 50 RON inventario gas) | 5,000 intents servidos antes de break-even |
| Integración Transak SANDBOX → PRODUCTION + KYC business | Onboarding LATAM real, fiat → NFT en 1 país piloto |
| Onboard 3 colecciones piloto Ronin (Pixels assets, Wild Forest items, una colección indie) | ~5K usuarios MAU expuestos al checkout |
| Goldsky subgraph en producción + dashboard | Operability + reporting para inversionistas / partners |

---

## 7. ¿Cómo se ve la pantalla del buyer hoy?

```
┌────────────────────────────────────────────────────┐
│ rwia.vertsun.io/app                                │
│                                                    │
│  Buy NFT with fiat                  [0x3006…6A5e] │
│                                                    │
│  NFT contract: 0x32e7C4499…1cF2                    │
│  Token id: 1                                       │
│  Pay: 1 WRON ($0.32 USD)                          │
│  Deadline: 60 min                                  │
│                                                    │
│  [ Review & sign ]                                 │
│                                                    │
│  ✓ NFT delivered                                  │
│  Token #1 is now in your wallet                   │
│                                                    │
│  Transaction: 0x1d3b7069…092ab58 ↗                │
│  Block: 55955676 ↗                                │
│  NFT contract: 0x32e7c4…1cf2 ↗                    │
│  Recipient: 0xd9A91B…3b0E ↗                       │
│                                                    │
│  [ View on Ronin Explorer ↗ ]                     │
│  [ View NFTs in my wallet ↗ ]                     │
│  [ Buy another ]                                  │
│                                                    │
└────────────────────────────────────────────────────┘
```

Cada elemento de "Transaction" / "Block" / "NFT contract" / "Recipient" es
**clickeable directo al Ronin Explorer**. No el usuario tiene que copiar y
pegar. Esto importa: el buyer obtiene **prueba criptográfica** de que su
NFT existe, en 0 clicks adicionales.

---

## 8. Roadmap de monetización 12 meses

| Mes | Hito | Métrica |
|---|---|---|
| 0-1 | Grant submit + Vercel público + Safe handoff + Transak SANDBOX | 0 ingresos, infra production-ready |
| 2-3 | Transak PRODUCTION + 1 colección piloto integrada | 100 intents/día, $80/día ingresos |
| 4-6 | 3 colecciones + dashboard ops + Goldsky subgraph | 500 intents/día, $400/día |
| 7-9 | API B2B abierta (auto-onboarding) + multi-region keepers | 2,000 intents/día, $1,600/día |
| 10-12 | V2 CCIP (cross-chain) + Ronin Waypoint social login default | 5,000 intents/día, $4,000/día (~$120K MRR) |

Break-even operacional al mes 4. Cash flow positivo desde mes 5.
