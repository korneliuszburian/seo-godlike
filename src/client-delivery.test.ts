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
    const keywordBundle = join(artifacts, "keyword-bundle");
    await mkdir(bundle, { recursive: true });
    await mkdir(keywordBundle, { recursive: true });
    const bundleReport = JSON.stringify({ client_id: "bodymove", provider: "google-search-console", property_refs: ["sc-domain:bodymove.pl"], analytics: { current: { clicks: 10, impressions: 100, ctr: 0.1, position: 5 }, previous: { clicks: 5, impressions: 50, ctr: 0.05, position: 6 }, current_date_range: { start: "2026-07-01", end: "2026-07-28" }, previous_date_range: { start: "2026-06-03", end: "2026-06-30" } } });
    await writeFile(join(bundle, "report.json"), bundleReport);
    const bundleManifest = manifest({ "report.json": bundleReport });
    await writeFile(join(bundle, "manifest.json"), bundleManifest);
    const keywordReport = JSON.stringify({ provider: "ahrefs", operation: "keywords-explorer.overview", input_sha256: "x", country: "pl", input_groups: [{ host: "bodymove.pl", phrases: ["bodymove-keyword"] }, { host: "other.pl", phrases: ["fraza"] }], notes: [], groups: [{ host: "bodymove.pl", phrases: ["bodymove-keyword"], rows: [{ keyword: "bodymove-keyword", volume: 10, parent_volume: 20 }] }, { host: "other.pl", phrases: ["fraza"], rows: [{ keyword: "fraza", volume: 10, parent_volume: 20 }] }] });
    await writeFile(join(keywordBundle, "report.json"), keywordReport);
    const keywordManifest = manifest({ "report.json": keywordReport });
    await writeFile(join(keywordBundle, "manifest.json"), keywordManifest);
    const summary = { schema_version: "1", report_status: "partial", generated_at: "2026-08-03T00:00:00.000Z", scope: { schema_version: "1", generated_at: "2026-08-03T00:00:00.000Z", status: "ready", entries: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, metrics: [] }] }, source_status: [{ client_id: "bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, bundle_path: "gsc-bundle" }], accepted_bundles: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", manifest_sha256: hash(bundleManifest), bundle_path: "gsc-bundle" }], blocked_sources: [], cross_source_context: [], insights: [], executive: {} as AgencyReportSummary["executive"], keyword_research: { source_label: "Estimated — Ahrefs Keywords Explorer", country: "pl", input_sha256: "x", input_groups: [{ host: "bodymove.pl", phrases: ["bodymove-keyword"] }, { host: "other.pl", phrases: ["fraza"] }], notes: [], groups: [{ host: "bodymove.pl", phrases: ["bodymove-keyword"], rows: [{ keyword: "bodymove-keyword", volume: 10, parent_volume: 20 }] }, { host: "other.pl", phrases: ["fraza"], rows: [{ keyword: "fraza", volume: 10, parent_volume: 20 }] }], bundle_path: keywordBundle, manifest_files: { "report.json": { sha256: hash(keywordReport), bytes: Buffer.byteLength(keywordReport) } } } } as unknown as AgencyReportSummary;
    const agencyPath = join(root, "agency-report.json");
    const agencyText = JSON.stringify(summary);
    await writeFile(agencyPath, agencyText);
    await writeFile(join(root, "manifest.json"), manifest({ "agency-report.json": agencyText }));
    const contentPath = join(root, "client-content.json");
    await writeFile(contentPath, JSON.stringify({ schema_version: "1", client_id: "bodymove", actions: [{ action_id: "a-1", client_id: "bodymove", period: { start: "2026-07-01", end: "2026-07-01" }, type: "sponsored_article", status: "published", title: "Artykuł sponsorowany", target_url: "https://bodymove.pl/", published_at: "2026-07-01", notes: null }], glossary: [{ term: "CTR", explanation: "Współczynnik klikalności" }], contact: { name: "Operator", email: "operator@example.test", phone: null } }));
    const result = await writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "delivery"), clientContentPath: contentPath });
    assert.deepEqual(result.units.map((unit) => [unit.kind, unit.id]), [["client", "bodymove"], ["domain", "domain-other.pl"]]);
    const clientHtml = await readFile(join(root, "delivery", "bodymove", "bodymove-seo-report.html"), "utf8");
    assert.match(clientHtml, /Raport gotowy — źródła: google-search-console/);
    assert.match(clientHtml, /Observed — Google Search Console · sc-domain:bodymove\.pl · Kliknięcia/);
    assert.match(clientHtml, /DZIAŁANIA DLA STRONY/);
    assert.match(clientHtml, /Artykuł sponsorowany/);
    assert.match(clientHtml, /Współczynnik klikalności/);
    assert.match(clientHtml, /Zakres danych/);
    assert.match(clientHtml, /Zmiana: 5 → 10 \(\+100,00%\)/);
    assert.match(clientHtml, /poprawa: 6,00 → 5,00 \(\+1,00\)/);
    assert.match(clientHtml, /Porównanie: 2026-06-03 — 2026-06-30/);
    assert.match(clientHtml, /bodymove-keyword/);
    assert.doesNotMatch(clientHtml, /other\.pl/);
    const email = await readFile(join(root, "delivery", "bodymove", "bodymove-seo-report.eml"), "utf8");
    assert.match(email, /^To: operator@example\.test/m);
    assert.match(email, /X-SEO-Godlike-Delivery: draft-only/);
    assert.match(email, /bodymove-seo-report\.html/);
    assert.match(email, /Porównanie GSC: .*kliknięcia 5 → 10/);
    assert.match(await readFile(join(root, "delivery", "index.html"), "utf8"), /Draft email/);
    const ambiguousSummary = { ...summary, scope: { ...summary.scope, entries: [...summary.scope.entries, { client_id: "other-client", client_display_name: "Other", property_id: "https://bodymove.pl/", provider: "google-search-console", status: "ready", reason: null, metrics: [] }] } };
    const ambiguousText = JSON.stringify(ambiguousSummary);
    await writeFile(agencyPath, ambiguousText);
    await writeFile(join(root, "manifest.json"), manifest({ "agency-report.json": ambiguousText }));
    await assert.rejects(writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "ambiguous-delivery") }), /maps to multiple clients/);
    const deliveryManifest = JSON.parse(await readFile(join(root, "delivery", "manifest.json"), "utf8")) as { files: Record<string, unknown> };
    assert.ok(deliveryManifest.files["bodymove/bodymove-seo-report.eml"]);
    assert.match(await readFile(join(root, "delivery", "domain-other.pl", "domain-other.pl-seo-report.html"), "utf8"), /Przypisanie do klienta: oczekuje na potwierdzenie operatora/);
    await writeFile(join(bundle, "manifest.json"), `${bundleManifest} `);
    await assert.rejects(writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "source-provenance-delivery") }), /source manifest provenance mismatch/);
    await writeFile(join(bundle, "manifest.json"), bundleManifest);
    await writeFile(join(bundle, "report.json"), `${bundleReport} `);
    await assert.rejects(writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "tampered-delivery") }), /manifest hash mismatch/);
    const traversalSummary = { ...summary, accepted_bundles: summary.accepted_bundles.map((bundle) => ({ ...bundle, bundle_path: "../outside" })) };
    const traversalText = JSON.stringify(traversalSummary);
    await writeFile(agencyPath, traversalText);
    await writeFile(join(root, "manifest.json"), manifest({ "agency-report.json": traversalText }));
    await assert.rejects(writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "traversal-delivery") }), /agency bundle_path escapes its root/);
    await writeFile(join(bundle, "report.json"), bundleReport);
    const keywordTraversalSummary = { ...summary, accepted_bundles: summary.accepted_bundles, keyword_research: { ...summary.keyword_research, bundle_path: "../outside" } };
    const keywordTraversalText = JSON.stringify(keywordTraversalSummary);
    await writeFile(agencyPath, keywordTraversalText);
    await writeFile(join(root, "manifest.json"), manifest({ "agency-report.json": keywordTraversalText }));
    await assert.rejects(writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "keyword-traversal-delivery") }), /keyword bundle_path escapes keyword bundle root/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
