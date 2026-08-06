import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { AgencyReportSummary, CrossSourceContextEntry } from "./agency-report.js";
import { PhraseGroup } from "./ahrefs-keywords.js";
import { canonicalJson, sha256 } from "./serialize.js";
import { ClientContent, readClientContent, readClientContentBundle, resolveLatestClientContentBundle } from "./client-content.js";
import { RANK_MONITORING_SOURCE_LABEL, RankMonitoringSnapshot, rankMonitoringClientIds, readRankMonitoringBundle, resolveLatestRankMonitoringBundle, resolveRankMonitoringRoot } from "./rank-monitoring.js";
import { RankHistoryComparison, readRankHistory, summarizeRankHistory } from "./rank-history.js";
import { ProviderHistoryEntry, readProviderHistory } from "./provider-history.js";
import { AgencyRunRecord, assertAgencyReadOnlyPolicy } from "./agency-run.js";
import { resolveExistingInside, resolveInside } from "./path-confinement.js";

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
  clientContentRoot?: string;
  rankMonitoringPath?: string;
  rankMonitoringRoot?: string;
  /** Resolved by the agency-run caller; must remain inside rankMonitoringRoot. */
  rankMonitoringResolvedPath?: string;
  rankMonitoringArtifactsDir?: string;
  keywordBundleRoot?: string;
  /** Explicit operator confirmation for keyword-only hosts rendered as clients. */
  confirmedKeywordClients?: string[];
  agencyRunRecordPath?: string;
  /** Test seam only; the CLI always uses the isolated renderer below. */
  pdfRenderer?: (htmlPath: string, pdfPath: string) => Promise<void>;
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
  rankHistory: RankHistoryComparison[];
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
function sourceStatusInterpretation(source: AgencyReportSummary["source_status"][number]): string {
  if (source.reason_code === "missing_freshness_baseline") return "Brak porównywalnej bazy — nie można zweryfikować świeżości snapshotu Ahrefs";
  if (source.reason_code === "stale_snapshot") return "Dane nieaktualne — snapshot Ahrefs jest starszy niż wybrany okres Google Search Console";
  if (source.reason_code === "missing_evidence_bundle") return "Brak zweryfikowanych danych — nie znaleziono zaakceptowanego pakietu evidence";
  if (source.reason_code === "no_evidence_path") return "Brak ścieżki evidence — źródło nie ma jeszcze obsługiwanej ścieżki importu danych";
  if (source.status === "unavailable") return `Niedostępne — ${localizedSourceReason(source.reason)}`;
  if (source.status === "ready") return "Dostępne — dane zweryfikowane";
  return `Zablokowane — ${localizedSourceReason(source.reason)}`;
}
function localizedSourceReason(reason: string | null | undefined): string {
  const labels: Record<string, string> = {
    "numeric GA4 property ID and analytics.readonly proof are not registered": "Brak zarejestrowanej numerycznej właściwości GA4 i potwierdzonego dostępu analytics.readonly.",
    "managed Localo profile unavailable; discovery snapshot is not a canonical profile": "Nie potwierdzono zarządzanego profilu Localo; snapshot discovery nie jest profilem kanonicznym.",
    "SERPROBOT rank snapshot or API source has not been imported": "Nie zaimportowano zweryfikowanego snapshotu pozycji ani źródła API SERPROBOT.",
    "Semstorm visibility export or API source has not been imported": "Nie zaimportowano eksportu widoczności ani źródła API Semstorm.",
    "no catalog metrics": "Brak zdefiniowanych metryk dla tego źródła.",
  };
  return labels[reason ?? ""] ?? "Szczegóły techniczne wymagają wyjaśnienia przez operatora.";
}
function sourceReasonLabel(source: AgencyReportSummary["source_status"][number]): string {
  if (source.reason_code === "missing_freshness_baseline") return "Nie znaleziono zaakceptowanej bazy Google Search Console dla tej właściwości; świeżość estymacji Ahrefs nie jest weryfikowana.";
  if (source.reason_code === "stale_snapshot") return "Snapshot Ahrefs jest starszy niż wybrany okres Google Search Console; dane nie są używane w tym raporcie.";
  if (source.reason_code === "missing_evidence_bundle") return "Nie znaleziono zaakceptowanego pakietu evidence dla tego źródła; źródło nie jest traktowane jako gotowe ani jako zero.";
  if (source.reason_code === "no_evidence_path") return "Dla tego zewnętrznego źródła nie ma jeszcze obsługiwanej ścieżki importu evidence; nie pokazujemy danych ani wartości zero.";
  if (source.status === "ready") return "Dane zweryfikowane.";
  return localizedSourceReason(source.reason);
}
function sourceHeadlineLabel(source: AgencyReportSummary["source_status"][number]): string {
  if (source.reason_code === "missing_freshness_baseline") return `${providerLabel(source.provider)} — brak bazy porównawczej`;
  if (source.reason_code === "stale_snapshot") return `${providerLabel(source.provider)} — dane nieaktualne`;
  if (source.reason_code === "no_evidence_path") return `${providerLabel(source.provider)} — brak ścieżki evidence`;
  if (source.reason_code === "missing_evidence_bundle") return `${providerLabel(source.provider)} — brak pakietu evidence`;
  return providerLabel(source.provider);
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
function metricValue(metric: BundleMetric, field: string): number | null { return finite(metric.current[field]); }
function formatNumber(value: number | null): string { return value === null ? "—" : new Intl.NumberFormat("pl-PL").format(value); }
function formatPercent(value: number | null): string {
  return value === null ? "—" : `${new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value * 100)}%`;
}
function formatAhrefsPercent(value: number | null): string {
  if (value === null) return "—";
  // Ahrefs profile rows expose this field in hundredths of a percent (e.g. -230 = -2.30%).
  // Preserve older normalized fixtures that already carry a ratio such as 0.14.
  const percent = Math.abs(value) > 1 ? value / 100 : value * 100;
  return `${new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(percent)}%`;
}
function formatCanonicalAhrefsPercent(value: number | null): string {
  return value === null ? "—" : `${new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value * 100)}%`;
}
function formatDecimal(value: number | null): string { return value === null ? "—" : new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
function parseDay(value: string): number | null { const time = Date.parse(`${value}T00:00:00Z`); return Number.isFinite(time) ? time : null; }
function hasAdjacentPeriods(metric: BundleMetric): boolean {
  if (!metric.current_range || !metric.previous_range) return false;
  const currentStart = parseDay(metric.current_range.start);
  const previousEnd = parseDay(metric.previous_range.end);
  return currentStart !== null && previousEnd !== null && currentStart - previousEnd === 86_400_000;
}
function hasComparableSearchBaseline(metric: BundleMetric): boolean {
  if (!hasAdjacentPeriods(metric)) return false;
  const previousImpressions = finite(metric.previous?.impressions);
  return previousImpressions !== null && previousImpressions > 0;
}
function comparisonText(metric: BundleMetric, field: string, kind: "count" | "ratio" | "position"): string {
  if (!hasComparableSearchBaseline(metric)) return "Brak porównywalnej bazy";
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
function compareCodePoint(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function hostFromProperty(value: string): string | null {
  if (value.startsWith("sc-domain:")) return value.slice("sc-domain:".length).toLowerCase();
  try { return new URL(value).hostname.toLowerCase(); } catch { return value.toLowerCase(); }
}

function unitInitials(title: string, id: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? `${words[0][0] ?? ""}${words[1][0] ?? ""}` : title.slice(0, 2);
  return (initials || id.slice(0, 2)).toUpperCase();
}

function renderDashboardNav(): string {
  return `<nav class="dashboard-nav" aria-label="Nawigacja raportu"><a class="dashboard-nav-brand" href="#summary">SEO / intelligence</a><div class="dashboard-nav-links"><a href="#summary">Podsumowanie</a><a href="#sources">Źródła</a><a href="#limitations">Ograniczenia</a></div></nav>`;
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
    const canonicalTrafficPercent = finite(rowValue(row, "traffic_diff_percent_ratio"));
    const legacyTrafficPercent = finite(rowValue(row, "traffic_diff_percent"));
    return render([rowValue(row, "url", "raw_url"), rowValue(row, "sum_traffic"), rowValue(row, "traffic_diff"), canonicalTrafficPercent !== null ? formatCanonicalAhrefsPercent(canonicalTrafficPercent) : legacyTrafficPercent === null ? rowValue(row, "traffic_diff_percent") : formatAhrefsPercent(legacyTrafficPercent), rowValue(row, "keywords"), rowValue(row, "top_keyword"), rowValue(row, "top_keyword_best_position"), rowValue(row, "top_keyword_best_position_diff"), rowValue(row, "referring_domains"), rowValue(row, "ur")]);
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
  if (keyword.bundle_path.startsWith("/") || keyword.bundle_path.includes("\\")) throw new Error("keyword bundle_path must be relative to keyword bundle root");
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
  if (!unit.context.length) result = result.replace(/<section id="visibility" class="page-break wide-table">[\s\S]*?<\/section>/, "");
  if (!unit.insights.length) result = result.replace(/<section id="signals" class="page-break">[\s\S]*?<\/section>/, "");
  return result;
}

function unitAppendixHtml(unit: DeliveryUnit, generatedAt: string): string {
  const gsc = unit.metrics.filter((metric) => metric.provider === "google-search-console");
  const ahrefs = unit.metrics.filter((metric) => metric.provider === "ahrefs");
  const currentPeriod = gsc.find((metric) => metric.current_range)?.current_range;
  const sourceSummary = [...new Set(unit.sources.map((source) => source.status === "ready"
    ? sourceHeadlineLabel(source)
    : `${source.status === "unavailable" ? "Niedostępne" : "Zablokowane"} — ${sourceHeadlineLabel(source)}`))].join(", ");
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
  const sourceRows = unit.sources.map((source) => `<tr><td>${escapeHtml(providerLabel(source.provider))}</td><td>${escapeHtml(sourceStatusInterpretation(source))}</td><td>${escapeHtml(sourceReasonLabel(source))}</td></tr>`).join("");
  let keywordSection = unit.keywordGroups.length ? `<section class="page-break wide-table"><div class="eyebrow">ANALIZA FRAZ</div><h2>Dane fraz kluczowych</h2><p class="muted">Estimated — Ahrefs Keywords Explorer. Wszystkie zwrócone wiersze są pokazane; to nie jest pełna inwentaryzacja fraz.</p><div class="table-wrap"><table><thead><tr><th>Domena</th><th>Fraza</th><th>Szac. wyszukiwania / mies.</th><th>Szac. kliknięcia / mies.</th><th>Trudność KD</th><th>Szac. potencjał ruchu</th><th>Temat nadrzędny</th><th>Wolumen tematu</th></tr></thead><tbody>${keywordRows}</tbody></table></div></section>` : "";
  const ahrefsDetails = ahrefs.map(ahrefsDetailSection).join("");
  keywordSection += ahrefsDetails;
  const readySources = [...new Set(unit.sources.filter((source) => source.status === "ready").map((source) => source.provider))];
  const unavailableSources = [...new Map(unit.sources.filter((source) => source.status !== "ready").map((source) => [sourceHeadlineLabel(source), source])).values()];
  const clientStatus = unavailableSources.length
    ? `Raport częściowy — dostępne: ${readySources.map(providerLabel).join(", ") || "brak"}; niedostępne: ${unavailableSources.map(sourceHeadlineLabel).join(", ")}`
    : readySources.length
      ? `Raport gotowy — źródła: ${readySources.map(providerLabel).join(", ")}`
      : "Raport częściowy — brak zweryfikowanych źródeł";
  const comparisonMetric = gsc.find((metric) => hasComparableSearchBaseline(metric));
  const previousLabel = comparisonMetric?.previous_range
    ? `Porównanie: ${comparisonMetric.previous_range.start} — ${comparisonMetric.previous_range.end} względem bieżącego okresu. Zmiany pokazujemy wyłącznie dla bezpośrednio sąsiadujących, zweryfikowanych zakresów.`
    : "Brak porównywalnej bazy — poprzedni okres nie jest bezpośrednio poprzedzającym, zweryfikowanym zakresem.";
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(unit.title)} — SEO report</title><style>
  @page{size:A4;margin:15mm 13mm 16mm}@page landscape{size:A4 landscape;margin:11mm 12mm}*{box-sizing:border-box}body{margin:0;background:#f3f6f8;color:#182431;font:13px/1.55 Inter,Arial,sans-serif}.sheet{max-width:1100px;margin:auto;background:#fff}.dashboard-nav{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px 18mm;background:rgba(255,255,255,.94);border-bottom:1px solid #dce7e8;backdrop-filter:blur(12px)}.dashboard-nav-brand{color:#12384a;text-decoration:none;font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:800;white-space:nowrap}.dashboard-nav-links{display:flex;gap:16px;flex-wrap:wrap;justify-content:flex-end}.dashboard-nav-links a{color:#5c7077;text-decoration:none;font-size:12px}.dashboard-nav-links a:hover,.dashboard-nav-links a:focus{color:#1d8b76}.cover{min-height:250mm;padding:42mm 18mm 22mm;background:linear-gradient(135deg,#0b1f33 0%,#123d52 58%,#9ed6b0 150%);color:#fff;position:relative}.cover:after{content:"";position:absolute;width:180px;height:180px;border:1px solid rgba(255,255,255,.25);border-radius:50%;right:50px;top:60px;box-shadow:0 0 0 22px rgba(255,255,255,.05),0 0 0 44px rgba(255,255,255,.04)}.brand{letter-spacing:.18em;text-transform:uppercase;font-weight:700;font-size:11px;color:#b8e9c7}.cover h1{font-size:46px;line-height:1.05;max-width:700px;margin:30px 0 18px}.cover .subtitle{font-size:18px;color:#d8e8ec;max-width:610px}.cover-meta{position:absolute;bottom:25mm;left:18mm;right:18mm;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,.25);padding-top:14px;color:#c8dce0}.content{padding:20mm 18mm}.eyebrow{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#4e8d72;font-weight:800;margin-bottom:8px}h2{font-size:25px;line-height:1.15;margin:0 0 12px;color:#12384a}h3{color:#12384a}.muted{color:#65757d}.status{display:inline-block;background:#d9f0df;color:#1f6840;padding:5px 10px;border-radius:99px;font-weight:700}.status.pending{background:#fff0c7;color:#8b5d13}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.metric{border:1px solid #dce7e8;border-radius:12px;padding:15px;background:#fbfdfd}.metric span{display:block;color:#5d737b;font-size:11px}.metric strong{display:block;font-size:27px;color:#12384a;margin:7px 0}.metric small{color:#6c7b83}.metric.estimated{background:#f5f0ff;border-color:#ded2fa}.section{margin-top:28px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:0;table-layout:fixed}th{text-align:left;background:#edf4f4;color:#31545d;font-size:11px;text-transform:uppercase;letter-spacing:.05em}th,td{padding:9px 8px;border-bottom:1px solid #e6eeee;vertical-align:top;overflow-wrap:anywhere}td{color:#31434a}.tag{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;background:#e6f1f1;padding:3px 7px;border-radius:99px}.callout{border-left:4px solid #79b78e;background:#f1f8f3;padding:14px 16px;border-radius:0 10px 10px 0}.warning{border-left-color:#e8bd62;background:#fff9e9}.page-break{break-before:page}.wide-table{page:landscape}.footer{margin-top:35px;padding-top:12px;border-top:1px solid #dde8e9;color:#72828a;font-size:10px;display:flex;justify-content:space-between}.no-data{color:#7b888e;font-style:italic}.client-switcher{position:fixed;z-index:10;left:50%;bottom:18px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid #dce7e8;border-radius:22px;background:rgba(255,255,255,.94);box-shadow:0 12px 34px rgba(24,36,49,.16);backdrop-filter:blur(12px)}.switcher-label{font-size:10px;color:#789096;margin:0 6px 0 2px;white-space:nowrap}.client-dot{position:relative;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#edf4f4;color:#31545d;text-decoration:none;font-size:10px;font-weight:800}.client-dot.active{background:#123d52;color:#fff;box-shadow:0 0 0 3px #b8e9c7}.client-dot small{display:none;position:absolute;bottom:42px;left:50%;transform:translateX(-50%);padding:5px 8px;border-radius:6px;background:#12384a;color:#fff;white-space:nowrap;font-size:10px;font-weight:600}.client-dot:hover small,.client-dot:focus small{display:block}@media (max-width:700px){.dashboard-nav{align-items:flex-start;flex-direction:column;gap:10px;padding:12px 7mm}.dashboard-nav-links{gap:10px;justify-content:flex-start}.dashboard-nav-links a{font-size:11px}.content{padding:12mm 7mm}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{padding:10px}.metric strong{font-size:21px}.cover{padding:28mm 10mm 18mm}.cover h1{font-size:36px}.cover-meta{left:10mm;right:10mm}.switcher-label{display:none}.client-switcher{max-width:calc(100vw - 20px);overflow-x:auto;bottom:10px}}@media print{body{background:#fff}.sheet{max-width:none}.dashboard-nav,.client-switcher{display:none}.page-break{break-before:page}tr{break-inside:avoid}table{font-size:8px}th,td{padding:5px 4px}.cover{break-after:page}}
  </style></head><body><main class="sheet">${renderDashboardNav()}<section class="cover"><div class="brand">Rekurencja.com · SEO intelligence</div><h1>${escapeHtml(unit.title)}</h1><p class="subtitle">Raport wyników organicznych przygotowany wyłącznie na podstawie zweryfikowanych danych źródłowych.</p><div class="cover-meta"><span>${escapeHtml(unit.mappingLabel)}</span><span>${escapeHtml(currentPeriod ? `${currentPeriod.start} — ${currentPeriod.end}` : "Brak okresu GSC")}</span><span>${escapeHtml(generatedAt.slice(0,10))}</span></div></section><div class="content"><section id="summary"><div class="eyebrow">PODSUMOWANIE</div><h2>Najważniejsze wyniki</h2><p><span class="status">${escapeHtml(clientStatus)}</span></p><div class="callout">GSC pokazuje obserwowane dane. Ahrefs pokazuje estymacje dostawcy. Tych wartości nie sumujemy. Źródła niepodłączone nie oznaczają wartości zero.</div><div class="grid">${cards}${ahrefsCards}</div><div class="section"><div class="eyebrow">OKRES RAPORTOWANIA</div><h2>Zakres danych</h2><p>${currentPeriod ? `GSC: ${escapeHtml(currentPeriod.start)} — ${currentPeriod.end}.` : "Brak okresu GSC."} ${escapeHtml(previousLabel)}</p></div></section><section id="sources" class="section"><div class="eyebrow">STATUS ŹRÓDEŁ</div><h2>Źródła danych</h2><p class="muted">${escapeHtml(sourceSummary || "Dla tego klienta nie ma jeszcze źródła pozycyjnego lub analitycznego.")}</p><div class="table-wrap"><table><thead><tr><th>Źródło</th><th>Status</th><th>Interpretacja</th></tr></thead><tbody>${sourceRows || `<tr><td colspan="3" class="no-data">Brak źródeł dla tego klienta.</td></tr>`}</tbody></table></div></section>${keywordSection}<section id="visibility" class="page-break wide-table"><div class="eyebrow">SZCZEGÓŁY WIDOCZNOŚCI</div><h2>Widoczność organiczna</h2><p class="muted">Pełny zbiór wyników z zachowaniem rozróżnienia źródeł i typu dopasowania: w obu źródłach, tylko GSC albo tylko Ahrefs.</p><div class="table-wrap"><table><thead><tr><th>Typ</th><th>Pokrycie</th><th>Adres / zapytanie</th><th>GSC — kliknięcia</th><th>GSC — wyświetlenia</th><th>Ahrefs — szac. ruch</th></tr></thead><tbody>${contextRows || `<tr><td colspan="6" class="no-data">Brak cross-source context.</td></tr>`}</tbody></table></div></section><section id="signals" class="page-break"><div class="eyebrow">SYGNAŁY REGUŁOWE</div><h2>Sygnały do omówienia</h2><p class="muted">Rule-based signal — not a recommendation. Sygnały wynikają z wymienionych danych; nie są rekomendacjami ani wnioskami przyczynowymi.</p><div class="table-wrap"><table><thead><tr><th>Typ</th><th>Obszar</th><th>Dowód</th><th>Waga</th></tr></thead><tbody>${signalRows || `<tr><td colspan="4" class="no-data">Brak sygnałów.</td></tr>`}</tbody></table></div></section><section id="limitations" class="section"><div class="eyebrow">OGRANICZENIA I NOTATKI</div><h2>Co należy wiedzieć</h2><ul><li>Raport nie wykonuje nowych requestów i nie rozszerza zakresu danych.</li><li>Ahrefs pokazuje szacunki w ograniczonym zakresie; nie jest to pełna inwentaryzacja.</li><li>GA4 i Localo są niepodłączone; ich brak nie oznacza wartości zero.</li><li>Dostęp do GSC nie potwierdza własności domeny.</li>${unit.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul><div class="footer"><span>Lokalny raport oparty na zweryfikowanych danych</span><span>${escapeHtml(unit.id)}</span></div></section></div><!-- supplements --></main></body></html>`;
}

function relativeMetricChange(metric: BundleMetric, field: string): number | null {
  if (!hasComparableSearchBaseline(metric)) return null;
  const current = finite(metric.current[field]);
  const previous = finite(metric.previous?.[field]);
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function positionImprovement(metric: BundleMetric): number | null {
  if (!hasComparableSearchBaseline(metric)) return null;
  const current = finite(metric.current.position);
  const previous = finite(metric.previous?.position);
  return current === null || previous === null ? null : previous - current;
}

function signedPercent(value: number | null): string {
  return value === null ? "Brak porównywalnej bazy" : `${value > 0 ? "+" : ""}${formatDecimal(value)}%`;
}

function propertyLabel(propertyId: string): string {
  if (propertyId.startsWith("sc-domain:")) return "Cała domena";
  const host = hostFromProperty(propertyId);
  return host ?? propertyId;
}

function storyMetric(metrics: BundleMetric[]): BundleMetric | null {
  return metrics[0] ?? null;
}

function primaryStoryContext(unit: DeliveryUnit): CrossSourceContextEntry | null {
  return [...unit.context]
    .filter((entry) => entry.gsc)
    .sort((a, b) => (b.gsc?.clicks ?? 0) - (a.gsc?.clicks ?? 0) || (b.gsc?.impressions ?? 0) - (a.gsc?.impressions ?? 0) || compareCodePoint(a.key, b.key))[0] ?? null;
}

function storyHeadline(unit: DeliveryUnit, metric: BundleMetric | null): string {
  if (!metric && unit.keywordGroups.length) return unit.keywordGroups.some((group) => group.rows.length)
    ? "Frazy pokazują, czego szukają potencjalni klienci."
    : "Zakres działań obejmuje cały serwis. Brakuje osobnej listy fraz.";
  if (!metric) return "Dane są gotowe do włączenia. Nie udajemy brakujących wyników.";
  const impressions = relativeMetricChange(metric, "impressions");
  const clicks = relativeMetricChange(metric, "clicks");
  if (impressions !== null && impressions > 0 && clicks !== null && clicks <= 0) return "Więcej widoczności. Jeszcze nie więcej kliknięć.";
  if (impressions !== null && impressions > 0 && clicks !== null && clicks > 0) return "Widoczność i ruch rosną.";
  if (impressions !== null && impressions < 0) return "Widoczność osłabła. Wiemy, gdzie szukać przyczyny.";
  return primaryStoryContext(unit)
    ? "Widoczność budują konkretne potrzeby użytkowników."
    : "Raport pokazuje aktualny obraz widoczności marki.";
}

function storyLead(unit: DeliveryUnit, metric: BundleMetric | null): string {
  if (!metric && unit.keywordGroups.length) return "Ten raport należy wyłącznie do wskazanego klienta i pokazuje zweryfikowany zakres badania fraz. Brak innych źródeł nie jest prezentowany jako wynik zerowy.";
  if (!metric) return "Raport rozróżnia brak danych od wyniku zerowego i pokazuje wyłącznie źródła z potwierdzonym evidence.";
  const label = propertyLabel(metric.property_id);
  const impressions = relativeMetricChange(metric, "impressions");
  const clicks = relativeMetricChange(metric, "clicks");
  const position = positionImprovement(metric);
  if (impressions !== null && clicks !== null) return `${label}: wyświetlenia ${impressions >= 0 ? "wzrosły" : "spadły"} o ${formatDecimal(Math.abs(impressions))}%, a kliknięcia ${clicks >= 0 ? "wzrosły" : "spadły"} o ${formatDecimal(Math.abs(clicks))}%.${position === null ? "" : ` Średnia pozycja ${position > 0 ? "poprawiła" : position < 0 ? "pogorszyła" : "nie zmieniła"} się o ${formatDecimal(Math.abs(position))}.`}`;
  const topContext = primaryStoryContext(unit);
  const currentImpressions = metricValue(metric, "impressions");
  const currentClicks = metricValue(metric, "clicks");
  const currentSummary = `${label}: ${formatNumber(currentImpressions)} wyświetleń i ${formatNumber(currentClicks)} kliknięć w Google Search Console.`;
  return topContext
    ? `${currentSummary} Największy wkład w kliknięcia ma „${readableContextKey(topContext)}” — ${formatNumber(topContext.gsc?.clicks ?? null)} kliknięć w zweryfikowanym zestawie.`
    : currentSummary;
}

function insightLabel(kind: string): string {
  return ({ low_ctr: "Dużo wyświetleń, niski CTR", striking_distance: "Fraza blisko pierwszej strony", ahrefs_opportunity: "Potencjał widoczności według Ahrefs" } as Record<string, string>)[kind] ?? "Sygnał z danych";
}

function localizedEvidence(value: string): string {
  return value
    .replace(/([\d.,]+) impressions/g, "$1 wyświetleń")
    .replace(/position ([\d.,]+)/g, "pozycja $1")
    .replace(/estimated traffic ([\d.,]+)/g, "szacowany ruch $1");
}

function readableContextKey(entry: CrossSourceContextEntry): string {
  if (entry.key_type !== "page") return entry.key;
  return readablePageLabel(entry.key);
}

function readablePageLabel(value: string): string {
  try {
    const url = new URL(value);
    const slug = url.pathname.split("/").filter(Boolean).at(-1);
    return slug ? slug.replaceAll("-", " ") : url.hostname;
  } catch { return value; }
}

function sourceStateLabel(source: AgencyReportSummary["source_status"][number]): string {
  if (source.status === "ready") return "Dostępne";
  if (source.status === "unavailable") return "Niepodłączone";
  return "Wymaga wyjaśnienia";
}

async function loadClientReportFontCss(): Promise<string> {
  const encoded = (await readFile(new URL("../assets/fonts/Manrope-Variable.ttf.base64", import.meta.url), "utf8")).trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("invalid embedded client report font");
  return `@font-face{font-family:"Manrope Report";src:url("data:font/ttf;base64,${encoded}") format("truetype");font-style:normal;font-weight:200 800;font-display:block}`;
}

const CLIENT_REPORT_CSS = `
:root{
  color-scheme:light;
  --ink:#202221;
  --ink-soft:#4f5552;
  --paper:#f7f5ef;
  --surface:#fff;
  --canvas:#d9dcda;
  --line:rgba(32,34,33,.18);
  --line-strong:#202221;
  --brand:#269353;
  --brand-dark:#1b4c30;
  --brand-soft:#e0f8e9;
  --blue:#3d6eb7;
  --blue-soft:#f2f7fc;
  --warning:#b95a00;
  --font:"Manrope Report",ui-sans-serif,system-ui,sans-serif;
  --wrapper:76rem;
  --gutter:clamp(1.25rem,5vw,4.75rem);
  --space-2xs:.444rem;
  --space-xs:.667rem;
  --space-s:1rem;
  --space-m:1.5rem;
  --space-l:2.25rem;
  --space-xl:3.375rem;
  --space-2xl:5.063rem;
  --space-3xl:7.594rem;
  --text-base:clamp(1rem,.96rem + .16vw,1.125rem);
  --text-lede:clamp(1.25rem,1.14rem + .42vw,1.5rem);
  --text-display:clamp(3.25rem,6.8vw,6.75rem);
  --text-section:clamp(2.25rem,3.8vw,4rem);
  --text-number:clamp(2.5rem,4.5vw,4.75rem);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--canvas);color:var(--ink);font:450 var(--text-base)/1.52 var(--font);font-feature-settings:"ss01" 1,"ss02" 1}
main{width:min(100%,92rem);margin-inline:auto;background:var(--paper);box-shadow:0 2rem 6rem rgba(25,34,31,.15)}
h1,h2,h3,p{margin:0}
h1,h2,h3{font-weight:700;letter-spacing:-.04em;line-height:.98}
a{color:inherit}
.wrapper{width:min(100% - (2 * var(--gutter)),var(--wrapper));margin-inline:auto}
.flow>*+*{margin-block-start:var(--flow-space,var(--space-m))}
.cluster{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-xs)}
.repel{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--space-m)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--grid-min,15rem)),1fr))}
.region{padding-block:var(--space-2xl);border-top:1px solid var(--line)}
.eyebrow{font-size:.7rem;font-weight:750;letter-spacing:.16em;line-height:1.25;text-transform:uppercase}
.report-cover{position:relative;display:flex;min-height:min(48rem,86svh);flex-direction:column;overflow:hidden;padding-block:var(--space-l) var(--space-2xl);background:var(--brand-soft);border-top:.75rem solid var(--brand)}
.report-cover:after{content:"SEO";position:absolute;right:-.04em;bottom:-.18em;color:rgba(38,147,83,.08);font-size:clamp(11rem,32vw,31rem);font-weight:800;letter-spacing:-.1em;line-height:.7;pointer-events:none}
.report-cover__top,.report-cover__body,.report-cover__meta{position:relative;z-index:1}
.report-cover__top{padding-bottom:var(--space-m);border-bottom:1px solid var(--line-strong)}
.report-cover__body{display:grid;align-content:center;flex:1;max-width:69rem;padding-block:var(--space-2xl)}
.report-cover__title{min-width:0;max-width:11ch;font-size:var(--text-display);line-height:.92;overflow-wrap:anywhere;hyphens:auto;text-wrap:balance}
.report-cover__lead{min-width:0;max-width:47ch;font-size:var(--text-lede);color:var(--ink-soft);overflow-wrap:anywhere;text-wrap:pretty}
.report-cover__meta{padding-top:var(--space-m);border-top:1px solid var(--line-strong);font-size:.82rem;font-weight:650}
.metric-strip{grid-template-columns:repeat(4,minmax(0,1fr));border-block:1px solid var(--line-strong);background:var(--surface)}
.metric-card{min-width:0;padding:var(--space-l) var(--space-m);border-right:1px solid var(--line-strong)}
.metric-card:last-child{border-right:0}
.metric-card__label{display:block;color:var(--ink-soft);font-size:.68rem;font-weight:700;letter-spacing:.11em;text-transform:uppercase}
.metric-card__value{display:block;margin-block:var(--space-xs);font-size:var(--text-number);font-weight:650;letter-spacing:-.065em;line-height:.85}
.metric-card__change{display:block;color:var(--ink-soft);font-size:.8rem;line-height:1.3;overflow-wrap:anywhere}
.story-heading{max-width:17ch;font-size:var(--text-section);text-wrap:balance}
.story-lede{max-width:49ch;color:var(--ink-soft);font-size:var(--text-lede);text-wrap:pretty}
.story-split{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(17rem,.65fr);gap:clamp(2rem,6vw,6rem);align-items:start}
.story-panel{padding:var(--space-l);background:var(--surface);border:1px solid var(--line-strong)}
.story-panel[data-tone=accent]{background:var(--blue-soft);border-color:var(--blue)}
.story-panel[data-tone=dark]{background:var(--ink);border-color:var(--ink);color:var(--surface)}
.keyword-summary{color:var(--ink-soft);font-size:.8rem;font-weight:600}
.comparison-list{margin:var(--space-xl) 0 0;padding:0;border-top:1px solid var(--line-strong);list-style:none}
.comparison-list__item{display:grid;grid-template-columns:minmax(10rem,1fr) auto;gap:var(--space-l);align-items:end;padding-block:var(--space-m);border-bottom:1px solid var(--line)}
.comparison-list__label{font-size:1.15rem;font-weight:700}
.comparison-list__meta{display:block;margin-top:.25rem;color:var(--ink-soft);font-size:.78rem;overflow-wrap:anywhere}
.comparison-list__value{font-size:clamp(1.5rem,2.4vw,2.5rem);font-weight:650;letter-spacing:-.05em;white-space:nowrap}
.result-list,.market-list,.timeline{margin:0;padding:0;list-style:none}
.result-list__item{display:grid;grid-template-columns:2rem minmax(0,1fr) auto;gap:var(--space-m);align-items:start;padding-block:var(--space-m);border-bottom:1px solid currentColor}
.result-list__item:last-child{border-bottom:0}
.result-list__index,.signal-card__number{color:var(--brand);font-size:.68rem;font-weight:750;letter-spacing:.15em}
.result-list__title{font-size:clamp(1.25rem,2.1vw,2rem);font-weight:650;line-height:1.02;text-transform:none;overflow-wrap:anywhere}
.result-list__item small{display:block;margin-top:.35rem;color:color-mix(in srgb,currentColor 65%,transparent);font-size:.72rem}
.result-list__metric{font-size:clamp(1rem,1.6vw,1.35rem);font-weight:650;white-space:nowrap}
.result-list__bar{display:block;width:var(--bar);height:.24rem;margin-top:.75rem;background:var(--brand)}
.market-card{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(11rem,.65fr);gap:var(--space-xl);align-items:end;padding:var(--space-xl);background:var(--brand-dark);color:var(--surface);box-shadow:inset .7rem 0 0 var(--brand)}
.market-card__number{display:block;margin-top:var(--space-l);font-size:var(--text-number);font-weight:650;letter-spacing:-.065em;line-height:.84}
.market-ring{display:grid;place-content:center;width:min(100%,12rem);aspect-ratio:1;margin-inline:auto;border:1.1rem solid var(--brand);border-top-color:var(--surface);border-radius:50%;text-align:center}
.market-ring strong{font-size:clamp(2rem,4vw,3.8rem);font-weight:650;letter-spacing:-.06em;line-height:.9}
.market-ring span{max-width:9ch;margin-top:.35rem;font-size:.7rem;line-height:1.2}
.market-list-wrap{padding-top:var(--space-xl)}
.market-list{border-top:1px solid var(--line-strong)}
.market-list__item{display:grid;grid-template-columns:2rem minmax(0,1fr) auto;gap:var(--space-m);align-items:start;padding-block:var(--space-m);border-bottom:1px solid var(--line)}
.market-list__item>span{color:var(--brand);font-size:.68rem;font-weight:750}
.market-list__item strong,.market-list__item small{display:block}
.market-list__item strong{font-size:1.3rem;font-weight:650;line-height:1.05;overflow-wrap:anywhere}
.market-list__item small{margin-top:.25rem;color:var(--ink-soft);font-size:.74rem}
.market-list__item i{display:block;width:var(--bar);height:.3rem;margin-top:.65rem;background:var(--blue)}
.market-list__item b{font-size:2rem;font-weight:650;letter-spacing:-.05em}
.signal-grid{grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--line-strong)}
.signal-card{min-width:0;padding:var(--space-l);background:var(--surface);border-right:1px solid var(--line-strong)}
.signal-card:last-child{border-right:0}
.signal-card__title{font-size:1.55rem;font-weight:650;line-height:1.02}
.signal-card__key{font-weight:650;overflow-wrap:anywhere}
.signal-card p{color:var(--ink-soft);overflow-wrap:anywhere}
.timeline{border-left:1px solid var(--line-strong)}
.timeline__item{position:relative;margin-left:var(--space-l);padding:0 0 var(--space-l) var(--space-s)}
.timeline__item:before{content:"";position:absolute;left:calc(-1 * var(--space-l) - .33rem);top:.35rem;width:.64rem;aspect-ratio:1;border-radius:50%;background:var(--brand)}
.timeline__title{font-size:1.3rem}
.source-pill{padding:.55rem .75rem;border:1px solid var(--line-strong);font-size:.75rem;font-weight:600}
.source-pill[data-state=ready]{background:var(--brand-soft);border-color:var(--brand);color:var(--brand-dark)}
.source-pill[data-state=unavailable]{background:#fff7ec;border-color:var(--warning);color:#713700}
.report-note{max-width:68ch;color:var(--ink-soft)}
.report-footer{padding-block:var(--space-l);border-top:1px solid var(--line-strong);background:var(--surface);color:var(--ink-soft);font-size:.72rem}
@media(max-width:50rem){
  main{box-shadow:none}
  .report-cover{min-height:auto}
  .report-cover__body{padding-block:var(--space-2xl)}
  .report-cover__title{font-size:clamp(3rem,16vw,5rem)}
  .metric-strip{grid-template-columns:repeat(2,minmax(0,1fr))}
  .metric-card:nth-child(2){border-right:0}
  .metric-card:nth-child(-n+2){border-bottom:1px solid var(--line-strong)}
  .story-split,.market-card{grid-template-columns:1fr}
  .result-list__item,.market-list__item{grid-template-columns:1.5rem minmax(0,1fr)}
  .result-list__metric,.market-list__item b{grid-column:2;white-space:normal}
  .signal-grid{grid-template-columns:1fr}
  .signal-card{border-right:0;border-bottom:1px solid var(--line-strong)}
  .signal-card:last-child{border-bottom:0}
}
@media(max-width:30rem){
  .report-cover__title{font-size:clamp(2.7rem,13.5vw,4rem)}
  .metric-strip{grid-template-columns:1fr}
  .metric-card,.metric-card:nth-child(2){border-right:0;border-bottom:1px solid var(--line-strong)}
  .metric-card:last-child{border-bottom:0}
  .comparison-list__item{grid-template-columns:1fr;gap:var(--space-xs)}
  .comparison-list__value{white-space:normal}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media print{
  @page{size:A4;margin:0}
  body{background:#fff;font-size:8.5pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  main{width:210mm;margin:0;box-shadow:none}
  .wrapper{width:100%}
  .report-cover{width:210mm;min-height:88mm;padding:6mm 14mm 8mm;border-top-width:3mm;break-after:auto}
  .report-cover:after{font-size:95mm}
  .report-cover__top{padding-bottom:3mm}
  .report-cover__body{padding-block:7mm 4mm}
  .report-cover__title{font-size:35pt}
  .report-cover__lead{max-width:100mm;font-size:8pt}
  .report-cover__meta{padding-top:3mm;font-size:6.5pt}
  .metric-strip{width:210mm;height:39mm;grid-template-columns:repeat(4,minmax(0,1fr))}
  .metric-card{padding:4.5mm}
  .metric-card__value{font-size:22pt}
  .metric-card__change{font-size:6.2pt}
  .region{width:210mm;padding:9mm 14mm}
  .story-heading{font-size:27pt}
  .story-lede{font-size:9pt}
  .story-split{grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr);gap:8mm}
  .story-panel,.market-card,.signal-card,.metric-card,.timeline__item{break-inside:avoid}
  .comparison-list{margin-top:5mm}
  .comparison-list__item{padding-block:1.5mm}
  .comparison-list__value{max-width:78mm;font-size:8pt;line-height:1.25;white-space:normal}
  .region:has(.story-panel[data-tone=dark]),.region:has(.market-card),.region:has(.signal-grid){break-before:page}
  .region:has(.story-panel[data-tone=dark]),.region:has(.market-card){display:flex;min-height:297mm;align-items:center}
  .region:has(.story-panel[data-tone=dark]){padding-block:12mm}
  .region:has(.story-panel[data-tone=dark]) .story-heading{font-size:26pt}
  .region:has(.story-panel[data-tone=dark]) .story-panel{padding:6mm}
  .result-list__item{padding-block:2.7mm}
  .result-list__title{font-size:14pt}
  .result-list__metric{font-size:10pt}
  .region:has(.market-card){padding-block:11mm}
  .market-card{padding:7mm;gap:8mm}
  .market-card__number{font-size:36pt}
  .market-ring{width:28mm;border-width:3mm}
  .market-ring strong{font-size:22pt}
  .market-list-wrap{padding-top:5mm}
  .market-list__item{padding-block:2mm}
  .market-list__item strong{font-size:9pt}
  .market-list__item small{font-size:6pt}
  .market-list__item b{font-size:13pt}
  .market-list__item i{height:1mm;margin-top:1.2mm}
  .region:has(.signal-grid){display:flex;min-height:165mm;align-items:center;padding-block:11mm}
  .signal-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
  .signal-card{min-height:45mm;padding:5mm}
  .signal-card__title{font-size:14pt}
  .region:has(.source-list){display:flex;min-height:132mm;align-items:center;padding-block:7mm}
  .report--keywords .report-cover{min-height:102mm;padding:7mm 14mm 8mm}
  .report--keywords .report-cover__body{padding-block:7mm 4mm}
  .report--keywords .report-cover__title{font-size:30pt}
  .report--keywords .report-cover__lead{font-size:7.5pt}
  .report--keywords .region{display:flex;min-height:174mm;align-items:center;padding:8mm 14mm}
  .report--keywords .story-panel{width:100%;padding:6mm}
  .report--keywords .keyword-summary{margin-block-start:2mm;font-size:6.5pt}
  .report--keywords .story-heading{font-size:19.5pt}
  .report--keywords .result-list__item{padding-block:2.2mm}
  .report--keywords .result-list__title{font-size:9pt}
  .report--keywords .result-list__metric{font-size:8pt}
  .report--keywords .region:has(.source-list){display:none}
  .report--keywords .report-note{display:none}
  .report-footer{display:none}
}
`;

function unitHtml(unit: DeliveryUnit, generatedAt: string, fontCss: string): string {
  const gsc = unit.metrics.filter((metric) => metric.provider === "google-search-console");
  const ahrefs = unit.metrics.filter((metric) => metric.provider === "ahrefs");
  const primary = storyMetric(gsc);
  const period = primary?.current_range;
  const headline = storyHeadline(unit, primary);
  const lead = storyLead(unit, primary);
  const summaryHeading = gsc.length > 1 ? "Dwa zakresy pomiaru. Każdy czytamy osobno." : "Jeden zakres. Jasny obraz widoczności.";
  const positionDelta = primary ? positionImprovement(primary) : null;
  const metricCards = primary ? [
    ["Wyświetlenia", formatNumber(metricValue(primary, "impressions")), signedPercent(relativeMetricChange(primary, "impressions"))],
    ["Kliknięcia", formatNumber(metricValue(primary, "clicks")), signedPercent(relativeMetricChange(primary, "clicks"))],
    ["Średnia pozycja", formatDecimal(metricValue(primary, "position")), positionDelta === null ? "Brak porównywalnej bazy" : positionDelta > 0 ? `Poprawa o ${formatDecimal(positionDelta)}` : positionDelta < 0 ? `Pogorszenie o ${formatDecimal(Math.abs(positionDelta))}` : "Bez zmiany"],
    ["CTR", formatPercent(metricValue(primary, "ctr")), comparisonText(primary, "ctr", "ratio")],
  ].map(([label, value, change]) => `<article class="metric-card"><span class="metric-card__label">${escapeHtml(label)}</span><strong class="metric-card__value">${escapeHtml(value)}</strong><small class="metric-card__change">${escapeHtml(change)}</small></article>`).join("") : "";
  const propertyComparisons = gsc.map((metric) => `<li class="comparison-list__item"><div><span class="comparison-list__label">${escapeHtml(propertyLabel(metric.property_id))}</span><small class="comparison-list__meta">Dane obserwowane · Google Search Console · ${escapeHtml(metric.property_id)} · ${escapeHtml(metric.current_range ? `${metric.current_range.start} — ${metric.current_range.end}` : "snapshot")}</small></div><strong class="comparison-list__value">${escapeHtml(formatNumber(metricValue(metric, "clicks")))} klik. · ${escapeHtml(formatNumber(metricValue(metric, "impressions")))} wyśw. · CTR ${escapeHtml(formatPercent(metricValue(metric, "ctr")))} · poz. ${escapeHtml(formatDecimal(metricValue(metric, "position")))}</strong></li>`).join("");
  const topContext = [...unit.context]
    .filter((entry) => entry.gsc)
    .sort((a, b) => (b.gsc?.clicks ?? 0) - (a.gsc?.clicks ?? 0) || (b.gsc?.impressions ?? 0) - (a.gsc?.impressions ?? 0) || compareCodePoint(a.key, b.key))
    .slice(0, 5);
  const maxContextClicks = Math.max(1, ...topContext.map((entry) => entry.gsc?.clicks ?? 0));
  const contextItems = topContext.map((entry, index) => `<li class="result-list__item"><span class="result-list__index">0${index + 1}</span><div><h3 class="result-list__title">${escapeHtml(readableContextKey(entry))}</h3><small>${entry.key_type === "page" ? "Strona budująca ruch" : "Zapytanie użytkowników"} · ${formatNumber(entry.gsc?.impressions ?? null)} wyświetleń · CTR ${formatPercent(entry.gsc?.ctr ?? null)} · śr. poz. ${formatDecimal(entry.gsc?.position ?? null)}</small><span class="result-list__bar" style="--bar:${Math.round(((entry.gsc?.clicks ?? 0) / maxContextClicks) * 100)}%"></span></div><strong class="result-list__metric">${formatNumber(entry.gsc?.clicks ?? null)} kliknięć</strong></li>`).join("");
  const signals = [...unit.insights]
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "attention" ? -1 : 1) || compareCodePoint(a.kind, b.kind) || compareCodePoint(a.key, b.key))
    .slice(0, 3)
    .map((insight, index) => `<article class="signal-card flow"><span class="signal-card__number">0${index + 1}</span><h3 class="signal-card__title">${escapeHtml(insightLabel(insight.kind))}</h3><p class="signal-card__key">${escapeHtml(insight.key)}</p><p>${escapeHtml(localizedEvidence(insight.evidence))}</p></article>`).join("");
  const ahrefsMetric = ahrefs[0] ?? null;
  const ahrefsKeywordCount = ahrefsMetric ? finite(ahrefsMetric.current.organic_keywords) : null;
  const ahrefsTopThree = ahrefsMetric ? finite(ahrefsMetric.current.organic_keywords_top_3) : null;
  const ahrefsTopThreeShare = ahrefsKeywordCount && ahrefsTopThree !== null ? Math.round((ahrefsTopThree / ahrefsKeywordCount) * 100) : 0;
  const ahrefsTopPages = (Array.isArray(ahrefsMetric?.current.top_pages) ? ahrefsMetric.current.top_pages : [])
    .filter(isRecord)
    .map((row) => ({ url: typeof row.url === "string" ? row.url : "—", traffic: finite(row.sum_traffic), keywords: finite(row.keywords) }))
    .sort((a, b) => (b.traffic ?? -1) - (a.traffic ?? -1) || compareCodePoint(a.url, b.url))
    .slice(0, 4);
  const maxAhrefsPageTraffic = Math.max(1, ...ahrefsTopPages.map((row) => row.traffic ?? 0));
  const ahrefsPageList = ahrefsTopPages.map((row, index) => `<li class="market-list__item"><span>0${index + 1}</span><div><strong>${escapeHtml(readablePageLabel(row.url))}</strong><small>${formatNumber(row.keywords)} fraz</small><i style="--bar:${Math.round(((row.traffic ?? 0) / maxAhrefsPageTraffic) * 100)}%"></i></div><b>${formatNumber(row.traffic)}</b></li>`).join("");
  const ahrefsBlock = ahrefsMetric ? `<div class="market-card"><div class="flow"><span class="eyebrow">Kontekst rynkowy · dane szacunkowe Ahrefs</span><h2 class="story-heading">${formatNumber(ahrefsKeywordCount)} fraz buduje estymowany zasięg domeny.</h2><span class="market-card__number">${formatNumber(finite(ahrefsMetric.current.organic_traffic))}</span><p>szacowanego ruchu organicznego.${ahrefsMetric.generated_at ? ` Stan na ${escapeHtml(ahrefsMetric.generated_at.slice(0, 10))}.` : ""}${ahrefsMetric.country ? ` Rynek ${escapeHtml(ahrefsMetric.country.toUpperCase())}.` : ""} To estymacja dostawcy, nie pomiar wejść.</p></div><div class="market-ring" style="--ring:${ahrefsTopThreeShare}%"><strong>${ahrefsTopThreeShare}%</strong><span>${formatNumber(ahrefsTopThree)} fraz w TOP 3</span></div></div>${ahrefsPageList ? `<div class="market-list-wrap flow"><span class="eyebrow">Strony o największym szacowanym ruchu</span><ul class="market-list">${ahrefsPageList}</ul></div>` : ""}` : "";
  const keywordRows = unit.keywordGroups.flatMap((group) => group.rows).sort((a, b) => (finite(b.volume) ?? -1) - (finite(a.volume) ?? -1) || compareCodePoint(String(a.keyword ?? ""), String(b.keyword ?? "")));
  const keywordVolumeRows = keywordRows.map((row) => finite(row.volume)).filter((value): value is number => value !== null);
  const keywordTotalVolume = keywordVolumeRows.reduce((sum, value) => sum + value, 0);
  const keywordBlock = unit.keywordGroups.length
    ? keywordRows.length
      ? `<div class="story-panel flow"><span class="eyebrow">Badanie fraz · dane szacunkowe Ahrefs Keywords Explorer</span><h2 class="story-heading">${formatNumber(keywordRows.length)} zwróconych fraz w tym widoku.</h2><p class="keyword-summary">Łączny szacowany wolumen zwróconych fraz: ${formatNumber(keywordTotalVolume)} · wolumen dostępny dla ${formatNumber(keywordVolumeRows.length)} z ${formatNumber(keywordRows.length)} fraz · poniżej TOP ${formatNumber(Math.min(5, keywordRows.length))}</p><ul class="result-list">${keywordRows.slice(0, 5).map((row, index) => `<li class="result-list__item"><span class="result-list__index">0${index + 1}</span><div><h3 class="result-list__title">${escapeHtml(row.keyword)}</h3><small>Szacowany wolumen wyszukiwań · Ahrefs</small></div><strong class="result-list__metric">${formatNumber(finite(row.volume))}</strong></li>`).join("")}</ul></div>`
      : `<div class="story-panel flow"><span class="eyebrow">Zakres badania fraz</span><h2 class="story-heading">Brak osobnej listy monitorowanych fraz.</h2><p class="story-lede">Działania obejmują cały serwis. Brak listy nie oznacza zerowej widoczności.</p></div>`
    : "";
  const rankRows = unit.rankMonitoring?.rows ?? [];
  const rankBlock = unit.rankMonitoring ? `<div class="story-panel flow"><span class="eyebrow">Monitoring pozycji · dane obserwowane SERPROBOT</span><h2 class="story-heading">${formatNumber(rankRows.filter((row) => row.position !== null && row.position <= 10).length)} z ${formatNumber(rankRows.length)} fraz znajduje się w TOP 10.</h2><div class="cluster">${[["TOP 3", 3], ["TOP 10", 10], ["TOP 20", 20], ["TOP 50", 50]].map(([label, limit]) => `<span class="source-pill" data-state="ready">${label}: ${rankRows.filter((row) => row.position !== null && row.position <= Number(limit)).length}</span>`).join("")}</div>${rankRows.length ? `<ul class="result-list">${[...rankRows].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || compareCodePoint(a.keyword, b.keyword)).slice(0, 5).map((row, index) => `<li class="result-list__item"><span class="result-list__index">0${index + 1}</span><div><h3 class="result-list__title">${escapeHtml(row.keyword)}</h3><small>${escapeHtml(row.search_engine)}${row.location ? ` · ${escapeHtml(row.location)}` : ""}</small></div><strong class="result-list__metric">pozycja ${escapeHtml(row.position ?? "—")}</strong></li>`).join("")}</ul>` : ""}</div>` : "";
  const actionsBlock = unit.kind === "client" && unit.content?.actions.length ? `<div class="story-panel flow"><span class="eyebrow">Wykonana praca</span><h2 class="story-heading">Działania mają własny, jawny rejestr.</h2><ol class="timeline">${unit.content.actions.map((action) => `<li class="timeline__item"><span class="eyebrow">${escapeHtml(action.period.start)} · ${escapeHtml(actionStatusLabel(action.status))}</span><h3 class="timeline__title">${escapeHtml(action.title)}</h3><p>${escapeHtml(actionTypeLabel(action.type))}${action.target_url ? ` · ${escapeHtml(action.target_url)}` : ""}</p></li>`).join("")}</ol></div>` : "";
  const sources = unit.sources.map((source) => `<span class="source-pill" data-state="${source.status === "ready" ? "ready" : "unavailable"}">${escapeHtml(providerLabel(source.provider))} · ${escapeHtml(sourceStateLabel(source))}</span>`).join("");
  const status = unit.sources.some((source) => source.status !== "ready")
    ? "Raport częściowy · brakujące źródło nie oznacza zera"
    : !gsc.length && unit.keywordGroups.length
      ? "Raport częściowy · zakres: badanie fraz"
      : "Raport gotowy · źródła zweryfikowane";
  const measurementNote = gsc.length
    ? "Każda właściwość Google Search Console jest pokazana osobno. Zakres domenowy może obejmować subdomeny, dlatego wartości nie są sumowane."
    : "Zakres raportu odpowiada zweryfikowanym źródłom tego klienta. Brak GSC, GA4 lub monitoringu pozycji nie jest prezentowany jako wartość zero.";
  const summaryBlock = gsc.length ? `<div class="region"><div class="wrapper flow"><span class="eyebrow">Najważniejszy obraz okresu</span><div class="story-split"><div class="flow"><h2 class="story-heading">${escapeHtml(summaryHeading)}</h2><p class="story-lede">${escapeHtml(lead)}</p></div><div class="story-panel" data-tone="accent"><span class="eyebrow">Zakres pomiaru</span><p>${escapeHtml(measurementNote)}</p></div></div>${propertyComparisons ? `<ul class="comparison-list">${propertyComparisons}</ul>` : ""}</div></div>` : "";
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(unit.title)} — raport SEO</title><style>${fontCss}${CLIENT_REPORT_CSS}</style></head><body><main class="report ${gsc.length ? "report--search" : "report--keywords"}"><div class="report-cover"><header class="report-cover__top wrapper repel"><span class="eyebrow">${escapeHtml(unit.title)} × Rekurencja.com</span><span class="eyebrow">${escapeHtml(period ? `${period.start} — ${period.end}` : generatedAt.slice(0, 10))}</span></header><div class="report-cover__body wrapper flow"><span class="eyebrow">Miesięczny raport SEO</span><h1 class="report-cover__title">${escapeHtml(headline)}</h1><p class="report-cover__lead">${escapeHtml(lead)}</p></div><div class="report-cover__meta wrapper repel"><span>${escapeHtml(status)}</span><span>${escapeHtml(primary ? `Zakres główny: ${propertyLabel(primary.property_id)}` : unit.mappingLabel)}</span></div></div>${metricCards ? `<div class="metric-strip grid">${metricCards}</div>` : ""}${summaryBlock}${contextItems ? `<div class="region"><div class="wrapper flow"><span class="eyebrow">Co działa</span><h2 class="story-heading">Odpowiedzi na konkretne problemy zbierają najwięcej kliknięć.</h2><div class="story-panel" data-tone="dark"><ul class="result-list">${contextItems}</ul></div></div></div>` : ""}<div class="region"><div class="wrapper flow">${ahrefsBlock}${keywordBlock}${rankBlock}</div></div>${signals ? `<div class="region"><div class="wrapper flow"><span class="eyebrow">Sygnały do omówienia</span><h2 class="story-heading">Trzy obszary, które warto obserwować w następnym okresie.</h2><div class="signal-grid grid">${signals}</div></div></div>` : ""}${actionsBlock ? `<div class="region"><div class="wrapper">${actionsBlock}</div></div>` : ""}<div class="region"><div class="wrapper flow"><span class="eyebrow">Zakres i ograniczenia</span><h2 class="story-heading">Pokazujemy to, co zostało zweryfikowane.</h2><div class="source-list cluster">${sources || `<span class="source-pill" data-state="unavailable">Brak zweryfikowanych źródeł</span>`}</div><p class="report-note">GSC jest obserwacją wyników wyszukiwania. Ahrefs dostarcza estymacje w ograniczonym zakresie. Źródła niepodłączone pozostają niedostępne, a nie zerowe. Pełne rekordy i hashe pozostają w lokalnym appendixie operatorskim i nie są częścią klient-facing narracji.</p></div></div><footer class="report-footer"><div class="wrapper repel"><span>Lokalny raport oparty na zweryfikowanych danych</span><span>${escapeHtml(unit.title)} · wygenerowano ${escapeHtml(generatedAt.slice(0, 10))}</span></div></footer></main></body></html>`;
}

function appendClientContent(html: string, content: ClientContent | null, rankMonitoring: RankMonitoringSnapshot | null, rankHistory: RankHistoryComparison[], history: ProviderHistoryEntry[], includeClientSections: boolean, sources: DeliveryUnit["sources"]): string {
  const rankSource = sources.find((source) => source.provider === "serprobot");
  if (!content && !rankMonitoring && history.length === 0 && !includeClientSections) return html;
  const actions = content ? content.actions.map((action) => `<tr><td>${escapeHtml(action.period.start)} — ${escapeHtml(action.period.end)}</td><td>${escapeHtml(actionTypeLabel(action.type))}</td><td>${escapeHtml(actionStatusLabel(action.status))}</td><td>${escapeHtml(action.title)}</td><td>${escapeHtml(action.target_url ?? "—")}</td><td>${escapeHtml(action.published_at ?? "—")}</td><td>${escapeHtml(action.notes ?? "—")}</td></tr>`).join("") : "";
  const glossary = content ? content.glossary.map((entry) => `<tr><td>${escapeHtml(entry.term)}</td><td>${escapeHtml(entry.explanation)}</td></tr>`).join("") : "";
  const contact = content?.contact ? `<p><strong>Kontakt:</strong> ${escapeHtml(content.contact.name)}${content.contact.email ? ` · ${escapeHtml(content.contact.email)}` : ""}${content.contact.phone ? ` · ${escapeHtml(content.contact.phone)}` : ""}</p>` : "";
  const rankRows = rankMonitoring?.rows.map((row) => `<tr><td>${escapeHtml(row.keyword)}</td><td>${escapeHtml(row.position ?? "—")}</td><td>${escapeHtml(row.previous_position ?? "—")}</td><td>${escapeHtml(row.search_engine)}</td><td>${escapeHtml(row.location ?? "—")}</td><td>${escapeHtml(row.url ?? "—")}</td></tr>`).join("") ?? "";
  const rankSection = rankMonitoring
    ? `<section class="section"><div class="eyebrow">MONITORING FRAZ</div><h2>Pozycje monitorowanych fraz</h2><p class="muted">Źródło: SERPROBOT · okres ${escapeHtml(rankMonitoring.date_range.start)} — ${escapeHtml(rankMonitoring.date_range.end)}.${rankMonitoring.source_config ? ` Projekt ${escapeHtml(rankMonitoring.source_config.project_id)} · ${escapeHtml(rankMonitoring.source_config.search_engine)}${rankMonitoring.source_config.location ? ` · ${escapeHtml(rankMonitoring.source_config.location)}` : ""}${rankMonitoring.source_config.device ? ` · ${escapeHtml(rankMonitoring.source_config.device)}` : ""}.` : ""} To snapshot pozycji, nie pomiar ruchu.</p><div class="table-wrap"><table><thead><tr><th>Fraza</th><th>Pozycja</th><th>Poprzednio</th><th>Wyszukiwarka</th><th>Lokalizacja</th><th>Adres</th></tr></thead><tbody>${rankRows || `<tr><td colspan="6" class="no-data">Brak zwróconych fraz.</td></tr>`}</tbody></table></div></section>`
    : includeClientSections && rankSource
      ? `<section class="section"><div class="eyebrow">MONITORING FRAZ</div><h2>Pozycje monitorowanych fraz</h2><p class="muted"><span class="tag">Unavailable · źródło niepodłączone</span> ${escapeHtml(sourceReasonLabel(rankSource))} Brak danych nie oznacza zerowych pozycji.</p></section>`
      : "";
  const rankHistoryRows = rankHistory.map((entry) => `<tr><td>${escapeHtml(entry.current_period.start)} — ${escapeHtml(entry.current_period.end)}</td><td>${escapeHtml(entry.keyword)}</td><td>${escapeHtml(entry.search_engine)}</td><td>${escapeHtml(entry.location ?? "—")}</td><td>${escapeHtml(entry.previous_position ?? "—")}</td><td>${escapeHtml(entry.current_position ?? "—")}</td><td>${escapeHtml(entry.position_delta ?? "—")}</td><td>${escapeHtml(entry.previous_manifest_sha256)}</td><td>${escapeHtml(entry.manifest_sha256)}</td></tr>`).join("");
  const rankHistorySection = rankHistory.length
    ? `<section class="section"><div class="eyebrow">HISTORIA MONITORINGU</div><h2>Zmiana pozycji monitorowanych fraz</h2><p class="muted">Observed — SERPROBOT. Porównanie obejmuje wyłącznie bezpośrednio sąsiadujące, zweryfikowane snapshoty. Ujemna delta oznacza poprawę, ponieważ niższa pozycja jest lepsza.</p><div class="table-wrap"><table><thead><tr><th>Okres porównania</th><th>Fraza</th><th>Wyszukiwarka</th><th>Lokalizacja</th><th>Poprzednio</th><th>Obecnie</th><th>Delta</th><th>Manifest poprzedni</th><th>Manifest obecny</th></tr></thead><tbody>${rankHistoryRows}</tbody></table></div></section>`
    : "";
  const actionsSection = includeClientSections
    ? `<section class="section"><div class="eyebrow">DZIAŁANIA DLA STRONY</div><h2>Wykonane i zaplanowane działania</h2>${content ? `<p class="muted">Rejestr działań pochodzi z jawnego inputu operatora; pozycje nie są wywnioskowane z metryk.</p><div class="table-wrap"><table><thead><tr><th>Okres</th><th>Typ</th><th>Status</th><th>Opis</th><th>Adres</th><th>Opublikowano</th><th>Notatka</th></tr></thead><tbody>${actions || `<tr><td colspan="7" class="no-data">Brak wpisów dla tego okresu.</td></tr>`}</tbody></table></div>${contact}` : `<p class="muted"><span class="tag">Unavailable · brak rejestru działań</span> Nie dostarczono manifest-bound rejestru działań off-site/on-site. Nie wywnioskujemy działań z metryk.</p>`}</section>${content ? `<section class="section"><div class="eyebrow">PRZYDATNE POJĘCIA</div><h2>Słownik raportu</h2><div class="table-wrap"><table><thead><tr><th>Pojęcie</th><th>Wyjaśnienie</th></tr></thead><tbody>${glossary || `<tr><td colspan="2" class="no-data">Brak wpisów słownika.</td></tr>`}</tbody></table></div></section>` : ""}`
    : "";
  const section = `${historySection(history)}${rankHistorySection}${rankSection}${actionsSection}`
    .replace('<section class="section"><div class="eyebrow">HISTORIA WYNIKÓW', '<section id="history" class="section supplement"><div class="eyebrow">HISTORIA WYNIKÓW')
    .replace('<section class="section"><div class="eyebrow">HISTORIA MONITORINGU', '<section id="rank-history" class="section supplement"><div class="eyebrow">HISTORIA MONITORINGU')
    .replace('<section class="section"><div class="eyebrow">MONITORING FRAZ', '<section id="ranking" class="section supplement"><div class="eyebrow">MONITORING FRAZ')
    .replace('<section class="section"><div class="eyebrow">DZIAŁANIA DLA STRONY', '<section id="actions" class="section supplement"><div class="eyebrow">DZIAŁANIA DLA STRONY');
  return html
    .replace("</style></head>", ".supplement{margin-inline:18mm}</style></head>")
    .replace("<!-- supplements -->", `${section}<!-- supplements -->`);
}

function base64Lines(bytes: Buffer): string {
  return bytes.toString("base64").replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function plainTextValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function emailDraft(unit: DeliveryUnit, generatedAt: string, htmlPath: string, pdfPath: string | null, htmlContent: string, pdfContent: Buffer | null): string {
  const subject = `Raport SEO — ${headerValue(unit.title)}`;
  const recipient = unit.content?.contact?.email ? `To: ${headerValue(unit.content.contact.email)}\r\n` : "";
  const currentPeriod = unit.metrics.find((metric) => metric.current_range)?.current_range;
  const sourceLabels = [...new Set(unit.sources.map((source) => `${providerLabel(source.provider)}: ${sourceStatusInterpretation(source)}`))].join(", ") || "Brak podłączonych źródeł";
  const gscComparisons = unit.metrics.filter((metric) => metric.provider === "google-search-console").map((metric) => `${metric.property_id}: kliknięcia ${comparisonText(metric, "clicks", "count")}; wyświetlenia ${comparisonText(metric, "impressions", "count")}; CTR ${comparisonText(metric, "ctr", "ratio")}; pozycja ${comparisonText(metric, "position", "position")}`);
  const attachmentList = [htmlPath, ...(pdfPath ? [pdfPath] : [])].join(", ");
  const titleText = plainTextValue(unit.title);
  const sourceText = plainTextValue(sourceLabels);
  const comparisonTextValue = plainTextValue(gscComparisons.join(" | "));
  const body = [
    `Dzień dobry,`,
    "",
    `przesyłamy przygotowany raport SEO dla: ${titleText}.`,
    currentPeriod ? `Okres danych: ${currentPeriod.start} — ${currentPeriod.end}.` : "Okres danych: brak porównywalnego zakresu.",
    `Status źródeł: ${sourceText}.`,
    comparisonTextValue ? `Porównanie GSC: ${comparisonTextValue}.` : "Porównanie GSC: brak porównywalnej bazy.",
    "",
    "Raport jest oparty na zweryfikowanych, lokalnych danych źródłowych. Wartości Ahrefs są estymacjami dostawcy, a brak podłączonego źródła nie oznacza wartości zero.",
    "",
    `Pliki w pakiecie: ${attachmentList}.`,
    "",
    "Pozdrawiamy,",
    "Rekurencja.com",
    `Wygenerowano: ${generatedAt}`,
  ].join("\r\n");
  const boundary = `seo-godlike-${safeSegment(unit.id)}-report`;
  const attachmentFiles = [
    { filename: basename(htmlPath), contentType: "text/html", bytes: Buffer.from(htmlContent, "utf8") },
    ...(pdfPath && pdfContent ? [{ filename: basename(pdfPath), contentType: "application/pdf", bytes: pdfContent }] : []),
  ];
  return [
    `Subject: ${subject}`,
    ...(recipient ? [recipient.trimEnd()] : []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary=\"${boundary}\"`,
    "X-SEO-Godlike-Delivery: draft-only",
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
    ...attachmentFiles.flatMap((attachment) => [
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename=\"${headerValue(attachment.filename)}\"`,
      "",
      base64Lines(attachment.bytes),
    ]),
    `--${boundary}--`,
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
  if (options.renderPdf && !options.pdfRenderer) await assertPdfRendererAvailable();
  const summary = await readAgencyReport(options.agencyReportPath, options.artifactsDir);
  if ([options.clientContentPath, options.clientContentBundlePath, options.clientContentRoot].filter(Boolean).length > 1) throw new Error("client content path, bundle and root are mutually exclusive");
  if (options.rankMonitoringPath && options.rankMonitoringRoot) throw new Error("rank monitoring path and root are mutually exclusive");
  const resolvedRankMonitoringRoot = options.rankMonitoringRoot
    ? await resolveRankMonitoringRoot(options.rankMonitoringRoot, options.rankMonitoringArtifactsDir ?? options.artifactsDir)
    : null;
  if (options.rankMonitoringResolvedPath && !resolvedRankMonitoringRoot) throw new Error("rank monitoring resolved path requires rank monitoring root");
  const declaredRankEvidence = summary.rank_monitoring_snapshots ?? (summary.rank_monitoring ? [summary.rank_monitoring] : []);
  const declaredRankPaths = [...new Set(declaredRankEvidence.map((entry) => entry.bundle_path).filter((path): path is string => typeof path === "string" && path.length > 0))];
  const declaredRankPath = resolvedRankMonitoringRoot && declaredRankPaths.length === 1
    ? await resolveExistingInside(resolvedRankMonitoringRoot, relative(resolvedRankMonitoringRoot, resolve(options.artifactsDir, declaredRankPaths[0])), "declared rank monitoring bundle")
    : null;
  const resolvedRankMonitoringPath = options.rankMonitoringResolvedPath
    ? await resolveExistingInside(resolvedRankMonitoringRoot!, relative(resolvedRankMonitoringRoot!, options.rankMonitoringResolvedPath), "rank monitoring resolved bundle")
    : declaredRankPath
      ? declaredRankPath
    : resolvedRankMonitoringRoot
      ? await resolveLatestRankMonitoringBundle(resolvedRankMonitoringRoot, rankMonitoringClientIds(summary.source_status))
      : options.rankMonitoringPath;
  const metrics = await collectMetrics(summary, options.artifactsDir);
  const agencyReportBytes = await readFile(options.agencyReportPath);
  const clientIds = [...new Set(summary.scope.entries.map((entry) => entry.client_id).concat(summary.source_status.map((source) => source.client_id)))].sort();
  const resolvedClientContentBundle = options.clientContentRoot ? await resolveLatestClientContentBundle(options.clientContentRoot, clientIds) : options.clientContentBundlePath;
  const clientContentBundle = resolvedClientContentBundle ? await readClientContentBundle(resolvedClientContentBundle, clientIds) : null;
  const clientContentById = new Map((clientContentBundle?.contents ?? []).map((content) => [content.client_id, content] as const));
  const directClientContent = options.clientContentPath ? await readClientContent(options.clientContentPath) : null;
  if (directClientContent && !clientIds.includes(directClientContent.client_id)) throw new Error(`client content client_id '${directClientContent.client_id}' is outside delivery scope`);
  const keyword = summary.keyword_research;
  const confirmedKeywordClients = (options.confirmedKeywordClients ?? []).map((clientId) => clientId.trim().toLowerCase()).sort();
  if (confirmedKeywordClients.some((clientId) => clientId === "") || new Set(confirmedKeywordClients).size !== confirmedKeywordClients.length) throw new Error("confirmed keyword clients must be non-empty and unique");
  const unmatchedKeywordHosts = (keyword?.input_groups ?? [])
    .map((group) => group.host.toLowerCase())
    .filter((host) => !summary.scope.entries.some((entry) => hostFromProperty(entry.property_id) === host))
    .sort();
  for (const host of unmatchedKeywordHosts) if (!confirmedKeywordClients.includes(host)) throw new Error(`keyword host '${host}' is not an operator-confirmed client`);
  for (const clientId of confirmedKeywordClients) if (!unmatchedKeywordHosts.includes(clientId)) throw new Error(`confirmed keyword client '${clientId}' is not an unmatched keyword host`);
  const sourceManifestHashes = await collectSourceManifestHashes(summary, options.artifactsDir);
  const agencyRunRecord = options.agencyRunRecordPath ? await readAgencyRunRecord(options.agencyRunRecordPath) : null;
  const historyIdentities = summary.accepted_bundles.map((entry) => ({ client_id: entry.client_id, property_id: entry.property_id, provider: entry.provider })).filter((entry): entry is { client_id: string; property_id: string; provider: "google-search-console" | "google-analytics" | "ahrefs" } => entry.provider === "google-search-console" || entry.provider === "google-analytics" || entry.provider === "ahrefs");
  const historyBundlePaths = (summary.history_bundle_paths ?? summary.accepted_bundles.map((entry) => entry.bundle_path))
    .filter((path) => typeof path === "string");
  const acceptedHistoryPaths = new Set(historyBundlePaths.map((path) => resolve(options.artifactsDir, path)));
  const historyEntries = (await readProviderHistory(options.artifactsDir, historyIdentities, historyBundlePaths)).filter((entry) => acceptedHistoryPaths.has(resolve(options.artifactsDir, entry.bundle_path)));
  const keywordManifestSha256 = summary.keyword_research ? await verifyKeywordBundle(summary.keyword_research, options.keywordBundleRoot ?? options.artifactsDir) : null;
  const clientReportFontCss = await loadClientReportFontCss();
  const outputDir = resolve(options.outputDir);
  await mkdir(outputDir, { recursive: false, mode: 0o700 });
  const rankBundle = resolvedRankMonitoringPath ? await readRankMonitoringBundle(resolvedRankMonitoringPath, clientIds) : null;
  const rankHistory = resolvedRankMonitoringRoot && rankBundle ? summarizeRankHistory(await readRankHistory(resolvedRankMonitoringRoot, clientIds)) : null;
  const rankComparisonsByClient = new Map<string, RankHistoryComparison[]>();
  for (const comparison of rankHistory?.comparisons ?? []) {
    const entries = rankComparisonsByClient.get(comparison.client_id) ?? [];
    entries.push(comparison);
    rankComparisonsByClient.set(comparison.client_id, entries);
  }
  if (declaredRankEvidence.length) {
    if (!rankBundle) throw new Error("agency report declares rank monitoring evidence but no rank bundle was supplied");
    for (const declared of declaredRankEvidence) {
      const snapshot = rankBundle.snapshots.find((item) => item.client_id === declared.client_id);
      if (rankBundle.manifest_sha256 !== declared.manifest_sha256 || !snapshot || snapshot.rows.length !== declared.row_count || snapshot.captured_at !== declared.captured_at || snapshot.date_range.start !== declared.date_range.start || snapshot.date_range.end !== declared.date_range.end) throw new Error("rank monitoring evidence does not match agency report provenance");
    }
  }
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
  const units: DeliveryUnit[] = clientIds.map((clientId) => { const content = clientContentById.get(clientId) ?? (directClientContent?.client_id === clientId ? directClientContent : null); const rankMonitoring = rankBundle?.snapshots.find((snapshot) => snapshot.client_id === clientId) ?? null; return { id: clientId, title: summary.scope.entries.find((entry) => entry.client_id === clientId)?.client_display_name ?? clientId, kind: "client", mappingLabel: `Klient: ${clientId}`, sources: summary.source_status.filter((source) => source.client_id === clientId), metrics: metrics.filter((metric) => summary.accepted_bundles.some((bundle) => bundle.client_id === clientId && bundle.property_id === metric.property_id && bundle.provider === metric.provider)), context: summary.cross_source_context.filter((entry) => entry.client_id === clientId), insights: summary.insights.filter((insight) => insight.client_id === clientId), keywordGroups: clientKeywordGroups.get(clientId) ?? [], notes: content ? content.actions.map((action) => `Działanie ${actionStatusLabel(action.status)}: ${action.title}`) : [], content, rankMonitoring, rankHistory: rankComparisonsByClient.get(clientId) ?? [], history: historyEntries.filter((entry) => entry.client_id === clientId) }; });
  if (keyword) {
    for (const inputGroup of keyword.input_groups) {
      if (summary.scope.entries.some((entry) => hostFromProperty(entry.property_id) === inputGroup.host.toLowerCase())) continue;
      const result = keyword.groups.find((group) => group.host === inputGroup.host);
      units.push({ id: inputGroup.host, title: inputGroup.host.replace(/^www\./, ""), kind: "client", mappingLabel: `Klient: ${inputGroup.host}`, sources: [{ client_id: inputGroup.host, property_id: inputGroup.host, provider: "ahrefs-keywords-explorer", status: "ready", reason: "Dane fraz zweryfikowane w bundle Keywords Explorer", bundle_path: keyword.bundle_path }], metrics: [], context: [], insights: [], keywordGroups: [{ group: inputGroup, rows: result?.rows ?? [] }], notes: keyword.notes.filter((note) => note.startsWith(`${inputGroup.host}:`)), content: null, rankMonitoring: null, rankHistory: [], history: [] });
    }
  }
  units.sort((a, b) => compareCodePoint(a.kind, b.kind) || compareCodePoint(a.id, b.id));
  const generatedAt = summary.generated_at;
  const resultUnits: ClientDeliveryResult["units"] = [];
  const operatorAppendices: Record<string, string> = {};
  const outputSegments = new Set<string>();
  for (const unit of units) {
    const unitDir = join(outputDir, safeSegment(unit.id));
    const segment = safeSegment(unit.id);
    if (outputSegments.has(segment)) throw new Error(`delivery unit path collision: ${unit.id}`);
    outputSegments.add(segment);
    await mkdir(unitDir, { recursive: false, mode: 0o700 });
    const htmlName = `${safeSegment(unit.id)}-seo-report.html`;
    const htmlPath = join(unitDir, htmlName);
    const html = unitHtml(unit, generatedAt, clientReportFontCss);
    const appendixName = `${safeSegment(unit.id)}-operator-appendix.html`;
    const appendixPath = join(unitDir, appendixName);
    const appendixHtml = appendClientContent(omitEmptyEvidenceSections(unitAppendixHtml(unit, generatedAt), unit), unit.content, unit.rankMonitoring, unit.rankHistory, unit.history, true, unit.sources);
    await writeFile(htmlPath, html, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await writeFile(appendixPath, appendixHtml, { encoding: "utf8", flag: "wx", mode: 0o600 });
    operatorAppendices[unit.id] = relative(outputDir, appendixPath);
    let pdf: string | null = null;
    if (options.renderPdf) {
      pdf = join(unitDir, `${safeSegment(unit.id)}-seo-report.pdf`);
      await (options.pdfRenderer ?? renderPdf)(htmlPath, pdf);
    }
    const htmlRelative = relative(outputDir, htmlPath);
    const pdfRelative = pdf ? relative(outputDir, pdf) : null;
    const emailRelative = `${safeSegment(unit.id)}/${safeSegment(unit.id)}-seo-report.eml`;
    const pdfContent = pdf ? await readFile(pdf) : null;
    await writeFile(join(outputDir, emailRelative), emailDraft(unit, generatedAt, htmlRelative, pdfRelative, html, pdfContent), { encoding: "utf8", flag: "wx", mode: 0o600 });
    resultUnits.push({ id: unit.id, kind: unit.kind, html: htmlRelative, pdf: pdfRelative, email: emailRelative });
  }
  const index = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SEO intelligence — raporty</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#eef3f2;color:#182431;font:14px/1.55 Inter,Arial,sans-serif}.shell{max-width:1180px;margin:auto;padding:34px 28px 110px}.topline{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:70px}.brand{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#31545d;font-weight:800}.badge{border:1px solid #cfe0dc;border-radius:99px;padding:6px 11px;color:#50716f;background:#f8fbfa;font-size:11px}.hero{max-width:720px}.eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#4e8d72;font-weight:800}.hero h1{font-size:clamp(40px,7vw,78px);line-height:.95;letter-spacing:-.06em;margin:18px 0;color:#12384a}.hero p{font-size:18px;color:#607379;max-width:620px}.dashboard{display:grid;grid-template-columns:1.4fr .9fr;gap:18px;margin-top:58px}.panel{background:#fff;border:1px solid #dce7e8;border-radius:18px;padding:22px;box-shadow:0 14px 35px rgba(24,36,49,.05)}.panel h2{font-size:20px;margin:0 0 6px;color:#12384a}.panel p{color:#718187;margin-top:0}.units{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.unit{display:flex;align-items:center;gap:13px;padding:13px;border:1px solid #e0eaea;border-radius:14px;text-decoration:none;color:#182431}.unit:hover,.unit:focus{border-color:#79b78e;transform:translateY(-1px)}.dot{display:grid;place-items:center;flex:none;width:42px;height:42px;border-radius:50%;background:#123d52;color:#fff;font-size:12px;font-weight:800}.unit strong{display:block}.unit small{color:#708187}.actions{display:flex;gap:10px;flex-wrap:wrap}.actions a{color:#176b70;font-weight:700}.footer{margin-top:52px;color:#7b888e;font-size:11px}@media(max-width:760px){.shell{padding:22px 16px 90px}.topline{margin-bottom:42px}.dashboard{grid-template-columns:1fr}.hero h1{font-size:52px}.hero p{font-size:16px}}
  </style></head><body><main class="shell"><div class="topline"><span class="brand">Rekurencja.com · SEO intelligence</span><span class="badge">lokalny pakiet · bez ponownych zapytań</span></div><section class="hero"><div class="eyebrow">PANEL RAPORTOWY</div><h1>Wyniki SEO.<br>Bez szumu.</h1><p>Minimalistyczny dostęp operatora do osobnych raportów klientów. Każdy widok powstał z istniejących, zweryfikowanych artefaktów; nie wykonano ponownych zapytań do dostawców.</p></section><section class="dashboard"><div class="panel"><div class="eyebrow">KLIENCI</div><h2>Wybierz raport</h2><p>Każdy klient ma własny, odseparowany artefakt.</p><div class="units">${resultUnits.map((unit) => `<a class="unit" href="${escapeHtml(unit.html)}"><span class="dot">${escapeHtml(unitInitials(unit.id, unit.id))}</span><span><strong>${escapeHtml(unit.id)}</strong><small>raport klienta</small></span></a>`).join("")}</div></div><div class="panel"><div class="eyebrow">DOSTĘP OPERATORA</div><h2>Artefakty</h2><p>Raport klienta jest narracyjny. Pełne rekordy pozostają w osobnym appendixie operatorskim.</p><div class="actions"><a href="${escapeHtml(resultUnits[0]?.html ?? "#")}">Otwórz raport</a>${resultUnits[0]?.pdf ? ` · <a href="${escapeHtml(resultUnits[0].pdf)}">Pobierz PDF</a>` : ""}</div><p>${resultUnits.map((unit) => `<a href="${escapeHtml(operatorAppendices[unit.id] ?? "#")}">Appendix: ${escapeHtml(unit.id)}</a> · <a href="${escapeHtml(unit.email)}">Draft email</a>`).join(" · ")}</p><p class="footer">Pełne dane, hashe i ograniczenia znajdują się w manifeście tego pakietu.</p></div></section></main></body></html>`;
  await writeFile(join(outputDir, "index.html"), index, { encoding: "utf8", flag: "wx", mode: 0o600 });
  const files: Record<string, string | Buffer> = { "index.html": index };
  for (const unit of resultUnits) { files[unit.html] = await readFile(join(outputDir, unit.html), "utf8"); files[operatorAppendices[unit.id]!] = await readFile(join(outputDir, operatorAppendices[unit.id]!), "utf8"); if (unit.pdf) files[unit.pdf] = await readFile(join(outputDir, unit.pdf)); files[unit.email] = await readFile(join(outputDir, unit.email), "utf8"); }
  const manifest = { schema_version: "1", source: "agency-report.json", agency_report_sha256: hashBytes(agencyReportBytes), agency_run_record_sha256: agencyRunRecord?.sha256 ?? null, source_manifest_sha256: sourceManifestHashes, history_manifest_sha256: [...new Set(historyEntries.map((entry) => entry.manifest_sha256))].sort(), rank_history_source_manifest_sha256: [...new Set(rankHistory?.snapshots.map((entry) => entry.manifest_sha256) ?? [])].sort(), keyword_manifest_sha256: keywordManifestSha256, confirmed_keyword_clients: confirmedKeywordClients, client_content_sha256: clientContentBundle ? null : options.clientContentPath ? hashBytes(await readFile(options.clientContentPath)) : null, client_content_manifest_sha256: clientContentBundle?.manifest_sha256 ?? null, rank_monitoring_manifest_sha256: rankBundle?.manifest_sha256 ?? null, execution: { provider_calls: 0, network_policy: options.renderPdf ? options.pdfRenderer ? "renderer_custom" : "renderer_network_isolated" : "no_renderer" }, units: resultUnits, operator_appendices: operatorAppendices, files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { sha256: hashBytes(content), bytes: Buffer.byteLength(content) }])) };
  await writeFile(join(outputDir, "manifest.json"), canonicalJson(manifest), { encoding: "utf8", flag: "wx", mode: 0o600 });
  const verifiedManifestHashes = new Set<string>([
    ...Object.values(sourceManifestHashes),
    ...historyEntries.map((entry) => entry.manifest_sha256),
    ...(keywordManifestSha256 ? [keywordManifestSha256] : []),
    ...(rankBundle ? [rankBundle.manifest_sha256] : []),
    ...(rankHistory?.snapshots.map((entry) => entry.manifest_sha256) ?? []),
    ...(clientContentBundle ? [clientContentBundle.manifest_sha256] : []),
  ]);
  return { output_dir: outputDir, units: resultUnits, manifests_verified: 1 + verifiedManifestHashes.size };
}
