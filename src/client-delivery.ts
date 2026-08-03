import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { AgencyReportSummary, CrossSourceContextEntry } from "./agency-report.js";
import { PhraseGroup } from "./ahrefs-keywords.js";
import { canonicalJson, sha256 } from "./serialize.js";

const execFileAsync = promisify(execFile);

interface BundleMetric {
  provider: string;
  property_id: string;
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
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function finite(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function escapeHtml(value: unknown): string {
  return String(value ?? "—").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function safeSegment(value: string): string { return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "report"; }
function hashBytes(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function metricValue(metric: BundleMetric, field: string): number | null { return finite(metric.current[field]); }
function delta(current: number | null, previous: number | null): string {
  if (current === null || previous === null || previous === 0) return "—";
  const value = ((current - previous) / Math.abs(previous)) * 100;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}
function formatNumber(value: number | null): string { return value === null ? "—" : new Intl.NumberFormat("pl-PL").format(value); }
function formatPercent(value: number | null): string { return value === null ? "—" : `${(value * 100).toFixed(2)}%`; }

async function readVerifiedJsonBundle(bundleDir: string): Promise<Record<string, unknown>> {
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
  const report = JSON.parse(files.get("report.json") ?? "null") as Record<string, unknown>;
  if (!isRecord(report)) throw new Error(`missing report.json: ${bundleDir}`);
  return report;
}

function extractMetric(report: Record<string, unknown>): BundleMetric | null {
  const analytics = isRecord(report.analytics) ? report.analytics : null;
  if (!analytics || typeof report.provider !== "string" || !Array.isArray(report.property_refs) || typeof report.property_refs[0] !== "string") return null;
  const current = isRecord(analytics.current) ? analytics.current : {};
  const previous = isRecord(analytics.previous) ? analytics.previous : null;
  const currentRange = isRecord(analytics.current_date_range) && typeof analytics.current_date_range.start === "string" && typeof analytics.current_date_range.end === "string" ? { start: analytics.current_date_range.start, end: analytics.current_date_range.end } : null;
  const previousRange = isRecord(analytics.previous_date_range) && typeof analytics.previous_date_range.start === "string" && typeof analytics.previous_date_range.end === "string" ? { start: analytics.previous_date_range.start, end: analytics.previous_date_range.end } : null;
  return { provider: report.provider, property_id: report.property_refs[0], current, previous, current_range: currentRange, previous_range: previousRange };
}

async function readAgencyReport(path: string): Promise<AgencyReportSummary> {
  const root = dirname(resolve(path));
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as { files?: Record<string, { sha256?: unknown; bytes?: unknown }> };
  const entry = manifest.files?.["agency-report.json"];
  const content = await readFile(path, "utf8");
  if (!entry || entry.sha256 !== sha256(content) || entry.bytes !== Buffer.byteLength(content)) throw new Error("agency report manifest verification failed");
  return JSON.parse(content) as AgencyReportSummary;
}

async function collectMetrics(summary: AgencyReportSummary, artifactsDir: string): Promise<BundleMetric[]> {
  const metrics: BundleMetric[] = [];
  for (const bundle of summary.accepted_bundles) {
    const report = await readVerifiedJsonBundle(join(resolve(artifactsDir), bundle.bundle_path));
    const metric = extractMetric(report);
    if (metric) metrics.push(metric);
  }
  return metrics;
}

function unitHtml(unit: DeliveryUnit, generatedAt: string): string {
  const gsc = unit.metrics.filter((metric) => metric.provider === "google-search-console");
  const ahrefs = unit.metrics.filter((metric) => metric.provider === "ahrefs");
  const currentPeriod = gsc.find((metric) => metric.current_range)?.current_range;
  const cards = gsc.flatMap((metric) => [
    ["Observed — Google Search Console · Clicks", formatNumber(metricValue(metric, "clicks")), delta(metricValue(metric, "clicks"), metric.previous ? finite(metric.previous.clicks) : null)],
    ["Observed — Google Search Console · Impressions", formatNumber(metricValue(metric, "impressions")), delta(metricValue(metric, "impressions"), metric.previous ? finite(metric.previous.impressions) : null)],
    ["Observed — Google Search Console · CTR", formatPercent(metricValue(metric, "ctr")), delta(metricValue(metric, "ctr"), metric.previous ? finite(metric.previous.ctr) : null)],
    ["Observed — Google Search Console · Average position", metricValue(metric, "position")?.toFixed(2) ?? "—", delta(metricValue(metric, "position"), metric.previous ? finite(metric.previous.position) : null)],
  ]).map(([label, value, change]) => `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(change)} vs previous available period</small></article>`).join("");
  const ahrefsCards = ahrefs.map((metric) => `<article class="metric estimated"><span>Estimated — Ahrefs</span><strong>${formatNumber(finite(metric.current.organic_traffic))}</strong><small>organic traffic estimate · ${formatNumber(finite(metric.current.organic_keywords))} keywords · ${formatNumber(finite(metric.current.organic_keywords_top_3))} Top 3</small></article>`).join("");
  const contextRows = unit.context.map((entry) => `<tr><td>${escapeHtml(entry.key_type)}</td><td><span class="tag">${escapeHtml(entry.join_type)}</span></td><td>${escapeHtml(entry.key)}</td><td>${formatNumber(entry.gsc?.clicks ?? null)}</td><td>${formatNumber(entry.gsc?.impressions ?? null)}</td><td>${formatNumber(entry.ahrefs?.estimated_traffic ?? null)}</td></tr>`).join("");
  const signalRows = unit.insights.map((insight) => `<tr><td>${escapeHtml(insight.kind)}</td><td>${escapeHtml(insight.key)}</td><td>${escapeHtml(insight.evidence)}</td><td>${escapeHtml(insight.severity)}</td></tr>`).join("");
  const keywordRows = unit.keywordGroups.flatMap(({ group, rows }) => rows.map((row) => `<tr><td>${escapeHtml(group.host)}</td><td>${escapeHtml(row.keyword)}</td><td>${escapeHtml(row.volume)}</td><td>${escapeHtml(row.clicks)}</td><td>${escapeHtml(row.difficulty)}</td><td>${escapeHtml(row.traffic_potential)}</td><td>${escapeHtml(row.parent_topic)}</td><td>${escapeHtml(row.parent_volume)}</td></tr>`)).join("");
  const sourceRows = unit.sources.map((source) => `<tr><td>${escapeHtml(source.provider)}</td><td>${escapeHtml(source.status)}</td><td>${escapeHtml(source.reason ?? "Ready")}</td></tr>`).join("");
  const keywordSection = unit.keywordGroups.length ? `<section class="page-break"><div class="eyebrow">SEARCH INTENT</div><h2>Keyword research</h2><p class="muted">Estimated — Ahrefs Keywords Explorer. All returned rows are shown; this section does not claim complete keyword inventory.</p><div class="table-wrap"><table><thead><tr><th>Domain</th><th>Keyword</th><th>Volume</th><th>Clicks</th><th>Difficulty</th><th>Traffic potential</th><th>Parent topic</th><th>Parent volume</th></tr></thead><tbody>${keywordRows}</tbody></table></div></section>` : "";
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(unit.title)} — SEO report</title><style>
  @page{size:A4;margin:15mm 13mm 16mm}*{box-sizing:border-box}body{margin:0;background:#f3f6f8;color:#182431;font:13px/1.55 Inter,Arial,sans-serif}.sheet{max-width:1100px;margin:auto;background:#fff}.cover{min-height:250mm;padding:42mm 18mm 22mm;background:linear-gradient(135deg,#0b1f33 0%,#123d52 58%,#9ed6b0 150%);color:#fff;position:relative}.cover:after{content:"";position:absolute;width:180px;height:180px;border:1px solid rgba(255,255,255,.25);border-radius:50%;right:50px;top:60px;box-shadow:0 0 0 22px rgba(255,255,255,.05),0 0 0 44px rgba(255,255,255,.04)}.brand{letter-spacing:.18em;text-transform:uppercase;font-weight:700;font-size:11px;color:#b8e9c7}.cover h1{font-size:46px;line-height:1.05;max-width:700px;margin:30px 0 18px}.cover .subtitle{font-size:18px;color:#d8e8ec;max-width:610px}.cover-meta{position:absolute;bottom:25mm;left:18mm;right:18mm;display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,.25);padding-top:14px;color:#c8dce0}.content{padding:20mm 18mm}.eyebrow{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#4e8d72;font-weight:800;margin-bottom:8px}h2{font-size:25px;line-height:1.15;margin:0 0 12px;color:#12384a}h3{color:#12384a}.muted{color:#65757d}.status{display:inline-block;background:#d9f0df;color:#1f6840;padding:5px 10px;border-radius:99px;font-weight:700}.status.pending{background:#fff0c7;color:#8b5d13}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.metric{border:1px solid #dce7e8;border-radius:12px;padding:15px;background:#fbfdfd}.metric span{display:block;color:#5d737b;font-size:11px}.metric strong{display:block;font-size:27px;color:#12384a;margin:7px 0}.metric small{color:#6c7b83}.metric.estimated{background:#f5f0ff;border-color:#ded2fa}.section{margin-top:28px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:700px}th{text-align:left;background:#edf4f4;color:#31545d;font-size:11px;text-transform:uppercase;letter-spacing:.05em}th,td{padding:9px 8px;border-bottom:1px solid #e6eeee;vertical-align:top}td{color:#31434a}.tag{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;background:#e6f1f1;padding:3px 7px;border-radius:99px}.callout{border-left:4px solid #79b78e;background:#f1f8f3;padding:14px 16px;border-radius:0 10px 10px 0}.warning{border-left-color:#e8bd62;background:#fff9e9}.page-break{break-before:page}.footer{margin-top:35px;padding-top:12px;border-top:1px solid #dde8e9;color:#72828a;font-size:10px;display:flex;justify-content:space-between}.no-data{color:#7b888e;font-style:italic}@media print{body{background:#fff}.sheet{max-width:none}.page-break{break-before:page}tr{break-inside:avoid}.cover{break-after:page}}
  </style></head><body><main class="sheet"><section class="cover"><div class="brand">Rekurencja.com · SEO intelligence</div><h1>${escapeHtml(unit.title)}</h1><p class="subtitle">Raport wyników organicznych przygotowany wyłącznie na podstawie zweryfikowanych danych źródłowych.</p><div class="cover-meta"><span>${escapeHtml(unit.mappingLabel)}</span><span>${escapeHtml(generatedAt.slice(0,10))}</span></div></section><div class="content"><div class="eyebrow">EXECUTIVE RESULTS</div><h2>Najważniejsze wyniki</h2><p><span class="status ${unit.kind === "domain" ? "pending" : ""}">${escapeHtml(unit.kind === "domain" ? "Mapowanie klienta oczekuje na potwierdzenie" : "Raport częściowy — dane źródłowe gotowe")}</span></p><div class="callout ${unit.kind === "domain" ? "warning" : ""}">${escapeHtml(unit.kind === "domain" ? "Ta domena pochodzi z dostarczonej listy fraz, ale nie ma jeszcze jawnego przypisania do klienta. Raport pokazuje wyłącznie jej wyniki i nie przypisuje własności automatycznie." : "Wartości GSC są obserwowane. Wartości Ahrefs są estymacjami dostawcy i nie są dodawane do kliknięć GSC.")}</div><div class="grid">${cards}${ahrefsCards}</div><div class="section"><div class="eyebrow">PERIOD</div><h2>Zakres i porównanie</h2><p>${currentPeriod ? `GSC: ${escapeHtml(currentPeriod.start)} — ${escapeHtml(currentPeriod.end)}.` : "Brak porównywalnego okresu GSC."} Porównanie jest pokazane tylko wtedy, gdy poprzedni okres ma niezerowe, zweryfikowane dane. Brak danych nie jest traktowany jako zero.</p></div><div class="section"><div class="eyebrow">SOURCE STATUS</div><h2>Źródła danych</h2><div class="table-wrap"><table><thead><tr><th>Źródło</th><th>Status</th><th>Interpretacja</th></tr></thead><tbody>${sourceRows || `<tr><td colspan="3" class="no-data">Brak źródeł dla tej jednostki.</td></tr>`}</tbody></table></div></div>${keywordSection}<section class="page-break"><div class="eyebrow">OPPORTUNITIES</div><h2>Widoczność organiczna</h2><p class="muted">Pełny zbiór wyników z zachowaniem rozróżnienia źródeł i typu dopasowania.</p><div class="table-wrap"><table><thead><tr><th>Typ</th><th>Pokrycie</th><th>Adres / zapytanie</th><th>GSC clicks</th><th>GSC impressions</th><th>Ahrefs est. traffic</th></tr></thead><tbody>${contextRows || `<tr><td colspan="6" class="no-data">Brak cross-source context.</td></tr>`}</tbody></table></div></section><section class="page-break"><div class="eyebrow">SIGNALS</div><h2>Sygnały do omówienia</h2><p class="muted">Sygnały są regułowe i evidence-derived. Nie są automatycznymi rekomendacjami ani wnioskami przyczynowymi.</p><div class="table-wrap"><table><thead><tr><th>Typ</th><th>Obszar</th><th>Dowód</th><th>Waga</th></tr></thead><tbody>${signalRows || `<tr><td colspan="4" class="no-data">Brak sygnałów.</td></tr>`}</tbody></table></div></section><section class="section"><div class="eyebrow">NOTES</div><h2>Ograniczenia</h2><ul><li>Raport nie wykonuje nowych requestów i nie rozszerza zakresu danych.</li><li>Ahrefs pokazuje estymacje i bounded provider context, nie pełną inwentaryzację.</li><li>Brak GA4/Localo oznacza unavailable, nie zero.</li><li>GSC access nie jest dowodem własności klienta.</li>${unit.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul><div class="footer"><span>Evidence-bound local delivery</span><span>${escapeHtml(unit.id)}</span></div></section></div></main></body></html>`;
}

async function renderPdf(htmlPath: string, pdfPath: string): Promise<void> {
  await execFileAsync("chromium", ["--headless", "--disable-gpu", `--print-to-pdf=${pdfPath}`, `file://${resolve(htmlPath)}`], { timeout: 120_000 });
}

export async function writeClientDelivery(options: ClientDeliveryOptions): Promise<ClientDeliveryResult> {
  const summary = await readAgencyReport(options.agencyReportPath);
  const metrics = await collectMetrics(summary, options.artifactsDir);
  const outputDir = resolve(options.outputDir);
  await mkdir(outputDir, { recursive: false });
  const clientIds = [...new Set(summary.scope.entries.map((entry) => entry.client_id).concat(summary.source_status.map((source) => source.client_id)))].sort();
  const units: DeliveryUnit[] = clientIds.map((clientId) => ({ id: clientId, title: summary.scope.entries.find((entry) => entry.client_id === clientId)?.client_display_name ?? clientId, kind: "client", mappingLabel: `Client: ${clientId}`, sources: summary.source_status.filter((source) => source.client_id === clientId), metrics: metrics.filter((metric) => summary.accepted_bundles.some((bundle) => bundle.client_id === clientId && bundle.property_id === metric.property_id && bundle.provider === metric.provider)), context: summary.cross_source_context.filter((entry) => entry.client_id === clientId), insights: summary.insights.filter((insight) => insight.client_id === clientId), keywordGroups: [], notes: [] }));
  const keyword = summary.keyword_research;
  if (keyword) {
    const knownProperties = new Set(summary.scope.entries.map((entry) => entry.property_id.toLowerCase()));
    for (const inputGroup of keyword.input_groups) {
      if (knownProperties.has(inputGroup.host.toLowerCase()) || inputGroup.host.toLowerCase().endsWith("bodymove.pl")) continue;
      const result = keyword.groups.find((group) => group.host === inputGroup.host);
      units.push({ id: `domain-${inputGroup.host}`, title: inputGroup.host, kind: "domain", mappingLabel: "Client mapping pending", sources: [], metrics: [], context: [], insights: [], keywordGroups: [{ group: inputGroup, rows: result?.rows ?? [] }], notes: keyword.notes.filter((note) => note.startsWith(`${inputGroup.host}:`)) });
    }
  }
  units.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const generatedAt = summary.generated_at;
  const resultUnits: ClientDeliveryResult["units"] = [];
  for (const unit of units) {
    const unitDir = join(outputDir, safeSegment(unit.id));
    await mkdir(unitDir, { recursive: false });
    const htmlName = `${safeSegment(unit.id)}-seo-report.html`;
    const htmlPath = join(unitDir, htmlName);
    const html = unitHtml(unit, generatedAt);
    await writeFile(htmlPath, html, { encoding: "utf8", flag: "wx", mode: 0o600 });
    let pdf: string | null = null;
    if (options.renderPdf) {
      pdf = join(unitDir, `${safeSegment(unit.id)}-seo-report.pdf`);
      await renderPdf(htmlPath, pdf);
    }
    resultUnits.push({ id: unit.id, kind: unit.kind, html: relative(outputDir, htmlPath), pdf: pdf ? relative(outputDir, pdf) : null });
  }
  const index = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>SEO delivery reports</title><style>body{font:16px system-ui;max-width:900px;margin:4rem auto;color:#172b36}a{color:#176b70}li{margin:1rem 0}</style></head><body><h1>SEO delivery reports</h1><p>Wygenerowano wyłącznie z istniejących, zweryfikowanych evidence bundles. Brak provider rerunów.</p><ul>${resultUnits.map((unit) => `<li><strong>${escapeHtml(unit.id)}</strong> — <a href="${escapeHtml(unit.html)}">HTML</a>${unit.pdf ? ` · <a href="${escapeHtml(unit.pdf)}">PDF</a>` : ""}</li>`).join("")}</ul></body></html>`;
  await writeFile(join(outputDir, "index.html"), index, { encoding: "utf8", flag: "wx", mode: 0o600 });
  const files: Record<string, string | Buffer> = { "index.html": index };
  for (const unit of resultUnits) { files[unit.html] = await readFile(join(outputDir, unit.html), "utf8"); if (unit.pdf) files[unit.pdf] = await readFile(join(outputDir, unit.pdf)); }
  const manifest = { schema_version: "1", source: resolve(options.agencyReportPath), provider_calls: 0, units: resultUnits, files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { sha256: hashBytes(content), bytes: Buffer.byteLength(content) }])) };
  await writeFile(join(outputDir, "manifest.json"), canonicalJson(manifest), { encoding: "utf8", flag: "wx", mode: 0o600 });
  return { output_dir: outputDir, units: resultUnits, manifests_verified: 1 + summary.accepted_bundles.length };
}
