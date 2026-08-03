import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { AgencyReportSummary } from "./agency-report.js";
import { writeClientDelivery } from "./client-delivery.js";

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function manifest(files: Record<string, string>): string { return JSON.stringify({ files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { sha256: hash(content), bytes: Buffer.byteLength(content) }])) }); }

test("client delivery splits unmapped phrase domains and keeps the client report separate", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-client-delivery-"));
  try {
    const artifacts = join(root, "artifacts");
    const bundle = join(artifacts, "gsc-bundle");
    await mkdir(bundle, { recursive: true });
    const bundleReport = JSON.stringify({ provider: "google-search-console", property_refs: ["sc-domain:bodymove.pl"], analytics: { current: { clicks: 10, impressions: 100, ctr: 0.1, position: 5 }, previous: { clicks: 5, impressions: 50, ctr: 0.1, position: 6 }, current_date_range: { start: "2026-07-01", end: "2026-07-28" }, previous_date_range: { start: "2026-06-01", end: "2026-06-28" } } });
    await writeFile(join(bundle, "report.json"), bundleReport);
    await writeFile(join(bundle, "manifest.json"), manifest({ "report.json": bundleReport }));
    const summary = { schema_version: "1", report_status: "partial", generated_at: "2026-08-03T00:00:00.000Z", scope: { schema_version: "1", generated_at: "2026-08-03T00:00:00.000Z", status: "ready", entries: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, metrics: [] }] }, source_status: [{ client_id: "bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, bundle_path: "gsc-bundle" }], accepted_bundles: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", bundle_path: "gsc-bundle" }], blocked_sources: [], cross_source_context: [], insights: [], executive: {} as AgencyReportSummary["executive"], keyword_research: { source_label: "Estimated — Ahrefs Keywords Explorer", country: "pl", input_sha256: "x", input_groups: [{ host: "other.pl", phrases: ["fraza"] }], notes: [], groups: [{ host: "other.pl", phrases: ["fraza"], rows: [{ keyword: "fraza", volume: 10, parent_volume: 20 }] }], bundle_path: "keyword-bundle", manifest_files: {} } } as unknown as AgencyReportSummary;
    const agencyPath = join(root, "agency-report.json");
    const agencyText = JSON.stringify(summary);
    await writeFile(agencyPath, agencyText);
    await writeFile(join(root, "manifest.json"), manifest({ "agency-report.json": agencyText }));
    const result = await writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "delivery") });
    assert.deepEqual(result.units.map((unit) => [unit.kind, unit.id]), [["client", "bodymove"], ["domain", "domain-other.pl"]]);
    const clientHtml = await readFile(join(root, "delivery", "bodymove", "bodymove-seo-report.html"), "utf8");
    assert.match(clientHtml, /Observed — Google Search Console · Clicks/);
    assert.doesNotMatch(clientHtml, /other\.pl/);
    assert.match(await readFile(join(root, "delivery", "domain-other.pl", "domain-other.pl-seo-report.html"), "utf8"), /Mapowanie klienta oczekuje na potwierdzenie/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
