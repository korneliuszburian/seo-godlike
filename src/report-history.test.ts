import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findPreviousBundleLinks, readAnalyticsHistory, summarizeHistory, writeHistoryDashboard } from "./report-history.js";
import { writeReportPackage } from "./report-package.js";
import { canonicalJson, sha256 } from "./serialize.js";
import { buildDailyAnalyticsCron, buildMonthlyAgencyCron } from "./schedule.js";

async function writeBundle(root: string, name: string, start: string, clicks: number, runId = name, generatedAt = `${start}T08:00:00.000Z`, clientId = "bodymove", propertyId = "sc-domain:bodymove.pl"): Promise<void> {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  const report = {
    run_id: runId,
    client_id: clientId,
    client_display_name: "Bodymove",
    provider: "google-search-console",
    property_refs: [propertyId],
    generated_at: generatedAt,
    analytics: {
      current_date_range: { start, end: start },
      current: { clicks, impressions: clicks * 10, ctr: clicks === 0 ? 0 : 0.1, position: 2 },
    },
  };
  const content = `${JSON.stringify(report)}\n`;
  await writeFile(join(directory, "report.json"), content, "utf8");
  const manifest = {
    schema_version: "1",
    run_id: runId,
    files: { "report.json": { sha256: createHash("sha256").update(content).digest("hex"), bytes: Buffer.byteLength(content) } },
  };
  await writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest)}\n`, "utf8");
}

async function writeStrictBundle(root: string, name: string, value: number, generatedAt: string, provider: "google-search-console" | "google-analytics" = "google-search-console"): Promise<void> {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  const reportWithoutHash = provider === "google-search-console" ? {
    schema_version: "1", run_id: `run-${name}`, client_id: "bodymove", client_display_name: "Bodymove", property_refs: ["sc-domain:bodymove.pl"], generated_at: generatedAt, evidence_manifest_ref: "manifest.json", provider, operation: "search_analytics.query", analytics: { current_date_range: { start: "2026-07-01", end: "2026-07-28" }, current: { clicks: value, impressions: value * 10, ctr: 0.1, position: 2 } },
  } : {
    schema_version: "1", run_id: `run-${name}`, client_id: "bodymove", client_display_name: "Bodymove", property_refs: ["properties/123"], generated_at: generatedAt, evidence_manifest_ref: "manifest.json", provider, operation: "properties.runReport", analytics: { current_date_range: { start: "2026-07-01", end: "2026-07-28" }, current: { metric_id: "ga4.sessions", sessions: value, rows_received: 1, property_quota: null } },
  };
  const report = { ...reportWithoutHash, canonical_json_hash: sha256(canonicalJson(reportWithoutHash)) };
  const content = canonicalJson(report);
  const request = canonicalJson({ schema_version: "1", run_id: report.run_id, client_id: report.client_id, property_id: report.property_refs[0], provider: report.provider, operation: report.operation, policy_mode: "read_only" });
  await writeFile(join(directory, "report.json"), content, "utf8");
  await writeFile(join(directory, "request.json"), request, "utf8");
  await writeFile(join(directory, "manifest.json"), canonicalJson({ schema_version: "1", run_id: report.run_id, files: { "report.json": { sha256: sha256(content), bytes: Buffer.byteLength(content) }, "request.json": { sha256: sha256(request), bytes: Buffer.byteLength(request) } } }), "utf8");
}

test("history rejects a tampered manifest before consuming report data", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-history-test-"));
  const directory = join(root, "tampered");
  await mkdir(directory);
  await writeFile(join(directory, "report.json"), "{}\n", "utf8");
  await writeFile(join(directory, "manifest.json"), JSON.stringify({ files: { "report.json": { sha256: "bad", bytes: 3 } } }), "utf8");
  await assert.rejects(readAnalyticsHistory(root), /manifest hash mismatch/);
  await rm(root, { recursive: true, force: true });
});

test("scoped history ignores unrelated malformed bundles", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-history-test-"));
  await writeBundle(root, "bodymove", "2026-07-01", 4);
  const unrelated = join(root, "unrelated");
  await mkdir(unrelated);
  await writeFile(join(unrelated, "report.json"), "{}\n", "utf8");
  await writeFile(join(unrelated, "manifest.json"), JSON.stringify({ files: { "report.json": { sha256: "bad", bytes: 3 } } }), "utf8");
  const malformed = join(root, "malformed-manifest");
  await mkdir(malformed);
  await writeFile(join(malformed, "report.json"), "{}\n", "utf8");
  await writeFile(join(malformed, "manifest.json"), "not-json\n", "utf8");
  const entries = await readAnalyticsHistory(root, [{ client_id: "bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console" }]);
  assert.deepEqual(entries.map((entry) => entry.client_id), ["bodymove"]);
  await rm(root, { recursive: true, force: true });
});

test("scoped history fails closed for a malformed in-scope report", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-history-test-"));
  const directory = join(root, "bodymove");
  await mkdir(directory);
  const content = `${JSON.stringify({ client_id: "bodymove", provider: "google-search-console", property_refs: ["sc-domain:bodymove.pl"] })}\n`;
  await writeFile(join(directory, "report.json"), content, "utf8");
  await writeFile(join(directory, "manifest.json"), JSON.stringify({ files: { "report.json": { sha256: sha256(content), bytes: Buffer.byteLength(content) } } }), "utf8");
  await assert.rejects(readAnalyticsHistory(root, [{ client_id: "bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console" }]), /invalid in-scope history report/);
  await rm(root, { recursive: true, force: true });
});

test("history follows an in-root bundle symlink without dropping the bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-history-symlink-test-"));
  try {
    await writeBundle(root, "real-bundle", "2026-07-01", 4);
    await symlink(join(root, "real-bundle"), join(root, "alias-bundle"));
    const entries = await readAnalyticsHistory(root);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.run_id, "real-bundle");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("history rejects a symlinked bundle escaping the artifacts root", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-history-escape-test-"));
  const outside = await mkdtemp(join(tmpdir(), "seo-godlike-history-outside-"));
  try {
    await writeBundle(outside, "outside-bundle", "2026-07-01", 4);
    await mkdir(join(root, "escaped-bundle"));
    await rm(join(root, "escaped-bundle", "manifest.json"), { force: true });
    await symlink(join(outside, "outside-bundle", "manifest.json"), join(root, "escaped-bundle", "manifest.json"));
    await assert.rejects(readAnalyticsHistory(root), /history symlink escapes artifacts root/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("history aggregates two bundles chronologically and writes deterministic dashboard", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-history-test-"));
  await writeBundle(root, "later", "2026-07-01", 4);
  await writeBundle(root, "earlier", "2026-06-30", 2);
  const entries = await readAnalyticsHistory(root);
  assert.deepEqual(entries.map((entry) => entry.bundle_path), ["earlier", "later"]);
  const summary = summarizeHistory(entries);
  assert.equal(summary.bundle_count, 2);
  assert.deepEqual(summary.skipped_bundles, []);
  assert.equal(summary.totals.clicks, 6);
  assert.equal(summary.totals.impressions, 60);
  assert.equal(summary.periods[1]?.comparison?.clicks_delta, 2);
  assert.equal(summary.periods[1]?.comparison?.position_delta, 0);
  const output = join(root, "dashboard");
  await writeHistoryDashboard(root, output);
  assert.match(await readFile(join(output, "executive-summary.md"), "utf8"), /2026-06-30/);
  assert.match(await readFile(join(output, "executive-summary.html"), "utf8"), /<table>/);
  assert.equal(JSON.parse(await readFile(join(output, "executive-summary.json"), "utf8")).bundle_count, 2);
  assert.equal((await stat(output)).mode & 0o777, 0o700);
  assert.equal((await stat(join(output, "executive-summary.html"))).mode & 0o777, 0o600);
  const dashboardManifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8")) as { files: Record<string, { sha256: string; bytes: number }> };
  assert.deepEqual(Object.keys(dashboardManifest.files).sort(), ["executive-summary.html", "executive-summary.json", "executive-summary.md"]);
  for (const [name, expected] of Object.entries(dashboardManifest.files)) {
    const bytes = await readFile(join(output, name));
    assert.equal(bytes.byteLength, expected.bytes);
    assert.equal(sha256(bytes.toString("utf8")), expected.sha256);
  }
  assert.deepEqual(await findPreviousBundleLinks(root, join(root, "new-run")), ["../earlier/report.md", "../later/report.md"]);
  await rm(root, { recursive: true, force: true });
});

test("history dashboard manifest is independent of the absolute artifacts root", async () => {
  const first = await mkdtemp(join(tmpdir(), "seo-godlike-history-root-a-"));
  const second = await mkdtemp(join(tmpdir(), "seo-godlike-history-root-b-"));
  try {
    await writeBundle(first, "same", "2026-07-01", 4);
    await writeBundle(second, "same", "2026-07-01", 4);
    await writeHistoryDashboard(first, join(first, "dashboard"));
    await writeHistoryDashboard(second, join(second, "dashboard"));
    assert.equal(await readFile(join(first, "dashboard", "manifest.json"), "utf8"), await readFile(join(second, "dashboard", "manifest.json"), "utf8"));
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

test("history keeps the latest generated duplicate run and warns about the skipped bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-history-test-"));
  await writeBundle(root, "older", "2026-07-01", 2, "same-run", "2026-07-02T08:00:00.000Z");
  await writeBundle(root, "newer", "2026-07-01", 7, "same-run", "2026-07-03T08:00:00.000Z");
  let stderr = "";
  const originalWrite = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += chunk.toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    const entries = await readAnalyticsHistory(root);
    assert.deepEqual(entries.map((entry) => entry.bundle_path), ["newer"]);
    assert.equal(entries[0]?.metrics.clicks, 7);
    assert.match(stderr, /skipping bundle 'older'/);
    const output = join(root, "dashboard");
    await writeHistoryDashboard(root, output);
    assert.deepEqual(JSON.parse(await readFile(join(output, "executive-summary.json"), "utf8")).skipped_bundles, ["older"]);
    assert.match(await readFile(join(output, "executive-summary.md"), "utf8"), /## Pominięte pakiety\n\n- older/);
  } finally {
    process.stderr.write = originalWrite;
    await rm(root, { recursive: true, force: true });
  }
});

test("history keeps equal run ids separate across canonical properties", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-history-test-"));
  await writeBundle(root, "bodymove", "2026-07-01", 2, "same-run", "2026-07-03T08:00:00.000Z", "bodymove", "sc-domain:bodymove.pl");
  await writeBundle(root, "other-property", "2026-07-01", 5, "same-run", "2026-07-02T08:00:00.000Z", "bodymove", "sc-domain:other-property.pl");
  const entries = await readAnalyticsHistory(root);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((entry) => entry.property_id).sort(), ["sc-domain:bodymove.pl", "sc-domain:other-property.pl"]);
  await rm(root, { recursive: true, force: true });
});

test("history rejects an invalid generated_at before deduplication", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-history-test-"));
  await writeBundle(root, "invalid", "2026-07-01", 1, "invalid-run", "not-a-date");
  await assert.rejects(readAnalyticsHistory(root), /invalid generated_at: not-a-date/);
  await rm(root, { recursive: true, force: true });
});

test("history HTML escapes bundle paths for local export", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-history-test-"));
  await writeBundle(root, "<unsafe>", "2026-07-01", 1);
  const output = join(root, "dashboard");
  await writeHistoryDashboard(root, output);
  const html = await readFile(join(output, "executive-summary.html"), "utf8");
  assert.match(html, /&lt;unsafe&gt;/);
  assert.doesNotMatch(html, /<unsafe>/);
  await rm(root, { recursive: true, force: true });
});

test("empty artifacts directory produces a zero-bundle dashboard", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-history-test-"));
  const output = join(root, "dashboard");
  const summary = await writeHistoryDashboard(root, output);
  assert.equal(summary.bundle_count, 0);
  assert.deepEqual(summary.skipped_bundles, []);
  assert.doesNotMatch(await readFile(join(output, "executive-summary.md"), "utf8"), /## Skipped bundles/);
  assert.equal(summary.totals.clicks, 0);
  await rm(root, { recursive: true, force: true });
});

test("report package verifies manifests, preserves rejected bundles, and writes deterministic outputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-package-test-"));
  await writeStrictBundle(root, "valid", 12, "2026-07-28T08:00:00Z");
  await writeStrictBundle(root, "ga4", 5, "2026-07-29T08:00:00Z", "google-analytics");
  const tampered = join(root, "tampered");
  await mkdir(tampered);
  await writeFile(join(tampered, "report.json"), "{}\n", "utf8");
  await writeFile(join(tampered, "manifest.json"), canonicalJson({ files: { "report.json": { sha256: "bad", bytes: 3 } } }), "utf8");
  const output = join(root, "package");
  const summary = await writeReportPackage(root, output);
  assert.equal(summary.package_status, "partial");
  assert.equal(summary.bundle_count, 2);
  assert.deepEqual(summary.skipped_bundles, []);
  assert.equal(summary.accepted_bundles[0]?.metric_id, "gsc.clicks");
  assert.match(summary.accepted_bundles[0]?.manifest_sha256 ?? "", /^[a-f0-9]{64}$/);
  assert.equal(summary.accepted_bundles[1]?.metric_id, "ga4.sessions");
  assert.deepEqual(summary.rejected_bundles.map((entry) => entry.bundle_path), ["tampered"]);
  assert.match(summary.rejected_bundles[0]?.reason ?? "", /manifest hash mismatch/);
  assert.match(await readFile(join(output, "report-package.html"), "utf8"), /<table>/);
  const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8")) as { files: Record<string, { sha256: string; bytes: number }> };
  for (const [name, expected] of Object.entries(manifest.files)) {
    const bytes = await readFile(join(output, name));
    assert.equal(bytes.byteLength, expected.bytes);
    assert.equal(sha256(bytes.toString("utf8")), expected.sha256);
  }
  await rm(root, { recursive: true, force: true });
});

test("report package is empty without manifests and rejects invalid reportability metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-package-test-"));
  const emptyOutput = join(root, "empty-package");
  const empty = await writeReportPackage(root, emptyOutput);
  assert.equal(empty.package_status, "empty");
  assert.deepEqual(empty.skipped_bundles, []);
  const invalid = join(root, "invalid");
  await mkdir(invalid);
  const report = canonicalJson({ run_id: "invalid", client_id: "bodymove", client_display_name: "Bodymove", property_refs: ["sc-domain:bodymove.pl"], generated_at: "2026-07-28T08:00:00Z", evidence_manifest_ref: "manifest.json", provider: "google-search-console", operation: "search_analytics.query", analytics: { current_date_range: { start: "2026-07-01", end: "2026-07-28" }, current: { clicks: 1, impressions: 10, ctr: 0.1, position: 2 } }, canonical_json_hash: "wrong" });
  const request = canonicalJson({ run_id: "invalid", client_id: "bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", operation: "search_analytics.query", policy_mode: "read_only" });
  await writeFile(join(invalid, "report.json"), report, "utf8");
  await writeFile(join(invalid, "request.json"), request, "utf8");
  await writeFile(join(invalid, "manifest.json"), canonicalJson({ files: { "report.json": { sha256: sha256(report), bytes: Buffer.byteLength(report) }, "request.json": { sha256: sha256(request), bytes: Buffer.byteLength(request) } } }), "utf8");
  const invalidOutput = join(root, "invalid-package");
  const result = await writeReportPackage(invalid, invalidOutput);
  assert.equal(result.package_status, "partial");
  assert.match(result.rejected_bundles[0]?.reason ?? "", /canonical_json_hash mismatch/);
  await rm(root, { recursive: true, force: true });
});

test("report package rejects non-date-only current periods at ingest", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-package-date-test-"));
  try {
    await writeStrictBundle(root, "invalid-date", 4, "2026-07-28T08:00:00Z");
    const directory = join(root, "invalid-date");
    const report = JSON.parse(await readFile(join(directory, "report.json"), "utf8")) as Record<string, unknown>;
    const analytics = report.analytics as Record<string, unknown>;
    const range = analytics.current_date_range as Record<string, unknown>;
    range.end = "2026-07-28T00:00:00.000Z";
    const { canonical_json_hash: _hash, ...withoutHash } = report;
    const content = canonicalJson({ ...withoutHash, canonical_json_hash: sha256(canonicalJson(withoutHash)) });
    const request = await readFile(join(directory, "request.json"), "utf8");
    await writeFile(join(directory, "report.json"), content, "utf8");
    await writeFile(join(directory, "manifest.json"), canonicalJson({ schema_version: "1", run_id: report.run_id, files: { "report.json": { sha256: sha256(content), bytes: Buffer.byteLength(content) }, "request.json": { sha256: sha256(request), bytes: Buffer.byteLength(request) } } }), "utf8");
    const summary = await writeReportPackage(root, join(root, "package"));
    assert.equal(summary.package_status, "partial");
    assert.match(summary.rejected_bundles[0]?.reason ?? "", /invalid current date range end/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("report package rejects a manifest entry symlink escaping the bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-package-symlink-test-"));
  try {
    await writeStrictBundle(root, "valid", 12, "2026-07-28T08:00:00Z");
    const bundle = join(root, "valid");
    const outside = join(root, "outside-report.json");
    const report = await readFile(join(bundle, "report.json"));
    await writeFile(outside, report);
    await rm(join(bundle, "report.json"));
    await symlink(outside, join(bundle, "report.json"));
    const summary = await writeReportPackage(root, join(root, "package"));
    assert.match(summary.rejected_bundles[0]?.reason ?? "", /escapes its root through a symlink/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("report package rejects a report whose request is not read-only", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-package-test-"));
  await writeStrictBundle(root, "write-request", 4, "2026-07-28T08:00:00Z");
  const requestPath = join(root, "write-request", "request.json");
  const request = canonicalJson({ policy_mode: "write", provider: "google-search-console", operation: "search_analytics.query", client_id: "bodymove", property_id: "sc-domain:bodymove.pl" });
  await writeFile(requestPath, request, "utf8");
  const manifestPath = join(root, "write-request", "manifest.json");
  const reportBytes = await readFile(join(root, "write-request", "report.json"));
  await writeFile(manifestPath, canonicalJson({ files: { "report.json": { sha256: sha256(reportBytes.toString("utf8")), bytes: reportBytes.byteLength }, "request.json": { sha256: sha256(request), bytes: Buffer.byteLength(request) } } }), "utf8");
  const summary = await writeReportPackage(root, join(root, "package"));
  assert.equal(summary.package_status, "partial");
  assert.match(summary.rejected_bundles[0]?.reason ?? "", /read-only request metadata/);
  await rm(root, { recursive: true, force: true });
});

test("report package does not consume its own nested output manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-package-test-"));
  await writeStrictBundle(root, "valid", 3, "2026-07-28T08:00:00Z");
  const output = join(root, "package");
  const summary = await writeReportPackage(root, output);
  assert.equal(summary.package_status, "reportable");
  assert.equal(summary.bundle_count, 1);
  assert.deepEqual(summary.skipped_bundles, []);
  assert.deepEqual(summary.rejected_bundles, []);
  await rm(root, { recursive: true, force: true });
});

test("report package deduplicates the same run identity without double counting", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-package-test-"));
  await writeStrictBundle(root, "older", 2, "2026-07-28T08:00:00Z");
  await writeStrictBundle(root, "newer", 9, "2026-07-29T08:00:00Z");
  const newerReport = JSON.parse(await readFile(join(root, "newer", "report.json"), "utf8")) as Record<string, unknown>;
  const olderReport = JSON.parse(await readFile(join(root, "older", "report.json"), "utf8")) as Record<string, unknown>;
  const sameRun = { ...newerReport, run_id: olderReport.run_id, canonical_json_hash: "" };
  const { canonical_json_hash: _, ...withoutHash } = sameRun;
  const content = canonicalJson({ ...withoutHash, canonical_json_hash: sha256(canonicalJson(withoutHash)) });
  const request = canonicalJson({ schema_version: "1", run_id: olderReport.run_id, client_id: "bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", operation: "search_analytics.query", policy_mode: "read_only" });
  await writeFile(join(root, "newer", "report.json"), content, "utf8");
  await writeFile(join(root, "newer", "request.json"), request, "utf8");
  await writeFile(join(root, "newer", "manifest.json"), canonicalJson({ schema_version: "1", run_id: olderReport.run_id, files: { "report.json": { sha256: sha256(content), bytes: Buffer.byteLength(content) }, "request.json": { sha256: sha256(request), bytes: Buffer.byteLength(request) } } }), "utf8");
  const summary = await writeReportPackage(root, join(root, "package"));
  assert.equal(summary.bundle_count, 1);
  assert.equal(summary.accepted_bundles[0]?.value, 9);
  assert.deepEqual(summary.skipped_bundles, ["older"]);
  await rm(root, { recursive: true, force: true });
});

test("schedule only renders a daily cron entry", () => {
  const entry = buildDailyAnalyticsCron({
    workingDirectory: "/work/seo-godlike",
    oauthClientPath: "/secure/oauth-client.json",
    clientId: "bodymove",
    propertyId: "sc-domain:bodymove.pl",
    registryPath: "fixtures/client-registry.json",
    capabilitiesPath: "fixtures/capability-registry.json",
    artifactsDir: "artifacts/analysis",
  });
  assert.match(entry, /^17 3 \* \* \* /);
  assert.match(entry, /--analytics/);
  assert.match(entry, /flock -n 'artifacts\/analysis\/\.bodymove-analytics\.lock' node/);
  assert.match(entry, /date \+\\%Y\\%m\\%d/);
  assert.match(entry, /date \+\\%Y\\%m\\%dT\\%H\\%M\\%S/);
  assert.match(entry, /--output 'artifacts\/analysis'\/bodymove-analytics-pipeline-\$\(date/);
  assert.doesNotMatch(entry, /--output 'artifacts\/analysis\/bodymove-analytics-pipeline/);
  assert.doesNotMatch(entry, /crontab/);
});

test("schedule uses the client id in the output path", () => {
  const entry = buildDailyAnalyticsCron({
    workingDirectory: "/work/seo-godlike",
    oauthClientPath: "/secure/oauth-client.json",
    clientId: "acme",
    propertyId: "sc-domain:acme.example",
    registryPath: "fixtures/client-registry.json",
    capabilitiesPath: "fixtures/capability-registry.json",
    artifactsDir: "artifacts/analysis",
  });
  assert.match(entry, /--output 'artifacts\/analysis'\/acme-analytics-pipeline-\$\(date/);
});

test("schedule rejects unsafe client id path segments", () => {
  const options = {
    workingDirectory: "/work/seo-godlike",
    oauthClientPath: "/secure/oauth-client.json",
    clientId: "bad/client",
    propertyId: "sc-domain:bad.example",
    registryPath: "fixtures/client-registry.json",
    capabilitiesPath: "fixtures/capability-registry.json",
    artifactsDir: "artifacts/analysis",
  };
  assert.throws(() => buildDailyAnalyticsCron(options), /shell-safe path segment/);
  assert.throws(() => buildDailyAnalyticsCron({ ...options, clientId: "bad client" }), /shell-safe path segment/);
});

test("monthly agency schedule runs the complete report and delivery pipeline", () => {
  const entry = buildMonthlyAgencyCron({ workingDirectory: "/work/seo-godlike", oauthClientPath: "/secure/oauth-client.json", registryPath: "fixtures/client-registry.json", capabilitiesPath: "fixtures/capability-registry.json", sourceRegistryPath: "fixtures/source-registry.json", artifactsDir: "artifacts/analysis", reportDir: "artifacts/reports", deliveryDir: "artifacts/delivery", clientContentPath: "fixtures/client-content.json", clientContentBundlePath: "fixtures/client-content-bundle", rankMonitoringRoot: "artifacts/rank-exports", keywordBundlePath: "artifacts/keyword-bundles/report", keywordInputPath: "fixtures/keywords.txt", keywordBundleRoot: "artifacts/keyword-bundles", keywordResearch: true, allowEstimatedBudget: true, keywordCountry: "pl", ahrefsDate: "2026-07-29", ahrefsCountry: "pl", keywordMaxRequests: "4", keywordMaxApiUnits: "200" });
  assert.match(entry, /^47 3 1 \* \* /);
  assert.match(entry, /install -d -m 700 'artifacts\/analysis' 'artifacts\/reports' 'artifacts\/delivery'/);
  assert.match(entry, /--agency-run/);
  assert.match(entry, /--artifacts-dir/);
  assert.match(entry, /artifacts\/analysis/);
  assert.match(entry, /flock -n 'artifacts\/analysis\/\.agency-monthly\.lock' sh -c/);
  assert.match(entry, /agency_run_stamp=\$\(date \+\\%Y\\%m\\%dT\\%H\\%M\\%S\)/);
  assert.match(entry, /--agency-report-output/);
  assert.match(entry, /agency-report-\"\$agency_run_stamp\"/);
  assert.match(entry, /--delivery-output/);
  assert.match(entry, /client-delivery-\"\$agency_run_stamp\"/);
  assert.match(entry, /--keyword-research --keyword-research-output/);
  assert.match(entry, /--allow-estimated-budget/);
  assert.match(entry, /--keyword-max-api-units/);
  assert.match(entry, /200/);
  assert.match(entry, /--ahrefs-date/);
  assert.match(entry, /2026-07-29/);
  assert.match(entry, /--ahrefs-country/);
  assert.match(entry, /agency_run_exit=\$\?/);
  assert.match(entry, /--report-history/);
  assert.match(entry, /--rank-history/);
  assert.match(entry, /if \[ "\$agency_run_exit" -ne 0 \]; then exit "\$agency_run_exit"; fi/);
  assert.match(entry, /if \[ "\$history_exit" -ne 0 \]; then exit "\$history_exit"; fi; exit "\$rank_history_exit"; \}/);
  assert.equal((entry.match(/date \+\\%Y\\%m\\%dT\\%H\\%M\\%S/g) ?? []).length, 1);
  assert.doesNotMatch(entry, /--output 'artifacts\/reports\/history-\$\(date/);
  assert.match(entry, /--source-registry/);
  assert.match(entry, /source-registry\.json/);
  assert.match(entry, /--client-content/);
  assert.match(entry, /client-content\.json/);
  assert.match(entry, /--client-content-bundle/);
  assert.match(entry, /client-content-bundle/);
  assert.match(entry, /--rank-monitoring-root/);
  assert.match(entry, /--keyword-bundle/);
  assert.match(entry, /keyword-bundles\/report/);
  assert.match(entry, /--keyword-input/);
  assert.match(entry, /keywords\.txt/);
  assert.match(entry, /--keyword-bundle-root/);
  assert.match(entry, /keyword-bundles/);
  assert.match(entry, /flock -n 'artifacts\/analysis\/\.agency-monthly\.lock' sh -c/);
});

test("monthly keyword research refuses an input-less schedule", () => {
  assert.throws(() => buildMonthlyAgencyCron({ workingDirectory: "/work/seo-godlike", oauthClientPath: "/secure/oauth-client.json", registryPath: "registry.json", capabilitiesPath: "capabilities.json", artifactsDir: "artifacts", reportDir: "reports", deliveryDir: "delivery", keywordResearch: true }), /requires keywordInputPath/);
});

test("monthly agency schedule rejects two rank monitoring sources", () => {
  assert.throws(() => buildMonthlyAgencyCron({ workingDirectory: "/work/seo-godlike", oauthClientPath: "/secure/oauth-client.json", registryPath: "registry.json", capabilitiesPath: "capabilities.json", artifactsDir: "artifacts", reportDir: "reports", deliveryDir: "delivery", rankMonitoringPath: "export", rankMonitoringRoot: "exports" }), /mutually exclusive/);
});

test("monthly keyword research requires explicit estimated-budget acceptance", () => {
  assert.throws(() => buildMonthlyAgencyCron({ workingDirectory: "/work/seo-godlike", oauthClientPath: "/secure/oauth-client.json", registryPath: "registry.json", capabilitiesPath: "capabilities.json", artifactsDir: "artifacts", reportDir: "reports", deliveryDir: "delivery", keywordResearch: true, keywordInputPath: "fixtures/keywords.txt" }), /requires allowEstimatedBudget/);
  const entry = buildMonthlyAgencyCron({ workingDirectory: "/work/seo-godlike", oauthClientPath: "/secure/oauth-client.json", registryPath: "registry.json", capabilitiesPath: "capabilities.json", artifactsDir: "artifacts", reportDir: "reports", deliveryDir: "delivery", keywordResearch: true, keywordInputPath: "fixtures/keywords.txt", allowEstimatedBudget: true });
  assert.match(entry, /--allow-estimated-budget/);
});

test("monthly agency schedule can render rank history from existing snapshots", () => {
  const entry = buildMonthlyAgencyCron({ workingDirectory: "/work/seo-godlike", oauthClientPath: "/secure/oauth-client.json", registryPath: "fixtures/client-registry.json", capabilitiesPath: "fixtures/capability-registry.json", artifactsDir: "artifacts/analysis", reportDir: "artifacts/reports", deliveryDir: "artifacts/delivery", rankHistoryDir: "artifacts/reports/rank-history" });
  assert.match(entry, /--rank-history/);
  assert.match(entry, /rank-history/);
});

test("monthly agency schedule prepares explicit history roots", () => {
  const entry = buildMonthlyAgencyCron({
    workingDirectory: "/work/seo-godlike",
    oauthClientPath: "/secure/oauth-client.json",
    registryPath: "registry.json",
    capabilitiesPath: "capabilities.json",
    artifactsDir: "artifacts",
    reportDir: "reports",
    deliveryDir: "delivery",
    historyDir: "custom/history",
    rankHistoryDir: "custom/rank-history",
  });
  assert.match(entry, /install -d -m 700 'artifacts' 'reports' 'delivery' 'custom'/);
});

test("monthly agency schedule never chmods the working directory for single-segment history roots", () => {
  const entry = buildMonthlyAgencyCron({
    workingDirectory: "/work/seo-godlike",
    oauthClientPath: "/secure/oauth-client.json",
    registryPath: "registry.json",
    capabilitiesPath: "capabilities.json",
    artifactsDir: "artifacts",
    reportDir: "reports",
    deliveryDir: "delivery",
    historyDir: "history",
    rankHistoryDir: "rank-history",
  });
  assert.match(entry, /install -d -m 700 'artifacts' 'reports' 'delivery'/);
  assert.doesNotMatch(entry, /install -d -m 700[^&]*'\.'/);
});

test("monthly agency schedule never prepares the filesystem root", () => {
  const entry = buildMonthlyAgencyCron({
    workingDirectory: "/work/seo-godlike",
    oauthClientPath: "/secure/oauth-client.json",
    registryPath: "registry.json",
    capabilitiesPath: "capabilities.json",
    artifactsDir: "artifacts",
    reportDir: "reports",
    deliveryDir: "delivery",
    historyDir: "/history",
  });
  assert.doesNotMatch(entry, /install -d -m 700[^&]*'\/'/);
});

test("monthly agency schedule rejects parent traversal in explicit history roots", () => {
  assert.throws(() => buildMonthlyAgencyCron({
    workingDirectory: "/work/seo-godlike",
    oauthClientPath: "/secure/oauth-client.json",
    registryPath: "registry.json",
    capabilitiesPath: "capabilities.json",
    artifactsDir: "artifacts",
    reportDir: "reports",
    deliveryDir: "delivery",
    historyDir: "custom/../history",
  }), /historyDir must not contain parent traversal/);
});
