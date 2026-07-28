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

export interface HistoryEntry {
  bundle_path: string;
  report_path: string;
  run_id: string;
  client_id: string;
  client_display_name: string;
  property_id: string;
  generated_at: string;
  period: { start: string; end: string };
  metrics: AnalyticsMetricSummary;
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
  return { schema_version: "1", bundle_count: entries.length, skipped_bundles: [...skippedBundles].sort(), periods: entries, totals: aggregateTotals(entries) };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function markdown(summary: HistorySummary): string {
  return [
    "# SEO history executive summary",
    "",
    `- Analytics bundles: ${summary.bundle_count}`,
    `- Total clicks: ${summary.totals.clicks}`,
    `- Total impressions: ${summary.totals.impressions}`,
    `- Weighted CTR: ${percent(summary.totals.ctr)}`,
    `- Weighted average position: ${summary.totals.position.toFixed(2)}`,
    ...(summary.skipped_bundles.length > 0 ? [
      "",
      "## Skipped bundles",
      "",
      ...summary.skipped_bundles.map((bundlePath) => `- ${bundlePath}`),
    ] : []),
    "",
    "| Period | Client | Property | Clicks | Impressions | CTR | Position | Bundle |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...summary.periods.map((entry) => `| ${entry.period.start} to ${entry.period.end} | ${entry.client_display_name} | ${entry.property_id} | ${entry.metrics.clicks} | ${entry.metrics.impressions} | ${percent(entry.metrics.ctr)} | ${entry.metrics.position.toFixed(2)} | ${entry.bundle_path} |`),
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
  await writeExclusive(join(outputDir, "executive-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await writeExclusive(join(outputDir, "executive-summary.md"), markdown(summary));
  return summary;
}
