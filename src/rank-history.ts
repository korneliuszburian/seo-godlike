import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { RankMonitoringSnapshot, parseRankMonitoringSnapshot, readRankMonitoringBundle } from "./rank-monitoring.js";

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
  previous_period: { start: string; end: string };
  current_period: { start: string; end: string };
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

async function manifestPaths(root: string): Promise<string[]> {
  const paths: string[] = [];
  async function walk(directory: string): Promise<void> {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name === "manifest.json") paths.push(path);
    }
  }
  await walk(root);
  return paths.sort();
}

async function readRankBundleIfPresent(manifestPath: string, artifactsDir: string): Promise<RankHistoryEntry | null> {
  const bundleDir = resolve(manifestPath, "..");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { files?: Record<string, unknown> };
  if (!isRecord(manifest.files) || !("report.json" in manifest.files)) return null;
  const report = JSON.parse(await readFile(join(bundleDir, "report.json"), "utf8")) as unknown;
  if (!isRecord(report) || report.provider !== "serprobot" || typeof report.client_id !== "string") return null;
  const snapshot = parseRankMonitoringSnapshot(report);
  const verified = await readRankMonitoringBundle(bundleDir, [snapshot.client_id]);
  return {
    bundle_path: relative(resolve(artifactsDir), bundleDir) || ".",
    client_id: verified.snapshot.client_id,
    captured_at: verified.snapshot.captured_at,
    date_range: verified.snapshot.date_range,
    source_config: verified.snapshot.source_config,
    rows: verified.snapshot.rows,
    manifest_sha256: verified.manifest_sha256,
  };
}

function comparisons(snapshots: RankHistoryEntry[]): RankHistoryComparison[] {
  const byClient = new Map<string, RankHistoryEntry[]>();
  for (const snapshot of snapshots) byClient.set(snapshot.client_id, [...(byClient.get(snapshot.client_id) ?? []), snapshot]);
  const result: RankHistoryComparison[] = [];
  for (const [clientId, entries] of byClient) {
    const ordered = [...entries].sort((a, b) => a.date_range.start.localeCompare(b.date_range.start) || a.date_range.end.localeCompare(b.date_range.end) || a.bundle_path.localeCompare(b.bundle_path));
    for (const current of ordered) {
      const previous = [...ordered].filter((candidate) => candidate.date_range.end < current.date_range.start).at(-1);
      if (!previous) continue;
      const previousRows = new Map(previous.rows.map((row) => [row.keyword, row]));
      for (const row of current.rows) {
        const old = previousRows.get(row.keyword);
        if (!old) continue;
        result.push({ client_id: clientId, keyword: row.keyword, previous_period: previous.date_range, current_period: current.date_range, previous_position: old.position, current_position: row.position, position_delta: old.position !== null && row.position !== null ? row.position - old.position : null });
      }
    }
  }
  return result.sort((a, b) => a.client_id.localeCompare(b.client_id) || a.current_period.start.localeCompare(b.current_period.start) || a.keyword.localeCompare(b.keyword));
}

export async function readRankHistory(artifactsDir: string): Promise<RankHistoryEntry[]> {
  const root = resolve(artifactsDir);
  const entries: RankHistoryEntry[] = [];
  for (const manifestPath of await manifestPaths(root)) {
    const entry = await readRankBundleIfPresent(manifestPath, root);
    if (entry) entries.push(entry);
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
    "| Okres | Klient | Fraza | Pozycja | Poprzednio | Delta | Manifest |",
    "| --- | --- | --- | ---: | ---: | ---: | --- |",
    ...summary.comparisons.map((entry) => `| ${entry.current_period.start} — ${entry.current_period.end} | ${entry.client_id} | ${entry.keyword} | ${entry.current_position ?? "—"} | ${entry.previous_position ?? "—"} | ${entry.position_delta ?? "—"} | ${summary.snapshots.find((snapshot) => snapshot.client_id === entry.client_id && snapshot.date_range.start === entry.current_period.start)?.manifest_sha256 ?? "—"} |`),
    "",
  ].join("\n");
}

function html(summary: RankHistorySummary): string {
  const rows = summary.comparisons.map((entry) => `<tr>${[entry.current_period.start, entry.current_period.end, entry.client_id, entry.keyword, String(entry.current_position ?? "—"), String(entry.previous_position ?? "—"), String(entry.position_delta ?? "—")].map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Historia monitoringu fraz</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:1200px;margin:2rem auto;padding:0 1rem;color:#172b36}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:800px}th,td{text-align:left;padding:.55rem;border-bottom:1px solid #dbe5e7}th{background:#eef5f4}</style></head><body><h1>Historia monitoringu fraz</h1><p>Snapshoty: ${summary.snapshot_count}; porównania: ${summary.comparisons.length}.</p><p>Źródło: SERPROBOT. Ujemna delta pozycji oznacza poprawę.</p><div class="table-wrap"><table><thead><tr><th>Od</th><th>Do</th><th>Klient</th><th>Fraza</th><th>Pozycja</th><th>Poprzednio</th><th>Delta</th></tr></thead><tbody>${rows || `<tr><td colspan="7">Brak wspólnych fraz w niepokrywających się okresach.</td></tr>`}</tbody></table></div></body></html>\n`;
}

export async function writeRankHistoryDashboard(artifactsDir: string, outputDir: string): Promise<RankHistorySummary> {
  const summary = summarizeRankHistory(await readRankHistory(artifactsDir));
  await mkdir(resolve(outputDir), { recursive: false });
  await writeFile(join(resolve(outputDir), "rank-history.json"), `${JSON.stringify(summary, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await writeFile(join(resolve(outputDir), "rank-history.md"), markdown(summary), { encoding: "utf8", flag: "wx", mode: 0o600 });
  await writeFile(join(resolve(outputDir), "rank-history.html"), html(summary), { encoding: "utf8", flag: "wx", mode: 0o600 });
  return summary;
}
