import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AhrefsAnalyticsRequest, CapabilityRegistry, ClientRegistry, ScopePlan, SourceRegistry } from "./domain.js";
import { composeAhrefsProfileContext, composeCrossSourceContext, composeExecutiveSummary, writeAgencyReport } from "./agency-report.js";
import { runAhrefsAnalytics } from "./ahrefs.js";
import { writeAhrefsKeywordResearch } from "./ahrefs-keywords.js";
import { writeRankMonitoringBundle } from "./rank-monitoring.js";
import { canonicalJson, sha256 } from "./serialize.js";

async function writeAgencySelectionBundle(root: string, name: string, generatedAt: string, clicks: number): Promise<void> {
  const bundle = join(root, name);
  await mkdir(bundle, { recursive: true });
  const withoutHash = { schema_version: "1", run_id: `run-${name}`, client_id: "bodymove", client_display_name: "Bodymove", property_refs: ["sc-domain:bodymove.pl"], generated_at: generatedAt, evidence_manifest_ref: "manifest.json", provider: "google-search-console", operation: "search_analytics.query", analytics: { current_date_range: { start: "2026-07-01", end: "2026-07-28" }, current: { clicks, impressions: clicks * 10, ctr: 0.1, position: 2 } } };
  const report = canonicalJson({ ...withoutHash, canonical_json_hash: sha256(canonicalJson(withoutHash)) });
  const request = canonicalJson({ run_id: `run-${name}`, client_id: "bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", operation: "search_analytics.query", policy_mode: "read_only" });
  const markdown = `# ${name}\n`;
  await writeFile(join(bundle, "report.json"), report);
  await writeFile(join(bundle, "request.json"), request);
  await writeFile(join(bundle, "report.md"), markdown);
  const files = Object.fromEntries(["report.json", "request.json", "report.md"].map((file) => { const bytes = readFileSync(join(bundle, file)); return [file, { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength }]; }));
  await writeFile(join(bundle, "manifest.json"), canonicalJson({ schema_version: "1", files }));
}

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

test("agency report selects the newest accepted bundle per current source identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-agency-selection-test-"));
  try {
    const artifacts = join(root, "artifacts");
    await mkdir(artifacts);
    await writeAgencySelectionBundle(artifacts, "older", "2026-07-29T08:00:00.000Z", 2);
    await writeAgencySelectionBundle(artifacts, "newer", "2026-07-30T08:00:00.000Z", 7);
    const scope: ScopePlan = { schema_version: "1", generated_at: "2026-07-30T00:00:00.000Z", status: "ready", entries: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, metrics: [] }] };
    const summary = await writeAgencyReport(artifacts, join(root, "report"), scope, "2026-07-30T00:00:00.000Z", { sources: [] });
    assert.deepEqual(summary.accepted_bundles.map((entry) => entry.bundle_path), ["newer"]);
    assert.equal(summary.executive.observed_gsc[0]?.clicks, 7);
    assert.equal(summary.insights.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agency report does not revive a source downgraded by the current scope", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-agency-downgraded-scope-test-"));
  try {
    const artifacts = join(root, "artifacts");
    await mkdir(artifacts);
    await writeAgencySelectionBundle(artifacts, "gsc", "2026-07-29T08:00:00.000Z", 2);
    const scope: ScopePlan = { schema_version: "1", generated_at: "2026-07-30T00:00:00.000Z", status: "partial", entries: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "unavailable", reason: "capability downgraded", metrics: [] }] };
    const summary = await writeAgencyReport(artifacts, join(root, "report"), scope, "2026-07-30T00:00:00.000Z", { sources: [] });
    assert.equal(summary.source_status[0]?.status, "unavailable");
    assert.equal(summary.source_status[0]?.bundle_path, null);
    assert.equal(summary.source_status[0]?.reason, "capability downgraded");
    assert.equal(summary.accepted_bundles.length, 0);
    assert.equal(summary.report_status, "blocked");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agency report fails closed when a ready source has no accepted evidence bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-agency-missing-evidence-test-"));
  try {
    const artifacts = join(root, "artifacts");
    await mkdir(artifacts);
    await writeAgencySelectionBundle(artifacts, "gsc", "2026-07-29T08:00:00.000Z", 2);
    const scope: ScopePlan = { schema_version: "1", generated_at: "2026-07-30T00:00:00.000Z", status: "ready", entries: [
      { client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, metrics: [] },
      { client_id: "bodymove", client_display_name: "Bodymove", property_id: "bodymove.pl", provider: "ahrefs", status: "ready", reason: null, metrics: [] },
    ] };
    const summary = await writeAgencyReport(artifacts, join(root, "report"), scope, "2026-07-30T00:00:00.000Z", { sources: [] });
    const ahrefsStatus = summary.source_status.find((source) => source.provider === "ahrefs");
    assert.equal(ahrefsStatus?.status, "unavailable");
    assert.equal(ahrefsStatus?.reason_code, "missing_evidence_bundle");
    assert.equal(summary.blocked_sources.some((source) => source.provider === "ahrefs"), true);
    assert.equal(summary.report_status, "partial");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agency report fails closed when a ready external source has no rank evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-agency-missing-external-evidence-test-"));
  try {
    const artifacts = join(root, "artifacts");
    await mkdir(artifacts);
    await writeAgencySelectionBundle(artifacts, "gsc", "2026-07-29T08:00:00.000Z", 2);
    const scope: ScopePlan = { schema_version: "1", generated_at: "2026-07-30T00:00:00.000Z", status: "ready", entries: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, metrics: [] }] };
    const sourceRegistry: SourceRegistry = { sources: [{ source_id: "serprobot.bodymove", client_id: "bodymove", provider: "serprobot", target: "123", status: "ready", reason: null }] };
    const summary = await writeAgencyReport(artifacts, join(root, "report"), scope, "2026-07-30T00:00:00.000Z", sourceRegistry);
    const rankStatus = summary.source_status.find((source) => source.provider === "serprobot");
    assert.equal(rankStatus?.status, "unavailable");
    assert.equal(rankStatus?.reason_code, "missing_evidence_bundle");
    assert.equal(summary.blocked_sources.some((source) => source.provider === "serprobot"), true);
    assert.equal(summary.report_status, "partial");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agency report distinguishes an external source without an evidence path", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-agency-no-evidence-path-test-"));
  try {
    const artifacts = join(root, "artifacts");
    await mkdir(artifacts);
    await writeAgencySelectionBundle(artifacts, "gsc", "2026-07-29T08:00:00.000Z", 2);
    const scope: ScopePlan = { schema_version: "1", generated_at: "2026-07-30T00:00:00.000Z", status: "ready", entries: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, metrics: [] }] };
    const sourceRegistry: SourceRegistry = { sources: [{ source_id: "localo.bodymove", client_id: "bodymove", provider: "localo", target: "bodymove.pl", status: "ready", reason: null }] };
    const summary = await writeAgencyReport(artifacts, join(root, "report"), scope, "2026-07-30T00:00:00.000Z", sourceRegistry);
    const localoStatus = summary.source_status.find((source) => source.provider === "localo");
    assert.equal(localoStatus?.status, "unavailable");
    assert.equal(localoStatus?.reason_code, "no_evidence_path");
    assert.match(localoStatus?.reason ?? "", /No evidence ingestion path/);
    assert.equal(summary.report_status, "partial");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agency report excludes an Ahrefs snapshot older than the selected GSC period", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-agency-period-test-"));
  try {
    const artifacts = join(root, "artifacts");
    await mkdir(artifacts);
    await writeAgencySelectionBundle(artifacts, "gsc", "2026-07-29T08:00:00.000Z", 2);
    const registry: ClientRegistry = { clients: [{ client_id: "bodymove", display_name: "Bodymove", properties: [{ property_id: "bodymove.pl", provider: "ahrefs", canonical_property: true }] }] };
    const capabilities: CapabilityRegistry = { capabilities: [{ capability_id: "ahrefs.site-explorer.metrics", provider: "ahrefs", operation_id: "site-explorer.metrics", api_version: "v3", read_write: "read", state: "schema_verified" }] };
    const request: AhrefsAnalyticsRequest = { schema_version: "1", run_id: "ahrefs-stale", client_id: "bodymove", property_id: "bodymove.pl", provider: "ahrefs", operation: "site-explorer.metrics", metric: "org_traffic", date_range: { start: "2026-06-30", end: "2026-06-30" }, credential_ref: "keyring:seo-godlike/ahrefs-api-key", policy_mode: "read_only", captured_at: "2026-07-01T08:00:00.000Z" };
    await runAhrefsAnalytics(request, registry, capabilities, JSON.stringify({ metrics: { org_traffic: 10, org_keywords: 2, org_keywords_1_3: 1 } }), join(artifacts, "ahrefs-stale"));
    const scope: ScopePlan = { schema_version: "1", generated_at: "2026-07-30T00:00:00.000Z", status: "partial", entries: [
      { client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, metrics: [] },
      { client_id: "bodymove", client_display_name: "Bodymove", property_id: "bodymove.pl", provider: "ahrefs", status: "ready", reason: null, metrics: [] },
    ] };
    const summary = await writeAgencyReport(artifacts, join(root, "report"), scope, "2026-07-30T00:00:00.000Z", { sources: [] });
    const ahrefsStatus = summary.source_status.find((source) => source.provider === "ahrefs");
    assert.equal(ahrefsStatus?.status, "unavailable");
    assert.equal(ahrefsStatus?.reason_code, "stale_snapshot");
    assert.match(ahrefsStatus?.reason ?? "", /older than the selected Google Search Console observation period/);
    assert.equal(summary.cross_source_context.length, 0);
    assert.equal(summary.report_status, "partial");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agency report accepts an Ahrefs snapshot on the GSC period boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-agency-period-boundary-test-"));
  try {
    const artifacts = join(root, "artifacts");
    await mkdir(artifacts);
    await writeAgencySelectionBundle(artifacts, "gsc", "2026-07-29T08:00:00.000Z", 2);
    const registry: ClientRegistry = { clients: [{ client_id: "bodymove", display_name: "Bodymove", properties: [{ property_id: "bodymove.pl", provider: "ahrefs", canonical_property: true }] }] };
    const capabilities: CapabilityRegistry = { capabilities: [{ capability_id: "ahrefs.site-explorer.metrics", provider: "ahrefs", operation_id: "site-explorer.metrics", api_version: "v3", read_write: "read", state: "schema_verified" }] };
    const request: AhrefsAnalyticsRequest = { schema_version: "1", run_id: "ahrefs-boundary", client_id: "bodymove", property_id: "bodymove.pl", provider: "ahrefs", operation: "site-explorer.metrics", metric: "org_traffic", date_range: { start: "2026-07-28", end: "2026-07-28" }, credential_ref: "keyring:seo-godlike/ahrefs-api-key", policy_mode: "read_only", captured_at: "2026-07-29T08:00:00.000Z" };
    await runAhrefsAnalytics(request, registry, capabilities, JSON.stringify({ metrics: { org_traffic: 10, org_keywords: 2, org_keywords_1_3: 1 } }), join(artifacts, "ahrefs-boundary"));
    const scope: ScopePlan = { schema_version: "1", generated_at: "2026-07-30T00:00:00.000Z", status: "ready", entries: [
      { client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, metrics: [] },
      { client_id: "bodymove", client_display_name: "Bodymove", property_id: "bodymove.pl", provider: "ahrefs", status: "ready", reason: null, metrics: [] },
    ] };
    const summary = await writeAgencyReport(artifacts, join(root, "report"), scope, "2026-07-30T00:00:00.000Z", { sources: [] });
    assert.equal(summary.source_status.find((source) => source.provider === "ahrefs")?.status, "ready");
    assert.equal(summary.report_status, "reportable");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

test("executive summary preserves missing metrics as unavailable", () => {
  const summary = composeExecutiveSummary([
    {
      client_id: "bodymove",
      property_id: "sc-domain:bodymove.pl",
      provider: "google-search-console",
      analytics: { current_date_range: { start: "2026-07-01", end: "2026-07-28" }, current: { impressions: 30 } },
    },
    {
      client_id: "bodymove",
      property_id: "bodymove.pl",
      provider: "ahrefs",
      analytics: { current: { organic_keywords: 50 } },
    },
  ], [], []);
  assert.deepEqual(summary.observed_gsc[0], {
    client_id: "bodymove",
    property_id: "sc-domain:bodymove.pl",
    date_range: { start: "2026-07-01", end: "2026-07-28" },
    clicks: null,
    impressions: 30,
    ctr: null,
    position: null,
  });
  assert.deepEqual(summary.estimated_ahrefs[0], {
    client_id: "bodymove",
    property_id: "bodymove.pl",
    organic_traffic: null,
    organic_keywords: 50,
    organic_keywords_top_3: null,
  });
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

test("agency report preserves every returned Ahrefs profile row for the appendix", () => {
  const profiles = composeAhrefsProfileContext([{
    client_id: "bodymove",
    property_id: "bodymove.pl",
    provider: "ahrefs",
    operation: "site-explorer.profile",
    generated_at: "2026-07-29T08:00:00.000Z",
    request: { country: "pl" },
    analytics: {
      current: {
        top_pages: [{ url: "https://bodymove.pl/usluga", sum_traffic: 80, traffic_diff_percent: -230, traffic_diff_percent_ratio: -0.023 }],
        organic_keyword_rows: [{ keyword: "rehabilitacja", best_position: 5, serp_features: ["local_pack"], is_local: true }],
        competitors: [{ competitor_domain: "konkurent.pl", traffic: 55 }],
      },
    },
  }]);
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0]?.country, "pl");
  assert.equal(profiles[0]?.top_pages.length, 1);
  assert.equal(profiles[0]?.top_pages[0]?.traffic_diff_percent_ratio, -0.023);
  assert.equal(profiles[0]?.organic_keyword_rows[0]?.keyword, "rehabilitacja");
  assert.equal(profiles[0]?.competitors[0]?.competitor_domain, "konkurent.pl");
});

test("agency report renders legacy Ahrefs percentage units consistently in both appendices", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-agency-ahrefs-percent-test-"));
  try {
    const artifacts = join(root, "artifacts");
    const bundle = join(artifacts, "ahrefs-profile");
    await mkdir(bundle, { recursive: true });
    const withoutHash = {
      schema_version: "1", run_id: "run-ahrefs-profile", client_id: "bodymove", client_display_name: "Bodymove",
      property_refs: ["bodymove.pl"], generated_at: "2026-07-29T08:00:00.000Z", evidence_manifest_ref: "manifest.json",
      provider: "ahrefs", operation: "site-explorer.profile", request: { country: "pl" },
      analytics: { current_date_range: { start: "2026-07-29", end: "2026-07-29" }, current: {
        organic_traffic: 100, organic_keywords: 50, organic_keywords_top_3: 5,
        top_pages: [{ url: "https://bodymove.pl/usluga", sum_traffic: 80, traffic_diff_percent: -230 }],
        organic_keyword_rows: [], competitors: [],
      } },
    };
    const files = {
      "report.json": canonicalJson({ ...withoutHash, canonical_json_hash: sha256(canonicalJson(withoutHash)) }),
      "request.json": canonicalJson({ run_id: "run-ahrefs-profile", client_id: "bodymove", property_id: "bodymove.pl", provider: "ahrefs", operation: "site-explorer.profile", policy_mode: "read_only" }),
      "report.md": "# Ahrefs profile\n",
    };
    for (const [name, content] of Object.entries(files)) await writeFile(join(bundle, name), content);
    const manifestFiles = Object.fromEntries(Object.keys(files).map((name) => {
      const bytes = readFileSync(join(bundle, name));
      return [name, { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength }];
    }));
    await writeFile(join(bundle, "manifest.json"), canonicalJson({ schema_version: "1", files: manifestFiles }));
    const scope: ScopePlan = { schema_version: "1", generated_at: "2026-08-03T00:00:00.000Z", status: "ready", entries: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "bodymove.pl", provider: "ahrefs", status: "ready", reason: null, metrics: [] }] };
    const output = join(root, "report");
    await writeAgencyReport(artifacts, output, scope, "2026-08-03T00:00:00.000Z", { sources: [] });
    assert.match(await readFile(join(output, "agency-report-appendix.md"), "utf8"), /\| -2\.30% \|/);
    assert.match(await readFile(join(output, "agency-report-appendix.html"), "utf8"), />-2\.30%<\/td>/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
      allowEstimatedBudget: true,
      fetchImpl: async () => new Response(JSON.stringify({ keywords: [{ keyword: "fraza jedna", volume: 12, clicks: 3, difficulty: 7, parent_topic: "a|b\nc", serp_features: ["local_pack"] }] }), { status: 200 }),
    });
    const scope: ScopePlan = { schema_version: "1", generated_at: "2026-08-03T00:00:00.000Z", status: "partial", entries: [] };
    const output = join(root, "report");
    const summary = await writeAgencyReport(artifacts, output, scope, "2026-08-03T00:00:00.000Z", { sources: [] }, keywordBundle, inputPath, undefined, root);
    assert.deepEqual(summary.keyword_research?.input_groups.map((group) => [group.host, group.phrases.length]), [["wilmed.pl", 0], ["cmr-ostroleka.pl", 1]]);
    assert.equal(summary.keyword_research?.groups[0]?.rows[0]?.difficulty, 7);
    const appendix = await readFile(join(output, "agency-report-appendix.md"), "utf8");
    assert.match(appendix, /wilmed\.pl/);
    assert.match(appendix, /local_pack/);
    assert.match(appendix, /a\\\|b c/);

    const requestPath = join(keywordBundle, "request.json");
    const request = JSON.parse(await readFile(requestPath, "utf8")) as { groups: Array<{ host: string; phrases: string[] }> };
    const tamperedRequest = canonicalJson({ ...request, groups: [] });
    await writeFile(requestPath, tamperedRequest);
    const keywordManifestPath = join(keywordBundle, "manifest.json");
    const keywordManifest = JSON.parse(await readFile(keywordManifestPath, "utf8")) as { files: Record<string, { sha256: string; bytes: number }> };
    keywordManifest.files["request.json"] = { sha256: sha256(tamperedRequest), bytes: Buffer.byteLength(tamperedRequest) };
    await writeFile(keywordManifestPath, canonicalJson(keywordManifest));
    await assert.rejects(
      () => writeAgencyReport(artifacts, join(root, "tampered-report"), scope, "2026-08-03T00:00:00.000Z", { sources: [] }, keywordBundle, inputPath, undefined, root),
      /keyword request groups do not match supplied input/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agency report rejects a keyword manifest entry symlink escaping the bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-agency-keyword-symlink-test-"));
  try {
    const artifacts = join(root, "artifacts");
    await mkdir(artifacts);
    const inputPath = join(root, "phrases.txt");
    await writeFile(inputPath, "https://wilmed.pl/\nfraza jedna\n");
    const keywordBundle = join(root, "keywords");
    await writeAhrefsKeywordResearch({
      inputPath,
      outputDir: keywordBundle,
      capabilities: { capabilities: [{ capability_id: "ahrefs.keywords-explorer.overview", provider: "ahrefs", operation_id: "keywords-explorer.overview", api_version: "v3", metric_ids: ["ahrefs.keyword_metrics"], read_write: "read", state: "schema_verified" }] },
      apiKey: "test-key",
      allowEstimatedBudget: true,
      fetchImpl: async () => new Response(JSON.stringify({ keywords: [{ keyword: "fraza jedna", volume: 12, clicks: 3, difficulty: 7 }] }), { status: 200 }),
    });
    const outside = join(root, "outside-report.json");
    const report = await readFile(join(keywordBundle, "report.json"));
    await writeFile(outside, report);
    await rm(join(keywordBundle, "report.json"));
    await symlink(outside, join(keywordBundle, "report.json"));
    await assert.rejects(() => writeAgencyReport(artifacts, join(root, "report"), { schema_version: "1", generated_at: "2026-08-03T00:00:00.000Z", status: "partial", entries: [] }, "2026-08-03T00:00:00.000Z", { sources: [] }, keywordBundle, inputPath, undefined, root), /escapes its root through a symlink/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agency report binds an imported rank snapshot to its manifest provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-agency-rank-report-test-"));
  try {
    const artifacts = join(root, "artifacts");
    await mkdir(artifacts);
    const rankInput = join(root, "rank.json");
    await writeFile(rankInput, JSON.stringify({
      schema_version: "1",
      provider: "serprobot",
      client_id: "bodymove",
      captured_at: "2026-08-03T00:00:00.000Z",
      date_range: { start: "2026-07-01", end: "2026-07-31" },
      source_config: { project_id: "123", search_engine: "google.pl", location: "Warszawa", device: "desktop" },
      rows: [{ keyword: "rehabilitacja", position: 7, previous_position: 9, search_engine: "google.pl", location: "Warszawa", url: "https://bodymove.pl/" }],
    }));
    const rankBundle = join(root, "rank-bundle");
    await writeRankMonitoringBundle(rankInput, rankBundle);
    const scope: ScopePlan = {
      schema_version: "1",
      generated_at: "2026-08-03T00:00:00.000Z",
      status: "partial",
      entries: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "unavailable", reason: "no accepted GSC bundle", metrics: [] }],
    };
    const sourceRegistry: SourceRegistry = { sources: [{ source_id: "serprobot.bodymove", client_id: "bodymove", provider: "serprobot", target: "123", status: "ready", reason: null }] };
    const summary = await writeAgencyReport(artifacts, join(root, "report"), scope, "2026-08-03T00:00:00.000Z", sourceRegistry, undefined, undefined, rankBundle);
    assert.equal(summary.rank_monitoring?.client_id, "bodymove");
    assert.equal(summary.rank_monitoring?.row_count, 1);
    assert.match(await readFile(join(root, "report", "agency-report.md"), "utf8"), /Observed — SERPROBOT rank snapshot/);
    assert.equal(summary.rank_monitoring?.manifest_sha256.length, 64);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agency report accepts a rank-only client owned by the source registry", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-agency-rank-only-test-"));
  try {
    const artifacts = join(root, "artifacts");
    await mkdir(artifacts);
    const rankInput = join(root, "rank.json");
    await writeFile(rankInput, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "rank-only", captured_at: "2026-08-03T00:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, source_config: { project_id: "456", search_engine: "google.pl", location: null, device: null }, rows: [] }));
    const rankBundle = join(root, "rank-bundle");
    await writeRankMonitoringBundle(rankInput, rankBundle);
    const scope: ScopePlan = { schema_version: "1", generated_at: "2026-08-03T00:00:00.000Z", status: "partial", entries: [] };
    const sourceRegistry: SourceRegistry = { sources: [{ source_id: "serprobot.rank-only", client_id: "rank-only", provider: "serprobot", target: "456", status: "ready", reason: null }] };
    const summary = await writeAgencyReport(artifacts, join(root, "report"), scope, "2026-08-03T00:00:00.000Z", sourceRegistry, undefined, undefined, rankBundle);
    assert.equal(summary.rank_monitoring?.client_id, "rank-only");
    assert.equal(summary.source_status[0]?.client_id, "rank-only");
    assert.equal(summary.source_status[0]?.status, "ready");
    assert.equal(summary.report_status, "blocked");
    const foreignInput = join(root, "foreign-rank.json");
    await writeFile(foreignInput, JSON.stringify({ schema_version: "1", provider: "serprobot", snapshots: [
      { schema_version: "1", provider: "serprobot", client_id: "rank-only", captured_at: "2026-08-03T00:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, source_config: { project_id: "456", search_engine: "google.pl", location: null, device: null }, rows: [] },
      { schema_version: "1", provider: "serprobot", client_id: "foreign", captured_at: "2026-08-03T00:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, source_config: { project_id: "999", search_engine: "google.pl", location: null, device: null }, rows: [] },
    ] }));
    const foreignBundle = join(root, "foreign-bundle");
    await writeRankMonitoringBundle(foreignInput, foreignBundle);
    await assert.rejects(writeAgencyReport(artifacts, join(root, "foreign-report"), scope, "2026-08-03T00:00:00.000Z", sourceRegistry, undefined, undefined, foreignBundle), /rank monitoring client identity mismatch: foreign/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
