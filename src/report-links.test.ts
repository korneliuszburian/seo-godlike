import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GSC_ANALYTICS_DIMENSIONS } from "./analytics.js";
import { CapabilityRegistry, ClientRegistry, GscAnalyticsRequest } from "./domain.js";
import { runGscAnalytics } from "./gsc-analytics.js";

const registry: ClientRegistry = { clients: [{ client_id: "bodymove", display_name: "Bodymove", properties: [{ property_id: "sc-domain:bodymove.pl", provider: "google-search-console" }] }] };
const capabilities: CapabilityRegistry = { capabilities: [{ capability_id: "gsc.search_analytics.query", provider: "google-search-console", operation_id: "search_analytics.query", read_write: "read", state: "schema_verified" }] };
const request: GscAnalyticsRequest = {
  schema_version: "1",
  run_id: "links_test_001",
  client_id: "bodymove",
  property_id: "sc-domain:bodymove.pl",
  provider: "google-search-console",
  operation: "search_analytics.query",
  metric: "clicks",
  date_range: { start: "2026-07-01", end: "2026-07-07" },
  comparison_date_range: { start: "2026-06-24", end: "2026-06-30" },
  dimensions: GSC_ANALYTICS_DIMENSIONS,
  row_limit: 25_000,
  credential_ref: "keyring:seo-godlike/google-agency-refresh-token",
  policy_mode: "read_only",
  captured_at: "2026-07-28T08:00:00.000Z",
};

test("analytics markdown includes deterministic previous-bundle links", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-links-test-"));
  const result = await runGscAnalytics(request, registry, capabilities, '{"rows":[]}', undefined, join(directory, "current"), ["../earlier/report.md", "../later/report.md"]);
  const markdown = await readFile(join(result.outputDir, "report.md"), "utf8");
  assert.match(markdown, /## Previous bundles/);
  assert.match(markdown, /\[Previous report\]\(\.\.\/earlier\/report\.md\)/);
  assert.match(markdown, /\[Previous report\]\(\.\.\/later\/report\.md\)/);
  await rm(directory, { recursive: true, force: true });
});
