import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type HistoryProvider = "google-search-console" | "google-analytics" | "ahrefs";
export type HistoryMetricUnit = "count" | "ratio" | "position";

export interface ProviderHistoryMetric {
  key: string;
  label: string;
  unit: HistoryMetricUnit;
  value: number;
}

export interface ProviderHistoryComparisonMetric {
  previous: number;
  current: number;
  delta: number;
}

export interface ProviderHistoryComparison {
  previous_period: { start: string; end: string };
  metrics: Record<string, ProviderHistoryComparisonMetric>;
}

export interface ProviderHistoryEntry {
  bundle_path: string;
  manifest_sha256: string;
  report_path: string;
  run_id: string;
  client_id: string;
  client_display_name: string;
  property_id: string;
  provider: HistoryProvider;
  generated_at: string;
  period: { start: string; end: string };
  metrics: ProviderHistoryMetric[];
  comparison?: ProviderHistoryComparison;
}

export interface ProviderHistoryIdentity {
  client_id: string;
  property_id: string;
  provider: HistoryProvider;
}

interface ManifestEntry { sha256: string; bytes: number; }
interface Manifest { files: Record<string, ManifestEntry>; }

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }

function parseManifest(value: unknown): Manifest {
  if (!isRecord(value) || !isRecord(value.files)) throw new Error("invalid provider history manifest");
  const files: Record<string, ManifestEntry> = {};
  for (const [name, entry] of Object.entries(value.files)) {
    const hash = isRecord(entry) ? entry.sha256 : undefined;
    const bytes = isRecord(entry) ? entry.bytes : undefined;
    if (name.startsWith("/") || name.split("/").includes("..") || name.includes(`..${sep}`) || typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash) || !Number.isInteger(bytes) || (bytes as number) < 0) throw new Error(`invalid provider history manifest entry '${name}'`);
    files[name] = { sha256: hash, bytes: bytes as number };
  }
  return { files };
}

function normalizeGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid generated_at: ${value}`);
  return date.toISOString();
}

function dateRange(value: unknown): { start: string; end: string } | null {
  if (!isRecord(value) || typeof value.start !== "string" || typeof value.end !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.start) || !/^\d{4}-\d{2}-\d{2}$/.test(value.end) || value.start > value.end) return null;
  return { start: value.start, end: value.end };
}

function metricDefinitions(provider: HistoryProvider, current: Record<string, unknown>): ProviderHistoryMetric[] | null {
  const definitions: Array<[string, string, HistoryMetricUnit]> = provider === "google-search-console"
    ? [["clicks", "Kliknięcia", "count"], ["impressions", "Wyświetlenia", "count"], ["ctr", "CTR", "ratio"], ["position", "Średnia pozycja", "position"]]
    : provider === "google-analytics"
      ? [["sessions", "Sesje", "count"]]
      : [["organic_traffic", "Szacowany ruch organiczny", "count"], ["organic_keywords", "Widoczne frazy", "count"], ["organic_keywords_top_3", "Frazy w Top 3", "count"]];
  if (!definitions.every(([key]) => finite(current[key]))) return null;
  return definitions.map(([key, label, unit]) => ({ key, label, unit, value: current[key] as number }));
}

function parseReport(value: unknown): ProviderHistoryEntry | null {
  if (!isRecord(value) || !["google-search-console", "google-analytics", "ahrefs"].includes(value.provider as string) || typeof value.run_id !== "string" || typeof value.client_id !== "string" || typeof value.generated_at !== "string" || !Array.isArray(value.property_refs) || typeof value.property_refs[0] !== "string" || !isRecord(value.analytics)) return null;
  const period = dateRange(value.analytics.current_date_range);
  const current = isRecord(value.analytics.current) ? value.analytics.current : null;
  const metrics = current ? metricDefinitions(value.provider as HistoryProvider, current) : null;
  if (!period || !metrics) return null;
  return {
    bundle_path: "",
    manifest_sha256: "",
    report_path: "",
    run_id: value.run_id,
    client_id: value.client_id,
    client_display_name: typeof value.client_display_name === "string" ? value.client_display_name : value.client_id,
    property_id: value.property_refs[0],
    provider: value.provider as HistoryProvider,
    generated_at: normalizeGeneratedAt(value.generated_at),
    period,
    metrics,
  };
}

async function manifestPaths(root: string): Promise<string[]> {
  const paths: string[] = [];
  let rootReal: string;
  try { rootReal = await realpath(root); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const seenDirectories = new Set<string>();
  const seenManifests = new Set<string>();
  function insideRoot(path: string): boolean { return path === rootReal || path.startsWith(`${rootReal}${sep}`); }
  async function walk(directory: string): Promise<void> {
    const realDirectory = await realpath(directory);
    if (!insideRoot(realDirectory)) throw new Error(`provider history path escapes artifacts root: ${directory}`);
    if (seenDirectories.has(realDirectory)) return;
    seenDirectories.add(realDirectory);
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name === "manifest.json") paths.push(path);
      else if (entry.isSymbolicLink()) {
        let realPath: string;
        try { realPath = await realpath(path); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
        if (!insideRoot(realPath)) {
          if (entry.name === "manifest.json") throw new Error(`provider history symlink escapes artifacts root: ${path}`);
          continue;
        }
        const target = await stat(path);
        if (target.isDirectory()) await walk(path);
        else if (target.isFile() && entry.name === "manifest.json" && !seenManifests.has(realPath)) {
          seenManifests.add(realPath);
          paths.push(path);
        }
      }
    }
  }
  await walk(root);
  return paths.sort();
}

async function readVerifiedManifest(manifestPath: string, artifactsRoot: string, scope?: ReadonlySet<string>, requiredBundlePaths?: ReadonlySet<string>): Promise<ProviderHistoryEntry | null> {
  const bundleDir = dirname(manifestPath);
  const required = requiredBundlePaths?.has(relative(artifactsRoot, bundleDir)) ?? false;
  let raw: unknown;
  try { raw = JSON.parse(await readFile(join(bundleDir, "report.json"), "utf8")) as unknown; }
  catch (error) {
    if (required) throw new Error(`provider history required report is unreadable: ${join(bundleDir, "report.json")}`, { cause: error });
    return null;
  }
  const candidate = parseReport(raw);
  const rawIdentity = isRecord(raw) && typeof raw.client_id === "string" && Array.isArray(raw.property_refs) && typeof raw.property_refs[0] === "string" && typeof raw.provider === "string" && isRecord(raw.analytics) && "current_date_range" in raw.analytics
    ? JSON.stringify([raw.client_id, raw.property_refs[0], raw.provider])
    : null;
  const inScope = (candidate !== null && scope?.has(JSON.stringify([candidate.client_id, candidate.property_id, candidate.provider]))) || (rawIdentity !== null && scope?.has(rawIdentity));
  if (scope && !inScope && !required) return null;
  if (!candidate) {
    if (scope && !required) throw new Error(`invalid in-scope provider history report: ${join(bundleDir, "report.json")}`);
    return null;
  }
  const manifest = parseManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
  if (!manifest.files["report.json"]) throw new Error(`provider history manifest does not bind report.json: ${manifestPath}`);
  const realBundleDir = await realpath(bundleDir);
  for (const [name, expected] of Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b))) {
    const filePath = resolve(realBundleDir, name);
    const realFilePath = await realpath(filePath);
    if (realFilePath !== realBundleDir && !realFilePath.startsWith(`${realBundleDir}${sep}`)) throw new Error(`provider history manifest entry escapes bundle: ${name}`);
    const bytes = await readFile(realFilePath);
    if (bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) throw new Error(`provider history manifest hash mismatch for '${join(bundleDir, name)}'`);
  }
  const manifestBytes = await readFile(manifestPath);
  candidate.bundle_path = relative(artifactsRoot, bundleDir) || ".";
  candidate.report_path = relative(artifactsRoot, join(bundleDir, "report.md"));
  candidate.manifest_sha256 = sha256(manifestBytes);
  return candidate;
}

function deduplicationKey(entry: ProviderHistoryEntry): string { return JSON.stringify([entry.run_id, entry.client_id, entry.property_id, entry.provider]); }

function adjacent(previous: ProviderHistoryEntry, current: ProviderHistoryEntry): boolean {
  const previousEnd = Date.parse(`${previous.period.end}T00:00:00Z`);
  const currentStart = Date.parse(`${current.period.start}T00:00:00Z`);
  return Number.isFinite(previousEnd) && Number.isFinite(currentStart) && currentStart - previousEnd === 86_400_000;
}

function withComparisons(entries: ProviderHistoryEntry[]): ProviderHistoryEntry[] {
  const groups = new Map<string, ProviderHistoryEntry[]>();
  for (const entry of entries) {
    const key = JSON.stringify([entry.client_id, entry.property_id, entry.provider]);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return entries.map((entry) => {
    const group = [...(groups.get(JSON.stringify([entry.client_id, entry.property_id, entry.provider])) ?? [])].sort((a, b) => a.period.start.localeCompare(b.period.start) || a.period.end.localeCompare(b.period.end) || a.generated_at.localeCompare(b.generated_at) || a.bundle_path.localeCompare(b.bundle_path));
    const index = group.findIndex((candidate) => candidate.bundle_path === entry.bundle_path);
    const previous = index > 0 ? group[index - 1] : undefined;
    if (!previous || !adjacent(previous, entry)) return { ...entry, comparison: undefined };
    const previousByKey = new Map(previous.metrics.map((metric) => [metric.key, metric.value]));
    const comparisonMetrics: Record<string, ProviderHistoryComparisonMetric> = {};
    for (const metric of entry.metrics) {
      const old = previousByKey.get(metric.key);
      if (old !== undefined) comparisonMetrics[metric.key] = { previous: old, current: metric.value, delta: metric.value - old };
    }
    return { ...entry, comparison: { previous_period: previous.period, metrics: comparisonMetrics } };
  });
}

export async function readProviderHistory(artifactsDir: string, identities?: readonly ProviderHistoryIdentity[], requiredBundlePaths?: readonly string[]): Promise<ProviderHistoryEntry[]> {
  const root = resolve(artifactsDir);
  const scope = identities ? new Set(identities.map((identity) => JSON.stringify([identity.client_id, identity.property_id, identity.provider]))) : undefined;
  const required = requiredBundlePaths ? new Set(requiredBundlePaths.map((path) => isAbsolute(path) ? resolve(path) : resolve(root, path))) : undefined;
  if (required) {
    for (const path of required) {
      if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error(`required provider history bundle escapes artifacts root: ${path}`);
    }
  }
  const foundRequired = new Set<string>();
  const entriesByIdentity = new Map<string, ProviderHistoryEntry>();
  for (const manifestPath of await manifestPaths(root)) {
    const bundlePath = resolve(dirname(manifestPath));
    if (required?.has(bundlePath)) foundRequired.add(bundlePath);
    const entry = await readVerifiedManifest(manifestPath, root, scope, required?.has(bundlePath) ? new Set([relative(root, bundlePath)]) : undefined);
    if (!entry) continue;
    const key = deduplicationKey(entry);
    const existing = entriesByIdentity.get(key);
    if (!existing || entry.generated_at > existing.generated_at || (entry.generated_at === existing.generated_at && entry.bundle_path > existing.bundle_path)) entriesByIdentity.set(key, entry);
  }
  for (const path of foundRequired) required?.delete(path);
  if (required?.size) throw new Error(`required provider history bundle was not discovered: ${[...required].sort().join(", ")}`);
  const entries = [...entriesByIdentity.values()].sort((a, b) => a.period.start.localeCompare(b.period.start) || a.period.end.localeCompare(b.period.end) || a.client_id.localeCompare(b.client_id) || a.property_id.localeCompare(b.property_id) || a.provider.localeCompare(b.provider) || a.bundle_path.localeCompare(b.bundle_path));
  return withComparisons(entries);
}
