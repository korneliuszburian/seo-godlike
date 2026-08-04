import { mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative, resolve, sep } from "node:path";
import { RankMonitoringSnapshot, readRankMonitoringBundle } from "./rank-monitoring.js";
import { resolveExistingInside } from "./path-confinement.js";

export interface RankHistoryEntry {
  bundle_path: string;
  client_id: string;
  captured_at: string;
  date_range: { start: string; end: string };
  source_config: RankMonitoringSnapshot["source_config"];
  rows: RankMonitoringSnapshot["rows"];
  manifest_sha256: string;
}

export interface RankHistoryComparison {
  client_id: string;
  keyword: string;
  search_engine: string;
  location: string | null;
  device: string | null;
  previous_period: { start: string; end: string };
  current_period: { start: string; end: string };
  manifest_sha256: string;
  previous_manifest_sha256: string;
  previous_position: number | null;
  current_position: number | null;
  position_delta: number | null;
}

export interface RankHistorySummary {
  schema_version: "1";
  snapshot_count: number;
  snapshots: RankHistoryEntry[];
  comparisons: RankHistoryComparison[];
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function markdownCell(value: unknown): string { return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " "); }
function sha256(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }

async function manifestPaths(root: string): Promise<string[]> {
  const paths: string[] = [];
  const realRoot = await realpath(resolve(root));
  const seenDirectories = new Set<string>();
  const seenManifests = new Set<string>();
  const insideRoot = (path: string): boolean => path === realRoot || path.startsWith(`${realRoot}${sep}`);
  async function walk(directory: string): Promise<void> {
    const realDirectory = await realpath(directory);
    if (!insideRoot(realDirectory) || seenDirectories.has(realDirectory)) return;
    seenDirectories.add(realDirectory);
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.name === "manifest.json" && (entry.isFile() || entry.isSymbolicLink())) {
        const realManifest = await realpath(path).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw error;
        });
        if (!realManifest) continue;
        if (!insideRoot(realManifest)) throw new Error(`rank history symlink escapes artifacts root: ${path}`);
        if (!seenManifests.has(realManifest)) {
          seenManifests.add(realManifest);
          paths.push(path);
        }
      } else if (entry.isDirectory()) await walk(path);
      else if (entry.isSymbolicLink()) {
        const realPath = await realpath(path).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw error;
        });
        if (!realPath || !insideRoot(realPath)) continue;
        if ((await stat(path)).isDirectory()) await walk(path);
      }
    }
  }
  await walk(root);
  return paths.sort();
}

async function readRankBundleIfPresent(manifestPath: string, artifactsDir: string, expectedClientIds: readonly string[]): Promise<RankHistoryEntry[]> {
  const bundleDir = await resolveExistingInside(artifactsDir, relative(resolve(artifactsDir), resolve(manifestPath, "..")), "rank history bundle");
  const manifestPathSafe = await resolveExistingInside(bundleDir, "manifest.json", "rank history manifest");
  const manifest = JSON.parse(await readFile(manifestPathSafe, "utf8")) as { provider?: unknown; artifact_type?: unknown; files?: Record<string, unknown> };
  if (manifest.artifact_type === "rank-history-dashboard") return [];
  if (!isRecord(manifest.files) || !("report.json" in manifest.files)) {
    if (manifest.provider === "serprobot") throw new Error(`rank history manifest does not bind report.json: ${manifestPath}`);
    return [];
  }
  const report = JSON.parse(await readFile(await resolveExistingInside(bundleDir, "report.json", "rank history report"), "utf8")) as unknown;
  if (!isRecord(report) || report.provider !== "serprobot") return [];
  let verified: Awaited<ReturnType<typeof readRankMonitoringBundle>>;
  try {
    verified = await readRankMonitoringBundle(bundleDir, expectedClientIds);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("rank monitoring client identity mismatch:")) return [];
    throw error;
  }
  return verified.snapshots.map((snapshot) => ({
    bundle_path: relative(resolve(artifactsDir), bundleDir) || ".",
    client_id: snapshot.client_id,
    captured_at: snapshot.captured_at,
    date_range: snapshot.date_range,
    source_config: snapshot.source_config,
    rows: snapshot.rows,
    manifest_sha256: verified.manifest_sha256,
  }));
}

function immediatelyPrecedes(previous: RankHistoryEntry, current: RankHistoryEntry): boolean {
  const previousEnd = Date.parse(`${previous.date_range.end}T00:00:00Z`);
  const currentStart = Date.parse(`${current.date_range.start}T00:00:00Z`);
  return Number.isFinite(previousEnd) && Number.isFinite(currentStart) && currentStart === previousEnd + 24 * 60 * 60 * 1000;
}

function sameSourceConfiguration(previous: RankHistoryEntry, current: RankHistoryEntry): boolean {
  const previousConfig = previous.source_config;
  const currentConfig = current.source_config;
  if (!previousConfig || !currentConfig) return previousConfig === currentConfig;
  return previousConfig.project_id === currentConfig.project_id
    && previousConfig.search_engine === currentConfig.search_engine
    && (previousConfig.location === null || currentConfig.location === null || previousConfig.location === currentConfig.location)
    && (previousConfig.device === null || currentConfig.device === null || previousConfig.device === currentConfig.device);
}

function comparisons(snapshots: RankHistoryEntry[]): RankHistoryComparison[] {
  const byClient = new Map<string, RankHistoryEntry[]>();
  for (const snapshot of snapshots) byClient.set(snapshot.client_id, [...(byClient.get(snapshot.client_id) ?? []), snapshot]);
  const result: RankHistoryComparison[] = [];
  for (const [clientId, entries] of byClient) {
    const ordered = [...entries].sort((a, b) => a.date_range.start.localeCompare(b.date_range.start) || a.date_range.end.localeCompare(b.date_range.end) || a.bundle_path.localeCompare(b.bundle_path));
    for (const current of ordered) {
      const previous = [...ordered].filter((candidate) => immediatelyPrecedes(candidate, current) && sameSourceConfiguration(candidate, current)).at(-1);
      if (!previous) continue;
      const rowKey = (row: RankHistoryEntry["rows"][number], sourceConfig: RankHistoryEntry["source_config"]): string => [row.keyword, row.search_engine, row.location ?? sourceConfig?.location ?? "", row.device ?? sourceConfig?.device ?? ""].join("\u0000");
      const previousRows = new Map(previous.rows.map((row) => [rowKey(row, previous.source_config), row]));
      for (const row of current.rows) {
        const old = previousRows.get(rowKey(row, current.source_config));
        if (!old) continue;
        result.push({ client_id: clientId, keyword: row.keyword, search_engine: row.search_engine, location: row.location ?? current.source_config?.location ?? null, device: row.device ?? current.source_config?.device ?? null, previous_period: previous.date_range, current_period: current.date_range, manifest_sha256: current.manifest_sha256, previous_manifest_sha256: previous.manifest_sha256, previous_position: old.position, current_position: row.position, position_delta: old.position !== null && row.position !== null ? row.position - old.position : null });
      }
    }
  }
  return result.sort((a, b) => a.client_id.localeCompare(b.client_id) || a.current_period.start.localeCompare(b.current_period.start) || a.keyword.localeCompare(b.keyword) || a.search_engine.localeCompare(b.search_engine) || (a.location ?? "").localeCompare(b.location ?? "") || (a.device ?? "").localeCompare(b.device ?? ""));
}

export async function readRankHistory(artifactsDir: string, expectedClientIds: readonly string[]): Promise<RankHistoryEntry[]> {
  const root = resolve(artifactsDir);
  const entries: RankHistoryEntry[] = [];
  for (const manifestPath of await manifestPaths(root)) {
    entries.push(...await readRankBundleIfPresent(manifestPath, root, expectedClientIds));
  }
  return entries.sort((a, b) => a.date_range.start.localeCompare(b.date_range.start) || a.date_range.end.localeCompare(b.date_range.end) || a.client_id.localeCompare(b.client_id) || a.bundle_path.localeCompare(b.bundle_path));
}

export function summarizeRankHistory(snapshots: RankHistoryEntry[]): RankHistorySummary {
  return { schema_version: "1", snapshot_count: snapshots.length, snapshots: [...snapshots], comparisons: comparisons(snapshots) };
}

function markdown(summary: RankHistorySummary): string {
  return [
    "# Historia monitoringu fraz",
    "",
    `- Zweryfikowane snapshoty: ${summary.snapshot_count}`,
    `- Porównania wspólnych fraz: ${summary.comparisons.length}`,
    "",
    "Pozycja pochodzi z SERPROBOT. Ujemna delta oznacza poprawę, ponieważ niższa pozycja jest lepsza.",
    "",
    "| Okres | Klient | Fraza | Konfiguracja | Pozycja | Poprzednio | Delta | Manifest bieżący | Manifest poprzedni |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |",
    ...summary.comparisons.map((entry) => `| ${markdownCell(`${entry.current_period.start} — ${entry.current_period.end}`)} | ${markdownCell(entry.client_id)} | ${markdownCell(entry.keyword)} | ${markdownCell(`${entry.search_engine} / ${entry.location ?? "—"} / ${entry.device ?? "—"}`)} | ${markdownCell(entry.current_position)} | ${markdownCell(entry.previous_position)} | ${markdownCell(entry.position_delta)} | ${markdownCell(entry.manifest_sha256)} | ${markdownCell(entry.previous_manifest_sha256)} |`),
    "",
  ].join("\n");
}

function html(summary: RankHistorySummary): string {
  const rows = summary.comparisons.map((entry) => `<tr>${[entry.current_period.start, entry.current_period.end, entry.client_id, entry.keyword, `${entry.search_engine} / ${entry.location ?? "—"} / ${entry.device ?? "—"}`, String(entry.current_position ?? "—"), String(entry.previous_position ?? "—"), String(entry.position_delta ?? "—"), entry.manifest_sha256, entry.previous_manifest_sha256].map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Historia monitoringu fraz</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:1200px;margin:2rem auto;padding:0 1rem;color:#172b36}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:1300px}th,td{text-align:left;padding:.55rem;border-bottom:1px solid #dbe5e7}th{background:#eef5f4}</style></head><body><h1>Historia monitoringu fraz</h1><p>Snapshoty: ${summary.snapshot_count}; porównania: ${summary.comparisons.length}.</p><p>Źródło: SERPROBOT. Ujemna delta pozycji oznacza poprawę.</p><div class="table-wrap"><table><thead><tr><th>Od</th><th>Do</th><th>Klient</th><th>Fraza</th><th>Konfiguracja</th><th>Pozycja</th><th>Poprzednio</th><th>Delta</th><th>Manifest bieżący</th><th>Manifest poprzedni</th></tr></thead><tbody>${rows || `<tr><td colspan="10">Brak wspólnych fraz w niepokrywających się okresach.</td></tr>`}</tbody></table></div></body></html>\n`;
}

export async function writeRankHistoryDashboard(artifactsDir: string, outputDir: string, expectedClientIds: readonly string[]): Promise<RankHistorySummary> {
  const summary = summarizeRankHistory(await readRankHistory(artifactsDir, expectedClientIds));
  await mkdir(resolve(outputDir), { recursive: false, mode: 0o700 });
  const files = {
    "rank-history.json": `${JSON.stringify(summary, null, 2)}\n`,
    "rank-history.md": markdown(summary),
    "rank-history.html": html(summary),
  };
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(resolve(outputDir), name), content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  }
  const sourceManifestSha256 = [...new Set(summary.snapshots.map((snapshot) => snapshot.manifest_sha256))].sort();
  await writeFile(join(resolve(outputDir), "manifest.json"), JSON.stringify({
    schema_version: "1",
    provider: "serprobot",
    artifact_type: "rank-history-dashboard",
    source_manifest_sha256: sourceManifestSha256,
    files: Object.fromEntries(Object.entries(files).map(([name, content]) => {
      const bytes = Buffer.from(content);
      return [name, { sha256: sha256(bytes), bytes: bytes.byteLength }];
    })),
  }, null, 2) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
  return summary;
}
