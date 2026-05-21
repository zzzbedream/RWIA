# Deploy IntentAggregator V1 — Ronin Mainnet

## Pre-requisitos

1. **Wallet con RON** en Mainnet (~0.2 RON mínimo para deploy)
2. **`contracts/.env`** configurado con:
   - `PRIVATE_KEY` — PK del deployer (con fondos RON)
   - `ADMIN_ADDRESS` — Address que recibirá `ADMIN_ROLE` (recomendado: multi-sig)
   - `KEEPER_ADDRESS` — Address que recibirá `KEEPER_ROLE` (operador)
   - `RECOVERY_ADDRESS` — Timelock admin
   - `RONIN_MAINNET_RPC_URL=https://api.roninchain.com/rpc`
   - `RONIN_API_KEY` — Para verificación en explorer

## ✅ EVM Compatibility

Ronin Mainnet soporta **Cancun** opcodes (incl. `mcopy`, `PUSH0`).
`foundry.toml` usa `evm_version = "cancun"` — **NO cambiar a "paris"** (rompe OpenZeppelin).

---

## Comandos de Deploy

### 1. Dry-run (simulación — no envía transacciones)

```powershell
cd contracts
forge script script/Deploy.s.sol --rpc-url ronin_mainnet --ffi
```

Verificar que:
- ✅ `Script ran successfully`
- ✅ Gas estimado < 0.5 RON
- ✅ Addresses correctas en logs

### 2. Deploy Real (broadcast a Mainnet)

```powershell
forge script script/Deploy.s.sol --rpc-url ronin_mainnet --broadcast --private-key $env:PRIVATE_KEY --ffi
```

> **Nota:** En PowerShell, `$env:PRIVATE_KEY` lee la variable de entorno.
> Alternativa: `--private-key %PRIVATE_KEY%` en CMD.

Esto despliega 3 contratos:
1. **TimelockController** — Gobernanza de upgrades
2. **IntentAggregator Implementation** — Lógica del contrato
3. **ERC1967Proxy** — Proxy apuntando a la implementación

Guardar las direcciones del output:
```
TimelockController:      0x...
IntentAggregator impl:   0x...
IntentAggregator proxy:  0x...   ← Esta es la dirección principal
```

### 3. Verificar en el Explorer

```powershell
# Verificar implementación
forge verify-contract <IMPL_ADDRESS> src/IntentAggregator.sol:IntentAggregator --rpc-url ronin_mainnet --verifier ronin_mainnet --watch

# Verificar proxy (si es necesario)
forge verify-contract <PROXY_ADDRESS> lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy --rpc-url ronin_mainnet --verifier ronin_mainnet --watch

# Verificar TimelockController
forge verify-contract <TIMELOCK_ADDRESS> lib/openzeppelin-contracts/contracts/governance/TimelockController.sol:TimelockController --rpc-url ronin_mainnet --verifier ronin_mainnet --watch --constructor-args $(cast abi-encode "constructor(uint256,address[],address[],address)" 172800 '["<ADMIN>"]' '["0x0000000000000000000000000000000000000000"]' "<ADMIN>")
```

### 4. Confirmar en el Explorer

Abrir https://app.roninchain.com y buscar:
- Proxy address → debe mostrar contrato verificado
- Verificar que `admin()` retorna tu `ADMIN_ADDRESS`
- Verificar que `keeper()` retorna tu `KEEPER_ADDRESS`

### 5. Post-Deploy — Actualizar Frontend

Después del deploy exitoso, actualizar `app/.env.local`:

```env
NEXT_PUBLIC_AGGREGATOR_ADDRESS=<PROXY_ADDRESS>
NEXT_PUBLIC_DEFAULT_CHAIN_ID=2020
KEEPER_PRIVATE_KEY=<KEEPER_PK>
RELAYER_CHAIN_ID=2020
```

---

## Rollback (si algo sale mal)

El contrato está detrás de un proxy UUPS + Timelock. Para upgrades:

```solidity
// Nuevas implementaciones se deployan y se schedulean a través del Timelock
// con el delay configurado (172800 segundos = 2 días)
```

Si el deploy falla completamente (revert on-chain), las direcciones no se registran y puedes re-ejecutar el script.

---

## Direcciones de Mainnet ✅ DEPLOYADO Block #55790568

| Contrato | Address | TX Hash |
|---|---|---|
| IntentAggregator Proxy | `0x482816C756893a813A82aa8CEc979F15101a4e18` | `0x567055f4...` |
| IntentAggregator Impl | `0xdAE948fd379C82552023f53b7A66091710f95f3a` | `0x07629c67...` |
| TimelockController | `0xa2Ab4fDd41d881b5598037536fA5496100881C9D` | `0xa3794c49...` |
| Deployer | `0x3006c0EefbCdC8AFF12D3D455376FD97d1266A5e` | |
| Admin | `0x3006c0EefbCdC8AFF12D3D455376FD97d1266A5e` | |
| Keeper | `0x3006c0EefbCdC8AFF12D3D455376FD97d1266A5e` | |

**Gas total: 0.0755 RON**

---

## Verificación en Blockscout (Manual - Flattened)

Archivos generados en `contracts/`:

| Archivo | Para contrato |
|---|---|
| `IntentAggregator_flattened.sol` (223 KB) | `0xdAE948fd379C82552023f53b7A66091710f95f3a` |
| `ERC1967Proxy_flattened.sol` (31 KB) | `0x482816C756893a813A82aa8CEc979F15101a4e18` |
| `TimelockController_flattened.sol` (49 KB) | `0xa2Ab4fDd41d881b5598037536fA5496100881C9D` |

### Pasos para cada contrato:
1. Ir a https://app.roninchain.com/address/`<ADDRESS>` → **Verify & Publish**
2. Método: **Solidity (Single part)**
3. Compiler: **0.8.24**
4. Optimization: **Yes**, runs: **200**
5. License: **MIT**
6. Abrir el archivo `.sol` correspondiente, copiar TODO el contenido, pegar
7. Submit
