import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runAhrefsAnalytics, queryAhrefsMetrics, runAhrefsProfile } from "./ahrefs.js";
import { AhrefsAnalyticsRequest, AhrefsProfileRequest, CapabilityRegistry, ClientRegistry } from "./domain.js";
import { writeReportPackage } from "./report-package.js";
import { AhrefsCollectionPolicy } from "./provider-collection-policy.js";

const enabledCollectionPolicy: AhrefsCollectionPolicy = { provider: "ahrefs", collection: "enabled", reason: null };

const registry: ClientRegistry = { clients: [{ client_id: "bodymove", display_name: "Bodymove", properties: [{ property_id: "bodymove.pl", provider: "ahrefs", canonical_property: true }] }] };
const capabilities: CapabilityRegistry = { capabilities: [{ capability_id: "ahrefs.site-explorer.metrics", provider: "ahrefs", operation_id: "site-explorer.metrics", api_version: "v3", read_write: "read", state: "schema_verified" }] };
const request: AhrefsAnalyticsRequest = { schema_version: "1", run_id: "analytics_bodymove_bodymove.pl_ahrefs_2026-07-28_2026-07-28", client_id: "bodymove", property_id: "bodymove.pl", provider: "ahrefs", operation: "site-explorer.metrics", metric: "org_traffic", date_range: { start: "2026-07-28", end: "2026-07-28" }, credential_ref: "keyring:seo-godlike/ahrefs-api-key", policy_mode: "read_only", captured_at: "2026-07-29T08:00:00.000Z" };

test("Ahrefs metrics writes a manifest-verified read-only bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-ahrefs-test-"));
  const output = join(root, "bundle");
  const report = await runAhrefsAnalytics(request, registry, capabilities, `${JSON.stringify({ metrics: { org_traffic: 123, org_keywords: 456, org_keywords_1_3: 12 } })}\n`, output);
  assert.equal(report.provider, "ahrefs");
  assert.equal(report.analytics.current.organic_traffic, 123);
  assert.equal(JSON.parse(await readFile(join(output, "claim.json"), "utf8")).confidence, "estimated");
  const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8")) as { files: Record<string, { sha256: string; bytes: number }> };
  for (const [name, expected] of Object.entries(manifest.files)) {
    const content = await readFile(join(output, name));
    assert.equal(content.byteLength, expected.bytes);
    assert.equal(createHash("sha256").update(content).digest("hex"), expected.sha256);
  }
  const packageSummary = await writeReportPackage(root, join(root, "package"));
  assert.equal(packageSummary.package_status, "reportable");
  assert.equal(packageSummary.accepted_bundles[0]?.metric_id, "ahrefs.org_traffic");
  await rm(root, { recursive: true, force: true });
});

test("Ahrefs rejects malformed metrics before writing", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-ahrefs-test-"));
  await assert.rejects(runAhrefsAnalytics(request, registry, capabilities, "{\"metrics\":{\"org_traffic\":-1}}\n", join(root, "bundle")), /invalid Ahrefs org_traffic/);
  await rm(root, { recursive: true, force: true });
});

test("Ahrefs transport uses the read-only metrics endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let observedUrl = "";
  let observedAuth = "";
  globalThis.fetch = (async (input, init) => {
    observedUrl = String(input);
    observedAuth = String((init?.headers as Record<string, string>)?.authorization);
    return new Response(JSON.stringify({ metrics: { org_traffic: 1 } }), { status: 200 });
  }) as typeof fetch;
  try {
    await queryAhrefsMetrics("redacted-test-key", "ahrefs.com", "2026-07-28", enabledCollectionPolicy);
    assert.match(observedUrl, /https:\/\/api\.ahrefs\.com\/v3\/site-explorer\/metrics/);
    assert.match(observedUrl, /target=ahrefs\.com/);
    assert.equal(observedAuth, "Bearer redacted-test-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Ahrefs transport is globally paused before network IO", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ metrics: { org_traffic: 1 } }), { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      queryAhrefsMetrics("redacted-test-key", "ahrefs.com", "2026-07-28"),
      /Ahrefs collection is globally disabled by budget policy/,
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Ahrefs profile persists bounded pages, keyword, and competitor context", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-ahrefs-profile-test-"));
  const output = join(root, "bundle");
  const profileCapabilities: CapabilityRegistry = { capabilities: [{ capability_id: "ahrefs.site-explorer.profile", provider: "ahrefs", operation_id: "site-explorer.profile", api_version: "v3", metric_ids: ["ahrefs.top_pages", "ahrefs.org_keywords_detail", "ahrefs.org_competitors"], read_write: "read", state: "schema_verified" }] };
  const profileRequest: AhrefsProfileRequest = { schema_version: "1", run_id: "analytics_bodymove_bodymove.pl_ahrefs-profile_2026-07-28_2026-07-28", client_id: "bodymove", property_id: "bodymove.pl", provider: "ahrefs", operation: "site-explorer.profile", metric: "org_traffic", date_range: { start: "2026-07-28", end: "2026-07-28" }, comparison_date_range: { start: "2026-06-30", end: "2026-06-30" }, country: "pl", limits: { top_pages: 100, organic_keywords: 500, organic_competitors: 20 }, credential_ref: "keyring:seo-godlike/ahrefs-api-key", policy_mode: "read_only", captured_at: "2026-07-29T08:00:00.000Z" };
  const report = await runAhrefsProfile(profileRequest, registry, profileCapabilities, {
    metrics: JSON.stringify({ metrics: { org_traffic: 100, org_keywords: 50, org_keywords_1_3: 5 } }),
    topPages: JSON.stringify({ pages: [{ url: "https://bodymove.pl/a", sum_traffic: 10, keywords: 2, traffic_diff_percent: -230 }] }),
    organicKeywords: JSON.stringify({ keywords: [{ keyword: "rehabilitacja", best_position: 4, sum_traffic: 8 }] }),
    competitors: JSON.stringify({ competitors: [{ competitor_domain: "competitor.example", traffic: 20 }] }),
  }, output);
  assert.equal(report.operation, "site-explorer.profile");
  assert.equal(report.analytics.current.top_pages.length, 1);
  assert.equal(report.analytics.current.top_pages[0]?.traffic_diff_percent_ratio, -0.023);
  assert.equal(report.analytics.current.organic_keyword_rows[0]?.keyword, "rehabilitacja");
  assert.equal(report.analytics.current.competitors[0]?.competitor_domain, "competitor.example");
  assert.equal(JSON.parse(await readFile(join(output, "claim.json"), "utf8")).confidence, "estimated");
  const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8")) as { files: Record<string, { sha256: string; bytes: number; request_row_limit?: number; response_row_count?: number }> };
  assert.deepEqual(manifest.files["raw-response.top-pages.json"], { sha256: manifest.files["raw-response.top-pages.json"]?.sha256, bytes: manifest.files["raw-response.top-pages.json"]?.bytes, request_row_limit: 100, response_row_count: 1 });
  assert.equal(manifest.files["raw-response.organic-keywords.json"]?.request_row_limit, 500);
  assert.equal(manifest.files["raw-response.organic-keywords.json"]?.response_row_count, 1);
  assert.equal(manifest.files["raw-response.competitors.json"]?.request_row_limit, 20);
  assert.equal(manifest.files["raw-response.competitors.json"]?.response_row_count, 1);
  await rm(root, { recursive: true, force: true });
});
