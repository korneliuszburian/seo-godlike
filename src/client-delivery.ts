import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { AgencyReportSummary, CrossSourceContextEntry } from "./agency-report.js";
import { PhraseGroup } from "./ahrefs-keywords.js";
import { canonicalJson, sha256 } from "./serialize.js";
import { ClientContent, readClientContent } from "./client-content.js";
import { RankMonitoringSnapshot, readRankMonitoringBundle } from "./rank-monitoring.js";

const execFileAsync = promisify(execFile);

interface BundleMetric {
  client_id: string;
  provider: string;
  property_id: string;
  generated_at: string | null;
  country: string | null;
  current: Record<string, unknown>;
  previous: Record<string, unknown> | null;
  current_range: { start: string; end: string } | null;
  previous_range: { start: string; end: string } | null;
}

export interface ClientDeliveryOptions {
  agencyReportPath: string;
  artifactsDir: string;
  outputDir: string;
  renderPdf?: boolean;
  clientContentPath?: string;
  rankMonitoringPath?: string;
}

export interface ClientDeliveryResult {
  output_dir: string;
  units: Array<{ id: string; kind: "client" | "domain"; html: string; pdf: string | null }>;
  manifests_verified: number;
}

interface DeliveryUnit {
  id: string;
  title: string;
  kind: "client" | "domain";
  mappingLabel: string;
  sources: AgencyReportSummary["source_status"];
  metrics: BundleMetric[];
  context: CrossSourceContextEntry[];
  insights: AgencyReportSummary["insights"];
  keywordGroups: Array<{ group: PhraseGroup; rows: Array<Record<string, unknown>> }>;
  notes: string[];
  content: ClientContent | null;
  rankMonitoring: RankMonitoringSnapshot | null;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function finite(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function escapeHtml(value: unknown): string {
  return String(value ?? "—").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function safeSegment(value: string): string { return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "report"; }
function hashBytes(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function normalizePdfMetadata(bytes: Buffer): Buffer {
  const text = bytes.toString("latin1").replace(/\/ModDate \(D:\d{14}[+-]\d{2}'\d{2}'\)/g, "/ModDate (D:20260101000000+00'00')");
  return Buffer.from(text, "latin1");
}
function resolveInside(root: string, child: string, label: string): string {
  if (!child || child.startsWith("/") || child.includes("\\")) throw new Error(`${label} must be a relative path`);
  const resolvedRoot = resolve(root);
  const resolvedChild = resolve(resolvedRoot, child);
  if (resolvedChild !== resolvedRoot && !resolvedChild.startsWith(`${resolvedRoot}${sep}`)) throw new Error(`${label} escapes its root`);
  return resolvedChild;
}
function metricValue(metric: BundleMetric, field: string): number | null { return finite(metric.current[field]); }
function delta(current: number | null, previous: number | null): string {
  if (current === null || previous === null || previous === 0) return "—";
  const value = ((current - previous) / Math.abs(previous)) * 100;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}
function comparison(metric: BundleMetric, field: string): string {
  const current = metricValue(metric, field);
  const previous = metric.previous && metric.previous_range ? finite(metric.previous[field]) : null;
  if (current === null || previous === null || previous === 0) return "Brak porównywalnej bazy";
  if (field === "position") {
    const difference = previous - current;
    return `${difference >= 0 ? "Poprawa" : "Pogorszenie"} o ${Math.abs(difference).toFixed(2)} (z ${previous.toFixed(2)} do ${current.toFixed(2)}; niższa pozycja jest lepsza)`;
  }
  if (field === "ctr") {
    const points = (current - previous) * 100;
    return `${formatPercent(current)} vs ${formatPercent(previous)} (${points >= 0 ? "+" : ""}${points.toFixed(2)} p.p.)`;
  }
  return `${delta(current, previous)} względem poprzedniego okresu`;
}
function formatNumber(value: number | null): string { return value === null ? "—" : new Intl.NumberFormat("pl-PL").format(value); }
function formatPercent(value: number | null): string { return value === null ? "—" : `${(value * 100).toFixed(2)}%`; }
function hostFromProperty(value: string): string | null {
  if (value.startsWith("sc-domain:")) return value.slice("sc-domain:".length).toLowerCase();
  try { return new URL(value).hostname.toLowerCase(); } catch { return value.toLowerCase(); }
}

async function readVerifiedJsonBundle(bundleDir: string, expected: { client_id: string; property_id: string; provider: string }): Promise<Record<string, unknown>> {
  const manifestPath = join(bundleDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { files?: Record<string, { sha256?: unknown; bytes?: unknown }> };
  if (!manifest.files) throw new Error(`invalid manifest: ${manifestPath}`);
  const files = new Map<string, string>();
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (name.startsWith("/") || name.includes("..") || typeof entry.sha256 !== "string" || typeof entry.bytes !== "number") throw new Error(`unsafe manifest entry '${name}'`);
    const content = await readFile(join(bundleDir, name), "utf8");
    if (Buffer.byteLength(content) !== entry.bytes || sha256(content) !== entry.sha256) throw new Error(`manifest hash mismatch: ${bundleDir}/${name}`);
    files.set(name, content);
  }
  const reportText = files.get("report.json");
  const report = JSON.parse(reportText ?? "null") as Record<string, unknown>;
  if (!isRecord(report)) throw new Error(`missing report.json: ${bundleDir}`);
  if (report.client_id !== expected.client_id || report.provider !== expected.provider || !Array.isArray(report.property_refs) || report.property_refs[0] !== expected.property_id) throw new Error(`bundle identity does not match accepted manifest: ${bundleDir}`);
  return report;
}

function extractMetric(report: Record<string, unknown>): BundleMetric | null {
  const analytics = isRecord(report.analytics) ? report.analytics : null;
  if (!analytics || typeof report.provider !== "string" || !Array.isArray(report.property_refs) || typeof report.property_refs[0] !== "string") return null;
  const current = isRecord(analytics.current) ? analytics.current : {};
  const previous = isRecord(analytics.previous) ? analytics.previous : null;
  const currentRange = isRecord(analytics.current_date_range) && typeof analytics.current_date_range.start === "string" && typeof analytics.current_date_range.end === "string" ? { start: analytics.current_date_range.start, end: analytics.current_date_range.end } : null;
  const previousRange = isRecord(analytics.previous_date_range) && typeof analytics.previous_date_range.start === "string" && typeof analytics.previous_date_range.end === "string" ? { start: analytics.previous_date_range.start, end: analytics.previous_date_range.end } : null;
  const request = isRecord(report.request) ? report.request : null;
  return { client_id: typeof report.client_id === "string" ? report.client_id : "", provider: report.provider, property_id: report.property_refs[0], generated_at: typeof report.generated_at === "string" ? report.generated_at : null, country: request && typeof request.country === "string" ? request.country : null, current, previous, current_range: currentRange, previous_range: previousRange };
}

async function readAgencyReport(path: string): Promise<AgencyReportSummary> {
  const root = dirname(resolve(path));
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as { files?: Record<string, { sha256?: unknown; bytes?: unknown }> };
  const entry = manifest.files?.["agency-report.json"];
  const content = await readFile(path, "utf8");
  if (!entry || entry.sha256 !== sha256(content) || entry.bytes !== Buffer.byteLength(content)) throw new Error("agency report manifest verification failed");
  const value = JSON.parse(content) as Partial<AgencyReportSummary>;
  if (value.schema_version !== "1" || typeof value.generated_at !== "string" || !Array.isArray(value.accepted_bundles) || !Array.isArray(value.source_status) || !Array.isArray(value.blocked_sources) || !Array.isArray(value.cross_source_context) || !Array.isArray(value.insights) || !isRecord(value.scope) || !Array.isArray(value.scope.entries)) throw new Error("agency report schema validation failed");
  for (const entry of value.scope.entries) {
    if (!isRecord(entry) || typeof entry.client_id !== "string" || typeof entry.client_display_name !== "string" || typeof entry.property_id !== "string" || typeof entry.provider !== "string" || typeof entry.status !== "string") throw new Error("agency report scope entry validation failed");
  }
  for (const bundle of value.accepted_bundles) {
    if (!isRecord(bundle) || typeof bundle.bundle_path !== "string" || typeof bundle.client_id !== "string" || typeof bundle.property_id !== "string" || typeof bundle.provider !== "string") throw new Error("agency report accepted bundle validation failed");
    resolveInside(root, bundle.bundle_path, "agency bundle_path");
  }
  return value as AgencyReportSummary;
}

async function collectMetrics(summary: AgencyReportSummary, artifactsDir: string): Promise<BundleMetric[]> {
  const metrics: BundleMetric[] = [];
  for (const bundle of summary.accepted_bundles) {
    const bundleDir = resolveInside(artifactsDir, bundle.bundle_path, "bundle_path");
    const report = await readVerifiedJsonBundle(bundleDir, bundle);
    const metric = extractMetric(report);
    if (metric) metrics.push(metric);
  }
  return metrics;
}

async function collectSourceManifestHashes(summary: AgencyReportSummary, artifactsDir: string): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const bundle of summary.accepted_bundles) {
    const bundleDir = resolveInside(artifactsDir, bundle.bundle_path, "bundle_path");
    const manifestPath = join(bundleDir, "manifest.json");
    hashes[bundle.bundle_path] = hashBytes(await readFile(manifestPath));
  }
  return hashes;
}

function unitHtml(unit: DeliveryUnit, generatedAt: string): string {
  const gsc = unit.metrics.filter((metric) => metric.provider === "google-search-console");
  const ahrefs = unit.metrics.filter((metric) => metric.provider === "ahrefs");
  const currentPeriod = gsc.find((metric) => metric.current_range)?.current_range;
  const previousPeriod = gsc.find((metric) => metric.previous_range)?.previous_range;
  const sourceSummary = unit.sources.map((source) => source.status === "unavailable" ? `Unavailable — ${source.provider}` : source.provider).join(", ");
  const cards = gsc.flatMap((metric) => [
    [`Observed — Google Search Console · ${metric.property_id} · Kliknięcia`, formatNumber(metricValue(metric, "clicks")), comparison(metric, "clicks")],
    [`Observed — Google Search Console · ${metric.property_id} · Wyświetlenia`, formatNumber(metricValue(metric, "impressions")), comparison(metric, "impressions")],
    [`Observed — Google Search Console · ${metric.property_id} · CTR`, formatPercent(metricValue(metric, "ctr")), comparison(metric, "ctr")],
    [`Observed — Google Search Console · ${metric.property_id} · Średnia pozycja`, metricValue(metric, "position")?.toFixed(2) ?? "—", comparison(metric, "position")],
  ]).map(([label, value, change]) => `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(change)}</small></article>`).join("");
  const ahrefsCards = ahrefs.map((metric) => `<article class="metric estimated"><span>Estimated — Ahrefs · ${escapeHtml(metric.property_id)}</span><strong>${formatNumber(finite(metric.current.organic_traffic))}</strong><small>Szacowany ruch organiczny · ${formatNumber(finite(metric.current.organic_keywords))} fraz · ${formatNumber(finite(metric.current.organic_keywords_top_3))} fraz w Top 3${metric.generated_at ? ` · stan na ${escapeHtml(metric.generated_at.slice(0, 10))}` : ""}${metric.country ? ` · rynek ${escapeHtml(metric.country.toUpperCase())}` : ""}</small></article>`).join("");
  const contextRows = unit.context.map((entry) => `<tr><td>${escapeHtml(entry.key_type)}</td><td><span class="tag">${escapeHtml(entry.join_type)}</span></td><td>${escapeHtml(entry.key)}</td><td>${formatNumber(entry.gsc?.clicks ?? null)}</td><td>${formatNumber(entry.gsc?.impressions ?? null)}</td><td>${formatNumber(entry.ahrefs?.estimated_traffic ?? null)}</td></tr>`).join("");
  const signalRows = unit.insights.map((insight) => `<tr><td>${escapeHtml(insight.kind)}</td><td>${escapeHtml(insight.key)}</td><td>${escapeHtml(insight.evidence)}</td><td>${escapeHtml(insight.severity)}</td></tr>`).join("");
  const keywordRows = unit.keywordGroups.flatMap(({ group, rows }) => rows.map((row) => `<tr><td>${escapeHtml(group.host)}</td><td>${escapeHtml(row.keyword)}</td><td>${escapeHtml(row.volume)}</td><td>${escapeHtml(row.clicks)}</td><td>${escapeHtml(row.difficulty)}</td><td>${escapeHtml(row.traffic_potential)}</td><td>${escapeHtml(row.parent_topic)}</td><td>${escapeHtml(row.parent_volume)}</td></tr>`)).join("");
  const sourceRows = unit.sources.map((source) => `<tr><td>${escapeHtml(source.provider)}</td><td>${escapeHtml(source.status === "unavailable" ? "Unavailable — źródło niepodłączone" : source.status)}</td><td>${escapeHtml(source.reason ?? "Dane zweryfikowane")}</td></tr>`).join("");
  const keywordSection = unit.keywordGroups.length ? `<section class="page-break wide-table"><div class="eyebrow">ANALIZA FRAZ</div><h2>Dane fraz kluczowych</h2><p class="muted">Estimated — Ahrefs Keywords Explorer. Wszystkie zwrócone wiersze są pokazane; to nie jest pełna inwentaryzacja fraz.</p><div class="table-wrap"><table><thead><tr><th>Domena</th><th>Fraza</th><th>Szac. wyszukiwania / mies.</th><th>Szac. kliknięcia / mies.</th><th>Trudność KD</th><th>Szac. potencjał ruchu</th><th>Temat nadrzędny</th><th>Wolumen tematu</th></tr></thead><tbody>${keywordRows}</tbody></table></div></section>` : "";
  const readySources = [...new Set(unit.sources.filter((source) => source.status === "ready").map((source) => source.provider))];
  const unavailableSources = [...new Set(unit.sources.filter((source) => source.status !== "ready").map((source) => source.provider))];
  const clientStatus = unavailableSources.length
    ? `Raport częściowy — dostępne: ${readySources.join(", ") || "brak"}; niepodłączone: ${unavailableSources.join(", ")}`
    : readySources.length
      ? `Raport gotowy — źródła: ${readySources.join(", ")}`
      : "Raport częściowy — brak zweryfikowanych źródeł";
  const previousLabel = previousPeriod ? `Poprzedni okres: ${previousPeriod.start} — ${previousPeriod.end}.` : "Brak porównywalnej bazy dla poprzedniego okresu.";
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(unit.title)} — SEO report</title><style>
  @page{size:A4;margin:15mm 13mm 16mm}@page landscape{size:A4 landscape;margin:11mm 12mm}*{box-sizing:border-box}body{margin:0;background:#f3f6f8;color:#182431;font:13px/1.55 Inter,Arial,sans-serif}.sheet{max-width:1100px;margin:auto;background:#fff}.cover{min-height:250mm;padding:42mm 18mm 22mm;background:linear-gradient(135deg,#0b1f33 0%,#123d52 58%,#9ed6b0 150%);color:#fff;position:relative}.cover:after{content:"";position:absolute;width:180px;height:180px;border:1px solid rgba(255,255,255,.25);border-radius:50%;right:50px;top:60px;box-shadow:0 0 0 22px rgba(255,255,255,.05),0 0 0 44px rgba(255,255,255,.04)}.brand{letter-spacing:.18em;text-transform:uppercase;font-weight:700;font-size:11px;color:#b8e9c7}.cover h1{font-size:46px;line-height:1.05;max-width:700px;margin:30px 0 18px}.cover .subtitle{font-size:18px;color:#d8e8ec;max-width:610px}.cover-meta{position:absolute;bottom:25mm;left:18mm;right:18mm;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,.25);padding-top:14px;color:#c8dce0}.content{padding:20mm 18mm}.eyebrow{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#4e8d72;font-weight:800;margin-bottom:8px}h2{font-size:25px;line-height:1.15;margin:0 0 12px;color:#12384a}h3{color:#12384a}.muted{color:#65757d}.status{display:inline-block;background:#d9f0df;color:#1f6840;padding:5px 10px;border-radius:99px;font-weight:700}.status.pending{background:#fff0c7;color:#8b5d13}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.metric{border:1px solid #dce7e8;border-radius:12px;padding:15px;background:#fbfdfd}.metric span{display:block;color:#5d737b;font-size:11px}.metric strong{display:block;font-size:27px;color:#12384a;margin:7px 0}.metric small{color:#6c7b83}.metric.estimated{background:#f5f0ff;border-color:#ded2fa}.section{margin-top:28px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:0;table-layout:fixed}th{text-align:left;background:#edf4f4;color:#31545d;font-size:11px;text-transform:uppercase;letter-spacing:.05em}th,td{padding:9px 8px;border-bottom:1px solid #e6eeee;vertical-align:top;overflow-wrap:anywhere}td{color:#31434a}.tag{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;background:#e6f1f1;padding:3px 7px;border-radius:99px}.callout{border-left:4px solid #79b78e;background:#f1f8f3;padding:14px 16px;border-radius:0 10px 10px 0}.warning{border-left-color:#e8bd62;background:#fff9e9}.page-break{break-before:page}.wide-table{page:landscape}.footer{margin-top:35px;padding-top:12px;border-top:1px solid #dde8e9;color:#72828a;font-size:10px;display:flex;justify-content:space-between}.no-data{color:#7b888e;font-style:italic}@media (max-width:700px){.content{padding:12mm 7mm}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{padding:10px}.metric strong{font-size:21px}.cover{padding:28mm 10mm 18mm}.cover h1{font-size:36px}.cover-meta{left:10mm;right:10mm}}@media print{body{background:#fff}.sheet{max-width:none}.page-break{break-before:page}tr{break-inside:avoid}table{font-size:8px}th,td{padding:5px 4px}.cover{break-after:page}}
  </style></head><body><main class="sheet"><section class="cover"><div class="brand">Rekurencja.com · SEO intelligence</div><h1>${escapeHtml(unit.title)}</h1><p class="subtitle">Raport wyników organicznych przygotowany wyłącznie na podstawie zweryfikowanych danych źródłowych.</p><div class="cover-meta"><span>${escapeHtml(unit.mappingLabel)}</span><span>${escapeHtml(currentPeriod ? `${currentPeriod.start} — ${currentPeriod.end}` : "Brak okresu GSC")}</span><span>${escapeHtml(generatedAt.slice(0,10))}</span></div></section><div class="content"><div class="eyebrow">PODSUMOWANIE</div><h2>Najważniejsze wyniki</h2><p><span class="status ${unit.kind === "domain" ? "pending" : ""}">${escapeHtml(unit.kind === "domain" ? "Przypisanie do klienta: oczekuje na potwierdzenie operatora" : clientStatus)}</span></p><div class="callout ${unit.kind === "domain" ? "warning" : ""}">${escapeHtml(unit.kind === "domain" ? "Ta domena pochodzi z dostarczonej listy fraz, ale nie ma jeszcze jawnego przypisania do klienta. Raport pokazuje wyłącznie jej wyniki i nie przypisuje własności automatycznie." : "GSC pokazuje obserwowane dane. Ahrefs pokazuje estymacje dostawcy. Tych wartości nie sumujemy. Źródła niepodłączone nie oznaczają wartości zero.")}</div><div class="grid">${cards}${ahrefsCards}</div><div class="section"><div class="eyebrow">OKRES RAPORTOWANIA</div><h2>Zakres i porównanie</h2><p>${currentPeriod ? `GSC: ${escapeHtml(currentPeriod.start)} — ${escapeHtml(currentPeriod.end)}.` : "Brak porównywalnego okresu GSC."} ${escapeHtml(previousLabel)} Dane raportowane są zgodnie z zakresem źródłowym; strefa czasowa dostawcy nie jest rekonstruowana lokalnie.</p></div><div class="section"><div class="eyebrow">STATUS ŹRÓDEŁ</div><h2>Źródła danych</h2><p class="muted">${escapeHtml(sourceSummary || "Dla tej jednostki nie ma jeszcze źródła pozycyjnego lub analitycznego.")}</p><div class="table-wrap"><table><thead><tr><th>Źródło</th><th>Status</th><th>Interpretacja</th></tr></thead><tbody>${sourceRows || `<tr><td colspan="3" class="no-data">Brak źródeł dla tej jednostki.</td></tr>`}</tbody></table></div></div>${keywordSection}<section class="page-break wide-table"><div class="eyebrow">SZCZEGÓŁY WIDOCZNOŚCI</div><h2>Widoczność organiczna</h2><p class="muted">Pełny zbiór wyników z zachowaniem rozróżnienia źródeł i typu dopasowania: w obu źródłach, tylko GSC albo tylko Ahrefs.</p><div class="table-wrap"><table><thead><tr><th>Typ</th><th>Pokrycie</th><th>Adres / zapytanie</th><th>GSC — kliknięcia</th><th>GSC — wyświetlenia</th><th>Ahrefs — szac. ruch</th></tr></thead><tbody>${contextRows || `<tr><td colspan="6" class="no-data">Brak cross-source context.</td></tr>`}</tbody></table></div></section><section class="page-break"><div class="eyebrow">SYGNAŁY REGUŁOWE</div><h2>Sygnały do omówienia</h2><p class="muted">Rule-based signal — not a recommendation. Sygnały wynikają z wymienionych danych; nie są rekomendacjami ani wnioskami przyczynowymi.</p><div class="table-wrap"><table><thead><tr><th>Typ</th><th>Obszar</th><th>Dowód</th><th>Waga</th></tr></thead><tbody>${signalRows || `<tr><td colspan="4" class="no-data">Brak sygnałów.</td></tr>`}</tbody></table></div></section><section class="section"><div class="eyebrow">OGRANICZENIA I NOTATKI</div><h2>Co należy wiedzieć</h2><ul><li>Raport nie wykonuje nowych requestów i nie rozszerza zakresu danych.</li><li>Ahrefs pokazuje szacunki w ograniczonym zakresie; nie jest to pełna inwentaryzacja.</li><li>GA4 i Localo są niepodłączone; ich brak nie oznacza wartości zero.</li><li>Dostęp do GSC nie potwierdza własności domeny.</li><li>Przypisanie tej jednostki do klienta pozostaje decyzją operatora.</li>${unit.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul><div class="footer"><span>Lokalny raport oparty na zweryfikowanych danych</span><span>${escapeHtml(unit.id)}</span></div></section></div></main></body></html>`;
}

function appendClientContent(html: string, content: ClientContent | null, rankMonitoring: RankMonitoringSnapshot | null): string {
  if (!content && !rankMonitoring) return html;
  const actions = content ? content.actions.map((action) => `<tr><td>${escapeHtml(action.period.start)} — ${escapeHtml(action.period.end)}</td><td>${escapeHtml(action.type)}</td><td>${escapeHtml(action.status)}</td><td>${escapeHtml(action.title)}</td><td>${escapeHtml(action.target_url ?? "—")}</td></tr>`).join("") : "";
  const glossary = content ? content.glossary.map((entry) => `<tr><td>${escapeHtml(entry.term)}</td><td>${escapeHtml(entry.explanation)}</td></tr>`).join("") : "";
  const contact = content?.contact ? `<p><strong>Kontakt:</strong> ${escapeHtml(content.contact.name)}${content.contact.email ? ` · ${escapeHtml(content.contact.email)}` : ""}${content.contact.phone ? ` · ${escapeHtml(content.contact.phone)}` : ""}</p>` : "";
  const rankRows = rankMonitoring?.rows.map((row) => `<tr><td>${escapeHtml(row.keyword)}</td><td>${escapeHtml(row.position ?? "—")}</td><td>${escapeHtml(row.previous_position ?? "—")}</td><td>${escapeHtml(row.search_engine)}</td><td>${escapeHtml(row.location ?? "—")}</td><td>${escapeHtml(row.url ?? "—")}</td></tr>`).join("") ?? "";
  const rankSection = rankMonitoring ? `<section class="section"><div class="eyebrow">MONITORING FRAZ</div><h2>Pozycje monitorowanych fraz</h2><p class="muted">Źródło: SERPROBOT · okres ${escapeHtml(rankMonitoring.date_range.start)} — ${escapeHtml(rankMonitoring.date_range.end)}. To snapshot pozycji, nie pomiar ruchu.</p><div class="table-wrap"><table><thead><tr><th>Fraza</th><th>Pozycja</th><th>Poprzednio</th><th>Wyszukiwarka</th><th>Lokalizacja</th><th>Adres</th></tr></thead><tbody>${rankRows || `<tr><td colspan="6" class="no-data">Brak zwróconych fraz.</td></tr>`}</tbody></table></div></section>` : "";
  const section = `${rankSection}${content ? `<section class="section"><div class="eyebrow">DZIAŁANIA DLA STRONY</div><h2>Wykonane i zaplanowane działania</h2><p class="muted">Rejestr działań pochodzi z jawnego inputu operatora; pozycje nie są wywnioskowane z metryk.</p><div class="table-wrap"><table><thead><tr><th>Okres</th><th>Typ</th><th>Status</th><th>Opis</th><th>Adres</th></tr></thead><tbody>${actions || `<tr><td colspan="5" class="no-data">Brak wpisów dla tego okresu.</td></tr>`}</tbody></table></div>${contact}</section><section class="section"><div class="eyebrow">PRZYDATNE POJĘCIA</div><h2>Słownik raportu</h2><div class="table-wrap"><table><thead><tr><th>Pojęcie</th><th>Wyjaśnienie</th></tr></thead><tbody>${glossary || `<tr><td colspan="2" class="no-data">Brak wpisów słownika.</td></tr>`}</tbody></table></div></section>` : ""}`;
  return html.replace("</section></div></main></body></html>", `${section}</section></div></main></body></html>`);
}

async function renderPdf(htmlPath: string, pdfPath: string): Promise<void> {
  const profile = await mkdtemp(join(tmpdir(), "seo-godlike-chromium-"));
  const normalized = `${pdfPath}.normalized`;
  const outputRoot = dirname(resolve(pdfPath));
  try {
    const chromiumArgs = [
      "--unshare-user", "--unshare-ipc", "--unshare-pid", "--unshare-uts", "--die-with-parent", "--ro-bind", "/", "/",
      "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp", "--bind", profile, profile,
      "--bind", outputRoot, outputRoot, "--setenv", "HOME", profile,
      "--setenv", "XDG_CONFIG_HOME", profile, "--setenv", "XDG_CACHE_HOME", profile,
      "chromium", "--headless", "--no-sandbox", "--disable-gpu", "--disable-background-networking",
      "--disable-component-update", "--disable-default-apps", "--disable-domain-reliability", "--disable-network-service", "--disable-breakpad", "--disable-client-side-phishing-detection", "--safebrowsing-disable-download-protection",
      "--disable-features=AutofillServerCommunication,CertificateTransparencyComponentUpdater,ConnectivityDiagnostics,MediaRouter,NetworkTimeQuery,OptimizationHints,Translate",
      "--disable-sync", "--disable-quic", "--host-resolver-rules=MAP * 127.0.0.1,EXCLUDE localhost",
      "--no-first-run", "--no-default-browser-check", "--no-pdf-header-footer",
      `--user-data-dir=${profile}`, `--print-to-pdf=${pdfPath}`, `file://${resolve(htmlPath)}`,
    ];
    await execFileAsync("systemd-run", ["--user", "--wait", "--pipe", "--quiet", "--collect", "-p", "RestrictAddressFamilies=AF_UNIX", "-p", "PrivateNetwork=yes", "--", "bwrap", ...chromiumArgs], { timeout: 120_000 });
    await execFileAsync("qpdf", ["--static-id", "--remove-info", "--remove-metadata", pdfPath, normalized], { timeout: 120_000 });
    await writeFile(normalized, normalizePdfMetadata(await readFile(normalized)), { flag: "w", mode: 0o600 });
    await rename(normalized, pdfPath);
    await chmod(pdfPath, 0o600);
  } finally {
    await rm(profile, { recursive: true, force: true });
    await rm(normalized, { force: true });
  }
}

export async function writeClientDelivery(options: ClientDeliveryOptions): Promise<ClientDeliveryResult> {
  const summary = await readAgencyReport(options.agencyReportPath);
  const metrics = await collectMetrics(summary, options.artifactsDir);
  const agencyReportBytes = await readFile(options.agencyReportPath);
  const clientContent = options.clientContentPath ? await readClientContent(options.clientContentPath) : null;
  const sourceManifestHashes = await collectSourceManifestHashes(summary, options.artifactsDir);
  const outputDir = resolve(options.outputDir);
  await mkdir(outputDir, { recursive: false, mode: 0o700 });
  const clientIds = [...new Set(summary.scope.entries.map((entry) => entry.client_id).concat(summary.source_status.map((source) => source.client_id)))].sort();
  const rankBundle = options.rankMonitoringPath ? await readRankMonitoringBundle(options.rankMonitoringPath, clientIds) : null;
  const keyword = summary.keyword_research;
  const clientKeywordGroups = new Map<string, Array<{ group: PhraseGroup; rows: Array<Record<string, unknown>> }>>();
  if (keyword) {
    for (const inputGroup of keyword.input_groups) {
      const owner = summary.scope.entries.find((entry) => hostFromProperty(entry.property_id) === inputGroup.host.toLowerCase());
      if (!owner) continue;
      const result = keyword.groups.find((group) => group.host === inputGroup.host);
      const groups = clientKeywordGroups.get(owner.client_id) ?? [];
      groups.push({ group: inputGroup, rows: result?.rows ?? [] });
      clientKeywordGroups.set(owner.client_id, groups);
    }
  }
  const units: DeliveryUnit[] = clientIds.map((clientId) => { const content = clientContent?.client_id === clientId ? clientContent : null; const rankMonitoring = rankBundle?.snapshot.client_id === clientId ? rankBundle.snapshot : null; return { id: clientId, title: summary.scope.entries.find((entry) => entry.client_id === clientId)?.client_display_name ?? clientId, kind: "client", mappingLabel: `Klient: ${clientId}`, sources: summary.source_status.filter((source) => source.client_id === clientId), metrics: metrics.filter((metric) => summary.accepted_bundles.some((bundle) => bundle.client_id === clientId && bundle.property_id === metric.property_id && bundle.provider === metric.provider)), context: summary.cross_source_context.filter((entry) => entry.client_id === clientId), insights: summary.insights.filter((insight) => insight.client_id === clientId), keywordGroups: clientKeywordGroups.get(clientId) ?? [], notes: content ? content.actions.map((action) => `Działanie ${action.status}: ${action.title}`) : [], content, rankMonitoring }; });
  if (keyword) {
    for (const inputGroup of keyword.input_groups) {
      if (summary.scope.entries.some((entry) => hostFromProperty(entry.property_id) === inputGroup.host.toLowerCase())) continue;
      const result = keyword.groups.find((group) => group.host === inputGroup.host);
      units.push({ id: `domain-${inputGroup.host}`, title: inputGroup.host, kind: "domain", mappingLabel: "Przypisanie do klienta: oczekuje na potwierdzenie operatora", sources: [{ client_id: "unassigned", property_id: inputGroup.host, provider: "ahrefs-keywords-explorer", status: "ready", reason: "Dane fraz zweryfikowane w bundle Keywords Explorer", bundle_path: keyword.bundle_path }], metrics: [], context: [], insights: [], keywordGroups: [{ group: inputGroup, rows: result?.rows ?? [] }], notes: keyword.notes.filter((note) => note.startsWith(`${inputGroup.host}:`)), content: null, rankMonitoring: null });
    }
  }
  units.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const generatedAt = summary.generated_at;
  const resultUnits: ClientDeliveryResult["units"] = [];
  const outputSegments = new Set<string>();
  for (const unit of units) {
    const unitDir = join(outputDir, safeSegment(unit.id));
    const segment = safeSegment(unit.id);
    if (outputSegments.has(segment)) throw new Error(`delivery unit path collision: ${unit.id}`);
    outputSegments.add(segment);
    await mkdir(unitDir, { recursive: false, mode: 0o700 });
    const htmlName = `${safeSegment(unit.id)}-seo-report.html`;
    const htmlPath = join(unitDir, htmlName);
    const html = appendClientContent(unitHtml(unit, generatedAt), unit.content, unit.rankMonitoring);
    await writeFile(htmlPath, html, { encoding: "utf8", flag: "wx", mode: 0o600 });
    let pdf: string | null = null;
    if (options.renderPdf) {
      pdf = join(unitDir, `${safeSegment(unit.id)}-seo-report.pdf`);
      await renderPdf(htmlPath, pdf);
    }
    resultUnits.push({ id: unit.id, kind: unit.kind, html: relative(outputDir, htmlPath), pdf: pdf ? relative(outputDir, pdf) : null });
  }
  const index = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Raporty SEO — Bodymove</title><style>body{font:16px/1.5 system-ui;max-width:900px;margin:4rem auto;padding:0 1.5rem;color:#172b36}a{color:#176b70}li{margin:1rem 0}small{color:#667}</style></head><body><h1>Raporty SEO</h1><p>Wyniki przygotowane wyłącznie z istniejących, zweryfikowanych danych. Nie wykonano ponownych zapytań do dostawców.</p><ul>${resultUnits.map((unit) => `<li><strong>${escapeHtml(unit.id)}</strong> — <a href="${escapeHtml(unit.html)}">Raport HTML</a>${unit.pdf ? ` · <a href="${escapeHtml(unit.pdf)}">Raport PDF</a>` : ""}</li>`).join("")}</ul><small>Źródła, zakres i ograniczenia są opisane w każdym raporcie.</small></body></html>`;
  await writeFile(join(outputDir, "index.html"), index, { encoding: "utf8", flag: "wx", mode: 0o600 });
  const files: Record<string, string | Buffer> = { "index.html": index };
  for (const unit of resultUnits) { files[unit.html] = await readFile(join(outputDir, unit.html), "utf8"); if (unit.pdf) files[unit.pdf] = await readFile(join(outputDir, unit.pdf)); }
  const manifest = { schema_version: "1", source: resolve(options.agencyReportPath), agency_report_sha256: hashBytes(agencyReportBytes), source_manifest_sha256: sourceManifestHashes, client_content_sha256: options.clientContentPath ? hashBytes(await readFile(options.clientContentPath)) : null, rank_monitoring_manifest_sha256: rankBundle?.manifest_sha256 ?? null, execution: { provider_calls: 0, network_policy: options.renderPdf ? "renderer_network_isolated" : "no_renderer" }, units: resultUnits, files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { sha256: hashBytes(content), bytes: Buffer.byteLength(content) }])) };
  await writeFile(join(outputDir, "manifest.json"), canonicalJson(manifest), { encoding: "utf8", flag: "wx", mode: 0o600 });
  return { output_dir: outputDir, units: resultUnits, manifests_verified: 1 + summary.accepted_bundles.length + (rankBundle ? 1 : 0) };
}
