# Contract verification — Sourcify UI flow

> Ronin Explorer (`app.roninchain.com`) está protegido por Cloudflare y
> bloquea la verificación automática vía `forge verify-contract`. La forma
> oficialmente soportada por Sky Mavis es usar **Sourcify** — el explorer
> sincroniza con Sourcify y muestra la palomita verde una vez verificado.
>
> Esta carpeta contiene todo lo necesario para subir cada contrato. **No
> tenés que abrir ningún `.sol`** — los archivos `.standard-input.json` ya
> incluyen todas las sources del compilador.

---

## Por qué Sourcify, no Etherscan-style

Sourcify es un servicio open-source que:
1. Hashea el bytecode del contrato deployado en la chain.
2. Compila el código fuente que subís usando el `Standard JSON Input`.
3. Compara los dos hashes. Si matchean (incluyendo metadata IPFS),
   queda registrado como verificado.

Ronin Explorer lee este registro y muestra el código + ABI. No necesitás
tener una API key de Ronin ni atravesar Cloudflare.

---

## Archivos en esta carpeta

| Archivo | Para qué sirve |
|---|---|
| `IntentAggregator.standard-input.json` | Standard JSON Input del implementation (28 KB) |
| `IntentAggregator.metadata.json` | Metadata pura (alternativa, no usar si subís el standard-input) |
| `IntentAggregator.flat.sol` | Source flat (solo si Sourcify rechaza el standard-input) |
| `TimelockController.standard-input.json` | Standard JSON del Timelock de OZ |
| `TimelockController.metadata.json` | Metadata Timelock |
| `TimelockController.flat.sol` | Flat fallback |
| `ERC1967Proxy.standard-input.json` | Standard JSON del proxy de OZ |
| `ERC1967Proxy.metadata.json` | Metadata proxy |
| `ERC1967Proxy.flat.sol` | Flat fallback |

---

## Settings comunes (los 3 contratos)

| Setting | Valor |
|---|---|
| Compiler | **Solidity 0.8.24** (`0.8.24+commit.e11b9ed9`) |
| Optimizer | **enabled** |
| Optimizer runs | **200** |
| EVM Version | **cancun** |
| Metadata bytecode hash | **none** (no IPFS hash) |
| via_ir | **false** |

Estos vienen incluidos dentro del `standard-input.json`. Sourcify los lee
automáticamente — no tenés que escribirlos a mano.

---

## Flujo de verificación (5 min los 3 contratos)

### Paso 0 — Abrir Sourcify

Andá a <https://sourcify.dev/#/verifier>.

### Paso 1 — Seleccionar la chain

En el dropdown "Choose chain":

- Buscá **Ronin Mainnet** (chainId 2020) — está en la lista oficial de
  redes soportadas por Sourcify.

Si no aparece, Sourcify aún no incluyó Ronin Mainnet en su UI. En ese
caso, abre el formulario por chainId directamente:
```
https://sourcify.dev/#/verifier?chainId=2020
```

---

### Paso 2 — Verificar `IntentAggregator` (implementation)

1. **Contract Address**: `0x1e2cA35cc4CC6036FcCAac4B84F4825dA95e1479`
2. **Upload**: arrastrá **`IntentAggregator.standard-input.json`** a la
   zona de drop (es el JSON que contiene todo).
3. Click **Verify**.
4. Esperá 10-30 segundos. Resultado esperado:
   ```
   ✓ Verified (perfect match)
   ```

Si decis "partial match" en lugar de "perfect match", está bien también
— significa que el bytecode runtime matchea pero el metadata IPFS hash no
(porque deshabilitamos `bytecodeHash`). El explorer lo reconoce igual.

---

### Paso 3 — Verificar `TimelockController`

1. **Contract Address**: `0x7862E95164a9F5a9A87Ce9019fD73b6Fe3004123`
2. Upload **`TimelockController.standard-input.json`**.
3. Click **Verify**.

Si Sourcify ya tiene cacheado el bytecode de `TimelockController` de
OpenZeppelin (es probable porque mucha gente lo usa), va a matchearse
instantáneo.

---

### Paso 4 — Verificar `ERC1967Proxy`

1. **Contract Address**: `0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5`
2. Upload **`ERC1967Proxy.standard-input.json`**.
3. Click **Verify**.

**Importante**: al verificar el proxy, asegurate de que Ronin Explorer
te dé el botón **"Read as Proxy"** y **"Write as Proxy"**. Esto pasa
automáticamente cuando el explorer detecta el slot ERC-1967 +
implementation verificada (Paso 2).

---

## Verificación end-to-end

Después de los 3 pasos andá a:

<https://app.roninchain.com/address/0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5>

Deberías ver:

- ✓ Tab `Contract` con **palomita verde**.
- ✓ Botón **`Read as Proxy`** que muestra `hasRole`, `paused`,
  `isIntentExecuted`, `hashIntent`, `verifyIntentSignature`, etc.
- ✓ Botón **`Write as Proxy`** que te deja firmar funciones directamente
  desde el explorer.

Repetí el chequeo para las otras dos addresses (Timelock y Aggregator
impl).

---

## Si Sourcify rechaza el upload

### Causa A — "bytecode mismatch"

El bytecode on-chain no matchea con lo que Sourcify recompila.
Diagnóstico:

```powershell
# Vuelve a compilar localmente y compara el deployed bytecode hash
cd contracts
forge build --force
# El bytecode del implementation está en:
# out/IntentAggregator.sol/IntentAggregator.json (campo `deployedBytecode.object`)
```

Si compilás localmente y el bytecode runtime no matchea con lo que está
on-chain, el deploy se hizo con un compiler distinto. **No debería pasar**
en este repo porque el deploy fue justo ahora con el mismo Foundry.

### Causa B — Sourcify no acepta el JSON

Probá subir el **flat** en lugar del `.standard-input.json`:

1. En Sourcify, escogé "Single Solidity file".
2. Subí el `.flat.sol` correspondiente.
3. Especificá compiler `0.8.24`, optimizer `200`, EVM `cancun`.
4. Para `ERC1967Proxy` pegá los constructor args ABI-encoded sin `0x`:
   ```
   0000000000000000000000001e2ca35cc4cc6036fccaac4b84f4825da95e147900000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000064c0c53b8b0000000000000000000000003006c0eefbcdc8aff12d3d455376fd97d1266a5e0000000000000000000000007862e95164a9f5a9a87ce9019fd73b6fe30041230000000000000000000000003006c0eefbcdc8aff12d3d455376fd97d1266a5e00000000000000000000000000000000000000000000000000000000
   ```
5. Para `TimelockController`:
   ```
   000000000000000000000000000000000000000000000000000000000002a300000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000003006c0eefbcdc8aff12d3d455376fd97d1266a5e00000000000000000000000000000000000000000000000000000000000000010000000000000000000000003006c0eefbcdc8aff12d3d455376fd97d1266a5e00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000
   ```

### Causa C — Ronin Explorer no sincronizó con Sourcify

Sourcify dice "verified" pero el explorer no muestra la palomita:

1. Esperá 5-10 min — el explorer hace un poll periódico de Sourcify.
2. Si después de 30 min no aparece, abrí un ticket en
   <https://docs.skymavis.com/contact> con los hashes de tx + address.

---

## Regenerar los archivos (si los borrás)

Desde `contracts/`:

```powershell
$env:RONIN_API_KEY = 'dummy'   # forge requiere la var aunque no la use con --show-standard-json-input
forge verify-contract 0x1e2cA35cc4CC6036FcCAac4B84F4825dA95e1479 \
    src/IntentAggregator.sol:IntentAggregator \
    --chain 2020 --show-standard-json-input \
    > verify/IntentAggregator.standard-input.json

forge verify-contract 0x7862E95164a9F5a9A87Ce9019fD73b6Fe3004123 \
    lib/openzeppelin-contracts/contracts/governance/TimelockController.sol:TimelockController \
    --chain 2020 --show-standard-json-input \
    > verify/TimelockController.standard-input.json

forge verify-contract 0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5 \
    lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy \
    --chain 2020 --show-standard-json-input \
    > verify/ERC1967Proxy.standard-input.json
```

---

## Checklist final

Cuando termines, marcá cada uno:

- [ ] `0x1e2cA35cc4CC6036FcCAac4B84F4825dA95e1479` — IntentAggregator impl verificado
- [ ] `0x7862E95164a9F5a9A87Ce9019fD73b6Fe3004123` — TimelockController verificado
- [ ] `0x2D3E5B0dEE29eA5641e1b0Bce08a8A7C5fF82BE5` — ERC1967Proxy verificado
- [ ] Ronin Explorer muestra "Read as Proxy" + "Write as Proxy" en la proxy address
- [ ] Las 3 addresses tienen palomita verde en `app.roninchain.com`

Una vez los 5 verdes, el Integration Checklist del grant queda en
"Source code verified on Ronin Explorer" ✓.
