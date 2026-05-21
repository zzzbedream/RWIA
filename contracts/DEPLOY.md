# Deploy & Verify — Ronin Saigon Testnet

## 0. Prerequisites

* Foundry installed (`forge`, `cast`, `anvil`)
* A funded deployer wallet on Ronin Saigon (faucet:
  <https://faucet.roninchain.com>)
* CCIP Router address for Ronin Saigon — confirm in the Chainlink CCIP
  directory before broadcasting:
  <https://docs.chain.link/ccip/supported-networks>

## 1. Configure environment

```bash
cd contracts
cp .env.example .env
$EDITOR .env
```

Required:

| Var                       | Notes                                                        |
| ------------------------- | ------------------------------------------------------------ |
| `PRIVATE_KEY`             | Deployer EOA (or use `--account` keystore for production)    |
| `ADMIN_ADDRESS`           | Multisig recommended. Gets DEFAULT_ADMIN + ADMIN roles       |
| `UPGRADER_ADDRESS`        | Should be a separate multisig with timelock                  |
| `KEEPER_ADDRESS`          | Off-chain bot signer (KEEPER_ROLE on aggregator)             |
| `RECOVERY_ADDRESS`        | Operator who can recover/drop DLQ entries                    |
| `CCIP_ROUTER_ADDRESS`     | Chainlink CCIP Router on the deploy chain                    |
| `RONIN_SAIGON_RPC_URL`    | Default: `https://saigon-testnet.roninchain.com/rpc`         |
| `RONIN_API_KEY`           | Block explorer API key for `--verify`                        |

## 2. Sanity test against a local fork

```bash
anvil --fork-url $RONIN_SAIGON_RPC_URL --chain-id 202601 &
forge script script/Deploy.s.sol:Deploy --rpc-url http://localhost:8545 \
    --broadcast --unlocked --sender $ADMIN_ADDRESS
```

## 3. Broadcast to Saigon

```bash
forge script script/Deploy.s.sol:Deploy \
    --rpc-url ronin_saigon \
    --broadcast \
    --verify \
    --slow \
    -vvvv
```

The script prints the proxy addresses for `IntentAggregator` and
`IntentDLQ`. Capture them — they go into:

* `app/.env.local` → `NEXT_PUBLIC_AGGREGATOR_ADDRESS`
* `keeper/.env`    → `AGGREGATOR_ADDRESS`, `DLQ_ADDRESS`
* The on-call runbook.

## 4. Post-deploy wiring

```bash
# allow each destination CCIP chain selector (example: Sepolia)
cast send $AGGREGATOR_ADDRESS "setDestChainAllowed(uint64,bool)" \
    16015286601757825753 true \
    --rpc-url ronin_saigon --account admin

# allow inbound senders (ABI-encoded address from the source chain)
cast send $AGGREGATOR_ADDRESS \
    "setSrcSenderAllowed(uint64,bytes,bool)" \
    16015286601757825753 0x000...000<sender20bytes-padded> true \
    --rpc-url ronin_saigon --account admin
```

## 5. Monitoring

* Run the keeper: `cd keeper && AGGREGATOR_ADDRESS=… DLQ_ADDRESS=… npm start`
* Alert on `IntentParked` events (`IntentDLQ.Parked(...)`)
* Snapshot gas baseline: `forge snapshot --diff` in CI

## 6. Incident plan

1. `pause()` aggregator via ADMIN multisig
2. Triage DLQ entries via `RECOVERY_ROLE`
3. If a bug requires an upgrade: prepare the new implementation, run
   `forge test` and storage-layout diff, then `upgradeToAndCall`
   from the UPGRADER multisig (timelock-gated)
4. Post-mortem in `incidents/<date>-<slug>.md`
