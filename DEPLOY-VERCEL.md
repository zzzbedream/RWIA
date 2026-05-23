# Vercel deploy — paso a paso

> 10 minutos. Hace falta tener: una cuenta GitHub conectada a Vercel, el
> repo `zzzbedream/RWIA` ya en GitHub (✅ hecho), y Supabase ya con las
> migrations aplicadas (paso anterior).

---

## 1. Conectar el repo a Vercel

1. Andá a <https://vercel.com/new>
2. Si no tenés cuenta: click **"Sign Up"** → "Continue with GitHub"
3. En la pantalla de import: buscá **`RWIA`** en tu lista de repos
4. Click **"Import"**

---

## 2. Configurar el proyecto

Vercel te muestra una pantalla de config. **Crítico:**

### Framework Preset
Auto-detect debería poner **Next.js**. Si no, seleccionalo manualmente.

### Root Directory
Por default Vercel intenta usar la raíz del repo, pero nuestro frontend
vive en `app/`. Click **"Edit"** al lado de "Root Directory" y poné:
```
app
```

### Build & Output Settings
Dejá los defaults (Next.js detectado):
- Build Command: `npm run build`
- Output Directory: `.next`
- Install Command: `npm install`

### Node version
Si te pregunta, **Node 20.x**.

---

## 3. Environment Variables — la parte importante

Click **"Environment Variables"** (sección abajo del form, expandible).

Vas a agregar **15 variables**. Copiá y pegá una por una.

### A. Públicas (con prefijo `NEXT_PUBLIC_`, seguras para el browser)

| Name | Value |
|---|---|
| `NEXT_PUBLIC_AGGREGATOR_ADDRESS` | `0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5` |
| `NEXT_PUBLIC_DEFAULT_CHAIN_ID` | `2020` |
| `NEXT_PUBLIC_DEFAULT_PAYMENT_TOKEN` | `0xe514d9DEB7966c8BE0ca922de8a064264eA6bcd4` |
| `NEXT_PUBLIC_DEFAULT_PAYMENT_DECIMALS` | `18` |
| `NEXT_PUBLIC_APP_URL` | `https://rwia.vercel.app` *(o el dominio que te dé Vercel; lo actualizás después)* |
| `NEXT_PUBLIC_INDEXER_MAX_LAG_BLOCKS` | `50` |

### B. Server-side (sin prefijo, NUNCA expuestas al browser)

| Name | Value | Notas |
|---|---|---|
| `KEEPER_PRIVATE_KEY` | `<el 0x... del Keeper EOA>` | Tu Keeper (el que ya tiene los NFTs + approval). NO commitearla — copiala desde `contracts/.env` |
| `RELAYER_CHAIN_ID` | `2020` | |
| `RELAYER_AGGREGATOR_ADDRESS` | `0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5` | |
| `SUPABASE_URL` | `https://<tu-ref>.supabase.co` | El que viste en Supabase → Settings → API |
| `SUPABASE_SECRET_KEY` | `<el secret nuevo que rotaste>` | **NO el publishable**. El `sb_secret_…` que generaste recién |
| `RWIA_JOB_STORE` | `supabase` | Activa el "Mundo 2" persistente |
| `RWIA_PAYMENT_PROVIDER` | `mock` | Por ahora; luego cambiás a `transak` |
| `RWIA_REQUIRE_PAYMENT` | `false` | Por ahora — ejecuta sin esperar webhook. Cambiás a `true` cuando wires Transak |
| `RWIA_KEEPER_HEALTHY_RON` | `1.0` | Threshold para `/api/health` |
| `RWIA_KEEPER_CRITICAL_RON` | `0.1` | |

### C. Opcional (Ronin Waypoint social login)

Si tenés un client ID de Sky Mavis Developer Portal:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_WAYPOINT_CLIENT_ID` | `<tu client id>` |

Sin esto, el botón "Connect wallet" igual funciona con Ronin Wallet + MetaMask + Browser Wallet.

---

## 4. Click "Deploy"

Vercel va a:
1. Clonar el repo
2. Correr `npm install` (toma ~1 minuto)
3. Correr `npm run build` (toma ~30 segundos)
4. Deployar

**Esperado**: pantalla verde con "Congratulations 🎉" + URL pública tipo `https://rwia-<hash>.vercel.app`.

### Si el build falla

Causas típicas:
- **"Module not found: @supabase/supabase-js"** → falló el `npm install`. Click "Redeploy" y debería andar.
- **"Type error: …"** → algo no se commiteó. Verificá `git status` local.
- **"Environment variable required"** → falta una env var. Volvé a Settings → Environment Variables y revisá.

Cualquier otro error: copiá el log y me lo pasás.

---

## 5. Después del primer deploy exitoso

### 5.1 Actualizar `NEXT_PUBLIC_APP_URL` al dominio real

Vercel te dió una URL tipo `rwia-abc123.vercel.app`. Andá a:
- Vercel → tu proyecto → **Settings** → **Environment Variables**
- Editá `NEXT_PUBLIC_APP_URL` y poné `https://<la URL real que te dió>.vercel.app`
- **Redeploy** (Vercel → Deployments → último → menú `⋯` → Redeploy)

### 5.2 Verificar que todo arrancó OK

Abrí en tu navegador:

```
https://<tu-dominio>.vercel.app/api/health
```

Esperado:
```json
{
  "ready": true,
  "status": "ok",
  "chainId": 2020,
  "aggregator": "0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5",
  "shards": 1,
  "keepers": [{"address": "0x3006c0…", "balanceRON": 75.x, "status": "ok"}]
}
```

Si responde `503` con `"missing": "..."` → falta una env var. Revisá.

### 5.3 Verificar Supabase conectado

```
https://<tu-dominio>.vercel.app/api/diagnose?nftContract=0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2&tokenId=3
```

Esperado: `"ready": true, "blockers": []`.

Si funciona, el frontend está conectado correctamente a la chain.

---

## 6. Smoke test desde el navegador (manual)

1. Abrí `https://<tu-dominio>.vercel.app/app`
2. Conectá tu Ronin Wallet (creá una secundaria si querés simular un buyer nuevo)
3. **NFT contract**: `0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2`
4. **Token id**: `3` (1 ya lo entregamos al script E2E; 2-5 disponibles)
5. **Amount**: 1
6. Review & sign → firma en wallet
7. La UI va a mostrar progress → confirmed con tx link

8. **Verificá en Supabase**:
   - Supabase Dashboard → Table Editor → `intents`
   - Debe aparecer una fila con tu intent (status: `confirmed`, tx_hash, etc.)
   - Esto prueba el "Mundo 2" funcionando end-to-end ✅

---

## 7. (Opcional) Configurar dominio custom

Vercel te permite agregar un dominio tipo `rwia.vertsun.io`:

- Settings → Domains → Add Domain
- Te da DNS records para configurar en tu proveedor
- Tras propagación (~5 min), todo apunta al nuevo dominio

Esto solo importa para el grant submission (URL más limpia que `rwia-abc123.vercel.app`).

---

## Listo

Cuando esté arriba y `/api/health` responde 200, avísame y arrancamos
con el smoke test E2E + el script del video demo.
