import { mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { canonicalJson, sha256 } from "./serialize.js";
import { resolveExistingInside } from "./path-confinement.js";

export interface RankRow { keyword: string; position: number | null; previous_position: number | null; search_engine: string; location: string | null; device: string | null; url: string | null; }
export interface RankMonitoringSourceConfig { project_id: string; search_engine: string; location: string | null; device: string | null; }
export interface RankMonitoringSnapshot { schema_version: "1"; provider: "serprobot"; client_id: string; captured_at: string; date_range: { start: string; end: string }; source_config: RankMonitoringSourceConfig | null; rows: RankRow[]; input_sha256?: string; import_mode?: "normalized_json" | "normalized_csv"; }
export interface RankMonitoringBundle { snapshot: RankMonitoringSnapshot; snapshots: RankMonitoringSnapshot[]; manifest_sha256: string; }
export const RANK_MONITORING_PROVIDER = "serprobot" as const;
export const RANK_MONITORING_SOURCE_LABEL = "Observed — SERPROBOT rank snapshot" as const;

export interface RankMonitoringCsvOptions {
  client_id: string;
  project_id: string;
  captured_at: string;
  date_range: { start: string; end: string };
  search_engine: string;
  location?: string | null;
  device?: string | null;
}

export function rankMonitoringClientIds(sources: readonly { provider: string; client_id: string }[]): string[] {
  return [...new Set(sources.filter((source) => source.provider === RANK_MONITORING_PROVIDER).map((source) => source.client_id))].sort();
}

export async function resolveRankMonitoringRoot(rootDir: string, artifactsDir: string): Promise<string> {
  const [realArtifacts, realRoot] = await Promise.all([realpath(resolve(artifactsDir)), realpath(resolve(rootDir))]);
  if (realRoot !== realArtifacts && !realRoot.startsWith(`${realArtifacts}${sep}`)) throw new Error("rank monitoring root escapes artifacts directory");
  return realRoot;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function nullableRank(value: unknown, label: string): number | null { if (value === null || value === undefined) return null; if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer or null`); return value; }
function nullableString(value: unknown, label: string): string | null { if (value === null || value === undefined) return null; if (typeof value !== "string") throw new Error(`${label} must be a string or null`); return value; }

export function parseRankMonitoringSnapshot(value: unknown): RankMonitoringSnapshot {
  if (!record(value) || value.schema_version !== "1" || value.provider !== RANK_MONITORING_PROVIDER) throw new Error("rank monitoring snapshot must declare schema_version '1' and provider 'serprobot'");
  if (typeof value.client_id !== "string" || typeof value.captured_at !== "string" || Number.isNaN(Date.parse(value.captured_at)) || !record(value.date_range) || typeof value.date_range.start !== "string" || typeof value.date_range.end !== "string" || !Array.isArray(value.rows)) throw new Error("invalid rank monitoring snapshot metadata");
  const configValue = value.source_config;
  let source_config: RankMonitoringSourceConfig | null = null;
  if (configValue !== null && configValue !== undefined) {
    if (!record(configValue) || typeof configValue.project_id !== "string" || !/^[1-9]\d*$/.test(configValue.project_id) || typeof configValue.search_engine !== "string") throw new Error("invalid SERPROBOT source configuration");
    source_config = { project_id: configValue.project_id, search_engine: configValue.search_engine, location: nullableString(configValue.location, "source_config.location"), device: nullableString(configValue.device, "source_config.device") };
  }
  const rows = value.rows.map((row, index) => { if (!record(row) || typeof row.keyword !== "string" || typeof row.search_engine !== "string") throw new Error(`invalid rank row ${index}`); return { keyword: row.keyword, position: nullableRank(row.position, `rank row ${index}.position`), previous_position: nullableRank(row.previous_position, `rank row ${index}.previous_position`), search_engine: row.search_engine, location: nullableString(row.location, `rank row ${index}.location`), device: nullableString(row.device, `rank row ${index}.device`), url: nullableString(row.url, `rank row ${index}.url`) }; }).sort((a, b) => a.keyword.localeCompare(b.keyword) || a.search_engine.localeCompare(b.search_engine) || (a.location ?? "").localeCompare(b.location ?? "") || (a.device ?? "").localeCompare(b.device ?? "") || (a.position ?? Infinity) - (b.position ?? Infinity));
  const input_sha256 = value.input_sha256 === undefined ? undefined : typeof value.input_sha256 === "string" && /^[a-f0-9]{64}$/.test(value.input_sha256) ? value.input_sha256 : (() => { throw new Error("rank monitoring input_sha256 must be a lowercase SHA-256 hash"); })();
  const import_mode = value.import_mode === undefined ? undefined : value.import_mode === "normalized_json" || value.import_mode === "normalized_csv" ? value.import_mode : (() => { throw new Error("rank monitoring import_mode is unsupported"); })();
  return { schema_version: "1", provider: "serprobot", client_id: value.client_id, captured_at: value.captured_at, date_range: { start: value.date_range.start, end: value.date_range.end }, source_config, rows, ...(input_sha256 ? { input_sha256 } : {}), ...(import_mode ? { import_mode } : {}) };
}

function parseRankMonitoringCollection(value: unknown): RankMonitoringSnapshot[] {
  if (record(value) && Array.isArray(value.snapshots)) {
    const snapshots = value.snapshots.map((item, index) => {
      try { return parseRankMonitoringSnapshot(item); }
      catch (error) { throw new Error(`rank monitoring snapshots[${index}] invalid: ${error instanceof Error ? error.message : String(error)}`); }
    });
    if (snapshots.length === 0) throw new Error("rank monitoring collection must contain at least one snapshot");
    const ids = new Set<string>();
    for (const snapshot of snapshots) {
      if (ids.has(snapshot.client_id)) throw new Error(`duplicate rank monitoring client identity: ${snapshot.client_id}`);
      ids.add(snapshot.client_id);
    }
    return snapshots.sort((a, b) => a.client_id.localeCompare(b.client_id));
  }
  return [parseRankMonitoringSnapshot(value)];
}

export async function readRankMonitoringBundle(bundleDir: string, expectedClientIds: readonly string[], options: { filterForeignClients?: boolean } = {}): Promise<RankMonitoringBundle> {
  const safeBundleDir = await resolveExistingInside(resolve(bundleDir), ".", "rank monitoring bundle");
  const manifestBytes = await readFile(await resolveExistingInside(safeBundleDir, "manifest.json", "rank monitoring manifest"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as { files?: Record<string, { sha256?: unknown; bytes?: unknown }> };
  const entry = manifest.files?.["report.json"];
  if (!entry || typeof entry.sha256 !== "string" || typeof entry.bytes !== "number") throw new Error("invalid rank monitoring manifest");
  const reportBytes = await readFile(await resolveExistingInside(safeBundleDir, "report.json", "rank monitoring report"));
  if (reportBytes.byteLength !== entry.bytes || sha256(reportBytes.toString("utf8")) !== entry.sha256) throw new Error("rank monitoring manifest hash mismatch");
  const snapshots = parseRankMonitoringCollection(JSON.parse(reportBytes.toString("utf8")) as unknown);
  const foreign = snapshots.filter((snapshot) => !expectedClientIds.includes(snapshot.client_id));
  if (foreign.length && !options.filterForeignClients) throw new Error(`rank monitoring client identity mismatch: ${foreign[0]!.client_id}`);
  const scopedSnapshots = options.filterForeignClients ? snapshots.filter((snapshot) => expectedClientIds.includes(snapshot.client_id)) : snapshots;
  if (scopedSnapshots.length === 0) throw new Error(`rank monitoring client identity mismatch: ${foreign[0]?.client_id ?? "no expected client"}`);
  return { snapshot: scopedSnapshots[0]!, snapshots: scopedSnapshots, manifest_sha256: sha256(manifestBytes.toString("utf8")) };
}

export async function resolveLatestRankMonitoringBundle(rootDir: string, expectedClientIds: readonly string[]): Promise<string> {
  if (expectedClientIds.length === 0) throw new Error("rank monitoring root requires at least one expected client");
  const candidates: Array<{ path: string; bundle: RankMonitoringBundle }> = [];
  const root = await realpath(resolve(rootDir));
  const insideRoot = (path: string): boolean => path === root || path.startsWith(`${root}${sep}`);
  const seenDirectories = new Set<string>();
  const seenManifests = new Set<string>();
  async function inspect(directory: string): Promise<void> {
    const realDirectory = await realpath(directory);
    if (!insideRoot(realDirectory) || seenDirectories.has(realDirectory)) return;
    seenDirectories.add(realDirectory);
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    const manifestEntry = entries.find((entry) => entry.isFile() && entry.name === "manifest.json") ?? entries.find((entry) => entry.isSymbolicLink() && entry.name === "manifest.json");
    if (manifestEntry) {
      const manifestPath = join(directory, manifestEntry.name);
      const realManifest = await realpath(manifestPath).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      });
      if (realManifest) {
        if (!insideRoot(realManifest)) throw new Error(`rank monitoring symlink escapes artifacts root: ${manifestPath}`);
        if (!seenManifests.has(realManifest)) {
          seenManifests.add(realManifest);
          let manifestValue: unknown;
          try { manifestValue = JSON.parse(await readFile(manifestPath, "utf8")) as unknown; }
          catch (error) { throw new Error(`invalid rank monitoring manifest: ${manifestPath}`, { cause: error }); }
          if (record(manifestValue) && manifestValue.provider === RANK_MONITORING_PROVIDER && manifestValue.artifact_type !== "rank-history-dashboard") {
            try {
              const bundle = await readRankMonitoringBundle(directory, expectedClientIds);
              const ids = new Set(bundle.snapshots.map((snapshot) => snapshot.client_id));
              if (expectedClientIds.every((clientId) => ids.has(clientId))) candidates.push({ path: directory, bundle });
            } catch (error) {
              if (!(error instanceof Error) || !error.message.startsWith("rank monitoring client identity mismatch:")) throw error;
            }
          }
        }
      }
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "manifest.json") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await inspect(path);
      else if (entry.isSymbolicLink()) {
        const realPath = await realpath(path).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw error;
        });
        if (!realPath) continue;
        if (!insideRoot(realPath)) continue;
        const target = await stat(path);
        if (target.isDirectory()) await inspect(path);
      }
    }
  }
  await inspect(root);
  candidates.sort((a, b) => {
    const aCaptured = Math.max(...a.bundle.snapshots.map((snapshot) => Date.parse(snapshot.captured_at)));
    const bCaptured = Math.max(...b.bundle.snapshots.map((snapshot) => Date.parse(snapshot.captured_at)));
    return bCaptured - aCaptured || b.bundle.snapshots[0]!.date_range.end.localeCompare(a.bundle.snapshots[0]!.date_range.end) || a.path.localeCompare(b.path);
  });
  const selected = candidates[0];
  if (!selected) throw new Error(`no complete rank monitoring bundle found for clients: ${expectedClientIds.join(", ")}`);
  return selected.path;
}

async function writeRankMonitoringSnapshots(snapshots: RankMonitoringSnapshot[], outputDir: string, provenance: { input_sha256: string; import_mode: "normalized_json" | "normalized_csv" }): Promise<RankMonitoringBundle> {
  const report = canonicalJson(snapshots.length === 1 ? { ...snapshots[0], ...provenance } : { schema_version: "1", provider: RANK_MONITORING_PROVIDER, snapshots: snapshots.map((snapshot) => ({ ...snapshot, ...provenance })), ...provenance });
  const snapshot = snapshots[0]!;
  await mkdir(outputDir, { recursive: false, mode: 0o700 });
  const manifest = canonicalJson({ schema_version: "1", provider: RANK_MONITORING_PROVIDER, import_mode: provenance.import_mode, input_sha256: provenance.input_sha256, client_id: snapshots.length === 1 ? snapshot.client_id : "multi-client", client_ids: snapshots.map((item) => item.client_id), files: { "report.json": { sha256: sha256(report), bytes: Buffer.byteLength(report) } } });
  await writeFile(join(outputDir, "report.json"), report, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await writeFile(join(outputDir, "manifest.json"), manifest, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return { snapshot, snapshots, manifest_sha256: sha256(manifest) };
}

export async function writeRankMonitoringBundle(inputPath: string, outputDir: string): Promise<RankMonitoringBundle> {
  const input = await readFile(inputPath, "utf8");
  return writeRankMonitoringSnapshots(parseRankMonitoringCollection(JSON.parse(input) as unknown), outputDir, { input_sha256: sha256(input), import_mode: "normalized_json" });
}

function parseCsvLine(line: string, lineNumber: number): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(cell); cell = "";
    } else cell += character;
  }
  if (quoted) throw new Error(`rank monitoring CSV line ${lineNumber} has an unterminated quoted field`);
  cells.push(cell);
  return cells;
}

function csvNullableNumber(value: string, label: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer or empty`);
  return parsed;
}

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return parsed.toISOString().slice(0, 10) === value;
}

/**
 * Packs a deliberately normalized CSV export without making a provider request.
 * Required columns: keyword, position. Optional columns may override the
 * snapshot metadata: previous_position, search_engine, location, device, url.
 */
export async function writeRankMonitoringCsvBundle(inputPath: string, outputDir: string, options: RankMonitoringCsvOptions): Promise<RankMonitoringBundle> {
  if (!options.client_id || !/^[1-9]\d*$/.test(options.project_id) || !options.search_engine) throw new Error("rank monitoring CSV metadata is invalid");
  if (Number.isNaN(Date.parse(options.captured_at)) || !validDateOnly(options.date_range.start) || !validDateOnly(options.date_range.end) || options.date_range.start > options.date_range.end) throw new Error("rank monitoring CSV metadata dates are invalid");
  const input = await readFile(inputPath, "utf8");
  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) throw new Error("rank monitoring CSV must contain a header and at least one row");
  const headers = parseCsvLine(lines[0]!, 1).map((header) => header.trim());
  const index = new Map<string, number>();
  headers.forEach((header, position) => { if (!header || index.has(header)) throw new Error(`rank monitoring CSV has duplicate or empty header '${header}'`); index.set(header, position); });
  if (!index.has("keyword") || !index.has("position")) throw new Error("rank monitoring CSV requires keyword and position columns");
  const value = (cells: string[], name: string): string => cells[index.get(name) ?? -1]?.trim() ?? "";
  const rows: RankRow[] = lines.slice(1).map((line, offset) => {
    const cells = parseCsvLine(line, offset + 2);
    const keyword = value(cells, "keyword");
    if (!keyword) throw new Error(`rank monitoring CSV line ${offset + 2} has an empty keyword`);
    const search_engine = value(cells, "search_engine") || options.search_engine;
    return {
      keyword,
      position: csvNullableNumber(value(cells, "position"), `rank monitoring CSV line ${offset + 2}.position`),
      previous_position: csvNullableNumber(value(cells, "previous_position"), `rank monitoring CSV line ${offset + 2}.previous_position`),
      search_engine,
      location: value(cells, "location") || (options.location ?? null),
      device: value(cells, "device") || (options.device ?? null),
      url: value(cells, "url") || null,
    };
  });
  return writeRankMonitoringSnapshots([parseRankMonitoringSnapshot({ schema_version: "1", provider: RANK_MONITORING_PROVIDER, client_id: options.client_id, captured_at: options.captured_at, date_range: options.date_range, source_config: { project_id: options.project_id, search_engine: options.search_engine, location: options.location ?? null, device: options.device ?? null }, rows })], outputDir, { input_sha256: sha256(input), import_mode: "normalized_csv" });
}
