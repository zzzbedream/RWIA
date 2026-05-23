#!/usr/bin/env node
// Load test for the read-only relayer endpoints.
// Reports p50/p95/p99 latency, success rate, throughput, and error histogram.
//
// Usage:
//   node scripts/load-test.mjs
//   TOTAL=1000 CONC=50 node scripts/load-test.mjs
//   HOST=http://localhost:3000 node scripts/load-test.mjs

const HOST = process.env.HOST ?? "https://ronin-waypoint-intent-aggregator-rw.vercel.app";
const TOTAL = Number(process.env.TOTAL ?? 200);
const CONC = Number(process.env.CONC ?? 20);

const NFT_CONTRACT = "0x32e7C4499dAF10DD412E2F2c07052b8929a31cF2";

const endpoints = [
    {label: "GET /api/health", path: "/api/health"},
    {label: "GET /api/diagnose", path: "/api/diagnose"},
    {label: "GET /api/diagnose?nft", path: `/api/diagnose?nftContract=${NFT_CONTRACT}&tokenId=5`},
    {label: "GET /api/dlq", path: "/api/dlq?limit=10"},
];

function percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor((p / 100) * sorted.length);
    return sorted[Math.min(idx, sorted.length - 1)];
}

async function runOne(path) {
    const start = performance.now();
    try {
        const res = await fetch(HOST + path, {method: "GET"});
        await res.text(); // drain body
        return {ok: res.ok, status: res.status, ms: performance.now() - start};
    } catch (e) {
        return {ok: false, status: 0, ms: performance.now() - start, err: e.message};
    }
}

async function runEndpoint({label, path}) {
    const results = [];
    let inFlight = 0;
    let launched = 0;

    return new Promise((resolve) => {
        const tick = () => {
            while (inFlight < CONC && launched < TOTAL) {
                inFlight++;
                launched++;
                runOne(path).then((r) => {
                    results.push(r);
                    inFlight--;
                    if (results.length === TOTAL) {
                        resolve({label, results});
                    } else if (launched < TOTAL) {
                        tick();
                    }
                });
            }
        };
        tick();
    });
}

function report(label, results, wallMs) {
    const okMs = results.filter((r) => r.ok).map((r) => r.ms);
    const failures = results.filter((r) => !r.ok);
    const byCode = {};
    for (const r of failures) byCode[r.status] = (byCode[r.status] ?? 0) + 1;

    const successRate = ((okMs.length / results.length) * 100).toFixed(1);
    const throughput = (results.length / (wallMs / 1000)).toFixed(1);

    console.log(`\n${label}`);
    console.log(`  total:        ${results.length} req (concurrency ${CONC})`);
    console.log(`  wall time:    ${(wallMs / 1000).toFixed(2)}s`);
    console.log(`  throughput:   ${throughput} req/s`);
    console.log(`  success rate: ${successRate}%`);
    if (okMs.length > 0) {
        console.log(`  latency p50:  ${percentile(okMs, 50).toFixed(0)}ms`);
        console.log(`  latency p95:  ${percentile(okMs, 95).toFixed(0)}ms`);
        console.log(`  latency p99:  ${percentile(okMs, 99).toFixed(0)}ms`);
        console.log(`  latency max:  ${Math.max(...okMs).toFixed(0)}ms`);
    }
    if (Object.keys(byCode).length > 0) {
        console.log(`  errors:       ${JSON.stringify(byCode)}`);
    }
}

async function main() {
    console.log(`RWIA load test → ${HOST}`);
    console.log(`config: TOTAL=${TOTAL}  CONC=${CONC}`);

    for (const ep of endpoints) {
        const t0 = performance.now();
        const {results} = await runEndpoint(ep);
        report(ep.label, results, performance.now() - t0);
    }
}

main().catch((e) => {
    console.error("Load test crashed:", e);
    process.exit(1);
});
