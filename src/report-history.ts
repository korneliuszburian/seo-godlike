import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";

interface ManifestFile {
  sha256: string;
  bytes: number;
}

interface Manifest {
  schema_version?: string;
  run_id?: string;
  files: Record<string, ManifestFile>;
}

interface AnalyticsMetricSummary {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface AnalyticsReportShape {
  run_id: string;
  client_id: string;
  client_display_name?: string;
  property_refs: string[];
  generated_at: string;
  analytics: {
    current_date_range: { start: string; end: string };
    current: AnalyticsMetricSummary;
  };
}

export interface HistoryComparison {
  previous_period: { start: string; end: string };
  clicks_delta: number;
  impressions_delta: number;
  ctr_delta: number;
  position_delta: number;
}

export interface HistoryEntry {
  bundle_path: string;
  manifest_sha256: string;
  report_path: string;
  run_id: string;
  client_id: string;
  client_display_name: string;
  property_id: string;
  generated_at: string;
  period: { start: string; end: string };
  metrics: AnalyticsMetricSummary;
  comparison?: HistoryComparison;
}

export interface HistorySummary {
  schema_version: "1";
  bundle_count: number;
  skipped_bundles: string[];
  periods: HistoryEntry[];
  totals: AnalyticsMetricSummary;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function metricSummary(value: unknown): AnalyticsMetricSummary | null {
  if (!isRecord(value)) return null;
  const metrics = [value.clicks, value.impressions, value.ctr, value.position];
  if (!metrics.every((metric) => typeof metric === "number" && Number.isFinite(metric))) return null;
  return { clicks: value.clicks as number, impressions: value.impressions as number, ctr: value.ctr as number, position: value.position as number };
}

function parseManifest(value: unknown): Manifest {
  if (!isRecord(value) || !isRecord(value.files)) throw new Error("invalid history manifest");
  const files: Record<string, ManifestFile> = {};
  for (const [name, entry] of Object.entries(value.files)) {
    const hash = isRecord(entry) ? entry.sha256 : undefined;
    const bytes = isRecord(entry) ? entry.bytes : undefined;
    if (typeof hash !== "string" || typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < 0) throw new Error(`invalid manifest entry '${name}'`);
    files[name] = { sha256: hash, bytes };
  }
  return { schema_version: typeof value.schema_version === "string" ? value.schema_version : undefined, run_id: typeof value.run_id === "string" ? value.run_id : undefined, files };
}

function parseAnalyticsReport(value: unknown): AnalyticsReportShape | null {
  if (!isRecord(value) || typeof value.run_id !== "string" || typeof value.client_id !== "string" || typeof value.generated_at !== "string" || !Array.isArray(value.property_refs) || typeof value.property_refs[0] !== "string" || !isRecord(value.analytics)) return null;
  const range = value.analytics.current_date_range;
  const current = metricSummary(value.analytics.current);
  if (!isRecord(range) || typeof range.start !== "string" || typeof range.end !== "string" || current === null) return null;
  return {
    run_id: value.run_id,
    client_id: value.client_id,
    client_display_name: typeof value.client_display_name === "string" ? value.client_display_name : undefined,
    property_refs: value.property_refs as string[],
    generated_at: value.generated_at,
    analytics: { current_date_range: { start: range.start, end: range.end }, current },
  };
}

function normalizeGeneratedAt(value: string): string {
  const date = new Date(value);
  if (isNaN(date.getTime())) throw new Error(`invalid generated_at: ${value}`);
  return date.toISOString();
}

async function manifestPaths(root: string): Promise<string[]> {
  const paths: string[] = [];
  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name === "manifest.json") paths.push(path);
    }
  }
  await walk(root);
  return paths.sort((left, right) => left.localeCompare(right));
}

async function readVerifiedBundle(manifestPath: string, artifactsDir: string): Promise<HistoryEntry | null> {
  const bundleDir = dirname(manifestPath);
  const manifest = parseManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
  const verifiedFiles = new Map<string, Buffer>();
  for (const name of Object.keys(manifest.files).sort()) {
    if (name.startsWith("/") || name.split("/").includes("..") || name.includes(`..${sep}`)) throw new Error(`unsafe manifest path '${name}'`);
    const bytes = await readFile(join(bundleDir, name));
    const expected = manifest.files[name];
    if (bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) throw new Error(`manifest hash mismatch for '${join(bundleDir, name)}'`);
    verifiedFiles.set(name, bytes);
  }
  const reportBytes = verifiedFiles.get("report.json");
  if (!reportBytes) return null;
  const report = parseAnalyticsReport(JSON.parse(reportBytes.toString("utf8")) as unknown);
  if (!report) return null;
  return {
    bundle_path: relative(artifactsDir, bundleDir) || ".",
    manifest_sha256: sha256(await readFile(manifestPath)),
    report_path: relative(artifactsDir, join(bundleDir, "report.md")),
    run_id: report.run_id,
    client_id: report.client_id,
    client_display_name: report.client_display_name ?? report.client_id,
    property_id: report.property_refs[0],
    generated_at: normalizeGeneratedAt(report.generated_at),
    period: report.analytics.current_date_range,
    metrics: report.analytics.current,
  };
}

interface HistoryReadResult {
  entries: HistoryEntry[];
  skippedBundles: string[];
}

function deduplicationKey(entry: HistoryEntry): string {
  return JSON.stringify([entry.run_id, entry.client_id, entry.property_id]);
}

async function readHistory(artifactsDir: string): Promise<HistoryReadResult> {
  const root = resolve(artifactsDir);
  const entriesByIdentity = new Map<string, HistoryEntry>();
  const skippedBundles: string[] = [];
  for (const manifestPath of await manifestPaths(root)) {
    const entry = await readVerifiedBundle(manifestPath, root);
    if (!entry) continue;
    const existing = entriesByIdentity.get(deduplicationKey(entry));
    if (!existing) {
      entriesByIdentity.set(deduplicationKey(entry), entry);
      continue;
    }
    if (entry.generated_at > existing.generated_at || (entry.generated_at === existing.generated_at && entry.bundle_path > existing.bundle_path)) {
      process.stderr.write(`warning: duplicate run_id '${entry.run_id}'; skipping bundle '${existing.bundle_path}' (last wins: '${entry.bundle_path}')\n`);
      skippedBundles.push(existing.bundle_path);
      entriesByIdentity.set(deduplicationKey(entry), entry);
    } else {
      process.stderr.write(`warning: duplicate run_id '${entry.run_id}'; skipping bundle '${entry.bundle_path}' (last wins: '${existing.bundle_path}')\n`);
      skippedBundles.push(entry.bundle_path);
    }
  }
  const entries = [...entriesByIdentity.values()];
  return {
    entries: entries.sort((left, right) => left.period.start.localeCompare(right.period.start) || left.period.end.localeCompare(right.period.end) || left.generated_at.localeCompare(right.generated_at) || left.bundle_path.localeCompare(right.bundle_path)),
    skippedBundles: skippedBundles.sort(),
  };
}

export async function readAnalyticsHistory(artifactsDir: string): Promise<HistoryEntry[]> {
  return (await readHistory(artifactsDir)).entries;
}

export async function findPreviousBundleLinks(artifactsDir: string, currentOutputDir: string): Promise<string[]> {
  const current = resolve(currentOutputDir);
  const entries = await readAnalyticsHistory(artifactsDir);
  return entries
    .filter((entry) => resolve(artifactsDir, entry.bundle_path) !== current)
    .map((entry) => relative(current, resolve(artifactsDir, entry.report_path)).split(sep).join("/"))
    .sort();
}

function aggregateTotals(entries: HistoryEntry[]): AnalyticsMetricSummary {
  const clicks = entries.reduce((sum, entry) => sum + entry.metrics.clicks, 0);
  const impressions = entries.reduce((sum, entry) => sum + entry.metrics.impressions, 0);
  const positionWeighted = entries.reduce((sum, entry) => sum + entry.metrics.position * entry.metrics.impressions, 0);
  return { clicks, impressions, ctr: impressions === 0 ? 0 : clicks / impressions, position: impressions === 0 ? 0 : positionWeighted / impressions };
}

export function summarizeHistory(entries: HistoryEntry[], skippedBundles: string[] = []): HistorySummary {
  const grouped = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const key = `${entry.client_id}\u0000${entry.property_id}`;
    const group = grouped.get(key) ?? [];
    group.push(entry);
    grouped.set(key, group);
  }
  const periods = entries.map((entry) => {
    const group = [...(grouped.get(`${entry.client_id}\u0000${entry.property_id}`) ?? [])].sort((a, b) => a.period.start.localeCompare(b.period.start) || a.period.end.localeCompare(b.period.end) || a.generated_at.localeCompare(b.generated_at));
    const index = group.findIndex((candidate) => candidate.run_id === entry.run_id && candidate.bundle_path === entry.bundle_path);
    const previous = index > 0 ? group[index - 1] : undefined;
    if (!previous || previous.period.end >= entry.period.start) return { ...entry, comparison: undefined };
    return { ...entry, comparison: { previous_period: previous.period, clicks_delta: entry.metrics.clicks - previous.metrics.clicks, impressions_delta: entry.metrics.impressions - previous.metrics.impressions, ctr_delta: entry.metrics.ctr - previous.metrics.ctr, position_delta: entry.metrics.position - previous.metrics.position } };
  });
  return { schema_version: "1", bundle_count: entries.length, skipped_bundles: [...skippedBundles].sort(), periods, totals: aggregateTotals(entries) };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function markdown(summary: HistorySummary): string {
  return [
    "# Historia wyników SEO — podsumowanie",
    "",
    `- Zweryfikowane pakiety analityczne: ${summary.bundle_count}`,
    `- Łączne kliknięcia: ${summary.totals.clicks}`,
    `- Łączne wyświetlenia: ${summary.totals.impressions}`,
    `- CTR ważony wyświetleniami: ${percent(summary.totals.ctr)}`,
    `- Średnia pozycja ważona wyświetleniami: ${summary.totals.position.toFixed(2)}`,
    ...(summary.skipped_bundles.length > 0 ? [
      "",
      "## Pominięte pakiety",
      "",
      ...summary.skipped_bundles.map((bundlePath) => `- ${bundlePath}`),
    ] : []),
    "",
    "| Okres | Klient | Właściwość | Kliknięcia | Wyświetlenia | CTR | Pozycja | Delta kliknięć | Delta pozycji | Bundle | Manifest SHA-256 |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ...summary.periods.map((entry) => `| ${entry.period.start} — ${entry.period.end} | ${entry.client_display_name} | ${entry.property_id} | ${entry.metrics.clicks} | ${entry.metrics.impressions} | ${percent(entry.metrics.ctr)} | ${entry.metrics.position.toFixed(2)} | ${entry.comparison?.clicks_delta ?? "—"} | ${entry.comparison?.position_delta.toFixed(2) ?? "—"} | ${entry.bundle_path} | ${entry.manifest_sha256} |`),
    "",
  ].join("\n");
}

function htmlEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function html(summary: HistorySummary): string {
  const rows = summary.periods.map((entry) => [
    entry.period.start,
    entry.period.end,
    entry.client_display_name,
    entry.property_id,
    String(entry.metrics.clicks),
    String(entry.metrics.impressions),
    percent(entry.metrics.ctr),
    String(entry.comparison?.clicks_delta ?? "—"),
    String(entry.comparison?.position_delta.toFixed(2) ?? "—"),
    entry.bundle_path,
    entry.manifest_sha256,
  ].map(htmlEscape).map((value) => `<td>${value}</td>`).join(""));
  const skipped = summary.skipped_bundles.length === 0 ? "" : `<h2>Skipped bundles</h2><ul>${summary.skipped_bundles.map((path) => `<li><code>${htmlEscape(path)}</code></li>`).join("")}</ul>`;
  return [
    "<!doctype html>",
    "<html lang=\"pl\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Historia wyników SEO</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:1200px;margin:2rem auto;padding:0 1rem;color:#172b36}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:900px}th,td{text-align:left;padding:.55rem;border-bottom:1px solid #dbe5e7}th{background:#eef5f4}</style></head><body>",
    "<h1>Historia wyników SEO</h1>",
    `<p>Zweryfikowane pakiety analityczne: ${summary.bundle_count}; kliknięcia: ${summary.totals.clicks}; wyświetlenia: ${summary.totals.impressions}</p>`,
    "<p>Delta jest liczona względem poprzedniego niepokrywającego się okresu tej samej właściwości. Ujemna delta pozycji oznacza poprawę, ponieważ niższa pozycja jest lepsza.</p>",
    skipped,
    "<div class=\"table-wrap\"><table><thead><tr><th>Okres</th><th>Klient</th><th>Właściwość</th><th>Kliknięcia</th><th>Wyświetlenia</th><th>CTR</th><th>Pozycja</th><th>Delta kliknięć</th><th>Delta pozycji</th><th>Bundle</th><th>Manifest SHA-256</th></tr></thead><tbody>",
    ...rows.map((row) => `<tr>${row}</tr>`),
    "</tbody></table></div>",
    "</body></html>",
    "",
  ].join("\n");
}

async function writeExclusive(path: string, content: string): Promise<void> {
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });
}

export async function writeHistoryDashboard(artifactsDir: string, outputDir: string): Promise<HistorySummary> {
  const history = await readHistory(artifactsDir);
  const summary = summarizeHistory(history.entries, history.skippedBundles);
  await mkdir(outputDir, { recursive: false });
  const files = { "executive-summary.json": `${JSON.stringify(summary, null, 2)}\n`, "executive-summary.md": markdown(summary), "executive-summary.html": html(summary) };
  for (const [name, content] of Object.entries(files)) await writeExclusive(join(outputDir, name), content);
  await writeExclusive(join(outputDir, "manifest.json"), JSON.stringify({ schema_version: "1", source_artifacts_dir: resolve(artifactsDir), files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { sha256: sha256(Buffer.from(content)), bytes: Buffer.byteLength(content) }])) }, null, 2) + "\n");
  return summary;
}
