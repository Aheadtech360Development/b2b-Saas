/**
 * T215: k6 load test — Product listing endpoint
 *
 * Target: GET /api/v1/products
 * Load:   500 VUs, 60 seconds
 * SLOs:   p95 latency < 200ms, error rate < 1%
 *
 * Usage:
 *   k6 run --env BASE_URL=http://localhost:8000 scripts/load-tests/product-listing.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ── Custom metrics ────────────────────────────────────────────────────────────
const errorRate = new Rate("error_rate");
const p95Latency = new Trend("p95_latency", true);

// ── Options ───────────────────────────────────────────────────────────────────
export const options = {
  stages: [
    { duration: "10s", target: 100 },  // Ramp up to 100 VUs
    { duration: "10s", target: 300 },  // Ramp up to 300 VUs
    { duration: "30s", target: 500 },  // Sustain 500 VUs for 30s
    { duration: "10s", target: 0 },    // Ramp down
  ],
  thresholds: {
    // p95 response time must be below 200ms
    http_req_duration: ["p(95)<200"],
    // Error rate must stay below 1%
    error_rate: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";

// Query parameter sets to simulate realistic usage patterns
const QUERY_VARIANTS = [
  "",
  "?page=1&page_size=24",
  "?page=2&page_size=24",
  "?category=t-shirts",
  "?q=polo",
  "?size=M",
  "?color=black",
  "?page=1&page_size=24&category=hoodies",
];

// ── Main test function ────────────────────────────────────────────────────────
export default function () {
  // Pick a random query variant
  const query = QUERY_VARIANTS[Math.floor(Math.random() * QUERY_VARIANTS.length)];
  const url = `${BASE_URL}/api/v1/products${query}`;

  const res = http.get(url, {
    headers: {
      Accept: "application/json",
    },
    tags: { endpoint: "product-listing" },
  });

  // Record metrics
  const success =
    res.status === 200 &&
    check(res, {
      "status is 200": (r) => r.status === 200,
      "response has items": (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.items);
        } catch {
          return false;
        }
      },
      "p95 < 200ms": (r) => r.timings.duration < 200,
    });

  errorRate.add(!success);
  p95Latency.add(res.timings.duration);

  // Simulate realistic user think time (100–300ms)
  sleep(Math.random() * 0.2 + 0.1);
}

// ── Teardown summary ──────────────────────────────────────────────────────────
export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values?.["p(95)"] ?? "N/A";
  const errRate = ((data.metrics.error_rate?.values?.rate ?? 0) * 100).toFixed(2);
  const totalReqs = data.metrics.http_reqs?.values?.count ?? 0;
  const rps = data.metrics.http_reqs?.values?.rate?.toFixed(1) ?? "N/A";

  const passed = p95 !== "N/A" && p95 < 200 && parseFloat(errRate) < 1.0;

  console.log("═══════════════════════════════════════════════");
  console.log("  AF Apparels — Product Listing Load Test");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Total Requests : ${totalReqs}`);
  console.log(`  Throughput     : ${rps} req/s`);
  console.log(`  p95 Latency    : ${typeof p95 === "number" ? p95.toFixed(1) : p95}ms  (target: <200ms)`);
  console.log(`  Error Rate     : ${errRate}%  (target: <1%)`);
  console.log(`  Result         : ${passed ? "✅ PASS" : "❌ FAIL"}`);
  console.log("═══════════════════════════════════════════════");

  return {
    stdout: `\nLoad test ${passed ? "PASSED" : "FAILED"}: p95=${p95}ms, errors=${errRate}%\n`,
  };
}
