import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { ScopePlan, SourceRegistry } from "./domain.js";
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

export interface AgencyReportSummary {
  schema_version: "1";
  report_status: "reportable" | "partial" | "blocked";
  generated_at: string;
  scope: ScopePlan;
  source_status: AgencyReportSourceStatus[];
  accepted_bundles: ReportPackageSummary["accepted_bundles"];
  blocked_sources: AgencyReportSourceStatus[];
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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Agency SEO report</title></head><body><h1>Agency SEO report</h1><p>Status: ${escapeHtml(summary.report_status)}; accepted evidence: ${summary.accepted_bundles.length}; blocked sources: ${summary.blocked_sources.length}</p><h2>Source status</h2><table><thead><tr><th>Client</th><th>Property</th><th>Provider</th><th>Status</th><th>Bundle</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table><h2>Evidence reports</h2>${details.map(escapeHtml).map((detail) => `<pre>${detail}</pre>`).join("")}<h2>Limitations</h2><p>Read-only evidence only. Missing access is reported as unavailable, never as zero.</p></body></html>\n`;
}

async function writeExclusive(path: string, content: string): Promise<void> {
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });
}

export async function writeAgencyReport(artifactsDir: string, outputDir: string, scope: ScopePlan, generatedAt = new Date().toISOString(), sourceRegistry: SourceRegistry = { sources: [] }): Promise<AgencyReportSummary> {
  validateSourceRegistry(sourceRegistry);
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
  const summary: AgencyReportSummary = { schema_version: "1", report_status: packageSummary.accepted_bundles.length === 0 ? "blocked" : sourceStatus.some((source) => source.status !== "ready") ? "partial" : "reportable", generated_at: generatedAt, scope, source_status: sourceStatus, accepted_bundles: packageSummary.accepted_bundles, blocked_sources: sourceStatus.filter((source) => source.status !== "ready") };
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
