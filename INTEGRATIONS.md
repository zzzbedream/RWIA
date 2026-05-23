# Integrations — Payment rails, on-ramps, fiat checkout

> Honest answer about "Ronin Payments" and how to plug a real PSP into
> RWIA. Read this before you ship to production.

---

## Does "Ronin Payments" exist?

Short answer: **not as a single product, yes as an ecosystem.**

Sky Mavis itself does not operate a payment processor. What exists in
the Ronin ecosystem (as of 2026-05):

| Product                                    | What it does                                                       | When to use it                                    |
| ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------- |
| **Transak ↔ Ronin** (2025-01 partnership)  | Fiat → crypto AND fiat → NFT checkout, native on Ronin             | First choice for global fiat NFT checkout         |
| **Ronin Waypoint Deposit SDK**             | Embed Onramper widget for buying RON/USDC/SLP with fiat            | Already wired into Waypoint; good for token onboarding |
| **Onramper (via Ronin Wallet)**            | 130+ payment methods, 190+ countries (card, bank, local rails)     | Standalone widget, no API integration             |
| **Stripe / MercadoPago / Binance Pay**     | Generic PSPs — collect fiat off-chain, you bridge the gap manually | When you need exotic markets or your own UX       |

**Conclusion:** the flow IS apifiable. The architecture in this repo is
already designed for it via the `PaymentProvider` adapter at
[`app/src/lib/payments/`](app/src/lib/payments/).

Sources used: [Transak ↔ Ronin partnership blog](https://transak.com/blog/transak-joins-forces-with-ronin-seamless-fiat-to-crypto-onboarding-and-nft-checkout) ·
[Onramper in Ronin Wallet docs](https://docs.skymavis.com/mavis/ronin-waypoint/guides/onramp-support) ·
[Ronin Waypoint Deposit SDK](https://docs.skymavis.com/mavis/ronin-waypoint/reference/web-utilities-sdk).

---

## How the payment flow plugs in (architecture)

```
┌─ Frontend ───────────────────────────────────────────────┐
│  POST /api/intent     {intent, sig}                       │
│   → job.status = "awaiting_payment"                       │
│                                                            │
│  POST /api/payments/create-session   {jobId}              │
│   → returns checkoutUrl from the active PaymentProvider   │
│                                                            │
│  Buyer redirects to checkoutUrl, pays in fiat             │
└────────────────────────────────────────────────────────────┘
                              │
                              ▼  PSP webhook (signed)
┌─ /api/payments/webhook ──────────────────────────────────┐
│  paymentProvider().parseWebhook(rawBody, headers)         │
│   - verifies HMAC / Stripe-Signature                      │
│   - returns {kind:"payment_succeeded", intentHash, …}     │
│  markIntentPaid(intentHash) → releasePaidJob → executor   │
└────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  Keeper broadcasts on-chain
```

Two-phase release means the user **cannot** execute by spamming the
relayer: until the PSP confirms, the job sits at `awaiting_payment` and
the keeper never touches gas.

---

## Switch which provider is active

`app/.env.local`:

```env
# One of: mock, transak  (more adapters: see roadmap below)
RWIA_PAYMENT_PROVIDER=transak

# When false, intents fire immediately on validation (direct-trust dev mode).
# Default true → payment webhook required before broadcast.
RWIA_REQUIRE_PAYMENT=true
```

---

## Provider recipes

### A. Transak (recommended for production)

```env
RWIA_PAYMENT_PROVIDER=transak
TRANSAK_API_KEY=pk_xxx                # from https://dashboard.transak.com
TRANSAK_HMAC_SECRET=whsec_xxx         # from the same dashboard
TRANSAK_ENV=PRODUCTION                # STAGING | PRODUCTION
TRANSAK_DEFAULT_CRYPTO=USDC           # what the user "buys" — defaults USDC
```

Webhook URL to register in Transak dashboard:
```
https://<your-domain>/api/payments/webhook
```

Transak's `partnerOrderId` is set to the EIP-712 `intentHash`, so the
webhook is self-correlating. The HMAC is `sha256(rawBody, secret)`
matched against `x-transak-signature` — implemented in
[`app/src/lib/payments/transak.ts`](app/src/lib/payments/transak.ts).

### B. Stripe (write your own adapter — boilerplate below)

```ts
// app/src/lib/payments/stripe.ts
import Stripe from "stripe";
import type {PaymentEvent, PaymentProvider, PaymentSession, PaymentSessionInput} from "./types";

export class StripeProvider implements PaymentProvider {
    readonly name = "stripe";
    private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {apiVersion: "2024-12-18.acacia"});

    async createSession(input: PaymentSessionInput): Promise<PaymentSession> {
        const session = await this.stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [{
                price_data: {
                    currency: "usd",
                    product_data: {name: `NFT ${input.nftContract}/${input.tokenId}`},
                    unit_amount: Number(input.amount / 10n ** BigInt(input.tokenDecimals - 2)), // cents
                },
                quantity: 1,
            }],
            metadata: {intentHash: input.intentHash},
            success_url: `${input.returnUrl ?? process.env.NEXT_PUBLIC_APP_URL}/app?paid=true`,
            cancel_url: `${input.returnUrl ?? process.env.NEXT_PUBLIC_APP_URL}/app?paid=false`,
        });
        return {
            providerSessionId: session.id,
            checkoutUrl: session.url!,
            intentHash: input.intentHash,
            provider: this.name,
        };
    }

    async parseWebhook(rawBody: string, headers: Record<string, string>): Promise<PaymentEvent> {
        const sig = headers["stripe-signature"]!;
        const evt = this.stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
        if (evt.type === "checkout.session.completed") {
            const s = evt.data.object as Stripe.Checkout.Session;
            return {
                kind: "payment_succeeded",
                intentHash: s.metadata!.intentHash as `0x${string}`,
                providerSessionId: s.id,
                amountPaid: BigInt(s.amount_total ?? 0),
            };
        }
        throw new Error(`unhandled stripe event ${evt.type}`);
    }
}
```

Then register in [`app/src/lib/payments/index.ts`](app/src/lib/payments/index.ts):

```ts
case "stripe": cached = new StripeProvider(); break;
```

### C. Onramper (no API needed — widget redirect)

Onramper is exposed by Ronin Wallet itself. If your buyer already has
Ronin Wallet, you can skip building the PSP path entirely and rely on
the buyer using the in-wallet "Buy Crypto" option to load up
WRON/USDC, then approving + paying directly. The downside: more
friction (3 steps inside the wallet). Use only as a fallback.

### D. MercadoPago (LATAM)

Same pattern as Stripe. Use `mercadopago-node-v2` SDK. Webhook
verification uses `x-signature` HMAC. The body shape is different but
the adapter contract is identical — implement `PaymentProvider`.

---

## End-to-end smoke test with Mock provider (no fiat money needed)

```powershell
# 1. Configure
cd app
# in .env.local:
#   RWIA_PAYMENT_PROVIDER=mock
#   RWIA_REQUIRE_PAYMENT=true
#   NEXT_PUBLIC_APP_URL=http://localhost:3000

npm run dev
```

1. Open <http://localhost:3000/app>, connect wallet, fill form, sign
2. The job appears at `/api/intent/<jobId>` with status `awaiting_payment`
3. POST to `/api/payments/create-session` with `{jobId}` → returns a
   `checkoutUrl` like `/api/payments/mock-confirm?intent=0x...`
4. Visit that URL → returns `{mockConfirmed: true}` and the queue
   advances: `pending` → `broadcasting` → `confirmed`
5. NFT lands in the buyer's wallet

For Transak, swap `RWIA_PAYMENT_PROVIDER=transak` and the rest works
the same. The buyer is redirected to Transak instead of the mock route.

---

## Re-deploy checklist (because the current contract at `0x4828…` is bricked)

The IntentAggregator at `0x482816C756893a813A82aa8CEc979F15101a4e18`
was deployed with `forge create` directly. Its constructor calls
`_disableInitializers()`, so `initialize` can never run and no roles
are assigned. **You MUST re-deploy through `Deploy.s.sol`** which
deploys impl + proxy + initialize atomically.

```powershell
cd "C:\Users\lcifuentes\Downloads\Ronin Waypoint Intent Aggregator (RWIA)\Ronin Waypoint Intent Aggregator (RWIA)\contracts"

# 1. (Optional) Run preflight to confirm env is sane
./scripts/preflight.ps1

# 2. Simulate (no broadcast)
$env:Path = "..\..\foundry_bin;$env:Path"
forge script script/Deploy.s.sol:Deploy --rpc-url ronin_mainnet -vvv

# 3. Broadcast for real (≈0.03 RON)
forge script script/Deploy.s.sol:Deploy `
    --rpc-url ronin_mainnet `
    --broadcast --slow -vvv

# 4. Note the proxy address from the logs:
#    IntentAggregator proxy: 0xNEW...
```

Then:

```powershell
# 5. Approve the NEW proxy on every NFT collection the keeper will sell
cast send 0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2 `
    "setApprovalForAll(address,bool)" 0xNEW... true `
    --rpc-url ronin_mainnet --private-key $env:PRIVATE_KEY

# 6. Update frontend
# In app/.env.local:
#   NEXT_PUBLIC_AGGREGATOR_ADDRESS=0xNEW...
# Restart the dev server.

# 7. Sanity-check via diagnose
curl "http://localhost:3000/api/diagnose?nftContract=0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2&tokenId=1"
# Expected: blockers == [] and ready == true
```

---

## Why this matters for the grant submission

When the Ronin grant committee reviews the project, they will look for:

1. **Transak integration possibility** — covered: adapter ships in
   `lib/payments/transak.ts`, register a key and you're live.
2. **Two-phase payment release** — covered: contract cannot be drained
   by replaying signatures because off-chain payment must clear first
   AND the on-chain replay guard (`executedIntents`) is independent.
3. **Webhook signature verification** — covered: every adapter MUST
   call `timingSafeEqual` on the PSP signature before mutating state.
4. **Easy provider swap** — covered: one env var
   (`RWIA_PAYMENT_PROVIDER`) selects the rail; no code change needed
   to switch from Mock to Transak to Stripe.
5. **No custodial fund flow on-chain** — covered: the contract never
   receives the user's fiat or tokens; it only records the intent's
   `amount` as an audit-only field.
