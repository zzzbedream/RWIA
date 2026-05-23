# RWIA — Demo Runbook (Smoke + Loom)

Te guía paso a paso para:
1. **Smoke test** end-to-end contra producción (NFT #3, antes de grabar).
2. **Loom de 2 min** para el form del grant (NFT #4).
3. **NFT #5** queda de reserva si necesitas retry.

Todo apunta a la prod deployada en Vercel:
`https://ronin-waypoint-intent-aggregator-rw.vercel.app`

---

## 0. Pre-flight (verifica ANTES de tocar nada — 30s)

Abrí en una terminal:

```powershell
curl -s https://ronin-waypoint-intent-aggregator-rw.vercel.app/api/health
```

Tiene que devolver:
- `"ready": true`
- `"status": "ok"`
- `"chainId": 2020`
- Keeper balance > 1 RON

Si algo falla acá, **no grabes** — primero arreglemos el health.

---

## 1. Smoke test (NFT #3 — pre-demo)

> Objetivo: validar que el flujo completo funciona END-TO-END antes del
> demo. Si esto pasa, el video va a salir limpio.

**Direcciones que necesitas:**
- `nftContract`: `0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2`
- `tokenId`: **`3`**
- `tokenAddress` (WRON, pago): `0xe514d9DEB7966c8BE0ca922de8a064264eA6bcd4`

### Paso 1.1 — Abrir la app

Navegá a:
```
https://ronin-waypoint-intent-aggregator-rw.vercel.app/app
```

### Paso 1.2 — Conectar Ronin Wallet

Click **"Ronin Wallet"** (NO "Browser Wallet" — la opción Ronin es la primera).

Aprobá la conexión en la extensión Ronin. **Usá una wallet que no sea la del Keeper**.

### Paso 1.3 — Verificar chain

Arriba a la derecha tiene que decir **"Ronin Mainnet"** (chainId 2020). Si dice otra cosa, cambiá la red en Ronin Wallet.

### Paso 1.4 — Llenar el form

| Campo | Valor |
|---|---|
| Recipient | (auto-fill con tu address) |
| NFT contract | `0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2` |
| Token ID | `3` |
| Payment token | `0xe514d9DEB7966c8BE0ca922de8a064264eA6bcd4` (WRON) |
| Amount | `1` (1 WRON, off-chain mock) |
| Deadline | Por defecto (1h) |

### Paso 1.5 — Review & sign

Click **"Review & sign"** → revisás los datos → click **"Sign in wallet"**.

Ronin Wallet pide firma EIP-712 — **aprobás, NO pagás gas** (es solo firma).

### Paso 1.6 — Observar el job

Aparece una card con `jobId` + status. El status va a evolucionar:
- `validating` → `pending` → `executing` → `confirmed` ✅

(Pasa por validate signature → simulate → broadcast → confirm.)

### Paso 1.7 — Verificar en explorer

Click el `tx hash` que aparece en verde. Se abre Ronin Explorer.

En la pestaña **Logs**, buscá el evento **`IntentExecuted`** con:
- `user` = tu address
- `tokenId` = `3`

### Paso 1.8 — Verificar ownership

```powershell
curl -s "https://ronin-waypoint-intent-aggregator-rw.vercel.app/api/diagnose?nftContract=0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2&tokenId=3"
```

`ownerOf` debería ser **tu address** (no la del Keeper).

✅ **Smoke PASS** — listo para grabar.

---

## 2. Loom Demo (NFT #4 — el video del grant)

> Objetivo: grabar 2 minutos limpios mostrando el flujo, con narración.

### Setup ANTES de hacer click en "Record" en Loom

1. Cerrá todas las tabs que no son la app
2. Abrí **2 tabs**:
   - Tab A: `https://ronin-waypoint-intent-aggregator-rw.vercel.app/app`
   - Tab B: `https://app.roninchain.com/address/0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5` (para mostrar el contrato al final)
3. Tené Ronin Wallet ya conectado (skip el paso de conexión en el video — perdés 15s)
4. Pre-cargá los datos del form (NFT contract + tokenId 4) pero NO firmes todavía
5. Limpiá el escritorio de notifications

### Direcciones para el demo

| Campo | Valor |
|---|---|
| nftContract | `0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2` |
| tokenId | **`4`** |
| tokenAddress (WRON) | `0xe514d9DEB7966c8BE0ca922de8a064264eA6bcd4` |
| amount | `1` |

### Script narrado (2 min — léelo de cabeza, no del papel)

**[00:00 — 00:15] Hook (15s)**

> "Hola, soy Lucas. Construí RWIA, el primer rail de fiat-checkout para
> NFTs nativo en Ronin Mainnet. Lo que un nuevo usuario necesitaba — 5
> pasos, instalar wallet, fondear RON, swapear tokens, aprobar, firmar y
> pagar gas — lo reducimos a UNO: firmar un mensaje. Te muestro."

**[00:15 — 00:25] Setup (10s)**

Pantalla en Tab A.

> "Esta es la app, deployada en producción contra Ronin Mainnet. Esta
> wallet que tengo conectada está vacía — cero RON, cero tokens. Cualquier
> usuario nuevo puede llegar acá."

**[00:25 — 00:55] Firmar (30s)**

> "Voy a comprar el TestNFT id 4 — el Keeper tiene el inventario, yo
> solo firmo un mensaje EIP-712. Pago un peso simbólico en WRON solo
> como referencia off-chain."
>
> *(Click Review & sign → Sign in wallet → wallet popup → firmás → cerrás popup)*
>
> "Listo, firmé. NO pagué gas. El Keeper se hace cargo de todo lo demás."

**[00:55 — 01:25] Procesamiento (30s)**

> "El backend valida la firma, simula la transacción contra el contrato
> para verificar que va a pasar, hace broadcast, y confirma. Pasa en
> menos de 10 segundos. Ven el spinner cambiando de fase."
>
> *(Esperás a que el status pase a `confirmed`. Si va lento por mainnet,
> filler: hablás del DLQ, del shardado, de los pre-flight checks.)*
>
> "Listo. Status confirmed. Tengo el tx hash."

**[01:25 — 01:45] Verificación on-chain (20s)**

> *(Click el tx hash → abre Ronin Explorer)*
>
> "Acá está la transacción en Ronin Explorer. El evento IntentExecuted
> registra mi address como buyer, el tokenId 4, y el Keeper que la
> ejecutó. La NFT ya está en mi wallet. Sin RON. Sin gas. Sin instalar
> nada nuevo. Un mensaje firmado."

**[01:45 — 02:00] Cierre + ask (15s)**

> *(Tab B — Ronin Explorer del contrato)*
>
> "Esto que vieron es un contrato UUPS upgradeable con timelock de 7
> días, governance multi-rol, 19 tests Foundry incluyendo invariantes,
> CI con Slither, y stack completo open-source en MIT. El repo está en
> github.com/zzzbedream/RWIA. El grant nos permite escalar a 4 keepers,
> integrar Transak en producción, y onboardear 3 colecciones piloto.
> Gracias."

### Pro-tips para Loom

- Usa **face cam pequeña en esquina** (más cercano = más confianza)
- Hablá rápido pero con pausas — no monotone
- Si te equivocás, **NO** corte y reanudes — borrá la grabación y empezá
- 1080p mínimo, audio sin eco (auriculares ayudan)
- Después de grabar, ponele título: **"RWIA — Fiat checkout for Ronin NFTs (2 min demo)"**

---

## 3. NFT #5 (Reserve)

Si el smoke (NFT #3) o el demo (NFT #4) fallan por cualquier razón —
red lenta, wallet rechaza, lo que sea — usá #5 como retry sin cambiar
nada más.

Si igual no funciona después de #5, ping el `/api/health` y revisá si:
- Keeper se quedó sin RON (necesita > 1 RON)
- Supabase tiró un error transient (DLQ vacío implica está ok)

---

## 4. Checklist final post-grabado

- [ ] Smoke test (#3) pasó: NFT en mi wallet
- [ ] Loom grabado (#4) ≤ 2 min, mp4 < 100MB
- [ ] Tx hashes anotados:
  - Smoke: `0x_______________`
  - Demo: `0x_______________`
- [ ] Loom URL copiada al portapapeles
- [ ] Form del grant abierto en otra tab
- [ ] `GRANT-SUBMISSION.md` abierto al lado para copy-paste

Cuando estos 6 están verdes, submit. ✅
