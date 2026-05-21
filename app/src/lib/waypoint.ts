"use client";

import {WaypointProvider} from "@sky-mavis/waypoint";

const CLIENT_ID = process.env.NEXT_PUBLIC_WAYPOINT_CLIENT_ID ?? "";
const DEFAULT_CHAIN_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? 202601);

let cached: WaypointProvider | null = null;

export function isWaypointConfigured(): boolean {
    return Boolean(CLIENT_ID);
}

export function getWaypointProvider(chainId: number = DEFAULT_CHAIN_ID): WaypointProvider {
    if (!CLIENT_ID) {
        throw new Error(
            "Waypoint clientId not configured. Set NEXT_PUBLIC_WAYPOINT_CLIENT_ID in app/.env.local.",
        );
    }
    if (cached && cached.chainId === chainId) return cached;
    cached = WaypointProvider.create({clientId: CLIENT_ID, chainId});
    return cached;
}
