import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ScopePlan, SourceRegistry } from "./domain.js";
import { composeCrossSourceContext, composeExecutiveSummary, writeAgencyReport } from "./agency-report.js";
import { writeAhrefsKeywordResearch } from "./ahrefs-keywords.js";

test("agency report preserves unavailable sources instead of inventing metrics", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-agency-report-test-"));
  const scope: ScopePlan = {
    schema_version: "1",
    generated_at: "2026-07-29T00:00:00.000Z",
    status: "partial",
    entries: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "properties/123", provider: "google-analytics", status: "unavailable", reason: "no live capability", metrics: [] }],
  };
  const output = join(root, "report");
  const sources: SourceRegistry = { sources: [
    { source_id: "ga4.bodymove", client_id: "bodymove", provider: "google-analytics", target: null, status: "unavailable", reason: "numeric GA4 property ID and analytics.readonly proof are not registered" },
    { source_id: "localo.bodymove", client_id: "bodymove", provider: "localo", target: "bodymove.pl", status: "unavailable", reason: "managed profile unavailable" },
  ] };
  const summary = await writeAgencyReport(root, output, scope, "2026-07-29T00:00:00.000Z", sources);
  assert.equal(summary.report_status, "blocked");
  assert.deepEqual(summary.blocked_sources.map((source) => source.reason), ["no live capability", "numeric GA4 property ID and analytics.readonly proof are not registered", "managed profile unavailable"]);
  assert.equal(summary.source_status.at(-1)?.provider, "localo");
  assert.match(await readFile(join(output, "agency-report.md"), "utf8"), /unavailable/);
  assert.match(await readFile(join(output, "agency-report.html"), "utf8"), /no live capability/);
  assert.match(await readFile(join(output, "agency-report-appendix.md"), "utf8"), /Full cross-source context/);
  const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8")) as { files: Record<string, { sha256: string; bytes: number }> };
  assert.deepEqual(Object.keys(manifest.files).sort(), ["agency-report-appendix.html", "agency-report-appendix.md", "agency-report.html", "agency-report.json", "agency-report.md"]);
  for (const [name, expected] of Object.entries(manifest.files)) {
    const bytes = await readFile(join(output, name));
    assert.equal(bytes.byteLength, expected.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected.sha256);
    assert.equal((await stat(join(output, name))).mode & 0o777, 0o600);
  }
  await rm(root, { recursive: true, force: true });
});

test("executive summary labels sources and preserves complete join coverage", () => {
  const context = [
    { client_id: "bodymove", key_type: "page" as const, join_type: "matched" as const, key: "https://bodymove.pl/a", gsc: { clicks: 1, impressions: 10, ctr: 0.1, position: 3 }, ahrefs: { estimated_traffic: 20, position: 2, keywords: 4, ranking_url: "https://bodymove.pl/a" } },
    { client_id: "bodymove", key_type: "page" as const, join_type: "gsc_only" as const, key: "https://bodymove.pl/b", gsc: { clicks: 2, impressions: 20, ctr: 0.1, position: 4 }, ahrefs: null },
    { client_id: "bodymove", key_type: "query" as const, join_type: "ahrefs_only" as const, key: "rehabilitacja", gsc: null, ahrefs: { estimated_traffic: 30, position: 5, keywords: null, ranking_url: "https://bodymove.pl/a" } },
  ];
  const summary = composeExecutiveSummary([
    { client_id: "bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", analytics: { current_date_range: { start: "2026-07-01", end: "2026-07-28" }, current: { clicks: 3, impressions: 30, ctr: 0.1, position: 3.5 } } },
    { client_id: "bodymove", property_id: "bodymove.pl", provider: "ahrefs", analytics: { organic_traffic: 100, organic_keywords: 50, organic_keywords_top_3: 10 } },
  ], context, [
    { client_id: "bodymove", kind: "low_ctr", key: "query", evidence: "100 impressions; CTR 1.00%", severity: "attention" },
  ]);
  assert.equal(summary.source_labels.gsc, "Observed — Google Search Console");
  assert.equal(summary.source_labels.ahrefs, "Estimated — Ahrefs");
  assert.equal(summary.source_labels.heuristic, "Rule-based signal — not a recommendation");
  assert.deepEqual(summary.join_coverage, { matched: 1, gsc_only: 1, ahrefs_only: 1, total: 3 });
  assert.equal(summary.observed_gsc[0]?.clicks, 3);
  assert.equal(summary.observed_gsc[0]?.property_id, "sc-domain:bodymove.pl");
  assert.equal(summary.estimated_ahrefs[0]?.organic_traffic, 100);
  assert.equal(summary.estimated_ahrefs[0]?.property_id, "bodymove.pl");
  assert.equal(summary.preview.context_shown, 3);
});

test("cross-source context joins GSC pages and queries to Ahrefs without merging metrics", () => {
  const context = composeCrossSourceContext([
    {
      client_id: "bodymove",
      provider: "google-search-console",
    analytics: { current: { top_pages: [{ key: "https://bodymove.pl/a/", clicks: 10, impressions: 100, ctr: 0.1, position: 5 }, { key: "https://bodymove.pl/gsc-only", clicks: 2, impressions: 20, ctr: 0.1, position: 10 }], top_queries: [{ key: "Rehabilitacja", clicks: 4, impressions: 20, ctr: 0.2, position: 3 }] } },
    },
    {
      client_id: "bodymove",
      provider: "ahrefs",
      analytics: { current: { top_pages: [{ url: "https://bodymove.pl/a", sum_traffic: 200, keywords: 12, top_keyword_best_position: 2 }, { url: "https://bodymove.pl/ahrefs-only", sum_traffic: 50, keywords: 3, top_keyword_best_position: 12 }], organic_keyword_rows: [{ keyword: "rehabilitacja", sum_traffic: 80, best_position: 4, best_position_url: "https://bodymove.pl/a" }] } },
    },
  ]);
  assert.deepEqual(context.map((entry) => [entry.key_type, entry.join_type, entry.key, entry.gsc?.clicks ?? null, entry.ahrefs?.estimated_traffic ?? null]), [["page", "matched", "https://bodymove.pl/a", 10, 200], ["page", "ahrefs_only", "https://bodymove.pl/ahrefs-only", null, 50], ["page", "gsc_only", "https://bodymove.pl/gsc-only", 2, null], ["query", "matched", "rehabilitacja", 4, 80]]);
});

test("cross-source context preserves missing GSC fields as unavailable instead of zero", () => {
  const context = composeCrossSourceContext([
    { client_id: "bodymove", provider: "google-search-console", analytics: { current: { top_pages: [{ key: "https://bodymove.pl/missing", impressions: 10 }] } } },
    { client_id: "bodymove", provider: "ahrefs", analytics: { current: { top_pages: [] } } },
  ]);
  assert.equal(context[0]?.gsc?.clicks, null);
  assert.equal(context[0]?.gsc?.ctr, null);
});

test("agency report preserves every supplied keyword group and full returned rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-agency-keyword-report-test-"));
  try {
    const artifacts = join(root, "artifacts");
    await mkdir(artifacts);
    const inputPath = join(root, "phrases.txt");
    await writeFile(inputPath, "https://wilmed.pl/\n# note: TUTAJ nie mamy fraz\n\nhttps://cmr-ostroleka.pl/\nfraza jedna\n");
    const keywordBundle = join(root, "keywords");
    await writeAhrefsKeywordResearch({
      inputPath,
      outputDir: keywordBundle,
      capabilities: { capabilities: [{ capability_id: "ahrefs.keywords-explorer.overview", provider: "ahrefs", operation_id: "keywords-explorer.overview", api_version: "v3", metric_ids: ["ahrefs.keyword_metrics"], read_write: "read", state: "schema_verified" }] },
      apiKey: "test-key",
      fetchImpl: async () => new Response(JSON.stringify({ keywords: [{ keyword: "fraza jedna", volume: 12, clicks: 3, difficulty: 7, parent_topic: "a|b\nc", serp_features: ["local_pack"] }] }), { status: 200 }),
    });
    const scope: ScopePlan = { schema_version: "1", generated_at: "2026-08-03T00:00:00.000Z", status: "partial", entries: [] };
    const output = join(root, "report");
    const summary = await writeAgencyReport(artifacts, output, scope, "2026-08-03T00:00:00.000Z", { sources: [] }, keywordBundle, inputPath);
    assert.deepEqual(summary.keyword_research?.input_groups.map((group) => [group.host, group.phrases.length]), [["wilmed.pl", 0], ["cmr-ostroleka.pl", 1]]);
    assert.equal(summary.keyword_research?.groups[0]?.rows[0]?.difficulty, 7);
    const appendix = await readFile(join(output, "agency-report-appendix.md"), "utf8");
    assert.match(appendix, /wilmed\.pl/);
    assert.match(appendix, /local_pack/);
    assert.match(appendix, /a\\\|b c/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
