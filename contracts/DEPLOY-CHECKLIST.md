# RWIA V1 Deploy Checklist — Ronin Mainnet

> Workflow para deployar V1 (NFT-delivery nativo). **Nunca pegues tu
> PRIVATE_KEY ni KEEPER_PRIVATE_KEY en chat ni la subas a git.**
>
> Para entender QUÉ es lo que se despliega y cómo lo usa un usuario final,
> lee primero [`HOW-IT-WORKS.md`](../HOW-IT-WORKS.md) en la raíz.

---

## Estado actual del deployment (Ronin Mainnet, chainId 2020)

| Pieza                | Dirección                                     | Status        |
| -------------------- | --------------------------------------------- | ------------- |
| IntentAggregator     | `0x482816C756893a813A82aa8CEc979F15101a4e18`  | ✅ live       |
| TestNFT              | `0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2`  | ✅ live, 5 NFTs minteados al Keeper |
| Keeper EOA           | `0x3006c0EefbCdC8AFF12D3D455376FD97d1266A5e`  | ✅ `setApprovalForAll(IntentAggregator, true)` granted |

Próximos contratos a registrar aquí cuando los despliegues: TimelockController.

---

## 0. Pre-requisitos

- [ ] Wallet en Ronin Mainnet con saldo RON
- [ ] Foundry instalado (`forge --version` ≥ 1.7.1)
- [ ] Git long-paths habilitado: `git config --global core.longpaths true`
- [ ] `contracts/lib/` poblado (forge-std, openzeppelin-contracts,
      openzeppelin-contracts-upgradeable)

## 1. `.env`

```powershell
cd "C:\Users\lcifuentes\Downloads\Ronin Waypoint Intent Aggregator (RWIA)\Ronin Waypoint Intent Aggregator (RWIA)\contracts"
copy .env.example .env
notepad .env
```

| Variable                  | Valor | Notas |
|---|---|---|
| `PRIVATE_KEY`             | `0x…` | Deployer EOA. Nunca en chat. |
| `ADMIN_ADDRESS`           | `0x…` | Wallet admin (testnet) o multisig (mainnet). |
| `KEEPER_ADDRESS`          | `0x…` | Wallet del bot Keeper. Tendrá `KEEPER_ROLE`. |
| `TIMELOCK_DELAY_SECONDS`  | `86400` testnet · `172800` mainnet | 1d / 2d. |
| `RONIN_MAINNET_RPC_URL`   | `https://api.roninchain.com/rpc` | Default OK. |
| `RONIN_API_KEY`           | (opcional) | Para `--verify`. |

> El script V1 ya no necesita `CCIP_ROUTER_ADDRESS`. El TimelockController
> se despliega automáticamente y recibe `UPGRADER_ROLE`.

## 2. Preflight

```powershell
cd contracts
./scripts/preflight.ps1
```

Esperado: forge fmt OK · build OK · 18 tests pass · RPC reachable · deployer ≥ 0.1 RON.

## 3. Simulación (sin broadcast)

```powershell
forge script script/Deploy.s.sol:Deploy --rpc-url ronin_mainnet -vvv
```

Verifica direcciones proyectadas. No gasta gas.

## 4. Broadcast + verificación

```powershell
forge script script/Deploy.s.sol:Deploy `
    --rpc-url ronin_mainnet `
    --broadcast `
    --verify `
    --slow `
    -vvv
```

Output esperado:

```
TimelockController:     0x...
IntentAggregator impl:  0x...
IntentAggregator proxy: 0x...   ← apunta TODO el frontend a este
Admin:                  0x...
Keeper:                 0x...
Timelock delay (s):     172800
```

## 5. Post-deploy wiring

Por cada colección NFT que el Keeper va a vender, ejecuta desde la
wallet del Keeper:

```powershell
# Una vez por colección
cast send <NFT_CONTRACT> `
    "setApprovalForAll(address,bool)" <AGGREGATOR_PROXY> true `
    --rpc-url ronin_mainnet `
    --private-key $env:KEEPER_PRIVATE_KEY
```

Sin esta aprobación, `executeLocalIntent` revierte en `safeTransferFrom`.

## 6. Configurar frontend + relayer

`app/.env.local`:

```
NEXT_PUBLIC_AGGREGATOR_ADDRESS=<AGGREGATOR_PROXY>
NEXT_PUBLIC_DEFAULT_CHAIN_ID=2020
NEXT_PUBLIC_DEFAULT_PAYMENT_TOKEN=0xe514d9DEB7966c8BE0ca922de8a064264eA6bcd4   # WRON mainnet
NEXT_PUBLIC_DEFAULT_PAYMENT_DECIMALS=18

# Server-side relayer (no NEXT_PUBLIC_ prefix)
KEEPER_PRIVATE_KEY=0x...    # Wallet del Keeper que paga gas
RELAYER_CHAIN_ID=2020
```

Lanzar:

```powershell
cd ..\app
npm install
npm run dev    # http://localhost:3000
```

> **Importante:** después de tocar `.env.local` reinicia el dev server
> (Ctrl+C + `npm run dev`). Next.js no recarga env vars en caliente.

## 7. Health check del relayer

```powershell
curl http://localhost:3000/api/health
```

Esperado:

```json
{"ready":true,"chainId":2020,"aggregator":"0x4828…","keeperAddress":"0x3006…"}
```

Si responde 503, faltan `KEEPER_PRIVATE_KEY` o `NEXT_PUBLIC_AGGREGATOR_ADDRESS`.

## 8. Smoke test end-to-end

Sigue los pasos del **bloque "Smoke test"** en
[`HOW-IT-WORKS.md`](../HOW-IT-WORKS.md#smoke-test--end-to-end-en-5-minutos)
— ahí está el flujo completo con valores reales del deployment actual.

## 9. Después del deploy

- [ ] Anota TimelockController + nuevas direcciones en `README.md`
- [ ] Anota direcciones en `ecosystem/ronin-directory.json`
- [ ] Verifica los contratos en el explorer si no usaste `--verify`
- [ ] Rota la clave Keeper si fue generada solo para el setup inicial
- [ ] Borra/encripta cualquier `.env` o `.env.local` que tenga claves de producción

---

## Troubleshooting

**`Provided chainId "X" must match the active chainId "Y"`**
La wallet está en una chain distinta a la del contrato. El `ConnectWallet`
muestra un botón "Switch to Ronin Mainnet" — úsalo, o cambia
`NEXT_PUBLIC_DEFAULT_CHAIN_ID` para que coincida con la chain del wallet.

**`ERC721InsufficientApproval` en simulate**
El Keeper no aprobó la colección. Ejecuta el `setApprovalForAll` del paso 5.

**`ERC721NonexistentToken`**
El Keeper no es dueño de ese tokenId. Mintea/transfiere antes de re-intentar.

**`IntentAlreadyExecuted`**
Esa firma ya se gastó. El user debe firmar otra (cambiando el `nonce`).

**`IntentExpired`**
Pasó el deadline. El user debe firmar otra con deadline futuro.

**Cambios en `.env.local` no surten efecto**
Reinicia el dev server. Next.js cachea env vars al boot.
