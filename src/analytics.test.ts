import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { aggregateSearchAnalytics, calculateDateRanges, comparePeriods, GSC_ANALYTICS_DIMENSIONS, SearchAnalyticsRow } from "./analytics.js";
import { CapabilityRegistry, ClientRegistry, GscAnalyticsRequest } from "./domain.js";
import { runGscAnalytics } from "./gsc-analytics.js";

const registry: ClientRegistry = {
  clients: [{ client_id: "bodymove", properties: [{ property_id: "sc-domain:bodymove.pl", provider: "google-search-console" }] }],
};
const capabilities: CapabilityRegistry = {
  capabilities: [{ capability_id: "gsc.search_analytics.query", provider: "google-search-console", operation_id: "search_analytics.query", read_write: "read", state: "schema_verified" }],
};

test("calculates lagged inclusive current and previous 28-day ranges", () => {
  assert.deepEqual(calculateDateRanges(new Date("2026-07-28T10:27:00+02:00")), {
    current: { start: "2026-06-28", end: "2026-07-25" },
    previous: { start: "2026-05-31", end: "2026-06-27" },
  });
});

test("deduplicates exact rows and aggregates queries, pages, and CTR breakdowns", () => {
  const rows: SearchAnalyticsRow[] = [
    { keys: ["seo", "/a", "pol", "MOBILE"], clicks: 3, impressions: 10, ctr: 0.3, position: 2 },
    { keys: ["seo", "/a", "pol", "MOBILE"], clicks: 3, impressions: 10, ctr: 0.3, position: 2 },
    { keys: ["seo", "/b", "pol", "DESKTOP"], clicks: 2, impressions: 5, ctr: 0.4, position: 4 },
  ];
  const summary = aggregateSearchAnalytics(rows);
  assert.equal(summary.rows_received, 3);
  assert.equal(summary.rows_deduplicated, 2);
  assert.equal(summary.clicks, 5);
  assert.equal(summary.impressions, 15);
  assert.equal(summary.ctr, 5 / 15);
  assert.deepEqual(summary.top_queries.map((row) => [row.key, row.clicks]), [["seo", 5]]);
  assert.deepEqual(summary.top_pages.map((row) => [row.key, row.clicks]), [["/a", 3], ["/b", 2]]);
  assert.deepEqual(summary.ctr_breakdown.device.map((row) => row.key), ["MOBILE", "DESKTOP"]);
  assert.equal(comparePeriods(summary, aggregateSearchAnalytics([])).change_pct.clicks, null);
});

test("writes the analytics bundle with raw responses and deterministic report shape", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-analytics-test-"));
  const request: GscAnalyticsRequest = {
    schema_version: "1",
    run_id: "analytics_test_001",
    client_id: "bodymove",
    property_id: "sc-domain:bodymove.pl",
    provider: "google-search-console",
    operation: "search_analytics.query",
    metric: "clicks",
    date_range: { start: "2026-06-28", end: "2026-07-25" },
    comparison_date_range: { start: "2026-05-31", end: "2026-06-27" },
    dimensions: GSC_ANALYTICS_DIMENSIONS,
    row_limit: 25_000,
    credential_ref: "keyring:seo-godlike/google-agency-refresh-token",
    policy_mode: "read_only",
    captured_at: "2026-07-28T08:27:00.000Z",
  };
  const result = await runGscAnalytics(
    request,
    registry,
    capabilities,
    JSON.stringify({ rows: [{ keys: ["seo", "/a", "pol", "MOBILE"], clicks: 3, impressions: 10, ctr: 0.3, position: 2 }] }),
    JSON.stringify({ rows: [{ keys: ["seo", "/a", "pol", "MOBILE"], clicks: 1, impressions: 5, ctr: 0.2, position: 3 }] }),
    join(directory, "run"),
  );
  const files = (await readdir(result.outputDir)).sort();
  assert.deepEqual(files, ["analytics.json", "audit-event.json", "claim.json", "manifest.json", "observation.json", "raw-response-previous.json", "raw-response.json", "report.json", "report.md", "request.json", "source.json"]);
  const report = JSON.parse(await readFile(join(result.outputDir, "report.json"), "utf8")) as { analytics: { current: { clicks: number }; previous: { clicks: number } }; canonical_json_hash: string };
  assert.equal(report.analytics.current.clicks, 3);
  assert.equal(report.analytics.previous.clicks, 1);
  assert.equal(result.report.canonical_json_hash, report.canonical_json_hash);
  assert.match(await readFile(join(result.outputDir, "report.md"), "utf8"), /Top queries/);
  await rm(directory, { recursive: true, force: true });
});
