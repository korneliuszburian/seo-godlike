import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { canonicalJson, sha256 as hashText } from "./serialize.js";

interface ManifestFile { sha256: string; bytes: number }
interface Manifest { files: Record<string, ManifestFile> }

interface PackageEntry {
  bundle_path: string;
  run_id: string;
  client_id: string;
  client_display_name: string;
  property_id: string;
  provider: "google-search-console" | "google-analytics";
  operation: "search_analytics.query" | "properties.runReport";
  metric_id: "gsc.clicks" | "ga4.sessions";
  value: number;
  period: { start: string; end: string };
  generated_at: string;
}

export interface ReportPackageSummary {
  schema_version: "1";
  package_status: "reportable" | "partial" | "empty";
  bundle_count: number;
  accepted_bundles: PackageEntry[];
  rejected_bundles: Array<{ bundle_path: string; reason: string }>;
  advisory: { fallow: "not_supplied" };
}

interface PackageResult extends ReportPackageSummary {
  outputDir: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseManifest(value: unknown): Manifest {
  if (!isRecord(value) || !isRecord(value.files)) throw new Error("invalid manifest");
  const files: Record<string, ManifestFile> = {};
  for (const [name, entry] of Object.entries(value.files)) {
    if (!isRecord(entry) || typeof entry.sha256 !== "string" || typeof entry.bytes !== "number" || !Number.isInteger(entry.bytes) || entry.bytes < 0) {
      throw new Error(`invalid manifest entry '${name}'`);
    }
    files[name] = { sha256: entry.sha256, bytes: entry.bytes };
  }
  return { files };
}

async function manifestPaths(root: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(directory: string): Promise<void> {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name === "manifest.json") result.push(path);
    }
  }
  await walk(root);
  return result.sort((a, b) => a.localeCompare(b));
}

function normalizeGeneratedAt(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid generated_at: missing");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid generated_at: ${value}`);
  return date.toISOString();
}

function reportEntry(value: unknown, bundlePath: string): PackageEntry {
  if (!isRecord(value) || typeof value.run_id !== "string" || typeof value.client_id !== "string" || typeof value.client_display_name !== "string" || typeof value.generated_at !== "string" || !Array.isArray(value.property_refs) || typeof value.property_refs[0] !== "string" || typeof value.provider !== "string" || typeof value.operation !== "string" || value.evidence_manifest_ref !== "manifest.json" || typeof value.canonical_json_hash !== "string" || !isRecord(value.analytics)) throw new Error("reportability metadata is incomplete");
  const pair = value.provider === "google-search-console" && value.operation === "search_analytics.query"
    ? { provider: "google-search-console" as const, operation: "search_analytics.query" as const, metric_id: "gsc.clicks" as const, value: (value.analytics.current as Record<string, unknown> | undefined)?.clicks }
    : value.provider === "google-analytics" && value.operation === "properties.runReport"
      ? { provider: "google-analytics" as const, operation: "properties.runReport" as const, metric_id: "ga4.sessions" as const, value: (value.analytics.current as Record<string, unknown> | undefined)?.sessions }
      : null;
  if (!pair || typeof pair.value !== "number" || !Number.isFinite(pair.value) || pair.value < 0) throw new Error("unsupported or invalid provider analytics shape");
  const range = value.analytics.current_date_range;
  if (!isRecord(range) || typeof range.start !== "string" || typeof range.end !== "string") throw new Error("invalid current date range");
  return {
    bundle_path: bundlePath,
    run_id: value.run_id,
    client_id: value.client_id,
    client_display_name: value.client_display_name,
    property_id: value.property_refs[0],
    provider: pair.provider,
    operation: pair.operation,
    metric_id: pair.metric_id,
    value: pair.value,
    period: { start: range.start, end: range.end },
    generated_at: normalizeGeneratedAt(value.generated_at),
  };
}

async function readVerifiedEntry(manifestPath: string, artifactsDir: string): Promise<PackageEntry> {
  const bundleDir = dirname(manifestPath);
  const manifest = parseManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
  const files = new Map<string, Buffer>();
  for (const name of Object.keys(manifest.files).sort()) {
    if (name.startsWith("/") || name.split("/").includes("..") || name.includes(`..${sep}`)) throw new Error(`unsafe manifest path '${name}'`);
    const bytes = await readFile(join(bundleDir, name));
    const expected = manifest.files[name];
    if (bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) throw new Error(`manifest hash mismatch for '${join(bundleDir, name)}'`);
    files.set(name, bytes);
  }
  const reportBytes = files.get("report.json");
  if (!reportBytes) throw new Error("reportability metadata is incomplete: report.json missing");
  const report = JSON.parse(reportBytes.toString("utf8")) as Record<string, unknown>;
  const declaredHash = report.canonical_json_hash;
  if (typeof declaredHash !== "string") throw new Error("reportability metadata is incomplete: canonical_json_hash missing");
  const { canonical_json_hash: _, ...reportWithoutHash } = report;
  if (hashText(canonicalJson(reportWithoutHash)) !== declaredHash) throw new Error("canonical_json_hash mismatch");
  return reportEntry(report, relative(artifactsDir, bundleDir) || ".");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function markdown(summary: ReportPackageSummary): string {
  return [
    "# SEO report package",
    "",
    `- Status: ${summary.package_status}`,
    `- Accepted bundles: ${summary.accepted_bundles.length}`,
    `- Rejected bundles: ${summary.rejected_bundles.length}`,
    "- Fallow advisory: not supplied",
    "",
    "## Accepted bundles",
    "",
    "| Period | Client | Property | Provider | Metric | Value | Bundle |",
    "| --- | --- | --- | --- | --- | ---: | --- |",
    ...summary.accepted_bundles.map((entry) => `| ${entry.period.start} to ${entry.period.end} | ${entry.client_display_name} | ${entry.property_id} | ${entry.provider} | ${entry.metric_id} | ${entry.value} | ${entry.bundle_path} |`),
    "",
    ...(summary.rejected_bundles.length === 0 ? [] : ["## Rejected bundles", "", ...summary.rejected_bundles.map((entry) => `- ${entry.bundle_path}: ${entry.reason}`), ""]),
  ].join("\n");
}

function html(summary: ReportPackageSummary): string {
  const rows = summary.accepted_bundles.map((entry) => [entry.period.start, entry.period.end, entry.client_display_name, entry.property_id, entry.provider, entry.metric_id, String(entry.value), entry.bundle_path].map(escapeHtml).map((value) => `<td>${value}</td>`).join(""));
  const rejected = summary.rejected_bundles.length === 0 ? "" : `<h2>Rejected bundles</h2><ul>${summary.rejected_bundles.map((entry) => `<li><code>${escapeHtml(entry.bundle_path)}</code>: ${escapeHtml(entry.reason)}</li>`).join("")}</ul>`;
  return ["<!doctype html>", "<html lang=\"en\"><head><meta charset=\"utf-8\"><title>SEO report package</title></head><body>", "<h1>SEO report package</h1>", `<p>Status: ${escapeHtml(summary.package_status)}; accepted: ${summary.accepted_bundles.length}; rejected: ${summary.rejected_bundles.length}</p>`, rejected, "<table><thead><tr><th>Start</th><th>End</th><th>Client</th><th>Property</th><th>Provider</th><th>Metric</th><th>Value</th><th>Bundle</th></tr></thead><tbody>", ...rows.map((row) => `<tr>${row}</tr>`), "</tbody></table>", "</body></html>", ""].join("\n");
}

async function writeExclusive(path: string, content: string): Promise<void> {
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });
}

export async function writeReportPackage(artifactsDir: string, outputDir: string): Promise<ReportPackageSummary> {
  const root = resolve(artifactsDir);
  const accepted: PackageEntry[] = [];
  const rejected: Array<{ bundle_path: string; reason: string }> = [];
  for (const manifestPath of await manifestPaths(root)) {
    const bundlePath = relative(root, dirname(manifestPath)) || ".";
    try { accepted.push(await readVerifiedEntry(manifestPath, root)); }
    catch (error) { rejected.push({ bundle_path: bundlePath, reason: error instanceof Error ? error.message : String(error) }); }
  }
  accepted.sort((a, b) => a.period.start.localeCompare(b.period.start) || a.period.end.localeCompare(b.period.end) || a.generated_at.localeCompare(b.generated_at) || a.bundle_path.localeCompare(b.bundle_path));
  rejected.sort((a, b) => a.bundle_path.localeCompare(b.bundle_path));
  const summary: ReportPackageSummary = { schema_version: "1", package_status: accepted.length === 0 ? (rejected.length === 0 ? "empty" : "partial") : (rejected.length === 0 ? "reportable" : "partial"), bundle_count: accepted.length, accepted_bundles: accepted, rejected_bundles: rejected, advisory: { fallow: "not_supplied" } };
  const files = { "report-package.json": canonicalJson(summary), "report-package.md": markdown(summary), "report-package.html": html(summary) };
  await mkdir(outputDir, { recursive: false });
  for (const [name, content] of Object.entries(files)) await writeExclusive(join(outputDir, name), content);
  const manifest = { schema_version: "1", package_status: summary.package_status, files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { sha256: hashText(content), bytes: Buffer.byteLength(content) }])) };
  await writeExclusive(join(outputDir, "manifest.json"), canonicalJson(manifest));
  return summary;
}
