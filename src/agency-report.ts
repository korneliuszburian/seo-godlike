import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { ClientRegistry, ScopePlan, SourceRegistry } from "./domain.js";
import { ReportPackageSummary, writeReportPackage } from "./report-package.js";
import { canonicalJson, sha256 } from "./serialize.js";
import { validateSourceRegistry } from "./source-registry.js";

interface AgencyReportSourceStatus {
  source_id?: string;
  client_id: string;
  property_id: string;
  provider: string;
  status: "ready" | "unavailable" | "unsupported";
  reason: string | null;
  bundle_path: string | null;
}

export interface CrossSourceContextEntry {
  client_id: string;
  key_type: "page" | "query";
  key: string;
  gsc: { clicks: number; impressions: number; ctr: number; position: number };
  ahrefs: { estimated_traffic: number | null; position: number | null; keywords: number | null; ranking_url: string | null };
}

export interface AgencyReportSummary {
  schema_version: "1";
  report_status: "reportable" | "partial" | "blocked";
  generated_at: string;
  scope: ScopePlan;
  source_status: AgencyReportSourceStatus[];
  accepted_bundles: ReportPackageSummary["accepted_bundles"];
  blocked_sources: AgencyReportSourceStatus[];
  cross_source_context: CrossSourceContextEntry[];
}

function normalizedUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "") || "/"}${url.search}`;
  } catch { return null; }
}

function normalizedText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().toLocaleLowerCase("pl-PL") : null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function composeCrossSourceContext(reports: Array<{ client_id: string; provider: string; analytics: Record<string, unknown> }>): CrossSourceContextEntry[] {
  const result: CrossSourceContextEntry[] = [];
  const clientIds = [...new Set(reports.map((report) => report.client_id))].sort();
  for (const clientId of clientIds) {
    const gsc = reports.find((report) => report.client_id === clientId && report.provider === "google-search-console");
    const ahrefs = reports.find((report) => report.client_id === clientId && report.provider === "ahrefs");
    if (!gsc || !ahrefs) continue;
    const gscCurrent = (gsc.analytics.current ?? {}) as Record<string, unknown>;
    const ahrefsCurrent = (ahrefs.analytics.current ?? {}) as Record<string, unknown>;
    const ahrefsPages = Array.isArray(ahrefsCurrent.top_pages) ? ahrefsCurrent.top_pages.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : [];
    const ahrefsPageMap = new Map(ahrefsPages.map((row) => [normalizedUrl(row.url ?? row.raw_url), row] as const).filter(([key]) => key));
    const gscPages = Array.isArray(gscCurrent.top_pages) ? gscCurrent.top_pages.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : [];
    for (const row of gscPages) {
      const key = normalizedUrl(row.key);
      const ahrefsRow = key ? ahrefsPageMap.get(key) : undefined;
      if (!key || !ahrefsRow) continue;
      result.push({ client_id: clientId, key_type: "page", key, gsc: { clicks: finiteOrNull(row.clicks) ?? 0, impressions: finiteOrNull(row.impressions) ?? 0, ctr: finiteOrNull(row.ctr) ?? 0, position: finiteOrNull(row.position) ?? 0 }, ahrefs: { estimated_traffic: finiteOrNull(ahrefsRow.sum_traffic), position: finiteOrNull(ahrefsRow.top_keyword_best_position), keywords: finiteOrNull(ahrefsRow.keywords), ranking_url: typeof ahrefsRow.url === "string" ? ahrefsRow.url : typeof ahrefsRow.raw_url === "string" ? ahrefsRow.raw_url : null } });
    }
    const ahrefsKeywords = Array.isArray(ahrefsCurrent.organic_keyword_rows) ? ahrefsCurrent.organic_keyword_rows.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : [];
    const ahrefsKeywordMap = new Map(ahrefsKeywords.map((row) => [normalizedText(row.keyword), row] as const).filter(([key]) => key));
    const gscQueries = Array.isArray(gscCurrent.top_queries) ? gscCurrent.top_queries.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : [];
    for (const row of gscQueries) {
      const key = normalizedText(row.key);
      const ahrefsRow = key ? ahrefsKeywordMap.get(key) : undefined;
      if (!key || !ahrefsRow) continue;
      result.push({ client_id: clientId, key_type: "query", key, gsc: { clicks: finiteOrNull(row.clicks) ?? 0, impressions: finiteOrNull(row.impressions) ?? 0, ctr: finiteOrNull(row.ctr) ?? 0, position: finiteOrNull(row.position) ?? 0 }, ahrefs: { estimated_traffic: finiteOrNull(ahrefsRow.sum_traffic), position: finiteOrNull(ahrefsRow.best_position), keywords: null, ranking_url: typeof ahrefsRow.best_position_url === "string" ? ahrefsRow.best_position_url : null } });
    }
  }
  return result.sort((a, b) => a.client_id.localeCompare(b.client_id) || a.key_type.localeCompare(b.key_type) || a.key.localeCompare(b.key));
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function acceptedBundleFor(source: AgencyReportSourceStatus, packageSummary: ReportPackageSummary): ReportPackageSummary["accepted_bundles"][number] | undefined {
  return packageSummary.accepted_bundles.find((entry) => entry.client_id === source.client_id && entry.property_id === source.property_id && entry.provider === source.provider);
}

function markdown(summary: AgencyReportSummary, details: string[]): string {
  return [
    "# Agency SEO report",
    "",
    `- Status: ${summary.report_status}`,
    `- Generated at: ${summary.generated_at}`,
    `- Scope entries: ${summary.scope.entries.length}`,
    `- Accepted evidence bundles: ${summary.accepted_bundles.length}`,
    `- Blocked sources: ${summary.blocked_sources.length}`,
    "",
    "## Source status",
    "",
    "| Client | Property | Provider | Status | Bundle | Reason |",
    "| --- | --- | --- | --- | --- | --- |",
    ...summary.source_status.map((source) => `| ${source.client_id} | ${source.property_id} | ${source.provider} | ${source.status} | ${source.bundle_path ?? "—"} | ${source.reason ?? "—"} |`),
    "",
    "## Evidence reports",
    "",
    ...details,
    "",
    "## Cross-source context",
    "",
    "GSC values are observed Search Console metrics; Ahrefs values are estimated ranking/traffic context. They are not added together.",
    "",
    "| Client | Type | Key | GSC clicks | GSC impressions | GSC position | Ahrefs traffic | Ahrefs position |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...summary.cross_source_context.slice(0, 100).map((entry) => `| ${entry.client_id} | ${entry.key_type} | ${entry.key} | ${entry.gsc.clicks} | ${entry.gsc.impressions} | ${entry.gsc.position.toFixed(2)} | ${entry.ahrefs.estimated_traffic ?? "—"} | ${entry.ahrefs.position ?? "—"} |`),
    "",
    "## Limitations",
    "",
    "- Only read-only provider operations are included.",
    "- A missing capability or managed profile is reported as unavailable; it is not converted to zero.",
    "- Raw provider payloads remain in the referenced immutable evidence bundles.",
    "",
  ].join("\n");
}

function html(summary: AgencyReportSummary, details: string[]): string {
  const rows = summary.source_status.map((source) => `<tr>${[source.client_id, source.property_id, source.provider, source.status, source.bundle_path ?? "—", source.reason ?? "—"].map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("\n");
  const contextRows = summary.cross_source_context.slice(0, 100).map((entry) => `<tr>${[entry.client_id, entry.key_type, entry.key, entry.gsc.clicks, entry.gsc.impressions, entry.gsc.position.toFixed(2), entry.ahrefs.estimated_traffic ?? "—", entry.ahrefs.position ?? "—"].map((value) => `<td>${escapeHtml(String(value))}</td>`).join("")}</tr>`).join("\n");
  const contextSection = `<h2>Cross-source context</h2><p>GSC values are observed Search Console metrics; Ahrefs values are estimated ranking/traffic context. They are not added together.</p><table><thead><tr><th>Client</th><th>Type</th><th>Key</th><th>GSC clicks</th><th>GSC impressions</th><th>GSC position</th><th>Ahrefs traffic</th><th>Ahrefs position</th></tr></thead><tbody>${contextRows}</tbody></table>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Agency SEO report</title></head><body><h1>Agency SEO report</h1><p>Status: ${escapeHtml(summary.report_status)}; accepted evidence: ${summary.accepted_bundles.length}; blocked sources: ${summary.blocked_sources.length}</p><h2>Source status</h2><table><thead><tr><th>Client</th><th>Property</th><th>Provider</th><th>Status</th><th>Bundle</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table>${contextSection}<h2>Evidence reports</h2>${details.map(escapeHtml).map((detail) => `<pre>${detail}</pre>`).join("")}<h2>Limitations</h2><p>Read-only evidence only. Missing access is reported as unavailable, never as zero.</p></body></html>\n`;
}

async function writeExclusive(path: string, content: string): Promise<void> {
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });
}

export async function writeAgencyReport(artifactsDir: string, outputDir: string, scope: ScopePlan, generatedAt = new Date().toISOString(), sourceRegistry: SourceRegistry = { sources: [] }): Promise<AgencyReportSummary> {
  const clients: ClientRegistry = { clients: [...new Set(scope.entries.map((entry) => entry.client_id))].map((client_id) => ({ client_id, properties: [] })) };
  validateSourceRegistry(sourceRegistry, clients);
  const resolvedArtifacts = resolve(artifactsDir);
  const resolvedOutput = resolve(outputDir);
  await mkdir(resolvedOutput, { recursive: false });
  const packageSummary = await writeReportPackage(resolvedArtifacts, join(resolvedOutput, "package"));
  const propertyStatus = scope.entries.map((entry) => {
    const source: AgencyReportSourceStatus = { client_id: entry.client_id, property_id: entry.property_id, provider: entry.provider, status: entry.status, reason: entry.reason, bundle_path: null };
    const accepted = acceptedBundleFor(source, packageSummary);
    if (accepted) return { ...source, status: "ready" as const, reason: null, bundle_path: accepted.bundle_path };
    return source;
  });
  const externalStatus = sourceRegistry.sources.map((source) => ({ source_id: source.source_id, client_id: source.client_id, property_id: source.target ?? "—", provider: source.provider, status: source.status, reason: source.reason, bundle_path: null } satisfies AgencyReportSourceStatus));
  const sourceStatus = [...propertyStatus, ...externalStatus];
  const reports = await Promise.all(packageSummary.accepted_bundles.map(async (accepted) => JSON.parse(await readFile(join(resolvedArtifacts, accepted.bundle_path, "report.json"), "utf8")) as { client_id: string; provider: string; analytics: Record<string, unknown> }));
  const summary: AgencyReportSummary = { schema_version: "1", report_status: packageSummary.accepted_bundles.length === 0 ? "blocked" : sourceStatus.some((source) => source.status !== "ready") ? "partial" : "reportable", generated_at: generatedAt, scope, source_status: sourceStatus, accepted_bundles: packageSummary.accepted_bundles, blocked_sources: sourceStatus.filter((source) => source.status !== "ready"), cross_source_context: composeCrossSourceContext(reports) };
  const details: string[] = [];
  for (const accepted of packageSummary.accepted_bundles) {
    const path = join(resolvedArtifacts, accepted.bundle_path, "report.md");
    const content = await readFile(path, "utf8");
    details.push(`### ${accepted.provider} — ${accepted.property_id}\n\nEvidence: [${accepted.bundle_path}](../${relative(resolvedOutput, join(resolvedArtifacts, accepted.bundle_path))})\n\n${content}`);
  }
  const files = { "agency-report.json": canonicalJson(summary), "agency-report.md": markdown(summary, details), "agency-report.html": html(summary, details) };
  for (const [name, content] of Object.entries(files)) await writeExclusive(join(resolvedOutput, name), content);
  await writeExclusive(join(resolvedOutput, "manifest.json"), canonicalJson({ schema_version: "1", report_status: summary.report_status, files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { sha256: sha256(content), bytes: Buffer.byteLength(content) }])) }));
  return summary;
}
