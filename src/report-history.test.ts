import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findPreviousBundleLinks, readAnalyticsHistory, summarizeHistory, writeHistoryDashboard } from "./report-history.js";
import { buildDailyAnalyticsCron } from "./schedule.js";

async function writeBundle(root: string, name: string, start: string, clicks: number, runId = name, generatedAt = `${start}T08:00:00.000Z`): Promise<void> {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  const report = {
    run_id: runId,
    client_id: "bodymove",
    client_display_name: "Bodymove",
    property_refs: ["sc-domain:bodymove.pl"],
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

test("history rejects a tampered manifest before consuming report data", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-history-test-"));
  const directory = join(root, "tampered");
  await mkdir(directory);
  await writeFile(join(directory, "report.json"), "{}\n", "utf8");
  await writeFile(join(directory, "manifest.json"), JSON.stringify({ files: { "report.json": { sha256: "bad", bytes: 3 } } }), "utf8");
  await assert.rejects(readAnalyticsHistory(root), /manifest hash mismatch/);
  await rm(root, { recursive: true, force: true });
});

test("history aggregates two bundles chronologically and writes deterministic dashboard", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-history-test-"));
  await writeBundle(root, "later", "2026-07-01", 4);
  await writeBundle(root, "earlier", "2026-06-01", 2);
  const entries = await readAnalyticsHistory(root);
  assert.deepEqual(entries.map((entry) => entry.bundle_path), ["earlier", "later"]);
  const summary = summarizeHistory(entries);
  assert.equal(summary.bundle_count, 2);
  assert.deepEqual(summary.skipped_bundles, []);
  assert.equal(summary.totals.clicks, 6);
  assert.equal(summary.totals.impressions, 60);
  const output = join(root, "dashboard");
  await writeHistoryDashboard(root, output);
  assert.match(await readFile(join(output, "executive-summary.md"), "utf8"), /2026-06-01/);
  assert.equal(JSON.parse(await readFile(join(output, "executive-summary.json"), "utf8")).bundle_count, 2);
  assert.deepEqual(await findPreviousBundleLinks(root, join(root, "new-run")), ["../earlier/report.md", "../later/report.md"]);
  await rm(root, { recursive: true, force: true });
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
  } finally {
    process.stderr.write = originalWrite;
    await rm(root, { recursive: true, force: true });
  }
});

test("history rejects an invalid generated_at before deduplication", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-history-test-"));
  await writeBundle(root, "invalid", "2026-07-01", 1, "invalid-run", "not-a-date");
  await assert.rejects(readAnalyticsHistory(root), /invalid generated_at: not-a-date/);
  await rm(root, { recursive: true, force: true });
});

test("empty artifacts directory produces a zero-bundle dashboard", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-history-test-"));
  const output = join(root, "dashboard");
  const summary = await writeHistoryDashboard(root, output);
  assert.equal(summary.bundle_count, 0);
  assert.deepEqual(summary.skipped_bundles, []);
  assert.equal(summary.totals.clicks, 0);
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
  assert.match(entry, /date \+\\%Y\\%m\\%d/);
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
