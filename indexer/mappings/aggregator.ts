// AssemblyScript mapping for The Graph / Goldsky subgraph.
// Indexes events emitted by IntentAggregator + inherited AccessControl /
// Pausable so the frontend can read fast aggregated data without hitting
// the RPC directly.

import {Bytes, BigInt, log} from "@graphprotocol/graph-ts";
import {
    IntentExecuted as IntentExecutedEvent,
    Paused as PausedEvent,
    Unpaused as UnpausedEvent,
    RoleGranted as RoleGrantedEvent,
    RoleRevoked as RoleRevokedEvent,
} from "../generated/IntentAggregator/IntentAggregator";
import {
    IntentExecuted,
    PauseEvent,
    RoleAssignment,
    DailyVolume,
    KeeperStats,
} from "../generated/schema";

export function handleIntentExecuted(event: IntentExecutedEvent): void {
    const id = event.transaction.hash.concatI32(event.logIndex.toI32());
    const e = new IntentExecuted(id);
    e.intentHash = event.params.intentHash;
    e.user = event.params.user;
    e.nftContract = event.params.nftContract;
    e.tokenId = event.params.tokenId;
    e.tokenAddress = event.params.tokenAddress;
    e.amount = event.params.amount;
    e.keeper = event.params.keeper;
    e.blockNumber = event.block.number;
    e.blockTimestamp = event.block.timestamp;
    e.transactionHash = event.transaction.hash;
    e.save();

    // Daily aggregate
    const day = dayKey(event.block.timestamp);
    let daily = DailyVolume.load(day);
    if (daily == null) {
        daily = new DailyVolume(day);
        daily.date = day;
        daily.intentCount = BigInt.zero();
        daily.totalAmount = BigInt.zero();
    }
    daily.intentCount = daily.intentCount.plus(BigInt.fromI32(1));
    daily.totalAmount = daily.totalAmount.plus(event.params.amount);
    daily.save();

    // Keeper attribution
    let ks = KeeperStats.load(event.params.keeper);
    if (ks == null) {
        ks = new KeeperStats(event.params.keeper);
        ks.intentsExecuted = BigInt.zero();
    }
    ks.intentsExecuted = ks.intentsExecuted.plus(BigInt.fromI32(1));
    ks.lastSeenAt = event.block.timestamp;
    ks.save();
}

export function handlePaused(event: PausedEvent): void {
    const id = event.transaction.hash.concatI32(event.logIndex.toI32());
    const e = new PauseEvent(id);
    e.kind = "Paused";
    e.account = event.params.account;
    e.blockNumber = event.block.number;
    e.blockTimestamp = event.block.timestamp;
    e.save();
    log.warning("Aggregator paused by {}", [event.params.account.toHexString()]);
}

export function handleUnpaused(event: UnpausedEvent): void {
    const id = event.transaction.hash.concatI32(event.logIndex.toI32());
    const e = new PauseEvent(id);
    e.kind = "Unpaused";
    e.account = event.params.account;
    e.blockNumber = event.block.number;
    e.blockTimestamp = event.block.timestamp;
    e.save();
}

export function handleRoleGranted(event: RoleGrantedEvent): void {
    const id = event.transaction.hash.concatI32(event.logIndex.toI32());
    const e = new RoleAssignment(id);
    e.kind = "Granted";
    e.role = event.params.role;
    e.account = event.params.account;
    e.sender = event.params.sender;
    e.blockNumber = event.block.number;
    e.blockTimestamp = event.block.timestamp;
    e.save();
}

export function handleRoleRevoked(event: RoleRevokedEvent): void {
    const id = event.transaction.hash.concatI32(event.logIndex.toI32());
    const e = new RoleAssignment(id);
    e.kind = "Revoked";
    e.role = event.params.role;
    e.account = event.params.account;
    e.sender = event.params.sender;
    e.blockNumber = event.block.number;
    e.blockTimestamp = event.block.timestamp;
    e.save();
}

function dayKey(timestamp: BigInt): string {
    const SECS_PER_DAY: i32 = 86400;
    const days = timestamp.toI32() / SECS_PER_DAY;
    const date = new Date(days * SECS_PER_DAY * 1000);
    return date.toISOString().substring(0, 10);
}
