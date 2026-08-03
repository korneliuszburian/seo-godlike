import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { ClientRegistry, ScopePlan, SourceRegistry } from "./domain.js";
import { ReportPackageSummary, writeReportPackage } from "./report-package.js";
import { canonicalJson, sha256 } from "./serialize.js";
import { validateSourceRegistry } from "./source-registry.js";
import { composeReportInsights, ReportInsight } from "./report-insights.js";
import { parsePhraseInput, PhraseGroup } from "./ahrefs-keywords.js";
import { RANK_MONITORING_SOURCE_LABEL, rankMonitoringClientIds, readRankMonitoringBundle, RankMonitoringSnapshot } from "./rank-monitoring.js";
import { resolveExistingInside } from "./path-confinement.js";

export type AgencyReportSourceReasonCode = "missing_evidence_bundle" | "no_evidence_path" | "stale_snapshot";

interface AgencyReportSourceStatus {
  source_id?: string;
  client_id: string;
  property_id: string;
  provider: string;
  status: "ready" | "unavailable" | "unsupported";
  reason: string | null;
  reason_code?: AgencyReportSourceReasonCode;
  bundle_path: string | null;
}

export interface CrossSourceContextEntry {
  client_id: string;
  key_type: "page" | "query";
  join_type: "matched" | "gsc_only" | "ahrefs_only";
  key: string;
  gsc: { clicks: number | null; impressions: number | null; ctr: number | null; position: number | null } | null;
  ahrefs: { estimated_traffic: number | null; position: number | null; keywords: number | null; ranking_url: string | null } | null;
}

export interface AgencyExecutiveSummary {
  source_labels: {
    gsc: "Observed — Google Search Console";
    ahrefs: "Estimated — Ahrefs";
    derived: "Derived from listed evidence";
    heuristic: "Rule-based signal — not a recommendation";
    unavailable: "Unavailable — access/profile proof pending";
  };
  observed_gsc: Array<{ client_id: string; property_id: string; date_range: { start: string; end: string }; clicks: number | null; impressions: number | null; ctr: number | null; position: number | null }>;
  estimated_ahrefs: Array<{ client_id: string; property_id: string; organic_traffic: number | null; organic_keywords: number | null; organic_keywords_top_3: number | null }>;
  join_coverage: { matched: number; gsc_only: number; ahrefs_only: number; total: number };
  top_signals: ReportInsight[];
  preview: { context_limit: number; context_shown: number; context_total: number; findings_limit: number; findings_shown: number; findings_total: number };
}

export interface AgencyReportSummary {
  schema_version: "1";
  report_status: "reportable" | "partial" | "blocked";
  generated_at: string;
  scope: ScopePlan;
  source_status: AgencyReportSourceStatus[];
  accepted_bundles: ReportPackageSummary["accepted_bundles"];
  history_bundle_paths?: string[];
  blocked_sources: AgencyReportSourceStatus[];
  cross_source_context: CrossSourceContextEntry[];
  insights: ReportInsight[];
  executive: AgencyExecutiveSummary;
  ahrefs_profile_context?: AhrefsProfileEvidence[];
  keyword_research?: AgencyKeywordResearch;
  rank_monitoring?: AgencyRankMonitoringEvidence;
  rank_monitoring_snapshots?: AgencyRankMonitoringEvidence[];
}

export interface AhrefsProfileEvidence {
  client_id: string;
  property_id: string;
  country: string | null;
  generated_at: string | null;
  top_pages: Array<Record<string, unknown>>;
  organic_keyword_rows: Array<Record<string, unknown>>;
  competitors: Array<Record<string, unknown>>;
}

export interface AgencyRankMonitoringEvidence {
  source_label: typeof RANK_MONITORING_SOURCE_LABEL;
  client_id: string;
  manifest_sha256: string;
  captured_at: string;
  date_range: { start: string; end: string };
  source_config: RankMonitoringSnapshot["source_config"];
  row_count: number;
}

export interface AgencyKeywordResearch {
  source_label: "Estimated — Ahrefs Keywords Explorer";
  country: string;
  input_sha256: string;
  input_groups: PhraseGroup[];
  notes: string[];
  groups: Array<{ host: string; phrases: string[]; rows: Array<Record<string, unknown>> }>;
  bundle_path: string;
  manifest_files: Record<string, { sha256: string; bytes: number }>;
}

export type AgencyInputReport = { client_id: string; client_display_name?: string; property_id?: string; provider: string; operation?: string; generated_at?: string; request?: Record<string, unknown>; analytics: Record<string, unknown> };

const EXECUTIVE_CONTEXT_LIMIT = 25;
const EXECUTIVE_FINDINGS_LIMIT = 5;

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

function safeManifestName(name: string): boolean {
  return !name.startsWith("/") && !name.split("/").includes("..") && !name.includes("..\\") && !name.includes("../");
}

async function readRankMonitoringEvidence(bundlePath: string, clientIds: readonly string[]): Promise<AgencyRankMonitoringEvidence[]> {
  const verified = await readRankMonitoringBundle(resolve(bundlePath), clientIds);
  return verified.snapshots.map((snapshot) => ({
    source_label: RANK_MONITORING_SOURCE_LABEL,
    client_id: snapshot.client_id,
    manifest_sha256: verified.manifest_sha256,
    captured_at: snapshot.captured_at,
    date_range: snapshot.date_range,
    source_config: snapshot.source_config,
    row_count: snapshot.rows.length,
  }));
}

export async function verifyKeywordResearchBundle(bundlePath: string, keywordBundleRoot: string, inputPath?: string): Promise<AgencyKeywordResearch> {
  const resolvedKeywordRoot = resolve(keywordBundleRoot);
  const root = await resolveExistingInside(resolvedKeywordRoot, relative(resolvedKeywordRoot, resolve(bundlePath)) || ".", "keyword bundle");
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as { files?: Record<string, { sha256?: unknown; bytes?: unknown }> };
  if (!manifest.files || typeof manifest.files !== "object") throw new Error("invalid keyword research manifest");
  const verified = new Map<string, string>();
  const manifestFiles: Record<string, { sha256: string; bytes: number }> = {};
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (!safeManifestName(name) || typeof entry.sha256 !== "string" || typeof entry.bytes !== "number" || !Number.isInteger(entry.bytes)) throw new Error(`invalid keyword manifest entry '${name}'`);
    const content = await readFile(await resolveExistingInside(root, name, "keyword manifest entry"), "utf8");
    if (Buffer.byteLength(content) !== entry.bytes || sha256(content) !== entry.sha256) throw new Error(`keyword manifest hash mismatch for '${name}'`);
    verified.set(name, content);
    manifestFiles[name] = { sha256: entry.sha256, bytes: entry.bytes };
  }
  const report = JSON.parse(verified.get("report.json") ?? "null") as Partial<AgencyKeywordResearch> & { provider?: unknown; operation?: unknown; input_sha256?: unknown };
  if (report.provider !== "ahrefs" || report.operation !== "keywords-explorer.overview" || typeof report.input_sha256 !== "string" || !Array.isArray(report.groups)) throw new Error("invalid keyword research report");
  let inputGroups = Array.isArray(report.input_groups) ? report.input_groups : report.groups.map((group) => ({ host: group.host, phrases: group.phrases }));
  let notes = Array.isArray(report.notes) ? report.notes : [];
  if (inputPath) {
    const inputText = await readFile(resolve(inputPath), "utf8");
    if (sha256(inputText) !== report.input_sha256) throw new Error("keyword input hash does not match bundle");
    const parsed = parsePhraseInput(inputText);
    inputGroups = parsed.groups;
    notes = parsed.notes;
  }
  if (typeof report.country !== "string" || !Array.isArray(report.groups) || !report.groups.every((group) => typeof group.host === "string" && Array.isArray(group.phrases) && Array.isArray(group.rows))) throw new Error("invalid keyword research groups");
  const request = JSON.parse(verified.get("request.json") ?? "null") as { provider?: unknown; operation?: unknown; country?: unknown; groups?: unknown };
  if (request.provider !== "ahrefs" || request.operation !== "keywords-explorer.overview" || request.country !== report.country || !Array.isArray(request.groups) || !request.groups.every((group) => typeof group === "object" && group !== null && typeof (group as { host?: unknown }).host === "string" && Array.isArray((group as { phrases?: unknown }).phrases) && (group as { phrases: unknown[] }).phrases.every((phrase) => typeof phrase === "string"))) {
    throw new Error("invalid keyword research request");
  }
  const sortGroups = (groups: Array<{ host: string; phrases: string[] }>): Array<{ host: string; phrases: string[] }> => groups
    .map((group) => ({ host: group.host, phrases: group.phrases }))
    .sort((left, right) => left.host.localeCompare(right.host));
  const requestedGroups = sortGroups((request.groups as Array<{ host: string; phrases: string[] }>));
  const expectedGroups = sortGroups(inputGroups.filter((group) => group.phrases.length > 0));
  const returnedGroups = sortGroups(report.groups as Array<{ host: string; phrases: string[]; rows: Array<Record<string, unknown>> }>);
  if (canonicalJson(requestedGroups) !== canonicalJson(expectedGroups)) throw new Error("keyword request groups do not match supplied input");
  if (canonicalJson(returnedGroups) !== canonicalJson(requestedGroups)) throw new Error("keyword report groups do not match keyword request");
  return { source_label: "Estimated — Ahrefs Keywords Explorer", country: report.country, input_sha256: report.input_sha256, input_groups: inputGroups, notes, groups: report.groups as AgencyKeywordResearch["groups"], bundle_path: relative(resolvedKeywordRoot, root) || ".", manifest_files: manifestFiles };
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
    const ahrefsPageMap = new Map<string, Record<string, unknown>>();
    for (const row of ahrefsPages) { const key = normalizedUrl(row.url ?? row.raw_url); if (key) ahrefsPageMap.set(key, row); }
    const gscPages = Array.isArray(gscCurrent.top_pages) ? gscCurrent.top_pages.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : [];
    const gscPageMap = new Map<string, Record<string, unknown>>();
    for (const row of gscPages) { const key = normalizedUrl(row.key); if (key) gscPageMap.set(key, row); }
    for (const key of new Set([...gscPageMap.keys(), ...ahrefsPageMap.keys()])) {
      const row = gscPageMap.get(key);
      const ahrefsRow = ahrefsPageMap.get(key);
      result.push({ client_id: clientId, key_type: "page", join_type: row && ahrefsRow ? "matched" : row ? "gsc_only" : "ahrefs_only", key, gsc: row ? { clicks: finiteOrNull(row.clicks), impressions: finiteOrNull(row.impressions), ctr: finiteOrNull(row.ctr), position: finiteOrNull(row.position) } : null, ahrefs: ahrefsRow ? { estimated_traffic: finiteOrNull(ahrefsRow.sum_traffic), position: finiteOrNull(ahrefsRow.top_keyword_best_position), keywords: finiteOrNull(ahrefsRow.keywords), ranking_url: typeof ahrefsRow.url === "string" ? ahrefsRow.url : typeof ahrefsRow.raw_url === "string" ? ahrefsRow.raw_url : null } : null });
    }
    const ahrefsKeywords = Array.isArray(ahrefsCurrent.organic_keyword_rows) ? ahrefsCurrent.organic_keyword_rows.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : [];
    const ahrefsKeywordMap = new Map<string, Record<string, unknown>>();
    for (const row of ahrefsKeywords) { const key = normalizedText(row.keyword); if (key) ahrefsKeywordMap.set(key, row); }
    const gscQueries = Array.isArray(gscCurrent.top_queries) ? gscCurrent.top_queries.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : [];
    const gscQueryMap = new Map<string, Record<string, unknown>>();
    for (const row of gscQueries) { const key = normalizedText(row.key); if (key) gscQueryMap.set(key, row); }
    for (const key of new Set([...gscQueryMap.keys(), ...ahrefsKeywordMap.keys()])) {
      const row = gscQueryMap.get(key);
      const ahrefsRow = ahrefsKeywordMap.get(key);
      result.push({ client_id: clientId, key_type: "query", join_type: row && ahrefsRow ? "matched" : row ? "gsc_only" : "ahrefs_only", key, gsc: row ? { clicks: finiteOrNull(row.clicks), impressions: finiteOrNull(row.impressions), ctr: finiteOrNull(row.ctr), position: finiteOrNull(row.position) } : null, ahrefs: ahrefsRow ? { estimated_traffic: finiteOrNull(ahrefsRow.sum_traffic), position: finiteOrNull(ahrefsRow.best_position), keywords: null, ranking_url: typeof ahrefsRow.best_position_url === "string" ? ahrefsRow.best_position_url : null } : null });
    }
  }
  return result.sort((a, b) => a.client_id.localeCompare(b.client_id) || a.key_type.localeCompare(b.key_type) || a.key.localeCompare(b.key));
}

function joinCoverage(context: CrossSourceContextEntry[]): AgencyExecutiveSummary["join_coverage"] {
  const coverage = { matched: 0, gsc_only: 0, ahrefs_only: 0, total: context.length };
  for (const entry of context) coverage[entry.join_type] += 1;
  return coverage;
}

function finiteMetric(value: unknown): number | null {
  return finiteOrNull(value);
}

function displayNumber(value: number | null): string {
  return value === null ? "—" : String(value);
}

function displayDecimal(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

function displayPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(2)}%`;
}

function recordRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : [];
}

function profileValue(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (Array.isArray(value)) return value.map(String).join(", ") || "—";
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function profileTrafficDiffPercent(row: Record<string, unknown>): string {
  const canonical = finiteOrNull(row.traffic_diff_percent_ratio);
  if (canonical !== null) return displayPercent(canonical);
  const legacy = finiteOrNull(row.traffic_diff_percent);
  if (legacy === null) return "—";
  // Older normalized bundles stored this field either as a ratio (0.14)
  // or as hundredths of a percent (-230). Render both representations
  // through the same canonical percentage surface.
  return Math.abs(legacy) > 1 ? `${(legacy / 100).toFixed(2)}%` : displayPercent(legacy);
}

function profileColumns(row: Record<string, unknown>, columns: string[]): string[] {
  return columns.map((key) => key === "traffic_diff_percent" ? profileTrafficDiffPercent(row) : profileValue(row, key));
}

function profileIntents(row: Record<string, unknown>): string {
  const labels = ["branded", "commercial", "informational", "local", "navigational", "transactional"];
  const selected = labels.filter((label) => row[`is_${label}`] === true);
  return selected.length ? selected.join(", ") : "—";
}

export function composeAhrefsProfileContext(reports: AgencyInputReport[]): AhrefsProfileEvidence[] {
  return reports
    .filter((report) => report.provider === "ahrefs" && report.operation === "site-explorer.profile")
    .map((report) => {
      const current = (report.analytics.current ?? {}) as Record<string, unknown>;
      const request = report.request ?? {};
      return {
        client_id: report.client_id,
        property_id: report.property_id ?? "—",
        country: typeof request.country === "string" ? request.country : null,
        generated_at: typeof report.generated_at === "string" ? report.generated_at : null,
        top_pages: recordRows(current.top_pages),
        organic_keyword_rows: recordRows(current.organic_keyword_rows),
        competitors: recordRows(current.competitors),
      };
    })
    .sort((a, b) => a.client_id.localeCompare(b.client_id) || a.property_id.localeCompare(b.property_id));
}

function ahrefsProfileMarkdown(profiles: AhrefsProfileEvidence[]): string[] {
  const lines: string[] = [];
  for (const profile of profiles) {
    const scope = `${profile.client_id} | ${profile.property_id} | ${profile.country ?? "—"} | ${profile.generated_at?.slice(0, 10) ?? "—"}`;
    lines.push(`## Estimated — Ahrefs profile: ${scope}`, "", "Wszystkie zwrócone wiersze profilu są zachowane; to ograniczony kontekst estymowany, nie pełna inwentaryzacja.", "");
    lines.push("### Najważniejsze strony", "", "| URL | Szac. ruch | Zmiana ruchu | Zmiana % | Frazy | Główna fraza | Pozycja | Zmiana pozycji | Domeny odsyłające | UR |", "| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |");
    for (const row of profile.top_pages) lines.push(`| ${profileColumns(row, ["url", "sum_traffic", "traffic_diff", "traffic_diff_percent", "keywords", "top_keyword", "top_keyword_best_position", "top_keyword_best_position_diff", "referring_domains", "ur"]).map(markdownCell).join(" | ")} |`);
    if (!profile.top_pages.length) lines.push("| — | — | — | — | — | — | — | — | — | — |");
    lines.push("", "### Frazy organiczne", "", "| Fraza | Kraj | Pozycja | Zmiana pozycji | Zestaw pozycji | URL | Szac. ruch | Poprzedni ruch | Wolumen | KD | Intencje | SERP features | Status |", "| --- | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |");
    for (const row of profile.organic_keyword_rows) lines.push(`| ${["keyword", "keyword_country", "best_position", "best_position_diff", "best_position_set", "best_position_url", "sum_traffic", "sum_traffic_prev", "volume", "keyword_difficulty"].map((key) => markdownCell(profileValue(row, key))).concat([markdownCell(profileIntents(row)), markdownCell(profileValue(row, "serp_features")), markdownCell(profileValue(row, "status"))]).join(" | ")} |`);
    if (!profile.organic_keyword_rows.length) lines.push("| — | — | — | — | — | — | — | — | — | — | — | — | — |");
    lines.push("", "### Konkurenci organiczni", "", "| Domena | DR | Wspólne frazy | Frazy celu | Frazy konkurenta | Udział | Szac. ruch | Zmiana ruchu | Wartość |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const row of profile.competitors) lines.push(`| ${["competitor_domain", "domain_rating", "keywords_common", "keywords_target", "keywords_competitor", "share", "traffic", "traffic_diff", "value"].map((key) => markdownCell(profileValue(row, key))).join(" | ")} |`);
    if (!profile.competitors.length) lines.push("| — | — | — | — | — | — | — | — | — |");
    lines.push("");
  }
  return lines;
}

function rankedContext(context: CrossSourceContextEntry[]): CrossSourceContextEntry[] {
  return [...context].sort((a, b) => {
    const score = (entry: CrossSourceContextEntry): number => entry.gsc?.impressions ?? entry.ahrefs?.estimated_traffic ?? 0;
    return score(b) - score(a) || a.client_id.localeCompare(b.client_id) || a.key_type.localeCompare(b.key_type) || a.key.localeCompare(b.key);
  });
}

export function composeExecutiveSummary(reports: AgencyInputReport[], context: CrossSourceContextEntry[], insights: ReportInsight[]): AgencyExecutiveSummary {
  const observed_gsc = reports.filter((report) => report.provider === "google-search-console").map((report) => {
    const current = (report.analytics.current ?? {}) as Record<string, unknown>;
    const range = (report.analytics.current_date_range ?? {}) as Record<string, unknown>;
    return {
      client_id: report.client_id,
      property_id: report.property_id ?? "—",
      date_range: { start: typeof range.start === "string" ? range.start : "—", end: typeof range.end === "string" ? range.end : "—" },
      clicks: finiteMetric(current.clicks),
      impressions: finiteMetric(current.impressions),
      ctr: finiteMetric(current.ctr),
      position: finiteMetric(current.position),
    };
  }).sort((a, b) => a.client_id.localeCompare(b.client_id) || a.property_id.localeCompare(b.property_id));
  const estimated_ahrefs = reports.filter((report) => report.provider === "ahrefs").map((report) => {
    const current = (report.analytics.current ?? report.analytics) as Record<string, unknown>;
    return {
      client_id: report.client_id,
      property_id: report.property_id ?? "—",
      organic_traffic: finiteMetric(current.organic_traffic),
      organic_keywords: finiteMetric(current.organic_keywords),
      organic_keywords_top_3: finiteMetric(current.organic_keywords_top_3),
    };
  }).sort((a, b) => a.client_id.localeCompare(b.client_id) || a.property_id.localeCompare(b.property_id));
  return {
    source_labels: {
      gsc: "Observed — Google Search Console",
      ahrefs: "Estimated — Ahrefs",
      derived: "Derived from listed evidence",
      heuristic: "Rule-based signal — not a recommendation",
      unavailable: "Unavailable — access/profile proof pending",
    },
    observed_gsc,
    estimated_ahrefs,
    join_coverage: joinCoverage(context),
    top_signals: insights.slice(0, EXECUTIVE_FINDINGS_LIMIT),
    preview: { context_limit: EXECUTIVE_CONTEXT_LIMIT, context_shown: Math.min(context.length, EXECUTIVE_CONTEXT_LIMIT), context_total: context.length, findings_limit: EXECUTIVE_FINDINGS_LIMIT, findings_shown: Math.min(insights.length, EXECUTIVE_FINDINGS_LIMIT), findings_total: insights.length },
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function markdownCell(value: unknown): string {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\r", " ").replaceAll("\n", " ");
}

function acceptedBundleFor(source: AgencyReportSourceStatus, packageSummary: ReportPackageSummary): ReportPackageSummary["accepted_bundles"][number] | undefined {
  return packageSummary.accepted_bundles
    .filter((entry) => entry.client_id === source.client_id && entry.property_id === source.property_id && entry.provider === source.provider)
    .sort((a, b) => b.generated_at.localeCompare(a.generated_at) || b.bundle_path.localeCompare(a.bundle_path))[0];
}

function ahrefsSnapshotFreshForGsc(entry: ReportPackageSummary["accepted_bundles"][number], packageSummary: ReportPackageSummary): boolean {
  if (entry.provider !== "ahrefs") return true;
  const latestGscEnd = packageSummary.accepted_bundles
    .filter((candidate) => candidate.client_id === entry.client_id && candidate.provider === "google-search-console")
    .map((candidate) => candidate.period.end)
    .sort()
    .at(-1);
  return !latestGscEnd || entry.period.end >= latestGscEnd;
}

function contextRows(summary: AgencyReportSummary): CrossSourceContextEntry[] {
  return rankedContext(summary.cross_source_context).slice(0, EXECUTIVE_CONTEXT_LIMIT);
}

function markdown(summary: AgencyReportSummary): string {
  const preview = contextRows(summary);
  const gscRows = summary.executive.observed_gsc.map((entry) => `| ${entry.client_id} | ${entry.property_id} | ${entry.date_range.start} to ${entry.date_range.end} | ${displayNumber(entry.clicks)} | ${displayNumber(entry.impressions)} | ${displayPercent(entry.ctr)} | ${displayDecimal(entry.position)} |`);
  const ahrefsRows = summary.executive.estimated_ahrefs.map((entry) => `| ${entry.client_id} | ${entry.property_id} | ${displayNumber(entry.organic_traffic)} | ${displayNumber(entry.organic_keywords)} | ${displayNumber(entry.organic_keywords_top_3)} |`);
  const keywordSection = summary.keyword_research ? [
    "## Estimated — Ahrefs Keywords Explorer",
    "",
    `- Input groups: ${summary.keyword_research.input_groups.length}`,
    `- Non-empty queried groups: ${summary.keyword_research.groups.length}`,
    `- Returned keyword rows: ${summary.keyword_research.groups.reduce((total, group) => total + group.rows.length, 0)}`,
    `- Country: ${summary.keyword_research.country}`,
    "- Full phrase rows and empty input groups are preserved in the evidence appendix.",
    "",
  ] : [];
  const rankEvidence = summary.rank_monitoring_snapshots ?? (summary.rank_monitoring ? [summary.rank_monitoring] : []);
  const rankSection = rankEvidence.length ? [
    `### ${RANK_MONITORING_SOURCE_LABEL}`,
    "",
    ...rankEvidence.map((entry) => `- Client: ${entry.client_id}; period: ${entry.date_range.start} to ${entry.date_range.end}; returned rows: ${entry.row_count}; manifest SHA-256: ${entry.manifest_sha256}`),
    "",
  ] : [];
  return [
    "# Agency SEO report",
    "",
    `- Status: ${summary.report_status}`,
    `- Generated at: ${summary.generated_at}`,
    `- Scope entries: ${summary.scope.entries.length}`,
    `- Accepted evidence bundles: ${summary.accepted_bundles.length}`,
    `- Blocked sources: ${summary.blocked_sources.length}`,
    "",
    "## Executive summary",
    "",
    "This operator summary separates observed provider data, estimated context, derived coverage, rule-based signals, and unavailable capabilities.",
    "",
    "### Source status",
    "",
    ...summary.source_status.map((source) => `- **${source.provider}** — ${source.status}${source.reason ? `: ${source.reason}` : ""}`),
    "",
    ...rankSection,
    "### Observed — Google Search Console",
    "",
    "| Client | Property | Period | Clicks | Impressions | CTR | Position |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: |",
    ...gscRows,
    "",
    "### Estimated — Ahrefs",
    "",
    "| Client | Property | Organic traffic | Organic keywords | Top 3 keywords |",
    "| --- | --- | ---: | ---: | ---: |",
    ...ahrefsRows,
    "",
    "### Derived from listed evidence: join coverage",
    "",
    `- Matched: ${summary.executive.join_coverage.matched}`,
    `- GSC-only: ${summary.executive.join_coverage.gsc_only}`,
    `- Ahrefs-only: ${summary.executive.join_coverage.ahrefs_only}`,
    `- Total context entries: ${summary.executive.join_coverage.total}`,
    "",
    "### Rule-based signal — not a recommendation",
    "",
    ...summary.executive.top_signals.map((insight) => `- **${insight.kind}** — ${insight.key}: ${insight.evidence} (${insight.severity})`),
    "",
    ...keywordSection,
    "## Opportunities preview",
    "",
    `Showing ${summary.executive.preview.context_shown} of ${summary.executive.preview.context_total} context entries; full appendix available locally in \\[agency-report-appendix.md](agency-report-appendix.md).`,
    "",
    "| Client | Type | Join | Key | GSC clicks | GSC impressions | Ahrefs traffic |",
    "| --- | --- | --- | --- | ---: | ---: | ---: |",
    ...preview.map((entry) => `| ${entry.client_id} | ${entry.key_type} | ${entry.join_type} | ${entry.key} | ${entry.gsc?.clicks ?? "—"} | ${entry.gsc?.impressions ?? "—"} | ${entry.ahrefs?.estimated_traffic ?? "—"} |`),
    "",
    "## Limitations",
    "",
    "- Only read-only provider operations are included.",
    "- A missing capability or managed profile is reported as unavailable; it is not converted to zero.",
    "- Ahrefs values are estimated context, not GSC observations or combined traffic.",
    "- Bounded provider responses are not full inventories; requested and returned row counts remain in evidence manifests.",
    "- Raw provider payloads and the complete tables remain in the referenced immutable evidence bundles and appendix.",
    "",
    "Full evidence: [agency-report-appendix.md](agency-report-appendix.md) · [agency-report-appendix.html](agency-report-appendix.html)",
    "",
  ].join("\n");
}

function html(summary: AgencyReportSummary): string {
  const preview = contextRows(summary).map((entry) => `<tr>${[entry.client_id, entry.key_type, entry.join_type, entry.key, entry.gsc?.clicks ?? "—", entry.gsc?.impressions ?? "—", entry.ahrefs?.estimated_traffic ?? "—"].map((value) => `<td>${escapeHtml(String(value))}</td>`).join("")}</tr>`).join("\n");
  const gscCards = summary.executive.observed_gsc.map((entry) => `<div class="card"><span class="badge observed">Observed — Google Search Console</span><h3>${escapeHtml(entry.client_id)} · ${escapeHtml(entry.property_id)}</h3><p>${displayNumber(entry.clicks)} clicks · ${displayNumber(entry.impressions)} impressions · ${displayPercent(entry.ctr)} CTR · position ${displayDecimal(entry.position)}</p></div>`).join("");
  const ahrefsCards = summary.executive.estimated_ahrefs.map((entry) => `<div class="card"><span class="badge estimated">Estimated — Ahrefs</span><h3>${escapeHtml(entry.client_id)} · ${escapeHtml(entry.property_id)}</h3><p>${displayNumber(entry.organic_traffic)} organic traffic · ${displayNumber(entry.organic_keywords)} keywords · ${displayNumber(entry.organic_keywords_top_3)} Top 3</p></div>`).join("");
  const signals = summary.executive.top_signals.map((insight) => `<li><span class="badge signal">Rule-based signal — not a recommendation</span> ${escapeHtml(insight.kind)} — ${escapeHtml(insight.key)}: ${escapeHtml(insight.evidence)}</li>`).join("");
  const keywordCard = summary.keyword_research ? `<div class="card"><span class="badge estimated">Estimated — Ahrefs Keywords Explorer</span><h3>Phrase research</h3><p>${summary.keyword_research.input_groups.length} input groups · ${summary.keyword_research.groups.reduce((total, group) => total + group.rows.length, 0)} returned rows · ${escapeHtml(summary.keyword_research.country)} market</p></div>` : "";
  const rankEvidence = summary.rank_monitoring_snapshots ?? (summary.rank_monitoring ? [summary.rank_monitoring] : []);
  const rankCard = rankEvidence.map((entry) => `<div class="card"><span class="badge observed">${escapeHtml(RANK_MONITORING_SOURCE_LABEL)}</span><h3>${escapeHtml(entry.client_id)}</h3><p>${escapeHtml(entry.date_range.start)} — ${escapeHtml(entry.date_range.end)} · ${entry.row_count} returned rows</p></div>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agency SEO report</title><style>:root{font-family:system-ui,sans-serif;color:#172033;background:#f6f8fb}body{margin:0;padding:2rem;max-width:1200px;margin-inline:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem}.card,section{background:#fff;border:1px solid #dbe2ec;border-radius:12px;padding:1rem;margin-block:1rem}.badge{display:inline-block;border-radius:999px;padding:.2rem .55rem;font-size:.8rem;font-weight:700}.observed{background:#dceeff;color:#075985}.estimated{background:#eee5ff;color:#5b21b6}.signal{background:#fff1c2;color:#854d0e}.blocked{background:#e5e7eb;color:#374151}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:720px}th,td{text-align:left;padding:.55rem;border-bottom:1px solid #e5e7eb}th{background:#f1f5f9}a{color:#075985}@media print{body{background:#fff;padding:.5rem}.card,section{break-inside:avoid}}</style></head><body><header id="summary"><h1>Agency SEO report</h1><p>Status: <strong>${escapeHtml(summary.report_status)}</strong> · accepted evidence: ${summary.accepted_bundles.length} · blocked sources: ${summary.blocked_sources.length}</p></header><section id="kpis"><h2>Observed and estimated KPIs</h2><div class="grid">${gscCards}${ahrefsCards}${keywordCard}${rankCard}</div></section><section><h2>Source availability</h2><ul>${summary.source_status.map((source) => `<li><strong>${escapeHtml(source.provider)}</strong>: ${escapeHtml(source.status)}${source.reason ? ` — ${escapeHtml(source.reason)}` : ""}</li>`).join("")}</ul></section><section id="queries"><h2>Executive opportunities preview</h2><p>Showing ${summary.executive.preview.context_shown} of ${summary.executive.preview.context_total}; full appendix available locally.</p><div class="table-wrap"><table><thead><tr><th>Client</th><th>Type</th><th>Join</th><th>Key</th><th>GSC clicks</th><th>GSC impressions</th><th>Ahrefs traffic</th></tr></thead><tbody>${preview}</tbody></table></div></section><section><h2>Rule-based signals</h2><ul>${signals}</ul></section><section id="limitations"><h2>Limitations</h2><ul><li>Ahrefs values are estimated context and are not added to GSC metrics.</li><li>Unavailable sources are not converted to zero.</li><li>Bounded responses are not full inventories.</li><li>Signals are not recommendations or causal conclusions.</li></ul><p><a href="agency-report-appendix.html">Open full evidence appendix</a></p></section></body></html>\n`;
}

function appendixMarkdown(summary: AgencyReportSummary, details: string[]): string {
  const profileRows = summary.ahrefs_profile_context ? [
    "## Full Ahrefs site-explorer profile context",
    "",
    "Estimated — Ahrefs. This section preserves every returned row from the bounded profile response; it is not a full inventory and is never added to GSC metrics.",
    "",
    ...ahrefsProfileMarkdown(summary.ahrefs_profile_context),
  ] : [];
  const keywordRows = summary.keyword_research ? [
    "## Full Ahrefs Keywords Explorer phrase research",
    "",
    "Values are estimated provider context. Every supplied input group is retained; no phrase rows are merged into GSC metrics.",
    "",
    "### Supplied input groups",
    "",
    "| Host | Supplied phrases | Returned rows |",
    "| --- | ---: | ---: |",
    ...summary.keyword_research.input_groups.map((group) => `| ${group.host} | ${group.phrases.length} | ${summary.keyword_research?.groups.find((result) => result.host === group.host)?.rows.length ?? 0} |`),
    "",
    ...summary.keyword_research.groups.flatMap((group) => [
      `### ${group.host}`,
      "",
      "| Keyword | Volume | Monthly volume | Global volume | Clicks | CPC | CPS | Difficulty | Traffic potential | Parent topic | Parent volume | Intents | SERP features | SERP last update |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | --- | --- |",
      ...group.rows.map((row) => `| ${[row.keyword, row.volume, row.volume_monthly, row.global_volume, row.clicks, row.cpc, row.cps, row.difficulty, row.traffic_potential, row.parent_topic, row.parent_volume, Array.isArray(row.intents) ? row.intents.join(", ") : row.intents, Array.isArray(row.serp_features) ? row.serp_features.join(", ") : row.serp_features, row.serp_last_update].map(markdownCell).join(" | ")} |`),
      "",
    ]),
    "Notes:",
    ...summary.keyword_research.notes.map((note) => `- ${note}`),
    "",
  ] : [];
  return [
    "# Agency SEO report — evidence appendix",
    "",
    "Full deterministic context and findings. GSC is observed; Ahrefs is estimated context; unavailable sources are not zero.",
    "",
    "## Source status",
    "",
    "| Client | Property | Provider | Status | Bundle | Reason |",
    "| --- | --- | --- | --- | --- | --- |",
    ...summary.source_status.map((source) => `| ${source.client_id} | ${source.property_id} | ${source.provider} | ${source.status} | ${source.bundle_path ?? "—"} | ${source.reason ?? "—"} |`),
    "",
    "## Full cross-source context",
    "",
    "| Client | Type | Join | Key | GSC clicks | GSC impressions | GSC position | Ahrefs traffic | Ahrefs position |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...summary.cross_source_context.map((entry) => `| ${entry.client_id} | ${entry.key_type} | ${entry.join_type} | ${entry.key} | ${entry.gsc?.clicks ?? "—"} | ${entry.gsc?.impressions ?? "—"} | ${entry.gsc?.position?.toFixed(2) ?? "—"} | ${entry.ahrefs?.estimated_traffic ?? "—"} | ${entry.ahrefs?.position ?? "—"} |`),
    "",
    "## Full rule-based signals",
    "",
    "These are evidence-derived signals, not automated recommendations or causal conclusions.",
    "",
    "| Client | Type | Key | Evidence | Severity |",
    "| --- | --- | --- | --- | --- |",
    ...summary.insights.map((insight) => `| ${insight.client_id} | ${insight.kind} | ${insight.key} | ${insight.evidence} | ${insight.severity} |`),
    "",
    ...profileRows,
    ...keywordRows,
    "## Evidence reports",
    "",
    ...details,
    "",
  ].join("\n");
}

function ahrefsProfileHtml(profiles: AhrefsProfileEvidence[]): string {
  const table = (title: string, headers: string[], rows: string, empty: string) => `<h3>${escapeHtml(title)}</h3><div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}">${escapeHtml(empty)}</td></tr>`}</tbody></table></div>`;
  return profiles.map((profile) => {
    const label = `${profile.client_id} · ${profile.property_id} · ${profile.country ?? "—"} · ${profile.generated_at?.slice(0, 10) ?? "—"}`;
    const row = (values: string[]) => `<tr>${values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`;
    const pages = profile.top_pages.map((item) => row(profileColumns(item, ["url", "sum_traffic", "traffic_diff", "traffic_diff_percent", "keywords", "top_keyword", "top_keyword_best_position", "top_keyword_best_position_diff", "referring_domains", "ur"]))).join("");
    const keywords = profile.organic_keyword_rows.map((item) => row(["keyword", "keyword_country", "best_position", "best_position_diff", "best_position_set", "best_position_url", "sum_traffic", "sum_traffic_prev", "volume", "keyword_difficulty"].map((key) => profileValue(item, key)).concat([profileIntents(item), profileValue(item, "serp_features"), profileValue(item, "status")]))).join("");
    const competitors = profile.competitors.map((item) => row(["competitor_domain", "domain_rating", "keywords_common", "keywords_target", "keywords_competitor", "share", "traffic", "traffic_diff", "value"].map((key) => profileValue(item, key)))).join("");
    return `<section id="ahrefs-profile-${escapeHtml(profile.client_id)}-${escapeHtml(profile.property_id.replaceAll(/[^a-zA-Z0-9_-]/g, "-") )}"><h2>Estimated — Ahrefs site-explorer profile</h2><p><span class="badge estimated">Estimated — Ahrefs</span> ${escapeHtml(label)}. Wszystkie zwrócone wiersze profilu są zachowane.</p>${table("Najważniejsze strony", ["URL", "Szac. ruch", "Zmiana ruchu", "Zmiana %", "Frazy", "Główna fraza", "Pozycja", "Zmiana pozycji", "Domeny odsyłające", "UR"], pages, "Brak zwróconych stron.")}${table("Frazy organiczne", ["Fraza", "Kraj", "Pozycja", "Zmiana pozycji", "Zestaw pozycji", "URL", "Szac. ruch", "Poprzedni ruch", "Wolumen", "KD", "Intencje", "SERP features", "Status"], keywords, "Brak zwróconych fraz organicznych.")}${table("Konkurenci organiczni", ["Domena", "DR", "Wspólne frazy", "Frazy celu", "Frazy konkurenta", "Udział", "Szac. ruch", "Zmiana ruchu", "Wartość"], competitors, "Brak zwróconych konkurentów.")}</section>`;
  }).join("");
}

function appendixHtml(summary: AgencyReportSummary, details: string[]): string {
  const contextRows = summary.cross_source_context.map((entry) => `<tr>${[entry.client_id, entry.key_type, entry.join_type, entry.key, entry.gsc?.clicks ?? "—", entry.gsc?.impressions ?? "—", entry.gsc?.position?.toFixed(2) ?? "—", entry.ahrefs?.estimated_traffic ?? "—", entry.ahrefs?.position ?? "—"].map((value) => `<td>${escapeHtml(String(value))}</td>`).join("")}</tr>`).join("\n");
  const insightRows = summary.insights.map((insight) => `<tr>${[insight.client_id, insight.kind, insight.key, insight.evidence, insight.severity].map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("\n");
  const keywordHtml = summary.keyword_research ? `<h2 id="keyword-research">Full Ahrefs Keywords Explorer phrase research</h2><p><span class="badge estimated">Estimated — Ahrefs Keywords Explorer</span> Every supplied input group is retained. Returned rows: ${summary.keyword_research.groups.reduce((total, group) => total + group.rows.length, 0)}.</p>${summary.keyword_research.input_groups.map((group) => { const result = summary.keyword_research?.groups.find((candidate) => candidate.host === group.host); const rows = result?.rows ?? []; return `<h3>${escapeHtml(group.host)}</h3><p>Supplied phrases: ${group.phrases.length}; returned rows: ${rows.length}</p><div class="table-wrap"><table><thead><tr><th>Keyword</th><th>Volume</th><th>Monthly volume</th><th>Global volume</th><th>Clicks</th><th>CPC</th><th>CPS</th><th>Difficulty</th><th>Traffic potential</th><th>Parent topic</th><th>Parent volume</th><th>Intents</th><th>SERP features</th><th>SERP last update</th></tr></thead><tbody>${rows.map((row) => [row.keyword, row.volume, row.volume_monthly, row.global_volume, row.clicks, row.cpc, row.cps, row.difficulty, row.traffic_potential, row.parent_topic, row.parent_volume, Array.isArray(row.intents) ? row.intents.join(", ") : row.intents, Array.isArray(row.serp_features) ? row.serp_features.join(", ") : row.serp_features, row.serp_last_update].map((value) => `<td>${escapeHtml(String(value ?? "—"))}</td>`).join("")).map((row) => `<tr>${row}</tr>`).join("")}</tbody></table></div>`; }).join("")}<h3>Input notes</h3><ul>${summary.keyword_research.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : "";
  const profileHtml = summary.ahrefs_profile_context ? ahrefsProfileHtml(summary.ahrefs_profile_context) : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agency SEO evidence appendix</title><style>body{font-family:system-ui,sans-serif;margin:2rem;color:#172033}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:900px}th,td{text-align:left;padding:.45rem;border-bottom:1px solid #ddd;vertical-align:top}th{background:#f1f5f9}.badge{display:inline-block;border-radius:999px;padding:.2rem .55rem;font-size:.8rem;font-weight:700;background:#eee5ff;color:#5b21b6}pre{white-space:pre-wrap;background:#f8fafc;padding:1rem;border:1px solid #e5e7eb}@media print{pre{break-inside:avoid}section{break-inside:auto}}</style></head><body><h1>Agency SEO report — evidence appendix</h1><p>Full deterministic context and findings. GSC is observed; Ahrefs is estimated context; unavailable sources are not zero.</p><h2 id="pages">Full cross-source context</h2><div class="table-wrap"><table><thead><tr><th>Client</th><th>Type</th><th>Join</th><th>Key</th><th>GSC clicks</th><th>GSC impressions</th><th>GSC position</th><th>Ahrefs traffic</th><th>Ahrefs position</th></tr></thead><tbody>${contextRows}</tbody></table></div><h2 id="findings">Full rule-based signals</h2><div class="table-wrap"><table><thead><tr><th>Client</th><th>Type</th><th>Key</th><th>Evidence</th><th>Severity</th></tr></thead><tbody>${insightRows}</tbody></table></div>${profileHtml}${keywordHtml}<h2 id="evidence">Evidence reports</h2>${details.map(escapeHtml).map((detail) => `<pre>${detail}</pre>`).join("")}</body></html>\n`;
}

async function writeExclusive(path: string, content: string): Promise<void> {
  await writeFile(path, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

export async function writeAgencyReport(artifactsDir: string, outputDir: string, scope: ScopePlan, generatedAt = new Date().toISOString(), sourceRegistry: SourceRegistry = { sources: [] }, keywordBundlePath?: string, keywordInputPath?: string, rankMonitoringPath?: string, keywordBundleRoot?: string): Promise<AgencyReportSummary> {
  const clients: ClientRegistry = { clients: [...new Set([...scope.entries.map((entry) => entry.client_id), ...sourceRegistry.sources.map((source) => source.client_id)])].map((client_id) => ({ client_id, properties: [] })) };
  validateSourceRegistry(sourceRegistry, clients);
  const resolvedArtifacts = resolve(artifactsDir);
  const resolvedOutput = resolve(outputDir);
  await mkdir(resolvedOutput, { recursive: false, mode: 0o700 });
  const packageSummary = await writeReportPackage(resolvedArtifacts, join(resolvedOutput, "package"));
  const propertyStatus = scope.entries.map((entry) => {
    const source: AgencyReportSourceStatus = { client_id: entry.client_id, property_id: entry.property_id, provider: entry.provider, status: entry.status, reason: entry.reason, bundle_path: null };
    const accepted = acceptedBundleFor(source, packageSummary);
    if (accepted && !ahrefsSnapshotFreshForGsc(accepted, packageSummary)) return { ...source, status: "unavailable" as const, reason: "Ahrefs snapshot is older than the selected Google Search Console observation period", reason_code: "stale_snapshot" as const, bundle_path: null };
    if (accepted) return { ...source, status: "ready" as const, reason: null, bundle_path: accepted.bundle_path };
    if (source.status === "ready") return { ...source, status: "unavailable" as const, reason: "No accepted evidence bundle was found for this source", reason_code: "missing_evidence_bundle" as const, bundle_path: null };
    return source;
  });
  const rankClientIds = rankMonitoringClientIds(sourceRegistry.sources);
  const rankMonitoringEvidence = rankMonitoringPath ? await readRankMonitoringEvidence(rankMonitoringPath, rankClientIds) : [];
  const externalStatus = sourceRegistry.sources.map((source) => {
    const hasEvidence = source.provider === "serprobot" && rankMonitoringEvidence.some((snapshot) => snapshot.client_id === source.client_id && snapshot.source_config?.project_id === source.target);
    if (source.status === "ready" && !hasEvidence) {
      const reasonCode = source.provider === "serprobot" ? "missing_evidence_bundle" as const : "no_evidence_path" as const;
      const reason = source.provider === "serprobot" ? "No accepted evidence bundle was found for this source" : "No evidence ingestion path is available for this external source";
      return { source_id: source.source_id, client_id: source.client_id, property_id: source.target ?? "—", provider: source.provider, status: "unavailable" as const, reason, reason_code: reasonCode, bundle_path: null } satisfies AgencyReportSourceStatus;
    }
    return { source_id: source.source_id, client_id: source.client_id, property_id: source.target ?? "—", provider: source.provider, status: source.status, reason: source.reason, bundle_path: null } satisfies AgencyReportSourceStatus;
  });
  const sourceStatus = [...propertyStatus, ...externalStatus];
  const currentAcceptedBundles = [...new Map(sourceStatus.map((source) => [source.bundle_path, source.bundle_path ? packageSummary.accepted_bundles.find((accepted) => accepted.bundle_path === source.bundle_path) : undefined]).filter((entry): entry is [string, ReportPackageSummary["accepted_bundles"][number]] => Boolean(entry[0] && entry[1]))).values()];
  const reports = await Promise.all(currentAcceptedBundles.map(async (accepted) => {
    const report = JSON.parse(await readFile(join(resolvedArtifacts, accepted.bundle_path, "report.json"), "utf8")) as AgencyInputReport;
    return { ...report, client_id: accepted.client_id, client_display_name: accepted.client_display_name, property_id: accepted.property_id };
  }));
  const crossSourceContext = composeCrossSourceContext(reports);
  const insights = composeReportInsights(reports);
  const keywordResearch = keywordBundlePath ? await verifyKeywordResearchBundle(keywordBundlePath, keywordBundleRoot ?? resolvedArtifacts, keywordInputPath) : undefined;
  const rankMonitoring = rankMonitoringEvidence[0];
  const profileContext = composeAhrefsProfileContext(reports);
  const summary: AgencyReportSummary = { schema_version: "1", report_status: currentAcceptedBundles.length === 0 ? "blocked" : sourceStatus.some((source) => source.status !== "ready") ? "partial" : "reportable", generated_at: generatedAt, scope, source_status: sourceStatus, accepted_bundles: currentAcceptedBundles, history_bundle_paths: packageSummary.accepted_bundles.map((entry) => entry.bundle_path), blocked_sources: sourceStatus.filter((source) => source.status !== "ready"), cross_source_context: crossSourceContext, insights, executive: composeExecutiveSummary(reports, crossSourceContext, insights), ...(profileContext.length ? { ahrefs_profile_context: profileContext } : {}), ...(keywordResearch ? { keyword_research: keywordResearch } : {}), ...(rankMonitoring ? { rank_monitoring: rankMonitoring } : {}), ...(rankMonitoringEvidence.length > 1 ? { rank_monitoring_snapshots: rankMonitoringEvidence } : {}) };
  const details: string[] = [];
  for (const accepted of currentAcceptedBundles) {
    const path = join(resolvedArtifacts, accepted.bundle_path, "report.md");
    const content = await readFile(path, "utf8");
    details.push(`### ${accepted.provider} — ${accepted.property_id}\n\nEvidence: [${accepted.bundle_path}](../${relative(resolvedOutput, join(resolvedArtifacts, accepted.bundle_path))})\n\n${content}`);
  }
  const files = { "agency-report.json": canonicalJson(summary), "agency-report.md": markdown(summary), "agency-report.html": html(summary), "agency-report-appendix.md": appendixMarkdown(summary, details), "agency-report-appendix.html": appendixHtml(summary, details) };
  for (const [name, content] of Object.entries(files)) await writeExclusive(join(resolvedOutput, name), content);
  await writeExclusive(join(resolvedOutput, "manifest.json"), canonicalJson({ schema_version: "1", report_status: summary.report_status, files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { sha256: sha256(content), bytes: Buffer.byteLength(content) }])) }));
  return summary;
}
