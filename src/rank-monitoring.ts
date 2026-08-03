import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson, sha256 } from "./serialize.js";

export interface RankRow { keyword: string; position: number | null; previous_position: number | null; search_engine: string; location: string | null; url: string | null; }
export interface RankMonitoringSnapshot { schema_version: "1"; provider: "serprobot"; client_id: string; captured_at: string; date_range: { start: string; end: string }; rows: RankRow[]; }

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function nullableNumber(value: unknown, label: string): number | null { if (value === null || value === undefined) return null; if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number or null`); return value; }
function nullableString(value: unknown): string | null { return value === null || value === undefined ? null : typeof value === "string" ? value : null; }

export function parseRankMonitoringSnapshot(value: unknown): RankMonitoringSnapshot {
  if (!record(value) || value.schema_version !== "1" || value.provider !== "serprobot") throw new Error("rank monitoring snapshot must declare schema_version '1' and provider 'serprobot'");
  if (typeof value.client_id !== "string" || typeof value.captured_at !== "string" || !record(value.date_range) || typeof value.date_range.start !== "string" || typeof value.date_range.end !== "string" || !Array.isArray(value.rows)) throw new Error("invalid rank monitoring snapshot metadata");
  const rows = value.rows.map((row, index) => { if (!record(row) || typeof row.keyword !== "string" || typeof row.search_engine !== "string") throw new Error(`invalid rank row ${index}`); return { keyword: row.keyword, position: nullableNumber(row.position, `rank row ${index}.position`), previous_position: nullableNumber(row.previous_position, `rank row ${index}.previous_position`), search_engine: row.search_engine, location: nullableString(row.location), url: nullableString(row.url) }; }).sort((a, b) => a.keyword.localeCompare(b.keyword) || (a.position ?? Infinity) - (b.position ?? Infinity));
  return { schema_version: "1", provider: "serprobot", client_id: value.client_id, captured_at: value.captured_at, date_range: { start: value.date_range.start, end: value.date_range.end }, rows };
}

export async function readRankMonitoringBundle(bundleDir: string, expectedClientIds: readonly string[]): Promise<{ snapshot: RankMonitoringSnapshot; manifest_sha256: string }> {
  const manifestBytes = await readFile(join(bundleDir, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as { files?: Record<string, { sha256?: unknown; bytes?: unknown }> };
  const entry = manifest.files?.["report.json"];
  if (!entry || typeof entry.sha256 !== "string" || typeof entry.bytes !== "number") throw new Error("invalid rank monitoring manifest");
  const reportBytes = await readFile(join(bundleDir, "report.json"));
  if (reportBytes.byteLength !== entry.bytes || sha256(reportBytes.toString("utf8")) !== entry.sha256) throw new Error("rank monitoring manifest hash mismatch");
  const snapshot = parseRankMonitoringSnapshot(JSON.parse(reportBytes.toString("utf8")) as unknown);
  if (!expectedClientIds.includes(snapshot.client_id)) throw new Error("rank monitoring client identity mismatch");
  return { snapshot, manifest_sha256: sha256(manifestBytes.toString("utf8")) };
}

export async function writeRankMonitoringBundle(inputPath: string, outputDir: string): Promise<{ snapshot: RankMonitoringSnapshot; manifest_sha256: string }> {
  const snapshot = parseRankMonitoringSnapshot(JSON.parse(await readFile(inputPath, "utf8")) as unknown);
  const report = canonicalJson(snapshot);
  await mkdir(outputDir, { recursive: false, mode: 0o700 });
  const manifest = canonicalJson({ schema_version: "1", provider: "serprobot", client_id: snapshot.client_id, files: { "report.json": { sha256: sha256(report), bytes: Buffer.byteLength(report) } } });
  await writeFile(join(outputDir, "report.json"), report, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await writeFile(join(outputDir, "manifest.json"), manifest, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return { snapshot, manifest_sha256: sha256(manifest) };
}
