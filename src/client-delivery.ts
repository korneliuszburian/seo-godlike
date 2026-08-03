import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { AgencyReportSummary, CrossSourceContextEntry } from "./agency-report.js";
import { PhraseGroup } from "./ahrefs-keywords.js";
import { canonicalJson, sha256 } from "./serialize.js";
import { ClientContent, readClientContent, readClientContentBundle } from "./client-content.js";
import { RANK_MONITORING_SOURCE_LABEL, RankMonitoringSnapshot, rankMonitoringClientIds, readRankMonitoringBundle, resolveLatestRankMonitoringBundle, resolveRankMonitoringRoot } from "./rank-monitoring.js";
import { ProviderHistoryEntry, readProviderHistory } from "./provider-history.js";
import { AgencyRunRecord, assertAgencyReadOnlyPolicy } from "./agency-run.js";

const execFileAsync = promisify(execFile);

const PDF_RENDERER_BINARIES = ["/usr/bin/systemd-run", "/usr/bin/bwrap", "/usr/bin/chromium", "/usr/bin/qpdf"] as const;

export async function assertPdfRendererAvailable(
  environment: NodeJS.ProcessEnv = process.env,
  fileExists: (path: string) => Promise<boolean> = async (path) => {
    try { await access(path); return true; } catch { return false; }
  },
): Promise<void> {
  const missing = (await Promise.all(PDF_RENDERER_BINARIES.map(async (path) => [path, await fileExists(path)] as const)))
    .filter(([, exists]) => !exists)
    .map(([path]) => path);
  if (missing.length) throw new Error(`PDF renderer unavailable: missing required binaries ${missing.join(", ")}`);
  if (!environment.XDG_RUNTIME_DIR) throw new Error("PDF renderer unavailable: XDG_RUNTIME_DIR is not set; systemd-run --user needs a user session");
}

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
  clientContentBundlePath?: string;
  rankMonitoringPath?: string;
  rankMonitoringRoot?: string;
  keywordBundleRoot?: string;
  agencyRunRecordPath?: string;
}

export interface ClientDeliveryResult {
  output_dir: string;
  units: Array<{ id: string; kind: "client" | "domain"; html: string; pdf: string | null; email: string }>;
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
  history: ProviderHistoryEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
async function readAgencyRunRecord(path: string): Promise<{ record: AgencyRunRecord; sha256: string }> {
  const bytes = await readFile(path);
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")) as unknown; } catch { throw new Error(`invalid agency run record: ${path}`); }
  if (!isRecord(value) || value.schema_version !== "1" || typeof value.run_id !== "string" || typeof value.started_at !== "string" || typeof value.finished_at !== "string" || !isRecord(value.result) || !["ready", "partial", "blocked"].includes(value.result.status as string) || !Array.isArray(value.result.completed) || !Array.isArray(value.result.blocked) || !Array.isArray(value.result.failed) || !Array.isArray(value.result.trace)) throw new Error(`invalid agency run record: ${path}`);
  const record = value as unknown as AgencyRunRecord;
  try { assertAgencyReadOnlyPolicy(record); } catch (error) { throw new Error(`agency run record violates read-only policy: ${path}`, { cause: error }); }
  return { record, sha256: hashBytes(bytes) };
}
function finite(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function escapeHtml(value: unknown): string {
  return String(value ?? "—").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function providerLabel(provider: string): string {
  return ({
    "google-search-console": "Google Search Console",
    "google-analytics": "Google Analytics 4",
    ahrefs: "Ahrefs",
    "ahrefs-keywords-explorer": "Ahrefs Keywords Explorer",
    serprobot: "SERPROBOT",
    localo: "Localo",
    semstorm: "Semstorm",
  } as Record<string, string>)[provider] ?? provider;
}
function actionTypeLabel(type: string): string {
  return ({ sponsored_article: "Artykuł sponsorowany", forum_marketing: "Marketing szeptany", nap_listing: "Wizytówka NAP", on_site: "Działanie na stronie", other: "Inne" } as Record<string, string>)[type] ?? type;
}
function actionStatusLabel(status: string): string {
  return ({ planned: "Zaplanowane", in_progress: "W toku", published: "Opublikowane", paused: "Wstrzymane", cancelled: "Anulowane" } as Record<string, string>)[status] ?? status;
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
async function resolveExistingInside(root: string, child: string, label: string): Promise<string> {
  const lexical = resolveInside(root, child, label);
  const [realRoot, realChild] = await Promise.all([realpath(resolve(root)), realpath(lexical)]);
  if (realChild !== realRoot && !realChild.startsWith(`${realRoot}${sep}`)) throw new Error(`${label} escapes its root through a symlink`);
  return realChild;
}
function metricValue(metric: BundleMetric, field: string): number | null { return finite(metric.current[field]); }
function formatNumber(value: number | null): string { return value === null ? "—" : new Intl.NumberFormat("pl-PL").format(value); }
function formatPercent(value: number | null): string { return value === null ? "—" : `${(value * 100).toFixed(2)}%`; }
function formatDecimal(value: number | null): string { return value === null ? "—" : new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
function parseDay(value: string): number | null { const time = Date.parse(`${value}T00:00:00Z`); return Number.isFinite(time) ? time : null; }
function hasAdjacentPeriods(metric: BundleMetric): boolean {
  if (!metric.current_range || !metric.previous_range) return false;
  const currentStart = parseDay(metric.current_range.start);
  const previousEnd = parseDay(metric.previous_range.end);
  return currentStart !== null && previousEnd !== null && currentStart - previousEnd === 86_400_000;
}
function comparisonText(metric: BundleMetric, field: string, kind: "count" | "ratio" | "position"): string {
  if (!hasAdjacentPeriods(metric)) return "Brak porównywalnej bazy";
  const current = finite(metric.current[field]);
  const previous = finite(metric.previous?.[field]);
  if (current === null || previous === null) return "Brak porównywalnej bazy";
  if (kind === "position") {
    const delta = previous - current;
    const direction = delta > 0 ? "poprawa" : delta < 0 ? "pogorszenie" : "bez zmiany";
    return `${direction}: ${formatDecimal(previous)} → ${formatDecimal(current)} (${delta > 0 ? "+" : ""}${formatDecimal(delta)})`;
  }
  if (kind === "ratio") {
    const delta = (current - previous) * 100;
    return `${formatPercent(previous)} → ${formatPercent(current)} (${delta > 0 ? "+" : ""}${formatDecimal(delta)} p.p.)`;
  }
  const change = previous === 0 ? null : ((current - previous) / previous) * 100;
  return `${formatNumber(previous)} → ${formatNumber(current)}${change === null ? "" : ` (${change > 0 ? "+" : ""}${formatDecimal(change)}%)`}`;
}
function headerValue(value: string): string { return value.replace(/[\r\n]+/g, " ").trim(); }
function hostFromProperty(value: string): string | null {
  if (value.startsWith("sc-domain:")) return value.slice("sc-domain:".length).toLowerCase();
  try { return new URL(value).hostname.toLowerCase(); } catch { return value.toLowerCase(); }
}

function historyMetricValue(metric: ProviderHistoryEntry["metrics"][number]): string {
  if (metric.unit === "ratio") return formatPercent(metric.value);
  if (metric.unit === "position") return formatDecimal(metric.value);
  return formatNumber(metric.value);
}

function historyComparison(entry: ProviderHistoryEntry): string {
  if (!entry.comparison) return "Brak porównywalnej bazy";
  return entry.metrics.map((metric) => {
    const comparison = entry.comparison?.metrics[metric.key];
    if (!comparison) return `${metric.label}: brak porównywalnej bazy`;
    if (metric.unit === "position") {
      const improvement = comparison.delta < 0 ? "poprawa" : comparison.delta > 0 ? "pogorszenie" : "bez zmiany";
      return `${metric.label}: ${improvement} (${formatDecimal(Math.abs(comparison.delta))})`;
    }
    if (metric.unit === "ratio") return `${metric.label}: ${formatPercent(comparison.previous)} → ${formatPercent(comparison.current)} (${formatDecimal(comparison.delta * 100)} p.p.)`;
    const percentChange = comparison.previous === 0 ? null : (comparison.delta / comparison.previous) * 100;
    return `${metric.label}: ${formatNumber(comparison.previous)} → ${formatNumber(comparison.current)}${percentChange === null ? "" : ` (${percentChange > 0 ? "+" : ""}${formatDecimal(percentChange)}%)`}`;
  }).join("; ");
}

function historySection(entries: ProviderHistoryEntry[]): string {
  if (entries.length === 0) return "";
  const rows = entries.map((entry) => `<tr><td>${escapeHtml(entry.period.start)} — ${escapeHtml(entry.period.end)}</td><td>${escapeHtml(providerLabel(entry.provider))}</td><td>${escapeHtml(entry.property_id)}</td><td>${entry.metrics.map((metric) => `${escapeHtml(metric.label)}: ${escapeHtml(historyMetricValue(metric))}`).join("<br>")}</td><td>${escapeHtml(historyComparison(entry))}</td></tr>`).join("");
  return `<section class="section"><div class="eyebrow">HISTORIA WYNIKÓW</div><h2>Okresy i porównania</h2><p class="muted">Zweryfikowana historia GSC, GA4 i Ahrefs dla tej jednostki. Ahrefs pozostaje estymacją dostawcy; wartości różnych źródeł nie są sumowane. Dla pozycji niższa wartość oznacza poprawę.</p><div class="table-wrap"><table><thead><tr><th>Okres</th><th>Źródło</th><th>Właściwość</th><th>Metryki</th><th>Porównanie</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function recordRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function rowValue(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key];
  return null;
}

function rowList(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return Array.isArray(value) ? value.map(String).join(", ") : String(value ?? "—");
}

function intentLabels(row: Record<string, unknown>): string {
  const labels = ["branded", "commercial", "informational", "local", "navigational", "transactional"];
  const selected = labels.filter((label) => row[`is_${label}`] === true);
  return selected.length ? selected.join(", ") : "—";
}

function ahrefsDetailSection(metric: BundleMetric): string {
  const pages = recordRows(metric.current.top_pages);
  const keywords = recordRows(metric.current.organic_keyword_rows);
  const competitors = recordRows(metric.current.competitors);
  if (!pages.length && !keywords.length && !competitors.length) return "";
  const scope = `Estimated — Ahrefs · ${escapeHtml(metric.property_id)}${metric.country ? ` · rynek ${escapeHtml(metric.country.toUpperCase())}` : ""}${metric.generated_at ? ` · stan na ${escapeHtml(metric.generated_at.slice(0, 10))}` : ""}`;
  const render = (values: unknown[]) => `<tr>${values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`;
  const pagesHtml = pages.map((row) => {
    const trafficPercent = finite(rowValue(row, "traffic_diff_percent"));
    return render([rowValue(row, "url", "raw_url"), rowValue(row, "sum_traffic"), rowValue(row, "traffic_diff"), trafficPercent === null ? rowValue(row, "traffic_diff_percent") : formatPercent(trafficPercent), rowValue(row, "keywords"), rowValue(row, "top_keyword"), rowValue(row, "top_keyword_best_position"), rowValue(row, "top_keyword_best_position_diff"), rowValue(row, "referring_domains"), rowValue(row, "ur")]);
  }).join("");
  const keywordsHtml = keywords.map((row) => render([rowValue(row, "keyword"), rowValue(row, "keyword_country"), rowValue(row, "best_position"), rowValue(row, "best_position_diff"), rowValue(row, "best_position_set"), rowValue(row, "best_position_url"), rowValue(row, "sum_traffic"), rowValue(row, "sum_traffic_prev"), rowValue(row, "volume"), rowValue(row, "keyword_difficulty"), intentLabels(row), rowList(row, "serp_features"), rowValue(row, "status")])).join("");
  const competitorsHtml = competitors.map((row) => render([rowValue(row, "competitor_domain"), rowValue(row, "domain_rating"), rowValue(row, "keywords_common"), rowValue(row, "keywords_target"), rowValue(row, "keywords_competitor"), rowValue(row, "share"), rowValue(row, "traffic"), rowValue(row, "traffic_diff"), rowValue(row, "value")])).join("");
  const table = (title: string, description: string, headers: string[], rows: string, empty: string) => `<section class="page-break wide-table"><div class="eyebrow">AHREFS · ${escapeHtml(title)}</div><h2>${escapeHtml(title)}</h2><p class="muted"><span class="tag">${scope}</span> ${escapeHtml(description)}</p><div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="no-data">${escapeHtml(empty)}</td></tr>`}</tbody></table></div></section>`;
  return [
    table("Najważniejsze strony", "Wszystkie zwrócone wiersze profilu; zmiany są estymacjami Ahrefs i nie są sumowane z kliknięciami GSC.", ["URL", "Szac. ruch", "Zmiana ruchu", "Zmiana %", "Frazy", "Główna fraza", "Pozycja", "Zmiana pozycji", "Domeny odsyłające", "UR"], pagesHtml, "Brak zwróconych stron."),
    table("Frazy organiczne", "Pełny zwrócony zbiór organicznych fraz profilu. Wartości pozycji i ruchu są estymacjami Ahrefs.", ["Fraza", "Kraj", "Pozycja", "Zmiana pozycji", "Zestaw pozycji", "URL", "Szac. ruch", "Poprzedni ruch", "Wolumen", "KD", "Intencje", "SERP features", "Status"], keywordsHtml, "Brak zwróconych fraz organicznych."),
    table("Konkurenci organiczni", "Pełny zwrócony zbiór konkurentów profilu; to kontekst estymowany, nie ocena jakości domeny.", ["Domena", "DR", "Wspólne frazy", "Frazy celu", "Frazy konkurenta", "Udział", "Szac. ruch", "Zmiana ruchu", "Wartość"], competitorsHtml, "Brak zwróconych konkurentów."),
  ].join("");
}

async function readVerifiedJsonBundle(bundleDir: string, expected: { client_id: string; property_id: string; provider: string; manifest_sha256: string }): Promise<Record<string, unknown>> {
  const manifestPath = join(bundleDir, "manifest.json");
  const manifestBytes = await readFile(manifestPath);
  if (hashBytes(manifestBytes) !== expected.manifest_sha256) throw new Error(`source manifest provenance mismatch: ${bundleDir}`);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as { files?: Record<string, { sha256?: unknown; bytes?: unknown }> };
  if (!manifest.files) throw new Error(`invalid manifest: ${manifestPath}`);
  const files = new Map<string, string>();
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (name.startsWith("/") || name.includes("..") || typeof entry.sha256 !== "string" || typeof entry.bytes !== "number") throw new Error(`unsafe manifest entry '${name}'`);
    const content = await readFile(await resolveExistingInside(bundleDir, name, "manifest entry"), "utf8");
    if (Buffer.byteLength(content) !== entry.bytes || sha256(content) !== entry.sha256) throw new Error(`manifest hash mismatch: ${bundleDir}/${name}`);
    files.set(name, content);
  }
  const reportText = files.get("report.json");
  const report = JSON.parse(reportText ?? "null") as Record<string, unknown>;
  if (!isRecord(report)) throw new Error(`missing report.json: ${bundleDir}`);
  if (report.client_id !== expected.client_id || report.provider !== expected.provider || !Array.isArray(report.property_refs) || report.property_refs.length !== 1 || report.property_refs[0] !== expected.property_id) throw new Error(`bundle identity does not match accepted manifest: ${bundleDir}`);
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

async function readAgencyReport(path: string, artifactsDir: string): Promise<AgencyReportSummary> {
  const reportRoot = dirname(resolve(path));
  const artifactsRoot = resolve(artifactsDir);
  const manifest = JSON.parse(await readFile(join(reportRoot, "manifest.json"), "utf8")) as { files?: Record<string, { sha256?: unknown; bytes?: unknown }> };
  const entry = manifest.files?.["agency-report.json"];
  const content = await readFile(path, "utf8");
  if (!entry || entry.sha256 !== sha256(content) || entry.bytes !== Buffer.byteLength(content)) throw new Error("agency report manifest verification failed");
  const value = JSON.parse(content) as Partial<AgencyReportSummary>;
  if (value.schema_version !== "1" || typeof value.generated_at !== "string" || !Array.isArray(value.accepted_bundles) || !Array.isArray(value.source_status) || !Array.isArray(value.blocked_sources) || !Array.isArray(value.cross_source_context) || !Array.isArray(value.insights) || !isRecord(value.scope) || !Array.isArray(value.scope.entries)) throw new Error("agency report schema validation failed");
  for (const entry of value.scope.entries) {
    if (!isRecord(entry) || typeof entry.client_id !== "string" || typeof entry.client_display_name !== "string" || typeof entry.property_id !== "string" || typeof entry.provider !== "string" || typeof entry.status !== "string") throw new Error("agency report scope entry validation failed");
  }
  for (const bundle of value.accepted_bundles) {
    if (!isRecord(bundle) || typeof bundle.bundle_path !== "string" || typeof bundle.manifest_sha256 !== "string" || typeof bundle.client_id !== "string" || typeof bundle.property_id !== "string" || typeof bundle.provider !== "string") throw new Error("agency report accepted bundle validation failed");
    resolveInside(artifactsRoot, bundle.bundle_path, "agency bundle_path");
  }
  if (value.rank_monitoring !== undefined) {
    const rank = value.rank_monitoring;
    if (!isRecord(rank) || rank.source_label !== RANK_MONITORING_SOURCE_LABEL || typeof rank.client_id !== "string" || typeof rank.manifest_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(rank.manifest_sha256) || typeof rank.captured_at !== "string" || !isRecord(rank.date_range) || typeof rank.date_range.start !== "string" || typeof rank.date_range.end !== "string" || typeof rank.row_count !== "number" || !Number.isInteger(rank.row_count) || rank.row_count < 0) throw new Error("agency report rank monitoring evidence validation failed");
  }
  if (value.rank_monitoring_snapshots !== undefined) {
    if (!Array.isArray(value.rank_monitoring_snapshots) || value.rank_monitoring_snapshots.length === 0) throw new Error("agency report rank monitoring snapshots validation failed");
    for (const rank of value.rank_monitoring_snapshots) {
      if (!isRecord(rank) || rank.source_label !== RANK_MONITORING_SOURCE_LABEL || typeof rank.client_id !== "string" || typeof rank.manifest_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(rank.manifest_sha256) || typeof rank.captured_at !== "string" || !isRecord(rank.date_range) || typeof rank.date_range.start !== "string" || typeof rank.date_range.end !== "string" || typeof rank.row_count !== "number" || !Number.isInteger(rank.row_count) || rank.row_count < 0) throw new Error("agency report rank monitoring snapshots validation failed");
    }
  }
  return value as AgencyReportSummary;
}

async function collectMetrics(summary: AgencyReportSummary, artifactsDir: string): Promise<BundleMetric[]> {
  const metrics: BundleMetric[] = [];
  for (const bundle of summary.accepted_bundles) {
    const bundleDir = await resolveExistingInside(artifactsDir, bundle.bundle_path, "bundle_path");
    const report = await readVerifiedJsonBundle(bundleDir, bundle);
    const metric = extractMetric(report);
    if (metric) metrics.push(metric);
  }
  return metrics;
}

async function collectSourceManifestHashes(summary: AgencyReportSummary, artifactsDir: string): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const bundle of summary.accepted_bundles) {
    const bundleDir = await resolveExistingInside(artifactsDir, bundle.bundle_path, "bundle_path");
    const manifestPath = join(bundleDir, "manifest.json");
    hashes[bundle.bundle_path] = hashBytes(await readFile(manifestPath));
  }
  return hashes;
}

async function verifyKeywordBundle(keyword: NonNullable<AgencyReportSummary["keyword_research"]>, keywordBundleRoot: string): Promise<string> {
  const lexicalRoot = resolve(keywordBundleRoot);
  const lexicalBundle = resolve(lexicalRoot, keyword.bundle_path);
  if (lexicalBundle !== lexicalRoot && !lexicalBundle.startsWith(`${lexicalRoot}${sep}`)) throw new Error("keyword bundle_path escapes keyword bundle root");
  const [realRoot, root] = await Promise.all([realpath(lexicalRoot), realpath(lexicalBundle)]);
  if (root !== realRoot && !root.startsWith(`${realRoot}${sep}`)) throw new Error("keyword bundle_path escapes keyword bundle root through a symlink");
  const manifestPath = join(root, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { files?: Record<string, { sha256?: unknown; bytes?: unknown }> };
  if (!manifest.files || Object.keys(keyword.manifest_files).length === 0) throw new Error("keyword bundle manifest provenance is missing");
  for (const [name, expected] of Object.entries(keyword.manifest_files)) {
    const entry = manifest.files[name];
    if (!entry || entry.sha256 !== expected.sha256 || entry.bytes !== expected.bytes || name.startsWith("/") || name.includes("..")) throw new Error(`keyword bundle manifest provenance mismatch: ${name}`);
    const bytes = await readFile(await resolveExistingInside(root, name, "keyword manifest entry"));
    if (bytes.byteLength !== expected.bytes || hashBytes(bytes) !== expected.sha256) throw new Error(`keyword bundle hash mismatch: ${name}`);
  }
  return hashBytes(await readFile(manifestPath));
}

function omitEmptyEvidenceSections(html: string, unit: DeliveryUnit): string {
  let result = html;
  if (!unit.context.length) result = result.replace(/<section class="page-break wide-table"><div class="eyebrow">SZCZEGÓŁY WIDOCZNOŚCI[\s\S]*?<\/section>/, "");
  if (!unit.insights.length) result = result.replace(/<section class="page-break"><div class="eyebrow">SYGNAŁY REGUŁOWE[\s\S]*?<\/section>/, "");
  return result;
}

function unitHtml(unit: DeliveryUnit, generatedAt: string): string {
  const gsc = unit.metrics.filter((metric) => metric.provider === "google-search-console");
  const ahrefs = unit.metrics.filter((metric) => metric.provider === "ahrefs");
  const currentPeriod = gsc.find((metric) => metric.current_range)?.current_range;
  const sourceSummary = unit.sources.map((source) => source.status === "unavailable" ? `Niedostępne — ${providerLabel(source.provider)}` : providerLabel(source.provider)).join(", ");
  const cards = gsc.flatMap((metric) => [
    [`Observed — Google Search Console · ${metric.property_id} · Kliknięcia`, formatNumber(metricValue(metric, "clicks")), `Zmiana: ${comparisonText(metric, "clicks", "count")}`],
    [`Observed — Google Search Console · ${metric.property_id} · Wyświetlenia`, formatNumber(metricValue(metric, "impressions")), `Zmiana: ${comparisonText(metric, "impressions", "count")}`],
    [`Observed — Google Search Console · ${metric.property_id} · CTR`, formatPercent(metricValue(metric, "ctr")), `Zmiana: ${comparisonText(metric, "ctr", "ratio")}`],
    [`Observed — Google Search Console · ${metric.property_id} · Średnia pozycja`, metricValue(metric, "position")?.toFixed(2) ?? "—", `Zmiana: ${comparisonText(metric, "position", "position")}; niższa pozycja jest lepsza`],
  ]).map(([label, value, change]) => `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(change)}</small></article>`).join("");
  const ahrefsCards = ahrefs.map((metric) => `<article class="metric estimated"><span>Estimated — Ahrefs · ${escapeHtml(metric.property_id)}</span><strong>${formatNumber(finite(metric.current.organic_traffic))}</strong><small>Szacowany ruch organiczny · ${formatNumber(finite(metric.current.organic_keywords))} fraz · ${formatNumber(finite(metric.current.organic_keywords_top_3))} fraz w Top 3${metric.generated_at ? ` · stan na ${escapeHtml(metric.generated_at.slice(0, 10))}` : ""}${metric.country ? ` · rynek ${escapeHtml(metric.country.toUpperCase())}` : ""}</small></article>`).join("");
  const contextRows = unit.context.map((entry) => `<tr><td>${escapeHtml(entry.key_type)}</td><td><span class="tag">${escapeHtml(entry.join_type)}</span></td><td>${escapeHtml(entry.key)}</td><td>${formatNumber(entry.gsc?.clicks ?? null)}</td><td>${formatNumber(entry.gsc?.impressions ?? null)}</td><td>${formatNumber(entry.ahrefs?.estimated_traffic ?? null)}</td></tr>`).join("");
  const signalRows = unit.insights.map((insight) => `<tr><td>${escapeHtml(insight.kind)}</td><td>${escapeHtml(insight.key)}</td><td>${escapeHtml(insight.evidence)}</td><td>${escapeHtml(insight.severity)}</td></tr>`).join("");
  const keywordRows = unit.keywordGroups.flatMap(({ group, rows }) => rows.map((row) => `<tr><td>${escapeHtml(group.host)}</td><td>${escapeHtml(row.keyword)}</td><td>${escapeHtml(row.volume)}</td><td>${escapeHtml(row.clicks)}</td><td>${escapeHtml(row.difficulty)}</td><td>${escapeHtml(row.traffic_potential)}</td><td>${escapeHtml(row.parent_topic)}</td><td>${escapeHtml(row.parent_volume)}</td></tr>`)).join("");
  const sourceRows = unit.sources.map((source) => `<tr><td>${escapeHtml(providerLabel(source.provider))}</td><td>${escapeHtml(source.status === "unavailable" ? "Niedostępne — źródło niepodłączone" : source.status === "ready" ? "Dostępne" : "Zablokowane")}</td><td>${escapeHtml(source.reason ?? "Dane zweryfikowane")}</td></tr>`).join("");
  let keywordSection = unit.keywordGroups.length ? `<section class="page-break wide-table"><div class="eyebrow">ANALIZA FRAZ</div><h2>Dane fraz kluczowych</h2><p class="muted">Estimated — Ahrefs Keywords Explorer. Wszystkie zwrócone wiersze są pokazane; to nie jest pełna inwentaryzacja fraz.</p><div class="table-wrap"><table><thead><tr><th>Domena</th><th>Fraza</th><th>Szac. wyszukiwania / mies.</th><th>Szac. kliknięcia / mies.</th><th>Trudność KD</th><th>Szac. potencjał ruchu</th><th>Temat nadrzędny</th><th>Wolumen tematu</th></tr></thead><tbody>${keywordRows}</tbody></table></div></section>` : "";
  const ahrefsDetails = ahrefs.map(ahrefsDetailSection).join("");
  keywordSection += ahrefsDetails;
  const readySources = [...new Set(unit.sources.filter((source) => source.status === "ready").map((source) => source.provider))];
  const unavailableSources = [...new Set(unit.sources.filter((source) => source.status !== "ready").map((source) => source.provider))];
  const clientStatus = unavailableSources.length
    ? `Raport częściowy — dostępne: ${readySources.map(providerLabel).join(", ") || "brak"}; niepodłączone: ${unavailableSources.map(providerLabel).join(", ")}`
    : readySources.length
      ? `Raport gotowy — źródła: ${readySources.map(providerLabel).join(", ")}`
      : "Raport częściowy — brak zweryfikowanych źródeł";
  const comparisonMetric = gsc.find((metric) => hasAdjacentPeriods(metric));
  const previousLabel = comparisonMetric?.previous_range
    ? `Porównanie: ${comparisonMetric.previous_range.start} — ${comparisonMetric.previous_range.end} względem bieżącego okresu. Zmiany pokazujemy wyłącznie dla bezpośrednio sąsiadujących, zweryfikowanych zakresów.`
    : "Brak porównywalnej bazy — poprzedni okres nie jest bezpośrednio poprzedzającym, zweryfikowanym zakresem.";
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(unit.title)} — SEO report</title><style>
  @page{size:A4;margin:15mm 13mm 16mm}@page landscape{size:A4 landscape;margin:11mm 12mm}*{box-sizing:border-box}body{margin:0;background:#f3f6f8;color:#182431;font:13px/1.55 Inter,Arial,sans-serif}.sheet{max-width:1100px;margin:auto;background:#fff}.cover{min-height:250mm;padding:42mm 18mm 22mm;background:linear-gradient(135deg,#0b1f33 0%,#123d52 58%,#9ed6b0 150%);color:#fff;position:relative}.cover:after{content:"";position:absolute;width:180px;height:180px;border:1px solid rgba(255,255,255,.25);border-radius:50%;right:50px;top:60px;box-shadow:0 0 0 22px rgba(255,255,255,.05),0 0 0 44px rgba(255,255,255,.04)}.brand{letter-spacing:.18em;text-transform:uppercase;font-weight:700;font-size:11px;color:#b8e9c7}.cover h1{font-size:46px;line-height:1.05;max-width:700px;margin:30px 0 18px}.cover .subtitle{font-size:18px;color:#d8e8ec;max-width:610px}.cover-meta{position:absolute;bottom:25mm;left:18mm;right:18mm;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,.25);padding-top:14px;color:#c8dce0}.content{padding:20mm 18mm}.eyebrow{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#4e8d72;font-weight:800;margin-bottom:8px}h2{font-size:25px;line-height:1.15;margin:0 0 12px;color:#12384a}h3{color:#12384a}.muted{color:#65757d}.status{display:inline-block;background:#d9f0df;color:#1f6840;padding:5px 10px;border-radius:99px;font-weight:700}.status.pending{background:#fff0c7;color:#8b5d13}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.metric{border:1px solid #dce7e8;border-radius:12px;padding:15px;background:#fbfdfd}.metric span{display:block;color:#5d737b;font-size:11px}.metric strong{display:block;font-size:27px;color:#12384a;margin:7px 0}.metric small{color:#6c7b83}.metric.estimated{background:#f5f0ff;border-color:#ded2fa}.section{margin-top:28px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:0;table-layout:fixed}th{text-align:left;background:#edf4f4;color:#31545d;font-size:11px;text-transform:uppercase;letter-spacing:.05em}th,td{padding:9px 8px;border-bottom:1px solid #e6eeee;vertical-align:top;overflow-wrap:anywhere}td{color:#31434a}.tag{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;background:#e6f1f1;padding:3px 7px;border-radius:99px}.callout{border-left:4px solid #79b78e;background:#f1f8f3;padding:14px 16px;border-radius:0 10px 10px 0}.warning{border-left-color:#e8bd62;background:#fff9e9}.page-break{break-before:page}.wide-table{page:landscape}.footer{margin-top:35px;padding-top:12px;border-top:1px solid #dde8e9;color:#72828a;font-size:10px;display:flex;justify-content:space-between}.no-data{color:#7b888e;font-style:italic}@media (max-width:700px){.content{padding:12mm 7mm}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{padding:10px}.metric strong{font-size:21px}.cover{padding:28mm 10mm 18mm}.cover h1{font-size:36px}.cover-meta{left:10mm;right:10mm}}@media print{body{background:#fff}.sheet{max-width:none}.page-break{break-before:page}tr{break-inside:avoid}table{font-size:8px}th,td{padding:5px 4px}.cover{break-after:page}}
  </style></head><body><main class="sheet"><section class="cover"><div class="brand">Rekurencja.com · SEO intelligence</div><h1>${escapeHtml(unit.title)}</h1><p class="subtitle">Raport wyników organicznych przygotowany wyłącznie na podstawie zweryfikowanych danych źródłowych.</p><div class="cover-meta"><span>${escapeHtml(unit.mappingLabel)}</span><span>${escapeHtml(currentPeriod ? `${currentPeriod.start} — ${currentPeriod.end}` : "Brak okresu GSC")}</span><span>${escapeHtml(generatedAt.slice(0,10))}</span></div></section><div class="content"><div class="eyebrow">PODSUMOWANIE</div><h2>Najważniejsze wyniki</h2><p><span class="status ${unit.kind === "domain" ? "pending" : ""}">${escapeHtml(unit.kind === "domain" ? "Przypisanie do klienta: oczekuje na potwierdzenie operatora" : clientStatus)}</span></p><div class="callout ${unit.kind === "domain" ? "warning" : ""}">${escapeHtml(unit.kind === "domain" ? "Ta domena pochodzi z dostarczonej listy fraz, ale nie ma jeszcze jawnego przypisania do klienta. Raport pokazuje wyłącznie jej wyniki i nie przypisuje własności automatycznie." : "GSC pokazuje obserwowane dane. Ahrefs pokazuje estymacje dostawcy. Tych wartości nie sumujemy. Źródła niepodłączone nie oznaczają wartości zero.")}</div><div class="grid">${cards}${ahrefsCards}</div><div class="section"><div class="eyebrow">OKRES RAPORTOWANIA</div><h2>Zakres danych</h2><p>${currentPeriod ? `GSC: ${escapeHtml(currentPeriod.start)} — ${escapeHtml(currentPeriod.end)}.` : "Brak okresu GSC."} ${escapeHtml(previousLabel)}</p></div><div class="section"><div class="eyebrow">STATUS ŹRÓDEŁ</div><h2>Źródła danych</h2><p class="muted">${escapeHtml(sourceSummary || "Dla tej jednostki nie ma jeszcze źródła pozycyjnego lub analitycznego.")}</p><div class="table-wrap"><table><thead><tr><th>Źródło</th><th>Status</th><th>Interpretacja</th></tr></thead><tbody>${sourceRows || `<tr><td colspan="3" class="no-data">Brak źródeł dla tej jednostki.</td></tr>`}</tbody></table></div></div>${keywordSection}<section class="page-break wide-table"><div class="eyebrow">SZCZEGÓŁY WIDOCZNOŚCI</div><h2>Widoczność organiczna</h2><p class="muted">Pełny zbiór wyników z zachowaniem rozróżnienia źródeł i typu dopasowania: w obu źródłach, tylko GSC albo tylko Ahrefs.</p><div class="table-wrap"><table><thead><tr><th>Typ</th><th>Pokrycie</th><th>Adres / zapytanie</th><th>GSC — kliknięcia</th><th>GSC — wyświetlenia</th><th>Ahrefs — szac. ruch</th></tr></thead><tbody>${contextRows || `<tr><td colspan="6" class="no-data">Brak cross-source context.</td></tr>`}</tbody></table></div></section><section class="page-break"><div class="eyebrow">SYGNAŁY REGUŁOWE</div><h2>Sygnały do omówienia</h2><p class="muted">Rule-based signal — not a recommendation. Sygnały wynikają z wymienionych danych; nie są rekomendacjami ani wnioskami przyczynowymi.</p><div class="table-wrap"><table><thead><tr><th>Typ</th><th>Obszar</th><th>Dowód</th><th>Waga</th></tr></thead><tbody>${signalRows || `<tr><td colspan="4" class="no-data">Brak sygnałów.</td></tr>`}</tbody></table></div></section><section class="section"><div class="eyebrow">OGRANICZENIA I NOTATKI</div><h2>Co należy wiedzieć</h2><ul><li>Raport nie wykonuje nowych requestów i nie rozszerza zakresu danych.</li><li>Ahrefs pokazuje szacunki w ograniczonym zakresie; nie jest to pełna inwentaryzacja.</li><li>GA4 i Localo są niepodłączone; ich brak nie oznacza wartości zero.</li><li>Dostęp do GSC nie potwierdza własności domeny.</li><li>Przypisanie tej jednostki do klienta pozostaje decyzją operatora.</li>${unit.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul><div class="footer"><span>Lokalny raport oparty na zweryfikowanych danych</span><span>${escapeHtml(unit.id)}</span></div></section></div></main></body></html>`;
}

function appendClientContent(html: string, content: ClientContent | null, rankMonitoring: RankMonitoringSnapshot | null, history: ProviderHistoryEntry[]): string {
  if (!content && !rankMonitoring && history.length === 0) return html;
  const actions = content ? content.actions.map((action) => `<tr><td>${escapeHtml(action.period.start)} — ${escapeHtml(action.period.end)}</td><td>${escapeHtml(actionTypeLabel(action.type))}</td><td>${escapeHtml(actionStatusLabel(action.status))}</td><td>${escapeHtml(action.title)}</td><td>${escapeHtml(action.target_url ?? "—")}</td></tr>`).join("") : "";
  const glossary = content ? content.glossary.map((entry) => `<tr><td>${escapeHtml(entry.term)}</td><td>${escapeHtml(entry.explanation)}</td></tr>`).join("") : "";
  const contact = content?.contact ? `<p><strong>Kontakt:</strong> ${escapeHtml(content.contact.name)}${content.contact.email ? ` · ${escapeHtml(content.contact.email)}` : ""}${content.contact.phone ? ` · ${escapeHtml(content.contact.phone)}` : ""}</p>` : "";
  const rankRows = rankMonitoring?.rows.map((row) => `<tr><td>${escapeHtml(row.keyword)}</td><td>${escapeHtml(row.position ?? "—")}</td><td>${escapeHtml(row.previous_position ?? "—")}</td><td>${escapeHtml(row.search_engine)}</td><td>${escapeHtml(row.location ?? "—")}</td><td>${escapeHtml(row.url ?? "—")}</td></tr>`).join("") ?? "";
  const rankSection = rankMonitoring ? `<section class="section"><div class="eyebrow">MONITORING FRAZ</div><h2>Pozycje monitorowanych fraz</h2><p class="muted">Źródło: SERPROBOT · okres ${escapeHtml(rankMonitoring.date_range.start)} — ${escapeHtml(rankMonitoring.date_range.end)}.${rankMonitoring.source_config ? ` Projekt ${escapeHtml(rankMonitoring.source_config.project_id)} · ${escapeHtml(rankMonitoring.source_config.search_engine)}${rankMonitoring.source_config.location ? ` · ${escapeHtml(rankMonitoring.source_config.location)}` : ""}${rankMonitoring.source_config.device ? ` · ${escapeHtml(rankMonitoring.source_config.device)}` : ""}.` : ""} To snapshot pozycji, nie pomiar ruchu.</p><div class="table-wrap"><table><thead><tr><th>Fraza</th><th>Pozycja</th><th>Poprzednio</th><th>Wyszukiwarka</th><th>Lokalizacja</th><th>Adres</th></tr></thead><tbody>${rankRows || `<tr><td colspan="6" class="no-data">Brak zwróconych fraz.</td></tr>`}</tbody></table></div></section>` : "";
  const section = `${historySection(history)}${rankSection}${content ? `<section class="section"><div class="eyebrow">DZIAŁANIA DLA STRONY</div><h2>Wykonane i zaplanowane działania</h2><p class="muted">Rejestr działań pochodzi z jawnego inputu operatora; pozycje nie są wywnioskowane z metryk.</p><div class="table-wrap"><table><thead><tr><th>Okres</th><th>Typ</th><th>Status</th><th>Opis</th><th>Adres</th></tr></thead><tbody>${actions || `<tr><td colspan="5" class="no-data">Brak wpisów dla tego okresu.</td></tr>`}</tbody></table></div>${contact}</section><section class="section"><div class="eyebrow">PRZYDATNE POJĘCIA</div><h2>Słownik raportu</h2><div class="table-wrap"><table><thead><tr><th>Pojęcie</th><th>Wyjaśnienie</th></tr></thead><tbody>${glossary || `<tr><td colspan="2" class="no-data">Brak wpisów słownika.</td></tr>`}</tbody></table></div></section>` : ""}`;
  return html.replace("</section></div></main></body></html>", `${section}</section></div></main></body></html>`);
}

function emailDraft(unit: DeliveryUnit, generatedAt: string, htmlPath: string, pdfPath: string | null): string {
  const subject = `Raport SEO — ${headerValue(unit.title)}`;
  const recipient = unit.content?.contact?.email ? `To: ${headerValue(unit.content.contact.email)}\r\n` : "";
  const currentPeriod = unit.metrics.find((metric) => metric.current_range)?.current_range;
  const sourceLabels = unit.sources.map((source) => `${providerLabel(source.provider)}: ${source.status === "ready" ? "Dostępne" : source.status === "unavailable" ? "Niedostępne" : "Zablokowane"}`).join(", ") || "Brak podłączonych źródeł";
  const gscComparisons = unit.metrics.filter((metric) => metric.provider === "google-search-console").map((metric) => `${metric.property_id}: kliknięcia ${comparisonText(metric, "clicks", "count")}; wyświetlenia ${comparisonText(metric, "impressions", "count")}; CTR ${comparisonText(metric, "ctr", "ratio")}; pozycja ${comparisonText(metric, "position", "position")}`);
  const attachments = [htmlPath, ...(pdfPath ? [pdfPath] : [])].join(", ");
  return [
    `Subject: ${subject}`,
    recipient.trimEnd(),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "X-SEO-Godlike-Delivery: draft-only",
    "",
    `Dzień dobry,`,
    "",
    `przesyłamy przygotowany raport SEO dla: ${unit.title}.`,
    currentPeriod ? `Okres danych: ${currentPeriod.start} — ${currentPeriod.end}.` : "Okres danych: brak porównywalnego zakresu.",
    `Status źródeł: ${sourceLabels}.`,
    gscComparisons.length ? `Porównanie GSC: ${gscComparisons.join(" | ")}.` : "Porównanie GSC: brak porównywalnej bazy.",
    "",
    "Raport jest oparty na zweryfikowanych, lokalnych danych źródłowych. Wartości Ahrefs są estymacjami dostawcy, a brak podłączonego źródła nie oznacza wartości zero.",
    "",
    `Pliki w pakiecie: ${attachments}.`,
    "",
    "Pozdrawiamy,",
    "Rekurencja.com",
    `Wygenerowano: ${generatedAt}`,
    "",
  ].join("\r\n");
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
      "/usr/bin/chromium", "--headless", "--no-sandbox", "--disable-gpu", "--disable-background-networking",
      "--disable-component-update", "--disable-default-apps", "--disable-domain-reliability", "--disable-network-service", "--disable-breakpad", "--disable-client-side-phishing-detection", "--safebrowsing-disable-download-protection",
      "--disable-features=AutofillServerCommunication,CertificateTransparencyComponentUpdater,ConnectivityDiagnostics,MediaRouter,NetworkTimeQuery,OptimizationHints,Translate",
      "--disable-sync", "--disable-quic", "--host-resolver-rules=MAP * 127.0.0.1,EXCLUDE localhost",
      "--no-first-run", "--no-default-browser-check", "--no-pdf-header-footer",
      `--user-data-dir=${profile}`, `--print-to-pdf=${pdfPath}`, `file://${resolve(htmlPath)}`,
    ];
    await execFileAsync("/usr/bin/systemd-run", ["--user", "--wait", "--pipe", "--quiet", "--collect", "-p", "RestrictAddressFamilies=AF_UNIX", "-p", "PrivateNetwork=yes", "--", "/usr/bin/bwrap", ...chromiumArgs], { timeout: 120_000 });
    await execFileAsync("/usr/bin/qpdf", ["--static-id", "--remove-info", "--remove-metadata", pdfPath, normalized], { timeout: 120_000 });
    await writeFile(normalized, normalizePdfMetadata(await readFile(normalized)), { flag: "w", mode: 0o600 });
    await rename(normalized, pdfPath);
    await chmod(pdfPath, 0o600);
  } finally {
    await rm(profile, { recursive: true, force: true });
    await rm(normalized, { force: true });
  }
}

export async function writeClientDelivery(options: ClientDeliveryOptions): Promise<ClientDeliveryResult> {
  if (!options.artifactsDir) throw new Error("client delivery requires artifactsDir");
  if (options.renderPdf) await assertPdfRendererAvailable();
  const summary = await readAgencyReport(options.agencyReportPath, options.artifactsDir);
  if (options.rankMonitoringPath && options.rankMonitoringRoot) throw new Error("rank monitoring path and root are mutually exclusive");
  const resolvedRankMonitoringPath = options.rankMonitoringRoot
    ? await resolveLatestRankMonitoringBundle(await resolveRankMonitoringRoot(options.rankMonitoringRoot, options.artifactsDir), rankMonitoringClientIds(summary.source_status))
    : options.rankMonitoringPath;
  const metrics = await collectMetrics(summary, options.artifactsDir);
  const agencyReportBytes = await readFile(options.agencyReportPath);
  const clientIds = [...new Set(summary.scope.entries.map((entry) => entry.client_id).concat(summary.source_status.map((source) => source.client_id)))].sort();
  const clientContentBundle = options.clientContentBundlePath ? await readClientContentBundle(options.clientContentBundlePath, clientIds) : null;
  const clientContentById = new Map((clientContentBundle?.contents ?? []).map((content) => [content.client_id, content] as const));
  const directClientContent = options.clientContentPath ? await readClientContent(options.clientContentPath) : null;
  const sourceManifestHashes = await collectSourceManifestHashes(summary, options.artifactsDir);
  const agencyRunRecord = options.agencyRunRecordPath ? await readAgencyRunRecord(options.agencyRunRecordPath) : null;
  const historyIdentities = summary.accepted_bundles.map((entry) => ({ client_id: entry.client_id, property_id: entry.property_id, provider: entry.provider })).filter((entry): entry is { client_id: string; property_id: string; provider: "google-search-console" | "google-analytics" | "ahrefs" } => entry.provider === "google-search-console" || entry.provider === "google-analytics" || entry.provider === "ahrefs");
  const historyBundlePaths = summary.accepted_bundles
    .filter((entry) => entry.provider === "google-search-console" || entry.provider === "google-analytics" || entry.provider === "ahrefs")
    .map((entry) => entry.bundle_path);
  const historyEntries = await readProviderHistory(options.artifactsDir, historyIdentities, historyBundlePaths);
  const keywordManifestSha256 = summary.keyword_research ? await verifyKeywordBundle(summary.keyword_research, options.keywordBundleRoot ?? options.artifactsDir) : null;
  const outputDir = resolve(options.outputDir);
  await mkdir(outputDir, { recursive: false, mode: 0o700 });
  const rankBundle = resolvedRankMonitoringPath ? await readRankMonitoringBundle(resolvedRankMonitoringPath, clientIds) : null;
  const declaredRankEvidence = summary.rank_monitoring_snapshots ?? (summary.rank_monitoring ? [summary.rank_monitoring] : []);
  if (declaredRankEvidence.length) {
    if (!rankBundle) throw new Error("agency report declares rank monitoring evidence but no rank bundle was supplied");
    for (const declared of declaredRankEvidence) {
      const snapshot = rankBundle.snapshots.find((item) => item.client_id === declared.client_id);
      if (rankBundle.manifest_sha256 !== declared.manifest_sha256 || !snapshot || snapshot.rows.length !== declared.row_count || snapshot.captured_at !== declared.captured_at || snapshot.date_range.start !== declared.date_range.start || snapshot.date_range.end !== declared.date_range.end) throw new Error("rank monitoring evidence does not match agency report provenance");
    }
  }
  const keyword = summary.keyword_research;
  const clientKeywordGroups = new Map<string, Array<{ group: PhraseGroup; rows: Array<Record<string, unknown>> }>>();
  if (keyword) {
    for (const inputGroup of keyword.input_groups) {
      const owners = [...new Set(summary.scope.entries.filter((entry) => hostFromProperty(entry.property_id) === inputGroup.host.toLowerCase()).map((entry) => entry.client_id))];
      if (owners.length > 1) throw new Error(`keyword host '${inputGroup.host}' maps to multiple clients`);
      const owner = owners.length === 1 ? summary.scope.entries.find((entry) => entry.client_id === owners[0]) : undefined;
      if (!owner) continue;
      const result = keyword.groups.find((group) => group.host === inputGroup.host);
      const groups = clientKeywordGroups.get(owner.client_id) ?? [];
      groups.push({ group: inputGroup, rows: result?.rows ?? [] });
      clientKeywordGroups.set(owner.client_id, groups);
    }
  }
  const units: DeliveryUnit[] = clientIds.map((clientId) => { const content = clientContentById.get(clientId) ?? (directClientContent?.client_id === clientId ? directClientContent : null); const rankMonitoring = rankBundle?.snapshots.find((snapshot) => snapshot.client_id === clientId) ?? null; return { id: clientId, title: summary.scope.entries.find((entry) => entry.client_id === clientId)?.client_display_name ?? clientId, kind: "client", mappingLabel: `Klient: ${clientId}`, sources: summary.source_status.filter((source) => source.client_id === clientId), metrics: metrics.filter((metric) => summary.accepted_bundles.some((bundle) => bundle.client_id === clientId && bundle.property_id === metric.property_id && bundle.provider === metric.provider)), context: summary.cross_source_context.filter((entry) => entry.client_id === clientId), insights: summary.insights.filter((insight) => insight.client_id === clientId), keywordGroups: clientKeywordGroups.get(clientId) ?? [], notes: content ? content.actions.map((action) => `Działanie ${actionStatusLabel(action.status)}: ${action.title}`) : [], content, rankMonitoring, history: historyEntries.filter((entry) => entry.client_id === clientId) }; });
  if (keyword) {
    for (const inputGroup of keyword.input_groups) {
      if (summary.scope.entries.some((entry) => hostFromProperty(entry.property_id) === inputGroup.host.toLowerCase())) continue;
      const result = keyword.groups.find((group) => group.host === inputGroup.host);
      units.push({ id: `domain-${inputGroup.host}`, title: inputGroup.host, kind: "domain", mappingLabel: "Przypisanie do klienta: oczekuje na potwierdzenie operatora", sources: [{ client_id: "unassigned", property_id: inputGroup.host, provider: "ahrefs-keywords-explorer", status: "ready", reason: "Dane fraz zweryfikowane w bundle Keywords Explorer", bundle_path: keyword.bundle_path }], metrics: [], context: [], insights: [], keywordGroups: [{ group: inputGroup, rows: result?.rows ?? [] }], notes: keyword.notes.filter((note) => note.startsWith(`${inputGroup.host}:`)), content: null, rankMonitoring: null, history: [] });
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
    const html = appendClientContent(omitEmptyEvidenceSections(unitHtml(unit, generatedAt), unit), unit.content, unit.rankMonitoring, unit.history);
    await writeFile(htmlPath, html, { encoding: "utf8", flag: "wx", mode: 0o600 });
    let pdf: string | null = null;
    if (options.renderPdf) {
      pdf = join(unitDir, `${safeSegment(unit.id)}-seo-report.pdf`);
      await renderPdf(htmlPath, pdf);
    }
    const htmlRelative = relative(outputDir, htmlPath);
    const pdfRelative = pdf ? relative(outputDir, pdf) : null;
    const emailRelative = `${safeSegment(unit.id)}/${safeSegment(unit.id)}-seo-report.eml`;
    await writeFile(join(outputDir, emailRelative), emailDraft(unit, generatedAt, htmlRelative, pdfRelative), { encoding: "utf8", flag: "wx", mode: 0o600 });
    resultUnits.push({ id: unit.id, kind: unit.kind, html: htmlRelative, pdf: pdfRelative, email: emailRelative });
  }
  const index = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Raporty SEO — pakiet operatorski</title><style>body{font:16px/1.5 system-ui;max-width:900px;margin:4rem auto;padding:0 1.5rem;color:#172b36}a{color:#176b70}li{margin:1rem 0}small{color:#667}</style></head><body><h1>Raporty SEO</h1><p>Wyniki przygotowane wyłącznie z istniejących, zweryfikowanych danych. Nie wykonano ponownych zapytań do dostawców.</p><ul>${resultUnits.map((unit) => `<li><strong>${escapeHtml(unit.id)}</strong> — <a href="${escapeHtml(unit.html)}">Raport HTML</a>${unit.pdf ? ` · <a href="${escapeHtml(unit.pdf)}">Raport PDF</a>` : ""} · <a href="${escapeHtml(unit.email)}">Draft email</a></li>`).join("")}</ul><small>Źródła, zakres i ograniczenia są opisane w każdym raporcie.</small></body></html>`;
  await writeFile(join(outputDir, "index.html"), index, { encoding: "utf8", flag: "wx", mode: 0o600 });
  const files: Record<string, string | Buffer> = { "index.html": index };
  for (const unit of resultUnits) { files[unit.html] = await readFile(join(outputDir, unit.html), "utf8"); if (unit.pdf) files[unit.pdf] = await readFile(join(outputDir, unit.pdf)); files[unit.email] = await readFile(join(outputDir, unit.email), "utf8"); }
  const manifest = { schema_version: "1", source: resolve(options.agencyReportPath), agency_report_sha256: hashBytes(agencyReportBytes), agency_run_record_sha256: agencyRunRecord?.sha256 ?? null, source_manifest_sha256: sourceManifestHashes, history_manifest_sha256: [...new Set(historyEntries.map((entry) => entry.manifest_sha256))].sort(), keyword_manifest_sha256: keywordManifestSha256, client_content_sha256: clientContentBundle ? null : options.clientContentPath ? hashBytes(await readFile(options.clientContentPath)) : null, client_content_manifest_sha256: clientContentBundle?.manifest_sha256 ?? null, rank_monitoring_manifest_sha256: rankBundle?.manifest_sha256 ?? null, execution: { provider_calls: 0, network_policy: options.renderPdf ? "renderer_network_isolated" : "no_renderer" }, units: resultUnits, files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { sha256: hashBytes(content), bytes: Buffer.byteLength(content) }])) };
  await writeFile(join(outputDir, "manifest.json"), canonicalJson(manifest), { encoding: "utf8", flag: "wx", mode: 0o600 });
  const verifiedManifestHashes = new Set<string>([
    ...Object.values(sourceManifestHashes),
    ...historyEntries.map((entry) => entry.manifest_sha256),
    ...(keywordManifestSha256 ? [keywordManifestSha256] : []),
    ...(rankBundle ? [rankBundle.manifest_sha256] : []),
    ...(clientContentBundle ? [clientContentBundle.manifest_sha256] : []),
  ]);
  return { output_dir: outputDir, units: resultUnits, manifests_verified: 1 + verifiedManifestHashes.size };
}
