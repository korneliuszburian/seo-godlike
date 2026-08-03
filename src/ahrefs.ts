import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { AhrefsAnalyticsRequest, AhrefsProfileRequest, CapabilityRegistry, Claim, ClientRegistry, CompanyLogEvent, MetricObservation, PolicyError, Report, SourceRecord } from "./domain.js";
import { canonicalJson, sha256 } from "./serialize.js";
import { resolveRegisteredProperty } from "./registry.js";
import { assertCanonicalIsoDateTime } from "./timestamps.js";

const execFileAsync = promisify(execFile);
export const AHREFS_API_VERSION = "v3";
export const AHREFS_METRICS_OPERATION = "site-explorer.metrics" as const;
export const AHREFS_API_KEY_REF = "keyring:seo-godlike/ahrefs-api-key";

export interface AhrefsAnalyticsReport extends Report {
  provider: "ahrefs";
  operation: "site-explorer.metrics";
  client_display_name: string;
  analytics: {
    current_date_range: AhrefsAnalyticsRequest["date_range"];
    current: {
      metric_id: "ahrefs.org_traffic";
      organic_traffic: number;
      organic_keywords: number;
      organic_keywords_top_3: number;
    };
  };
}

export interface AhrefsProfileReport extends Report {
  provider: "ahrefs";
  operation: "site-explorer.profile";
  client_display_name: string;
  analytics: {
    current_date_range: AhrefsProfileRequest["date_range"];
    comparison_date_range: AhrefsProfileRequest["comparison_date_range"];
    current: AhrefsProfileAnalytics;
  };
}

export interface AhrefsProfileAnalytics {
  metric_id: "ahrefs.org_traffic";
  organic_traffic: number;
  organic_keywords: number;
  organic_keywords_top_3: number;
  top_pages: Array<Record<string, unknown>>;
  organic_keyword_rows: Array<Record<string, unknown>>;
  competitors: Array<Record<string, unknown>>;
}

interface AhrefsResponse {
  metrics: {
    org_traffic?: number;
    org_keywords?: number;
    org_keywords_1_3?: number;
  };
}

function finiteNonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`invalid Ahrefs ${label}`);
  return value;
}

function parseResponse(rawText: string): AhrefsResponse["metrics"] {
  const parsed = JSON.parse(rawText) as { metrics?: unknown };
  if (!parsed.metrics || typeof parsed.metrics !== "object") throw new Error("invalid Ahrefs metrics response");
  const metrics = parsed.metrics as Record<string, unknown>;
  return {
    org_traffic: finiteNonNegative(metrics.org_traffic, "org_traffic"),
    org_keywords: finiteNonNegative(metrics.org_keywords, "org_keywords"),
    org_keywords_1_3: finiteNonNegative(metrics.org_keywords_1_3, "org_keywords_1_3"),
  };
}

function assertRequest(request: AhrefsAnalyticsRequest, registry: ClientRegistry, capabilities: CapabilityRegistry): string {
  assertCanonicalIsoDateTime(request.captured_at);
  if (request.policy_mode !== "read_only" || request.provider !== "ahrefs" || request.operation !== AHREFS_METRICS_OPERATION || request.metric !== "org_traffic") throw new PolicyError("policy");
  const resolved = resolveRegisteredProperty(registry, request.client_id, request.property_id, "ahrefs");
  const capability = capabilities.capabilities.find((item) => item.provider === "ahrefs" && item.operation_id === AHREFS_METRICS_OPERATION);
  if (!capability || capability.read_write !== "read" || capability.api_version !== AHREFS_API_VERSION) throw new PolicyError("schema", `schema: unsupported Ahrefs API version '${capability?.api_version ?? "missing"}'`);
  return resolved.canonical_property_id;
}

export async function getAhrefsApiKey(): Promise<string> {
  try {
    const result = await execFileAsync("secret-tool", ["lookup", "service", "seo-godlike", "account", "ahrefs-api-key"], { encoding: "utf8" });
    if (result.stdout.trim()) return result.stdout.trim();
  } catch { /* fail closed below */ }
  throw new PolicyError("policy", `policy: missing secret reference '${AHREFS_API_KEY_REF}'`);
}

export async function queryAhrefsMetrics(apiKey: string, target: string, date: string): Promise<string> {
  const url = new URL("https://api.ahrefs.com/v3/site-explorer/metrics");
  url.searchParams.set("target", target);
  url.searchParams.set("date", date);
  url.searchParams.set("mode", "subdomains");
  url.searchParams.set("protocol", "https");
  url.searchParams.set("output", "json");
  const response = await fetch(url, { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Ahrefs request failed: ${response.status}`);
  return `${JSON.stringify(await response.json())}\n`;
}

const PROFILE_SELECTS = {
  topPages: "url,raw_url,keywords,sum_traffic,top_keyword,top_keyword_best_position,top_keyword_best_position_diff,referring_domains,ur,traffic_diff,traffic_diff_percent",
  organicKeywords: "keyword,keyword_country,best_position,best_position_diff,best_position_set,best_position_url,sum_traffic,sum_traffic_prev,volume,keyword_difficulty,is_branded,is_commercial,is_informational,is_local,is_navigational,is_transactional,status,serp_features",
  competitors: "competitor_domain,domain_rating,keywords_common,keywords_target,keywords_competitor,share,traffic,traffic_diff,value",
} as const;

async function queryAhrefsEndpoint(apiKey: string, endpoint: string, target: string, date: string, parameters: Record<string, string>): Promise<string> {
  const url = new URL(`https://api.ahrefs.com/v3/site-explorer/${endpoint}`);
  url.searchParams.set("target", target);
  url.searchParams.set("date", date);
  url.searchParams.set("mode", "subdomains");
  url.searchParams.set("protocol", "https");
  url.searchParams.set("output", "json");
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Ahrefs ${endpoint} request failed: ${response.status}`);
  return `${JSON.stringify(await response.json())}\n`;
}

export async function queryAhrefsProfile(apiKey: string, target: string, date: string, comparisonDate: string, country: string): Promise<{ metrics: string; topPages: string; organicKeywords: string; competitors: string }> {
  const metrics = await queryAhrefsMetrics(apiKey, target, date);
  const topPages = await queryAhrefsEndpoint(apiKey, "top-pages", target, date, { date_compared: comparisonDate, limit: "100", order_by: "sum_traffic:desc", select: PROFILE_SELECTS.topPages });
  const organicKeywords = await queryAhrefsEndpoint(apiKey, "organic-keywords", target, date, { date_compared: comparisonDate, limit: "500", order_by: "sum_traffic:desc", select: PROFILE_SELECTS.organicKeywords });
  const competitors = await queryAhrefsEndpoint(apiKey, "organic-competitors", target, date, { country, date_compared: comparisonDate, limit: "20", order_by: "traffic:desc", select: PROFILE_SELECTS.competitors });
  return { metrics, topPages, organicKeywords, competitors };
}

function parseArrayResponse(rawText: string, field: string): Array<Record<string, unknown>> {
  const parsed = JSON.parse(rawText) as Record<string, unknown>;
  if (!Array.isArray(parsed[field])) throw new Error(`invalid Ahrefs ${field} response`);
  return parsed[field].filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null);
}

/** Ahrefs profile responses encode percentage deltas as hundredths of a percent. */
function normalizeTrafficDiffPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number.isInteger(value) ? value / 10_000 : value;
}

function assertProfileRequest(request: AhrefsProfileRequest, registry: ClientRegistry, capabilities: CapabilityRegistry): string {
  assertCanonicalIsoDateTime(request.captured_at);
  if (request.policy_mode !== "read_only" || request.provider !== "ahrefs" || request.operation !== "site-explorer.profile" || request.metric !== "org_traffic") throw new PolicyError("policy");
  const resolved = resolveRegisteredProperty(registry, request.client_id, request.property_id, "ahrefs");
  const capability = capabilities.capabilities.find((item) => item.provider === "ahrefs" && item.operation_id === "site-explorer.profile");
  if (!capability || capability.read_write !== "read" || capability.api_version !== AHREFS_API_VERSION) throw new PolicyError("schema", `schema: unsupported Ahrefs profile API version '${capability?.api_version ?? "missing"}'`);
  if (!capability.metric_ids?.includes("ahrefs.top_pages") || !capability.metric_ids.includes("ahrefs.org_keywords_detail") || !capability.metric_ids.includes("ahrefs.org_competitors")) throw new PolicyError("schema", "schema: Ahrefs profile capability is missing context metrics");
  return resolved.canonical_property_id;
}

function markdownCell(value: unknown): string {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

export async function runAhrefsProfile(request: AhrefsProfileRequest, registry: ClientRegistry, capabilities: CapabilityRegistry, rawResponses: { metrics: string; topPages: string; organicKeywords: string; competitors: string }, outputDir: string): Promise<AhrefsProfileReport> {
  const canonicalPropertyId = assertProfileRequest(request, registry, capabilities);
  const displayName = registry.clients.find((client) => client.client_id === request.client_id)?.display_name ?? request.client_id;
  const metrics = parseResponse(rawResponses.metrics);
  const topPages = parseArrayResponse(rawResponses.topPages, "pages").map((row) => {
    const ratio = normalizeTrafficDiffPercent(row.traffic_diff_percent);
    return ratio === null ? row : { ...row, traffic_diff_percent_ratio: ratio };
  });
  const organicKeywords = parseArrayResponse(rawResponses.organicKeywords, "keywords");
  const competitors = parseArrayResponse(rawResponses.competitors, "competitors");
  const requestText = canonicalJson(request);
  const sources: SourceRecord[] = Object.entries(rawResponses).map(([name, rawText]) => ({ source_id: `source_${request.run_id}_${name}`, provider: request.provider, operation_id: request.operation, request_hash: sha256(requestText), response_hash: sha256(rawText), captured_at: request.captured_at, redaction_policy: "provider_response_no_credentials", raw_artifact_ref: `raw-response.${name}.json` }));
  const sourceRefs = sources.map((source) => source.source_id);
  const observation: MetricObservation = { observation_id: `observation_${request.run_id}`, metric_id: "ahrefs.org_traffic", client_id: request.client_id, property_id: canonicalPropertyId, period: request.date_range, value: metrics.org_traffic as number, source_ref: sources[0]!.source_id, normalized_at: request.captured_at };
  const claim: Claim = { claim_id: `claim_${request.run_id}`, statement: `Ahrefs profile for ${canonicalPropertyId} on ${request.date_range.end}: ${topPages.length} top pages, ${organicKeywords.length} organic keyword rows, ${competitors.length} competitors`, observation_refs: [observation.observation_id], confidence: "estimated", validation: "passed", created_at: request.captured_at };
  const capabilityId = capabilities.capabilities.find((item) => item.provider === request.provider && item.operation_id === request.operation)?.capability_id;
  if (!capabilityId) throw new PolicyError("schema");
  const requestHash = sha256(requestText);
  const log: CompanyLogEvent = { event_id: `event_${request.run_id}`, run_id: request.run_id, capability_id: capabilityId, operation_id: request.operation, client_id: request.client_id, property_id: canonicalPropertyId, request_hash: requestHash, response_hash: sha256(canonicalJson(sources)), outcome: "succeeded", error_category: null, occurred_at: request.captured_at };
  const analytics: AhrefsProfileAnalytics = { metric_id: "ahrefs.org_traffic", organic_traffic: metrics.org_traffic as number, organic_keywords: metrics.org_keywords as number, organic_keywords_top_3: metrics.org_keywords_1_3 as number, top_pages: topPages, organic_keyword_rows: organicKeywords, competitors };
  const reportBase = { report_id: `report_${request.run_id}`, schema_version: request.schema_version, run_id: request.run_id, client_id: request.client_id, client_display_name: displayName, provider: request.provider, operation: request.operation, property_refs: [canonicalPropertyId], source_refs: sourceRefs, observation_refs: [observation.observation_id], claim_refs: [claim.claim_id], generated_at: request.captured_at, evidence_manifest_ref: "manifest.json", analytics: { current_date_range: request.date_range, comparison_date_range: request.comparison_date_range, current: analytics } };
  const report: AhrefsProfileReport = { ...reportBase, canonical_json_hash: sha256(canonicalJson(reportBase)) };
  const pageRows = topPages.slice(0, request.limits.top_pages).map((row) => `| ${markdownCell(row.url ?? row.raw_url)} | ${markdownCell(row.sum_traffic)} | ${markdownCell(row.keywords)} | ${markdownCell(row.top_keyword)} | ${markdownCell(row.top_keyword_best_position)} |`);
  const keywordRows = organicKeywords.slice(0, request.limits.organic_keywords).slice(0, 25).map((row) => `| ${markdownCell(row.keyword)} | ${markdownCell(row.keyword_country)} | ${markdownCell(row.best_position)} | ${markdownCell(row.sum_traffic)} | ${markdownCell(row.volume)} | ${markdownCell(row.is_local ? "local" : row.is_transactional ? "transactional" : row.is_informational ? "informational" : "—")} |`);
  const competitorRows = competitors.slice(0, request.limits.organic_competitors).map((row) => `| ${markdownCell(row.competitor_domain)} | ${markdownCell(row.traffic)} | ${markdownCell(row.domain_rating)} | ${markdownCell(row.keywords_common)} | ${markdownCell(row.share)} |`);
  const reportMarkdown = [`# Ahrefs SEO profile: ${displayName}`, "", `- Property: ${canonicalPropertyId}`, `- Snapshot date: ${request.date_range.end}`, `- Comparison date: ${request.comparison_date_range.end}`, `- Estimated organic traffic: ${metrics.org_traffic}`, `- Organic keywords: ${metrics.org_keywords}`, `- Organic keywords Top 3: ${metrics.org_keywords_1_3}`, "", "## Top pages", "", "| URL | Estimated traffic | Keywords | Top keyword | Position |", "| --- | ---: | ---: | --- | ---: |", ...pageRows, "", "## Organic keyword context (first 25 rows)", "", "| Keyword | Country | Position | Traffic | Volume | Intent |", "| --- | --- | ---: | ---: | ---: | --- |", ...keywordRows, "", "## Organic competitors", "", "| Domain | Traffic | Domain Rating | Common keywords | Share |", "| --- | ---: | ---: | ---: | ---: |", ...competitorRows, "", "## Provenance", "", "- Ahrefs values are estimates and remain separate from observed GSC metrics.", `- Raw responses are bound by manifest hashes.`, `- Canonical JSON hash: ${report.canonical_json_hash}`, ""].join("\n");
  const files: Record<string, string> = { "request.json": requestText, "raw-response.metrics.json": rawResponses.metrics, "raw-response.top-pages.json": rawResponses.topPages, "raw-response.organic-keywords.json": rawResponses.organicKeywords, "raw-response.competitors.json": rawResponses.competitors, "source.json": canonicalJson(sources), "observation.json": canonicalJson(observation), "claim.json": canonicalJson(claim), "audit-event.json": canonicalJson(log), "analytics.json": canonicalJson(analytics), "report.json": canonicalJson(report), "report.md": reportMarkdown };
  await mkdir(outputDir, { recursive: false });
  for (const [name, content] of Object.entries(files)) await writeExclusive(join(outputDir, name), content);
  const manifestFiles = Object.fromEntries(Object.entries(files).map(([name, content]) => {
    const bounded = name === "raw-response.top-pages.json"
      ? { request_row_limit: request.limits.top_pages, response_row_count: topPages.length }
      : name === "raw-response.organic-keywords.json"
        ? { request_row_limit: request.limits.organic_keywords, response_row_count: organicKeywords.length }
        : name === "raw-response.competitors.json"
          ? { request_row_limit: request.limits.organic_competitors, response_row_count: competitors.length }
          : {};
    return [name, { sha256: sha256(content), bytes: Buffer.byteLength(content), ...bounded }];
  }));
  await writeExclusive(join(outputDir, "manifest.json"), canonicalJson({ schema_version: request.schema_version, run_id: request.run_id, files: manifestFiles }));
  return report;
}

async function writeExclusive(path: string, content: string): Promise<void> {
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });
}

export async function runAhrefsAnalytics(request: AhrefsAnalyticsRequest, registry: ClientRegistry, capabilities: CapabilityRegistry, rawText: string, outputDir: string): Promise<AhrefsAnalyticsReport> {
  const canonicalPropertyId = assertRequest(request, registry, capabilities);
  const displayName = registry.clients.find((client) => client.client_id === request.client_id)?.display_name ?? request.client_id;
  const metrics = parseResponse(rawText);
  const requestText = canonicalJson(request);
  const responseHash = sha256(rawText);
  const requestHash = sha256(requestText);
  const sourceId = `source_${request.run_id}`;
  const source: SourceRecord = { source_id: sourceId, provider: request.provider, operation_id: request.operation, request_hash: requestHash, response_hash: responseHash, captured_at: request.captured_at, redaction_policy: "provider_response_no_credentials", raw_artifact_ref: "raw-response.json" };
  const observation: MetricObservation = { observation_id: `observation_${request.run_id}`, metric_id: "ahrefs.org_traffic", client_id: request.client_id, property_id: canonicalPropertyId, period: request.date_range, value: metrics.org_traffic as number, source_ref: sourceId, normalized_at: request.captured_at };
  const claim: Claim = { claim_id: `claim_${request.run_id}`, statement: `Ahrefs estimated organic traffic for ${canonicalPropertyId} on ${request.date_range.end}: ${metrics.org_traffic}`, observation_refs: [observation.observation_id], confidence: "estimated", validation: "passed", created_at: request.captured_at };
  const capabilityId = capabilities.capabilities.find((item) => item.provider === request.provider && item.operation_id === request.operation)?.capability_id;
  if (!capabilityId) throw new PolicyError("schema");
  const log: CompanyLogEvent = { event_id: `event_${request.run_id}`, run_id: request.run_id, capability_id: capabilityId, operation_id: request.operation, client_id: request.client_id, property_id: canonicalPropertyId, request_hash: requestHash, response_hash: responseHash, outcome: "succeeded", error_category: null, occurred_at: request.captured_at };
  const analytics = { current_date_range: request.date_range, current: { metric_id: "ahrefs.org_traffic" as const, organic_traffic: metrics.org_traffic as number, organic_keywords: metrics.org_keywords as number, organic_keywords_top_3: metrics.org_keywords_1_3 as number } };
  const reportBase = { report_id: `report_${request.run_id}`, schema_version: request.schema_version, run_id: request.run_id, client_id: request.client_id, client_display_name: displayName, provider: request.provider, operation: request.operation, property_refs: [canonicalPropertyId], source_refs: [sourceId], observation_refs: [observation.observation_id], claim_refs: [claim.claim_id], generated_at: request.captured_at, evidence_manifest_ref: "manifest.json", analytics };
  const report: AhrefsAnalyticsReport = { ...reportBase, canonical_json_hash: sha256(canonicalJson(reportBase)) };
  const files = { "request.json": requestText, "raw-response.json": rawText, "source.json": canonicalJson(source), "observation.json": canonicalJson(observation), "claim.json": canonicalJson(claim), "audit-event.json": canonicalJson(log), "analytics.json": canonicalJson(analytics), "report.json": canonicalJson(report), "report.md": `# Ahrefs analytics report: ${displayName}\n\n- Property: ${canonicalPropertyId}\n- Date: ${request.date_range.end}\n- Estimated organic traffic: ${metrics.org_traffic}\n- Organic keywords: ${metrics.org_keywords}\n- Organic keywords in top 3: ${metrics.org_keywords_1_3}\n- Canonical JSON hash: ${report.canonical_json_hash}\n` };
  await mkdir(outputDir, { recursive: false });
  for (const [name, content] of Object.entries(files)) await writeExclusive(join(outputDir, name), content);
  const manifest = { schema_version: request.schema_version, run_id: request.run_id, files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { sha256: sha256(content), bytes: Buffer.byteLength(content) }])) };
  await writeExclusive(join(outputDir, "manifest.json"), canonicalJson(manifest));
  return report;
}
