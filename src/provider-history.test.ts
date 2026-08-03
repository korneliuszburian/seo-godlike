import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { canonicalJson } from "./serialize.js";
import { readProviderHistory } from "./provider-history.js";

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

async function writeBundle(root: string, name: string, report: Record<string, unknown>): Promise<void> {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  const content = canonicalJson(report);
  await writeFile(join(directory, "report.json"), content, "utf8");
  await writeFile(join(directory, "report.md"), "report\n", "utf8");
  await writeFile(join(directory, "manifest.json"), canonicalJson({ schema_version: "1", files: {
    "report.json": { sha256: hash(content), bytes: Buffer.byteLength(content) },
    "report.md": { sha256: hash("report\n"), bytes: Buffer.byteLength("report\n") },
  } }), "utf8");
}

function report(provider: "google-search-console" | "google-analytics" | "ahrefs", start: string, end: string, value: number, runId: string): Record<string, unknown> {
  const current = provider === "google-search-console"
    ? { clicks: value, impressions: value * 10, ctr: 0.1, position: 8 }
    : provider === "google-analytics"
      ? { metric_id: "ga4.sessions", sessions: value, rows_received: 1, property_quota: null }
      : { metric_id: "ahrefs.org_traffic", organic_traffic: value, organic_keywords: value + 10, organic_keywords_top_3: value + 2 };
  const property = provider === "google-search-console" ? "sc-domain:bodymove.pl" : provider === "google-analytics" ? "properties/123" : "bodymove.pl";
  return { schema_version: "1", run_id: runId, client_id: "bodymove", client_display_name: "Bodymove", provider, operation: provider === "google-search-console" ? "search_analytics.query" : provider === "google-analytics" ? "properties.runReport" : "site-explorer.metrics", property_refs: [property], generated_at: `${end}T08:00:00.000Z`, analytics: { current_date_range: { start, end }, current } };
}

test("provider history compares GSC, GA4 and Ahrefs without aggregating providers", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-provider-history-"));
  await writeBundle(root, "gsc-previous", report("google-search-console", "2026-06-01", "2026-06-28", 10, "gsc-previous"));
  await writeBundle(root, "gsc-current", report("google-search-console", "2026-06-29", "2026-07-26", 20, "gsc-current"));
  await writeBundle(root, "ga4-current", report("google-analytics", "2026-06-29", "2026-07-26", 30, "ga4-current"));
  await writeBundle(root, "ahrefs-current", report("ahrefs", "2026-06-29", "2026-07-26", 40, "ahrefs-current"));
  const entries = await readProviderHistory(root);
  assert.deepEqual(entries.map((entry) => entry.provider), ["google-search-console", "ahrefs", "google-analytics", "google-search-console"]);
  const currentGsc = entries.find((entry) => entry.run_id === "gsc-current")!;
  assert.equal(currentGsc.comparison?.metrics.clicks.delta, 10);
  assert.equal(entries.find((entry) => entry.run_id === "ga4-current")?.metrics[0]?.value, 30);
  assert.equal(entries.find((entry) => entry.run_id === "ahrefs-current")?.metrics.find((metric) => metric.key === "organic_traffic")?.value, 40);
  assert.equal(entries.filter((entry) => entry.provider === "google-search-console").length, 2);
  await rm(root, { recursive: true, force: true });
});

test("provider history fails closed for a tampered in-scope bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-provider-history-"));
  await writeBundle(root, "tampered", report("ahrefs", "2026-06-29", "2026-07-26", 40, "tampered"));
  await writeFile(join(root, "tampered", "report.json"), canonicalJson(report("ahrefs", "2026-06-29", "2026-07-26", 41, "tampered")), "utf8");
  await assert.rejects(readProviderHistory(root, [{ client_id: "bodymove", property_id: "bodymove.pl", provider: "ahrefs" }]), /manifest hash mismatch/);
  await rm(root, { recursive: true, force: true });
});

test("provider history scopes by provider identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-provider-history-"));
  await writeBundle(root, "gsc", report("google-search-console", "2026-06-29", "2026-07-26", 10, "gsc"));
  await writeBundle(root, "ahrefs", report("ahrefs", "2026-06-29", "2026-07-26", 20, "ahrefs"));
  const entries = await readProviderHistory(root, [{ client_id: "bodymove", property_id: "bodymove.pl", provider: "ahrefs" }]);
  assert.deepEqual(entries.map((entry) => entry.provider), ["ahrefs"]);
  await rm(root, { recursive: true, force: true });
});

test("provider history rejects a non-adjacent comparison", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-provider-history-"));
  await writeBundle(root, "previous", report("google-analytics", "2026-06-01", "2026-06-28", 10, "previous"));
  await writeBundle(root, "current", report("google-analytics", "2026-07-01", "2026-07-28", 20, "current"));
  const entries = await readProviderHistory(root);
  assert.equal(entries.find((entry) => entry.run_id === "current")?.comparison, undefined);
  await rm(root, { recursive: true, force: true });
});

test("provider history ignores unrelated reports while preserving a malformed in-scope report as an error", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-provider-history-"));
  await writeBundle(root, "valid", report("google-analytics", "2026-06-29", "2026-07-26", 20, "valid"));
  const malformed = join(root, "malformed");
  await mkdir(malformed);
  const content = canonicalJson({ client_id: "other", provider: "ahrefs", property_refs: ["other.pl"] });
  await writeFile(join(malformed, "report.json"), content, "utf8");
  await writeFile(join(malformed, "manifest.json"), canonicalJson({ files: { "report.json": { sha256: hash(content), bytes: Buffer.byteLength(content) } } }), "utf8");
  const entries = await readProviderHistory(root, [{ client_id: "bodymove", property_id: "properties/123", provider: "google-analytics" }]);
  assert.deepEqual(entries.map((entry) => entry.run_id), ["valid"]);
  await rm(root, { recursive: true, force: true });
});

test("provider history rejects a manifest file symlink escaping the bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-provider-history-"));
  const outside = join(root, "outside-report.json");
  const bundle = join(root, "bundle");
  await mkdir(bundle);
  const content = canonicalJson(report("ahrefs", "2026-06-29", "2026-07-26", 40, "symlink"));
  await writeFile(outside, content, "utf8");
  await symlink(outside, join(bundle, "report.json"));
  await writeFile(join(bundle, "manifest.json"), canonicalJson({ files: { "report.json": { sha256: hash(content), bytes: Buffer.byteLength(content) } } }), "utf8");
  await assert.rejects(readProviderHistory(root, [{ client_id: "bodymove", property_id: "bodymove.pl", provider: "ahrefs" }]), /escapes bundle/);
  await rm(root, { recursive: true, force: true });
});

test("provider history fails closed when an accepted bundle report is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-provider-history-"));
  await writeBundle(root, "missing-report", report("ahrefs", "2026-06-29", "2026-07-26", 40, "missing-report"));
  await rm(join(root, "missing-report", "report.json"));
  await assert.rejects(
    readProviderHistory(root, [{ client_id: "bodymove", property_id: "bodymove.pl", provider: "ahrefs" }], ["missing-report"]),
    /required report is unreadable/,
  );
  await rm(root, { recursive: true, force: true });
});

test("provider history fails closed when an accepted bundle report is malformed", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-provider-history-"));
  const bundle = join(root, "malformed-report");
  await mkdir(bundle);
  const content = canonicalJson({ run_id: "malformed", client_id: "bodymove", provider: "google-search-console", property_refs: ["sc-domain:bodymove.pl"], generated_at: "2026-07-26T08:00:00.000Z", analytics: { current_date_range: { start: "2026-06-29", end: "2026-07-26" }, current: { clicks: 10 } } });
  await writeFile(join(bundle, "report.json"), content, "utf8");
  await writeFile(join(bundle, "manifest.json"), canonicalJson({ files: { "report.json": { sha256: hash(content), bytes: Buffer.byteLength(content) } } }), "utf8");
  await assert.rejects(
    readProviderHistory(root, [{ client_id: "bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console" }], ["malformed-report"]),
    /required report is invalid/,
  );
  await rm(root, { recursive: true, force: true });
});

test("provider history fails closed when an accepted report loses its identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-provider-history-"));
  const bundle = join(root, "identity-stripped");
  await mkdir(bundle);
  const content = canonicalJson({ foo: "identity removed" });
  await writeFile(join(bundle, "report.json"), content, "utf8");
  await writeFile(join(bundle, "manifest.json"), canonicalJson({ files: { "report.json": { sha256: hash(content), bytes: Buffer.byteLength(content) } } }), "utf8");
  await assert.rejects(
    readProviderHistory(root, [{ client_id: "bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console" }], ["identity-stripped"]),
    /required report is invalid/,
  );
  await rm(root, { recursive: true, force: true });
});

test("provider history follows an in-root bundle symlink without dropping the bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-provider-history-"));
  await writeBundle(root, "real-bundle", report("ahrefs", "2026-06-29", "2026-07-26", 40, "symlinked-manifest"));
  await symlink(join(root, "real-bundle"), join(root, "alias-bundle"));
  const entries = await readProviderHistory(root, [{ client_id: "bodymove", property_id: "bodymove.pl", provider: "ahrefs" }], ["alias-bundle"]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.run_id, "symlinked-manifest");
  await rm(root, { recursive: true, force: true });
});

test("provider history ignores dangling unrelated symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-provider-history-"));
  await symlink(join(root, "does-not-exist"), join(root, "dangling"));
  assert.deepEqual(await readProviderHistory(root), []);
  await rm(root, { recursive: true, force: true });
});

test("provider history fails closed when a required bundle is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-provider-history-"));
  await assert.rejects(readProviderHistory(root, [], ["deleted-bundle"]), /required provider history bundle was not discovered/);
  await rm(root, { recursive: true, force: true });
});
