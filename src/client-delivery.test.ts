import assert from "node:assert/strict";
import { chmod, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { AgencyReportSummary } from "./agency-report.js";
import { assertPdfRendererAvailable, writeClientDelivery } from "./client-delivery.js";
import { writeRankMonitoringBundle } from "./rank-monitoring.js";

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function manifest(files: Record<string, string>): string { return JSON.stringify({ files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { sha256: hash(content), bytes: Buffer.byteLength(content) }])) }); }

test("PDF renderer preflight fails clearly when host binaries are unavailable", async () => {
  await assert.rejects(
    assertPdfRendererAvailable({ XDG_RUNTIME_DIR: "/run/user/test" }, async () => false),
    /PDF renderer unavailable: missing required binaries/,
  );
});

test("client delivery creates one isolated report per operator-confirmed client", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-client-delivery-"));
  try {
    const artifacts = join(root, "artifacts");
    const bundle = join(artifacts, "gsc-bundle");
    const keywordBundle = join(artifacts, "keyword-bundle");
    await mkdir(bundle, { recursive: true });
    await mkdir(keywordBundle, { recursive: true });
    const bundleReport = JSON.stringify({ run_id: "run-bodymove-july", generated_at: "2026-08-03T00:00:00.000Z", client_id: "bodymove", client_display_name: "Bodymove", provider: "google-search-console", property_refs: ["sc-domain:bodymove.pl"], analytics: { current: { clicks: 10, impressions: 100, ctr: 0.1, position: 5 }, previous: { clicks: 5, impressions: 50, ctr: 0.05, position: 6 }, current_date_range: { start: "2026-07-01", end: "2026-07-28" }, previous_date_range: { start: "2026-06-03", end: "2026-06-30" } } });
    await writeFile(join(bundle, "report.json"), bundleReport);
    const bundleManifest = manifest({ "report.json": bundleReport });
    await writeFile(join(bundle, "manifest.json"), bundleManifest);
    const keywordReport = JSON.stringify({ provider: "ahrefs", operation: "keywords-explorer.overview", input_sha256: "x", country: "pl", input_groups: [{ host: "bodymove.pl", phrases: ["bodymove-keyword"] }, { host: "other.pl", phrases: ["fraza"] }], notes: [], groups: [{ host: "bodymove.pl", phrases: ["bodymove-keyword"], rows: [{ keyword: "bodymove-keyword", volume: 10, parent_volume: 20 }] }, { host: "other.pl", phrases: ["fraza"], rows: [{ keyword: "fraza", volume: 10, parent_volume: 20 }] }] });
    await writeFile(join(keywordBundle, "report.json"), keywordReport);
    const keywordManifest = manifest({ "report.json": keywordReport });
    await writeFile(join(keywordBundle, "manifest.json"), keywordManifest);
    const summary = { schema_version: "1", report_status: "partial", generated_at: "2026-08-03T00:00:00.000Z", scope: { schema_version: "1", generated_at: "2026-08-03T00:00:00.000Z", status: "ready", entries: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, metrics: [] }] }, source_status: [{ client_id: "bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, bundle_path: "gsc-bundle" }, { client_id: "bodymove", property_id: "bodymove.pl", provider: "ahrefs", status: "unavailable", reason: "Ahrefs snapshot is older than the selected Google Search Console observation period", reason_code: "stale_snapshot", bundle_path: null }, { client_id: "bodymove", property_id: "www.bodymove.pl", provider: "ahrefs", status: "unavailable", reason: "Ahrefs snapshot is older than the selected Google Search Console observation period", reason_code: "stale_snapshot", bundle_path: null }, { client_id: "bodymove", property_id: "properties/123456", provider: "google-analytics", status: "unavailable", reason: "numeric GA4 property ID and analytics.readonly proof are not registered", bundle_path: null }, { client_id: "bodymove", property_id: "—", provider: "semstorm", status: "unsupported", reason: "no catalog metrics", bundle_path: null }, { client_id: "bodymove", property_id: "—", provider: "localo", status: "unsupported", reason: "future internal provider error", bundle_path: null }], accepted_bundles: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", manifest_sha256: hash(bundleManifest), bundle_path: "gsc-bundle" }], blocked_sources: [], cross_source_context: [], insights: [], executive: {} as AgencyReportSummary["executive"], keyword_research: { source_label: "Estimated — Ahrefs Keywords Explorer", country: "pl", input_sha256: "x", input_groups: [{ host: "bodymove.pl", phrases: ["bodymove-keyword"] }, { host: "other.pl", phrases: ["fraza"] }], notes: [], groups: [{ host: "bodymove.pl", phrases: ["bodymove-keyword"], rows: [{ keyword: "bodymove-keyword", volume: 10, parent_volume: 20 }] }, { host: "other.pl", phrases: ["fraza"], rows: [{ keyword: "fraza" }]}], bundle_path: "keyword-bundle", manifest_files: { "report.json": { sha256: hash(keywordReport), bytes: Buffer.byteLength(keywordReport) } } } } as unknown as AgencyReportSummary;
    const reportDir = join(root, "report");
    await mkdir(reportDir, { recursive: true });
    const agencyPath = join(reportDir, "agency-report.json");
    const agencyText = JSON.stringify(summary);
    await writeFile(agencyPath, agencyText);
    await writeFile(join(reportDir, "manifest.json"), manifest({ "agency-report.json": agencyText }));
    const agencyRunRecord = JSON.stringify({ schema_version: "1", run_id: "agency-run-bodymove-july", started_at: "2026-08-03T00:00:00.000Z", finished_at: "2026-08-03T00:05:00.000Z", policy_mode: "read_only", approval_boundary: "no_external_write_operations", retention_mode: "operator_managed", deletion_authority: "operator_only", result: { status: "partial", completed: ["bodymove:google-search-console:sc-domain:bodymove.pl"], blocked: [], failed: [], trace: [] } });
    const agencyRunRecordPath = join(root, "agency-run.json");
    await writeFile(agencyRunRecordPath, agencyRunRecord);
    const contentPath = join(root, "client-content.json");
    await writeFile(contentPath, JSON.stringify({ schema_version: "1", client_id: "bodymove", actions: [{ action_id: "a-1", client_id: "bodymove", period: { start: "2026-07-01", end: "2026-07-01" }, type: "sponsored_article", status: "published", title: "Publikacja partnera", target_url: "https://bodymove.pl/", published_at: "2026-07-02", notes: "Link zweryfikowany przez operatora" }], glossary: [{ term: "CTR", explanation: "Współczynnik klikalności" }], contact: { name: "Operator", email: "operator@example.test", phone: null } }));
    const foreignContentPath = join(root, "foreign-client-content.json");
    await writeFile(foreignContentPath, JSON.stringify({ schema_version: "1", client_id: "other", actions: [], glossary: [], contact: { name: "Operator", email: "operator@example.test", phone: null } }));
    const confirmedKeywordClients = { confirmedKeywordClients: ["other.pl"] };
    await assert.rejects(() => writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "foreign-content-delivery"), clientContentPath: foreignContentPath, ...confirmedKeywordClients, agencyRunRecordPath }), /outside delivery scope/);
    await assert.rejects(() => writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "unconfirmed-delivery"), clientContentPath: contentPath, agencyRunRecordPath }), /keyword host 'other\.pl' is not an operator-confirmed client/);
    const result = await writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "delivery"), clientContentPath: contentPath, ...confirmedKeywordClients, agencyRunRecordPath });
    assert.equal(result.manifests_verified, 3);
    assert.deepEqual(result.units.map((unit) => [unit.kind, unit.id]), [["client", "bodymove"], ["client", "other.pl"]]);
    const clientHtml = await readFile(join(root, "delivery", "bodymove", "bodymove-seo-report.html"), "utf8");
    const clientAppendix = await readFile(join(root, "delivery", "bodymove", "bodymove-operator-appendix.html"), "utf8");
    assert.match(clientHtml, /Widoczność i ruch rosną\./);
    assert.match(clientHtml, /font-family:"Manrope Report";src:url\("data:font\/ttf;base64,/);
    assert.match(clientHtml, /Najważniejszy obraz okresu/);
    assert.doesNotMatch(clientHtml, /<table[ >]/);
    assert.doesNotMatch(clientHtml, /HISTORIA WYNIKÓW/);
    assert.match(clientAppendix, /HISTORIA WYNIKÓW/);
    assert.match(clientAppendix, /bodymove-keyword/);
    assert.match(clientAppendix, /Artykuł sponsorowany/);
    assert.match(clientHtml, /Raport częściowy · brakujące źródło nie oznacza zera/);
    assert.match(clientHtml, /Google Search Console · Dostępne/);
    assert.match(clientHtml, /Ahrefs · Niepodłączone/);
    assert.match(clientAppendix, /Raport częściowy — dostępne: Google Search Console; niedostępne: Ahrefs — dane nieaktualne/);
    assert.match(clientAppendix, /Google Search Console, Niedostępne — Ahrefs — dane nieaktualne, Niedostępne — Google Analytics 4, Zablokowane — Semstorm, Zablokowane — Localo/);
    assert.match(clientAppendix, /Dane nieaktualne — snapshot Ahrefs jest starszy niż wybrany okres Google Search Console/);
    assert.doesNotMatch(clientHtml, /Ahrefs snapshot is older/);
    assert.match(clientAppendix, /Observed — Google Search Console · sc-domain:bodymove\.pl · Kliknięcia/);
    assert.match(clientHtml, /Wykonana praca/);
    assert.match(clientHtml, /Artykuł sponsorowany/);
    assert.match(clientHtml, /Opublikowane/);
    assert.match(clientAppendix, /Współczynnik klikalności/);
    assert.match(clientAppendix, /Zakres danych/);
    assert.match(clientAppendix, /class="dashboard-nav"/);
    assert.match(clientAppendix, /Opublikowano/);
    assert.match(clientAppendix, /2026-07-02/);
    assert.match(clientAppendix, /Link zweryfikowany przez operatora/);
    assert.match(clientAppendix, /id="summary"/);
    assert.match(clientAppendix, /id="sources"/);
    assert.doesNotMatch(clientHtml, /class="client-switcher"|aria-current="page"/);
    assert.doesNotMatch(clientAppendix, /class="client-switcher"|aria-current="page"/);
    assert.match(clientAppendix, /Zmiana: 5 → 10 \(\+100,00%\)/);
    assert.match(clientAppendix, /poprawa: 6,00 → 5,00 \(\+1,00\)/);
    assert.match(clientAppendix, /Porównanie: 2026-06-03 — 2026-06-30/);
    assert.match(clientHtml, /bodymove-keyword/);
    assert.doesNotMatch(clientHtml, /other\.pl\/other\.pl-seo-report\.html/);
    assert.doesNotMatch(clientHtml, />fraza<|>other-keyword</);
    const email = await readFile(join(root, "delivery", "bodymove", "bodymove-seo-report.eml"), "utf8");
    assert.match(email, /^To: operator@example\.test/m);
    assert.match(email, /X-SEO-Godlike-Delivery: draft-only/);
    assert.match(email, /Content-Type: multipart\/mixed; boundary="seo-godlike-bodymove-report"/);
    assert.match(email, /Content-Disposition: attachment; filename="bodymove-seo-report\.html"/);
    assert.match(email, /bodymove-seo-report\.html/);
    assert.match(email, /Ahrefs: Dane nieaktualne — snapshot Ahrefs jest starszy niż wybrany okres Google Search Console/);
    assert.equal((email.match(/Ahrefs: Dane nieaktualne — snapshot Ahrefs jest starszy niż wybrany okres Google Search Console/g) ?? []).length, 1);
    assert.match(email, /Google Analytics 4: Niedostępne — Brak zarejestrowanej numerycznej właściwości GA4 i potwierdzonego dostępu analytics\.readonly\./);
    assert.match(email, /Semstorm: Zablokowane — Brak zdefiniowanych metryk dla tego źródła\./);
    assert.doesNotMatch(clientHtml, /numeric GA4 property ID and analytics\.readonly proof/);
    assert.match(clientAppendix, /Brak zarejestrowanej numerycznej właściwości GA4/);
    assert.doesNotMatch(clientHtml, /managed Localo profile unavailable/);
    assert.doesNotMatch(clientHtml, /future internal provider error/);
    assert.match(clientAppendix, /Szczegóły techniczne wymagają wyjaśnienia przez operatora/);
    assert.match(email, /Porównanie GSC: .*kliknięcia 5 → 10/);
    const domainEmail = await readFile(join(root, "delivery", "other.pl", "other.pl-seo-report.eml"), "utf8");
    assert.equal(domainEmail.split("\r\n", 1)[0], "Subject: Raport SEO — other.pl");
    assert.match(await readFile(join(root, "delivery", "index.html"), "utf8"), /Draft email/);

    const pdfDelivery = join(root, "pdf-delivery");
    await writeClientDelivery({
      agencyReportPath: agencyPath,
      artifactsDir: artifacts,
      outputDir: pdfDelivery,
      renderPdf: true,
      ...confirmedKeywordClients,
      pdfRenderer: async (_htmlPath, pdfPath) => {
        await writeFile(pdfPath, Buffer.from("%PDF-fake-bodymove", "ascii"), { flag: "wx", mode: 0o600 });
        await chmod(pdfPath, 0o600);
      },
    });
    const pdfEmail = await readFile(join(pdfDelivery, "bodymove", "bodymove-seo-report.eml"), "utf8");
    assert.match(pdfEmail, /Content-Disposition: attachment; filename="bodymove-seo-report\.pdf"/);
    const encodedPdf = pdfEmail.split('Content-Disposition: attachment; filename="bodymove-seo-report.pdf"\r\n')[1]!.split("\r\n--seo-godlike-bodymove-report")[0]!.replaceAll("\r\n", "");
    assert.equal(Buffer.from(encodedPdf, "base64").toString("ascii"), "%PDF-fake-bodymove");
    const pdfManifest = JSON.parse(await readFile(join(pdfDelivery, "manifest.json"), "utf8")) as { execution: { network_policy: string } };
    assert.equal(pdfManifest.execution.network_policy, "renderer_custom");
    const nonAdjacentReport = bundleReport.replace('"start":"2026-06-03","end":"2026-06-30"', '"start":"2026-05-01","end":"2026-05-28"');
    const nonAdjacentManifest = manifest({ "report.json": nonAdjacentReport });
    await writeFile(join(bundle, "report.json"), nonAdjacentReport);
    await writeFile(join(bundle, "manifest.json"), nonAdjacentManifest);
    const nonAdjacentSummary = { ...summary, accepted_bundles: summary.accepted_bundles.map((item) => ({ ...item, manifest_sha256: hash(nonAdjacentManifest) })) };
    const nonAdjacentText = JSON.stringify(nonAdjacentSummary);
    await writeFile(agencyPath, nonAdjacentText);
    await writeFile(join(reportDir, "manifest.json"), manifest({ "agency-report.json": nonAdjacentText }));
    await writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "non-adjacent-delivery"), ...confirmedKeywordClients });
    const unavailableSupplementHtml = await readFile(join(root, "non-adjacent-delivery", "bodymove", "bodymove-seo-report.html"), "utf8");
    const unavailableAppendixHtml = await readFile(join(root, "non-adjacent-delivery", "bodymove", "bodymove-operator-appendix.html"), "utf8");
    assert.match(unavailableSupplementHtml, /Brak porównywalnej bazy/);
    assert.doesNotMatch(unavailableSupplementHtml, /Rejestr działań czeka na dane operatora|Wykonana praca/);
    assert.match(unavailableAppendixHtml, /Unavailable · brak rejestru działań/);
    await writeFile(join(bundle, "report.json"), bundleReport);
    await writeFile(join(bundle, "manifest.json"), bundleManifest);
    const zeroBaseline = JSON.parse(bundleReport) as {
      analytics: { previous: { clicks: number; impressions: number; ctr: number; position: number } };
    };
    zeroBaseline.analytics.previous = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const zeroBaselineReport = JSON.stringify(zeroBaseline);
    const zeroBaselineManifest = manifest({ "report.json": zeroBaselineReport });
    await writeFile(join(bundle, "report.json"), zeroBaselineReport);
    await writeFile(join(bundle, "manifest.json"), zeroBaselineManifest);
    const zeroBaselineSummary = { ...summary, accepted_bundles: summary.accepted_bundles.map((item) => ({ ...item, manifest_sha256: hash(zeroBaselineManifest) })) };
    const zeroBaselineText = JSON.stringify(zeroBaselineSummary);
    await writeFile(agencyPath, zeroBaselineText);
    await writeFile(join(reportDir, "manifest.json"), manifest({ "agency-report.json": zeroBaselineText }));
    await writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "zero-baseline-delivery"), ...confirmedKeywordClients });
    const zeroBaselineHtml = await readFile(join(root, "zero-baseline-delivery", "bodymove", "bodymove-seo-report.html"), "utf8");
    assert.equal((zeroBaselineHtml.match(/Brak porównywalnej bazy/g) ?? []).length, 4);
    assert.doesNotMatch(zeroBaselineHtml, /Pogorszenie o|0,00% →/);
    await writeFile(join(bundle, "report.json"), bundleReport);
    await writeFile(join(bundle, "manifest.json"), bundleManifest);
    const multiPropertyReport = bundleReport.replace('"property_refs":["sc-domain:bodymove.pl"]', '"property_refs":["sc-domain:bodymove.pl","https://krakow.bodymove.pl/"]');
    const multiPropertyManifest = manifest({ "report.json": multiPropertyReport });
    await writeFile(join(bundle, "report.json"), multiPropertyReport);
    await writeFile(join(bundle, "manifest.json"), multiPropertyManifest);
    const multiPropertySummary = { ...summary, accepted_bundles: summary.accepted_bundles.map((item) => ({ ...item, manifest_sha256: hash(multiPropertyManifest) })) };
    const multiPropertyText = JSON.stringify(multiPropertySummary);
    await writeFile(agencyPath, multiPropertyText);
    await writeFile(join(reportDir, "manifest.json"), manifest({ "agency-report.json": multiPropertyText }));
    await assert.rejects(writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "multi-property-delivery"), ...confirmedKeywordClients }), /bundle identity does not match accepted manifest/);
    await writeFile(join(bundle, "report.json"), bundleReport);
    await writeFile(join(bundle, "manifest.json"), bundleManifest);
    const ambiguousSummary = { ...summary, scope: { ...summary.scope, entries: [...summary.scope.entries, { client_id: "other-client", client_display_name: "Other", property_id: "https://bodymove.pl/", provider: "google-search-console", status: "ready", reason: null, metrics: [] }] } };
    const ambiguousText = JSON.stringify(ambiguousSummary);
    await writeFile(agencyPath, ambiguousText);
    await writeFile(join(reportDir, "manifest.json"), manifest({ "agency-report.json": ambiguousText }));
    await assert.rejects(writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "ambiguous-delivery"), ...confirmedKeywordClients }), /maps to multiple clients/);
    const deliveryManifest = JSON.parse(await readFile(join(root, "delivery", "manifest.json"), "utf8")) as { files: Record<string, unknown>; history_manifest_sha256: string[]; agency_run_record_sha256: string | null; confirmed_keyword_clients: string[]; operator_appendices: Record<string, string> };
    assert.ok(deliveryManifest.files["bodymove/bodymove-seo-report.eml"]);
    assert.ok(deliveryManifest.files["bodymove/bodymove-operator-appendix.html"]);
    assert.equal(deliveryManifest.operator_appendices.bodymove, "bodymove/bodymove-operator-appendix.html");
    assert.deepEqual(deliveryManifest.history_manifest_sha256, [hash(bundleManifest)]);
    assert.deepEqual(deliveryManifest.confirmed_keyword_clients, ["other.pl"]);
    assert.equal(deliveryManifest.agency_run_record_sha256, hash(agencyRunRecord));
    await writeFile(agencyRunRecordPath, agencyRunRecord.replace('"read_only"', '"write"'));
    await assert.rejects(writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "invalid-run-record-delivery"), ...confirmedKeywordClients, agencyRunRecordPath }), /violates read-only policy/);
    await writeFile(agencyRunRecordPath, agencyRunRecord);
    const domainHtml = await readFile(join(root, "delivery", "other.pl", "other.pl-seo-report.html"), "utf8");
    assert.match(domainHtml, /Klient: other\.pl/);
    assert.match(domainHtml, /Raport częściowy · zakres: badanie fraz/);
    assert.doesNotMatch(domainHtml, /Przypisanie do klienta|oczekuje na potwierdzenie|client-switcher/);
    assert.doesNotMatch(domainHtml, /<table[ >]/);
    assert.doesNotMatch(domainHtml, /Widoczność organiczna/);
    assert.doesNotMatch(domainHtml, /Sygnały do omówienia/);
    const populatedSummary = { ...summary, cross_source_context: [{ client_id: "bodymove", key_type: "page", join_type: "matched", key: "https://bodymove.pl/", gsc: { clicks: 10, impressions: 100, ctr: 0.1, position: 5 }, ahrefs: { estimated_traffic: 20, position: 4, keywords: 3, ranking_url: "https://bodymove.pl/" } }], insights: [{ client_id: "bodymove", kind: "low_ctr", key: "https://bodymove.pl/", evidence: "100 impressions", severity: "low" }] };
    const populatedText = JSON.stringify(populatedSummary);
    await writeFile(agencyPath, populatedText);
    await writeFile(join(reportDir, "manifest.json"), manifest({ "agency-report.json": populatedText }));
    await writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "populated-delivery"), ...confirmedKeywordClients });
    const populatedHtml = await readFile(join(root, "populated-delivery", "bodymove", "bodymove-seo-report.html"), "utf8");
    const populatedAppendix = await readFile(join(root, "populated-delivery", "bodymove", "bodymove-operator-appendix.html"), "utf8");
    assert.match(populatedHtml, /Co działa/);
    assert.match(populatedHtml, /Sygnały do omówienia/);
    assert.doesNotMatch(populatedHtml, /<table[ >]/);
    assert.match(populatedAppendix, /Widoczność organiczna/);
    assert.match(populatedAppendix, /https:\/\/bodymove\.pl\//);
    await writeFile(join(bundle, "manifest.json"), `${bundleManifest} `);
    await assert.rejects(writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "source-provenance-delivery"), ...confirmedKeywordClients }), /source manifest provenance mismatch/);
    await writeFile(join(bundle, "manifest.json"), bundleManifest);
    await writeFile(join(bundle, "report.json"), `${bundleReport} `);
    await assert.rejects(writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "tampered-delivery"), ...confirmedKeywordClients }), /manifest hash mismatch/);
    const traversalSummary = { ...summary, accepted_bundles: summary.accepted_bundles.map((bundle) => ({ ...bundle, bundle_path: "../outside" })) };
    const traversalText = JSON.stringify(traversalSummary);
    await writeFile(agencyPath, traversalText);
    await writeFile(join(reportDir, "manifest.json"), manifest({ "agency-report.json": traversalText }));
    await assert.rejects(writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "traversal-delivery"), ...confirmedKeywordClients }), /agency bundle_path escapes its root/);
    const outsideBundle = join(root, "outside-bundle");
    await mkdir(outsideBundle);
    await symlink(outsideBundle, join(artifacts, "symlink-bundle"));
    const symlinkSummary = { ...summary, accepted_bundles: summary.accepted_bundles.map((bundle) => ({ ...bundle, bundle_path: "symlink-bundle" })) };
    const symlinkText = JSON.stringify(symlinkSummary);
    await writeFile(agencyPath, symlinkText);
    await writeFile(join(reportDir, "manifest.json"), manifest({ "agency-report.json": symlinkText }));
    await assert.rejects(writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "symlink-delivery"), ...confirmedKeywordClients }), /bundle_path escapes its root through a symlink/);
    await writeFile(join(bundle, "report.json"), bundleReport);
    const keywordTraversalSummary = { ...summary, accepted_bundles: summary.accepted_bundles, keyword_research: { ...summary.keyword_research, bundle_path: "../outside" } };
    const keywordTraversalText = JSON.stringify(keywordTraversalSummary);
    await writeFile(agencyPath, keywordTraversalText);
    await writeFile(join(reportDir, "manifest.json"), manifest({ "agency-report.json": keywordTraversalText }));
    await assert.rejects(writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "keyword-traversal-delivery"), ...confirmedKeywordClients }), /keyword bundle_path escapes keyword bundle root/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("client delivery renders the complete bounded Ahrefs profile context", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-ahrefs-delivery-"));
  try {
    const artifacts = join(root, "artifacts");
    const gscDir = join(artifacts, "gsc");
    const ahrefsDir = join(artifacts, "ahrefs");
    await mkdir(gscDir, { recursive: true });
    await mkdir(ahrefsDir, { recursive: true });
    const gscReport = JSON.stringify({ run_id: "run-bodymove-july", generated_at: "2026-08-03T00:00:00.000Z", client_id: "bodymove", client_display_name: "Bodymove", provider: "google-search-console", property_refs: ["sc-domain:bodymove.pl"], analytics: { current_date_range: { start: "2026-07-01", end: "2026-07-28" }, current: { clicks: 1, impressions: 2, ctr: 0.5, position: 4 } } });
    const ahrefsReport = JSON.stringify({ run_id: "run-bodymove-ahrefs-july", client_id: "bodymove", provider: "ahrefs", property_refs: ["bodymove.pl"], generated_at: "2026-07-29T00:00:00.000Z", request: { country: "pl" }, analytics: { current_date_range: { start: "2026-07-29", end: "2026-07-29" }, current: { organic_traffic: 100, organic_keywords: 20, organic_keywords_top_3: 3, top_pages: [{ url: "https://bodymove.pl/usluga", sum_traffic: 80, traffic_diff: 10, traffic_diff_percent: 0.14, keywords: 7, top_keyword: "rehabilitacja", top_keyword_best_position: 5, top_keyword_best_position_diff: -1, referring_domains: 4, ur: 12 }, { url: "https://bodymove.pl/inny", sum_traffic: 20, traffic_diff: -2, traffic_diff_percent: -230, keywords: 2, top_keyword: "ból", top_keyword_best_position: 9, top_keyword_best_position_diff: 1, referring_domains: 1, ur: 4 }] , organic_keyword_rows: [{ keyword: "rehabilitacja", keyword_country: "pl", best_position: 5, best_position_diff: -1, best_position_url: "https://bodymove.pl/usluga", sum_traffic: 80, sum_traffic_prev: 70, volume: 500, keyword_difficulty: 23, serp_features: ["local_pack"], status: "active" }], competitors: [{ competitor_domain: "konkurent.pl", domain_rating: 31, keywords_common: 4, keywords_target: 7, keywords_competitor: 9, share: 0.12, traffic: 55, traffic_diff: 3, value: 20 }] } } });
    const gscManifest = manifest({ "report.json": gscReport });
    const ahrefsManifest = manifest({ "report.json": ahrefsReport });
    await writeFile(join(gscDir, "report.json"), gscReport);
    await writeFile(join(gscDir, "manifest.json"), gscManifest);
    await writeFile(join(ahrefsDir, "report.json"), ahrefsReport);
    await writeFile(join(ahrefsDir, "manifest.json"), ahrefsManifest);
    const summary = { schema_version: "1", report_status: "partial", generated_at: "2026-08-03T00:00:00.000Z", scope: { schema_version: "1", generated_at: "2026-08-03T00:00:00.000Z", status: "ready", entries: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, metrics: [] }, { client_id: "bodymove", client_display_name: "Bodymove", property_id: "bodymove.pl", provider: "ahrefs", status: "ready", reason: null, metrics: [] }] }, source_status: [{ client_id: "bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, bundle_path: "gsc" }, { client_id: "bodymove", property_id: "bodymove.pl", provider: "ahrefs", status: "ready", reason: null, bundle_path: "ahrefs" }], accepted_bundles: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", manifest_sha256: hash(gscManifest), bundle_path: "gsc" }, { client_id: "bodymove", client_display_name: "Bodymove", property_id: "bodymove.pl", provider: "ahrefs", manifest_sha256: hash(ahrefsManifest), bundle_path: "ahrefs" }], blocked_sources: [], cross_source_context: [], insights: [], executive: {} } as unknown as AgencyReportSummary;
    const agencyPath = join(root, "agency-report.json");
    const agencyText = JSON.stringify(summary);
    await writeFile(agencyPath, agencyText);
    await writeFile(join(root, "manifest.json"), manifest({ "agency-report.json": agencyText }));
    await writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "delivery") });
    const html = await readFile(join(root, "delivery", "bodymove", "bodymove-seo-report.html"), "utf8");
    const appendix = await readFile(join(root, "delivery", "bodymove", "bodymove-operator-appendix.html"), "utf8");
    assert.match(html, /Kontekst rynkowy · dane szacunkowe Ahrefs/);
    assert.match(html, /20 fraz buduje estymowany zasięg domeny/);
    assert.match(html, />100</);
    assert.match(html, /Stan na 2026-07-29/);
    assert.doesNotMatch(html, /<table[ >]/);
    assert.match(appendix, /AHREFS · Najważniejsze strony/);
    assert.match(appendix, /14,00%/);
    assert.match(appendix, /-2,30%/);
    assert.match(appendix, /AHREFS · Frazy organiczne/);
    assert.match(appendix, /local_pack/);
    assert.match(appendix, /AHREFS · Konkurenci organiczni/);
    assert.match(appendix, /konkurent\.pl/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("client delivery assigns a multi-client rank bundle to the matching reports", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-delivery-multi-"));
  try {
    const artifacts = join(root, "artifacts");
    const rankInput = join(root, "rank.json");
    const rankRoot = join(artifacts, "rank-root");
    const rankBundle = join(rankRoot, "rank");
    await mkdir(artifacts, { recursive: true });
    await mkdir(rankRoot, { recursive: true });
    const snapshot = (client_id: string, project_id: string, keyword: string) => ({ schema_version: "1", provider: "serprobot", client_id, captured_at: "2026-08-03T00:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, source_config: { project_id, search_engine: "google.pl", location: null, device: null }, rows: [{ keyword, position: 3, previous_position: null, search_engine: "google.pl", location: "PL", device: "desktop", url: null }] });
    await writeFile(rankInput, JSON.stringify({ schema_version: "1", provider: "serprobot", snapshots: [snapshot("acme", "456", "acme-fraza"), snapshot("bodymove", "123", "rehabilitacja")] }));
    const previousRankInput = join(root, "previous-rank.json");
    await writeFile(previousRankInput, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: "2026-07-01T00:00:00.000Z", date_range: { start: "2026-06-01", end: "2026-06-30" }, source_config: { project_id: "123", search_engine: "google.pl", location: null, device: "desktop" }, rows: [{ keyword: "rehabilitacja", position: 5, previous_position: null, search_engine: "google.pl", location: "PL", device: "desktop", url: null }] }));
    await writeRankMonitoringBundle(previousRankInput, join(rankRoot, "previous-rank"));
    const packed = await writeRankMonitoringBundle(rankInput, rankBundle);
    const newerRankInput = join(root, "newer-rank.json");
    await writeFile(newerRankInput, JSON.stringify({ schema_version: "1", provider: "serprobot", snapshots: [
      { ...snapshot("acme", "456", "acme-fraza"), captured_at: "2026-08-04T00:00:00.000Z" },
      { ...snapshot("bodymove", "123", "rehabilitacja"), captured_at: "2026-08-04T00:00:00.000Z", rows: [{ ...snapshot("bodymove", "123", "rehabilitacja").rows[0], position: 1 }] },
    ] }));
    await writeRankMonitoringBundle(newerRankInput, join(rankRoot, "newer-rank"));
    const summary = { schema_version: "1", report_status: "partial", generated_at: "2026-08-03T00:00:00.000Z", scope: { schema_version: "1", generated_at: "2026-08-03T00:00:00.000Z", status: "ready", entries: [
      { client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, metrics: [] },
      { client_id: "acme", client_display_name: "Acme", property_id: "sc-domain:acme.example", provider: "google-search-console", status: "ready", reason: null, metrics: [] },
    ] }, source_status: [
      { source_id: "serprobot.bodymove", client_id: "bodymove", property_id: "123", provider: "serprobot", status: "ready", reason: null, bundle_path: null },
      { source_id: "serprobot.acme", client_id: "acme", property_id: "456", provider: "serprobot", status: "ready", reason: null, bundle_path: null },
    ], accepted_bundles: [], blocked_sources: [], cross_source_context: [], insights: [], executive: {}, rank_monitoring_snapshots: packed.snapshots.map((item) => ({ source_label: "Observed — SERPROBOT rank snapshot", client_id: item.client_id, bundle_path: "rank-root/rank", manifest_sha256: packed.manifest_sha256, captured_at: item.captured_at, date_range: item.date_range, source_config: item.source_config, row_count: item.rows.length })) };
    const agencyPath = join(root, "agency-report.json");
    const agencyText = JSON.stringify(summary);
    await writeFile(agencyPath, agencyText);
    await writeFile(join(root, "manifest.json"), manifest({ "agency-report.json": agencyText }));
    await writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "delivery"), rankMonitoringRoot: rankRoot, rankMonitoringResolvedPath: rankBundle });
    const bodymoveHtml = await readFile(join(root, "delivery", "bodymove", "bodymove-seo-report.html"), "utf8");
    const bodymoveAppendix = await readFile(join(root, "delivery", "bodymove", "bodymove-operator-appendix.html"), "utf8");
    const acmeHtml = await readFile(join(root, "delivery", "acme", "acme-seo-report.html"), "utf8");
    assert.match(bodymoveHtml, /rehabilitacja/);
    assert.match(bodymoveHtml, /Monitoring pozycji · dane obserwowane SERPROBOT/);
    assert.match(bodymoveAppendix, /Zmiana pozycji monitorowanych fraz/);
    assert.match(bodymoveAppendix, /Okres porównania/);
    assert.match(bodymoveAppendix, />-4</);
    assert.doesNotMatch(bodymoveHtml, /acme-fraza/);
    assert.match(acmeHtml, /acme-fraza/);
    assert.doesNotMatch(acmeHtml, /rehabilitacja/);
    const deliveryManifest = JSON.parse(await readFile(join(root, "delivery", "manifest.json"), "utf8")) as { rank_history_source_manifest_sha256: string[] };
    assert.equal(deliveryManifest.rank_history_source_manifest_sha256.length, 2);
    await writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "standalone-delivery"), rankMonitoringRoot: rankRoot });
    const standaloneHtml = await readFile(join(root, "standalone-delivery", "bodymove", "bodymove-seo-report.html"), "utf8");
    assert.match(standaloneHtml, /pozycja 3/);
    await assert.rejects(writeClientDelivery({ agencyReportPath: agencyPath, artifactsDir: artifacts, outputDir: join(root, "conflict"), rankMonitoringPath: rankBundle, rankMonitoringRoot: artifacts }), /mutually exclusive/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
