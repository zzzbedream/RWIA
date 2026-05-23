# RWIA Subgraph (Goldsky / The Graph)

Indexes `IntentExecuted`, `Paused`/`Unpaused`, and `RoleGranted`/`RoleRevoked`
events from the IntentAggregator proxy. Decouples the frontend from raw
RPC reads — instead of polling the chain for the buyer's NFT, the UI
queries the subgraph by `user` address and gets paginated results.

## Why this exists

Calling `pc.readContract({functionName: "ownerOf"})` and `getLogs` for
every intent is O(intents × users). At scale (>100 intents/min) the
public RPC will throttle you. A subgraph turns it into O(1) read by
GraphQL query.

## Deploy to Goldsky (recommended — Goldsky natively supports Ronin)

```bash
npm install -g @goldskycom/cli
goldsky login
cd indexer
goldsky subgraph deploy rwia/v1 --path .
```

## Deploy to The Graph (Hosted Service / Decentralized)

```bash
npm install -g @graphprotocol/graph-cli
cd indexer
graph init --product hosted-service --from-contract 0x2D3E5B... \
    --network ronin <your-username>/rwia
graph deploy --product hosted-service <your-username>/rwia
```

## Files

| Path                     | Purpose                                                  |
| ------------------------ | -------------------------------------------------------- |
| `subgraph.yaml`          | Manifest — data sources, ABIs, event handlers            |
| `schema.graphql`         | Entity types (IntentExecuted, DailyVolume, KeeperStats…) |
| `mappings/aggregator.ts` | AssemblyScript handlers that translate events → entities |
| `abis/`                  | Will be generated from `contracts/out/` (run `forge build` first) |

## Example queries

Recent intents for a buyer:

```graphql
{
    intentExecuteds(
        first: 25
        where: {user: "0x..."}
        orderBy: blockTimestamp
        orderDirection: desc
    ) {
        intentHash
        nftContract
        tokenId
        keeper
        transactionHash
        blockTimestamp
    }
}
```

Daily volume for ops dashboard:

```graphql
{
    dailyVolumes(first: 30, orderBy: date, orderDirection: desc) {
        date
        intentCount
        totalAmount
    }
}
```

Keeper utilization (which shard does the work):

```graphql
{
    keeperStats(orderBy: intentsExecuted, orderDirection: desc) {
        id
        intentsExecuted
        lastSeenAt
    }
}
```

## Wiring to the frontend

In `app/.env.local`:

```
NEXT_PUBLIC_SUBGRAPH_URL=https://api.goldsky.com/api/public/.../rwia/gn
```

Then the React layer queries the subgraph instead of going to the RPC —
the diagnostic endpoint stays for ops, but the user-facing data lives
behind the GraphQL gateway.
