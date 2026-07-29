import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runAhrefsAnalytics, queryAhrefsMetrics } from "./ahrefs.js";
import { AhrefsAnalyticsRequest, CapabilityRegistry, ClientRegistry } from "./domain.js";

const registry: ClientRegistry = { clients: [{ client_id: "bodymove", display_name: "Bodymove", properties: [{ property_id: "bodymove.pl", provider: "ahrefs", canonical_property: true }] }] };
const capabilities: CapabilityRegistry = { capabilities: [{ capability_id: "ahrefs.site-explorer.metrics", provider: "ahrefs", operation_id: "site-explorer.metrics", api_version: "v3", read_write: "read", state: "schema_verified" }] };
const request: AhrefsAnalyticsRequest = { schema_version: "1", run_id: "analytics_bodymove_bodymove.pl_ahrefs_2026-07-28_2026-07-28", client_id: "bodymove", property_id: "bodymove.pl", provider: "ahrefs", operation: "site-explorer.metrics", metric: "org_traffic", date_range: { start: "2026-07-28", end: "2026-07-28" }, credential_ref: "keyring:seo-godlike/ahrefs-api-key", policy_mode: "read_only", captured_at: "2026-07-29T08:00:00.000Z" };

test("Ahrefs metrics writes a manifest-verified read-only bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-ahrefs-test-"));
  const output = join(root, "bundle");
  const report = await runAhrefsAnalytics(request, registry, capabilities, `${JSON.stringify({ metrics: { org_traffic: 123, org_keywords: 456, org_keywords_1_3: 12 } })}\n`, output);
  assert.equal(report.provider, "ahrefs");
  assert.equal(report.analytics.current.organic_traffic, 123);
  const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8")) as { files: Record<string, { sha256: string; bytes: number }> };
  for (const [name, expected] of Object.entries(manifest.files)) {
    const content = await readFile(join(output, name));
    assert.equal(content.byteLength, expected.bytes);
    assert.equal(createHash("sha256").update(content).digest("hex"), expected.sha256);
  }
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
    await queryAhrefsMetrics("redacted-test-key", "ahrefs.com", "2026-07-28");
    assert.match(observedUrl, /https:\/\/api\.ahrefs\.com\/v3\/site-explorer\/metrics/);
    assert.match(observedUrl, /target=ahrefs\.com/);
    assert.equal(observedAuth, "Bearer redacted-test-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
