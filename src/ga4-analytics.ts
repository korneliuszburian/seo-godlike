import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Ga4AnalyticsRequest, CapabilityRegistry, Claim, ClientRegistry, CompanyLogEvent, MetricObservation, PolicyError, Report, SourceRecord } from "./domain.js";
import { canonicalJson, sha256 } from "./serialize.js";
import { resolveRegisteredProperty } from "./registry.js";
import { assertCanonicalIsoDateTime } from "./timestamps.js";
import { GOOGLE_ANALYTICS_API_VERSION } from "./google.js";

function htmlEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

interface Ga4QuotaBucket {
  consumed: number;
  remaining: number;
}

export interface Ga4PropertyQuota {
  tokens_per_day?: Ga4QuotaBucket;
  tokens_per_hour?: Ga4QuotaBucket;
  concurrent_requests?: Ga4QuotaBucket;
}

export interface Ga4ReportSummary {
  metric_id: "ga4.sessions";
  sessions: number;
  rows_received: number;
  property_quota: Ga4PropertyQuota | null;
}

export interface Ga4AnalyticsReport extends Report {
  provider: "google-analytics";
  operation: "properties.runReport";
  client_display_name: string;
  analytics: {
    current_date_range: Ga4AnalyticsRequest["date_range"];
    current: Ga4ReportSummary;
  };
}

export interface Ga4AnalyticsRunResult {
  outputDir: string;
  report: Ga4AnalyticsReport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`invalid GA4 ${label}`);
  return value;
}

function quotaBucket(value: unknown, label: string): Ga4QuotaBucket | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`invalid GA4 ${label}`);
  return {
    consumed: finiteNonNegative(value.consumed, `${label}.consumed`),
    remaining: finiteNonNegative(value.remaining, `${label}.remaining`),
  };
}

function parsePropertyQuota(value: unknown): Ga4PropertyQuota | null {
  if (value === undefined) return null;
  if (!isRecord(value)) throw new Error("invalid GA4 propertyQuota");
  const result: Ga4PropertyQuota = {};
  const tokensPerDay = quotaBucket(value.tokensPerDay, "tokensPerDay");
  const tokensPerHour = quotaBucket(value.tokensPerHour, "tokensPerHour");
  const concurrentRequests = quotaBucket(value.concurrentRequests, "concurrentRequests");
  if (tokensPerDay) result.tokens_per_day = tokensPerDay;
  if (tokensPerHour) result.tokens_per_hour = tokensPerHour;
  if (concurrentRequests) result.concurrent_requests = concurrentRequests;
  return result;
}

function parseGa4Report(rawText: string): Ga4ReportSummary {
  const parsed: unknown = JSON.parse(rawText);
  if (!isRecord(parsed)) throw new Error("invalid GA4 response");
  if (parsed.rows !== undefined && !Array.isArray(parsed.rows)) throw new Error("invalid GA4 rows");
  const rows = parsed.rows ?? [];
  let sessions = 0;
  for (const row of rows) {
    if (!isRecord(row) || !Array.isArray(row.metricValues) || !isRecord(row.metricValues[0])) throw new Error("invalid GA4 metric row");
    const value = row.metricValues[0].value;
    if (typeof value !== "string" || value.trim() === "") throw new Error("invalid GA4 sessions value");
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) throw new Error("invalid GA4 sessions value");
    sessions += numeric;
  }
  return { metric_id: "ga4.sessions", sessions, rows_received: rows.length, property_quota: parsePropertyQuota(parsed.propertyQuota) };
}

function assertGa4Request(request: Ga4AnalyticsRequest, registry: ClientRegistry, capabilities: CapabilityRegistry): string {
  assertCanonicalIsoDateTime(request.captured_at);
  if (request.policy_mode !== "read_only" || request.provider !== "google-analytics" || request.operation !== "properties.runReport") throw new PolicyError("policy");
  if (request.metric !== "sessions" || JSON.stringify(request.dimensions) !== JSON.stringify(["date"]) || request.row_limit !== 10_000) throw new PolicyError("schema");
  const resolved = resolveRegisteredProperty(registry, request.client_id, request.property_id, "google-analytics");
  const capability = capabilities.capabilities.find((item) => item.provider === request.provider && item.operation_id === request.operation);
  if (!capability || capability.read_write !== "read" || capability.api_version !== GOOGLE_ANALYTICS_API_VERSION) {
    throw new PolicyError("schema", `schema: unsupported Google Analytics API version '${capability?.api_version ?? "missing"}'`);
  }
  return resolved.canonical_property_id;
}

async function writeExclusive(path: string, content: string): Promise<void> {
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });
}

function markdown(report: Ga4AnalyticsReport, observation: MetricObservation, claim: Claim): string {
  return [
    `# GA4 analytics report: ${htmlEscape(report.client_display_name)}`,
    "",
    `- Property: ${htmlEscape(observation.property_id)}`,
    `- Period: ${htmlEscape(report.analytics.current_date_range.start)} to ${htmlEscape(report.analytics.current_date_range.end)}`,
    `- Sessions: ${report.analytics.current.sessions}`,
    `- Rows: ${report.analytics.current.rows_received}`,
    `- Claim: ${htmlEscape(claim.statement)}`,
    `- Canonical JSON hash: ${htmlEscape(report.canonical_json_hash)}`,
    "",
  ].join("\n");
}

export async function runGa4Analytics(
  request: Ga4AnalyticsRequest,
  registry: ClientRegistry,
  capabilities: CapabilityRegistry,
  rawText: string,
  outputDir: string,
): Promise<Ga4AnalyticsRunResult> {
  const canonicalPropertyId = assertGa4Request(request, registry, capabilities);
  const clientDisplayName = registry.clients.find((client) => client.client_id === request.client_id)?.display_name ?? request.client_id;
  const current = parseGa4Report(rawText);
  const requestText = canonicalJson(request);
  const requestHash = sha256(requestText);
  const responseHash = sha256(rawText);
  const sourceId = `source_${request.run_id}`;
  const source: SourceRecord = {
    source_id: sourceId,
    provider: request.provider,
    operation_id: request.operation,
    request_hash: requestHash,
    response_hash: responseHash,
    captured_at: request.captured_at,
    redaction_policy: "provider_response_no_credentials",
    raw_artifact_ref: "raw-response.json",
  };
  const observation: MetricObservation = {
    observation_id: `observation_${request.run_id}`,
    metric_id: "ga4.sessions",
    client_id: request.client_id,
    property_id: canonicalPropertyId,
    period: request.date_range,
    value: current.sessions,
    source_ref: sourceId,
    normalized_at: request.captured_at,
  };
  const claim: Claim = {
    claim_id: `claim_${request.run_id}`,
    statement: `GA4 sessions for ${canonicalPropertyId} from ${request.date_range.start} to ${request.date_range.end}: ${current.sessions}`,
    observation_refs: [observation.observation_id],
    confidence: "observed",
    validation: "passed",
    created_at: request.captured_at,
  };
  const capabilityId = capabilities.capabilities.find((item) => item.provider === request.provider && item.operation_id === request.operation)?.capability_id;
  if (!capabilityId) throw new PolicyError("schema");
  const log: CompanyLogEvent = {
    event_id: `event_${request.run_id}`,
    run_id: request.run_id,
    capability_id: capabilityId,
    operation_id: request.operation,
    client_id: request.client_id,
    property_id: canonicalPropertyId,
    request_hash: requestHash,
    response_hash: responseHash,
    outcome: "succeeded",
    error_category: null,
    occurred_at: request.captured_at,
  };
  const analytics = { current_date_range: request.date_range, current };
  const reportBase = {
    report_id: `report_${request.run_id}`,
    schema_version: request.schema_version,
    run_id: request.run_id,
    client_id: request.client_id,
    client_display_name: clientDisplayName,
    provider: request.provider,
    operation: request.operation,
    property_refs: [canonicalPropertyId],
    source_refs: [sourceId],
    observation_refs: [observation.observation_id],
    claim_refs: [claim.claim_id],
    generated_at: request.captured_at,
    evidence_manifest_ref: "manifest.json",
    analytics,
  };
  const reportHash = sha256(canonicalJson(reportBase));
  const report: Ga4AnalyticsReport = { ...reportBase, canonical_json_hash: reportHash };
  const files: Record<string, string> = {
    "request.json": requestText,
    "raw-response.json": rawText,
    "source.json": canonicalJson(source),
    "observation.json": canonicalJson(observation),
    "claim.json": canonicalJson(claim),
    "audit-event.json": canonicalJson(log),
    "analytics.json": canonicalJson(analytics),
    "report.json": canonicalJson(report),
    "report.md": markdown(report, observation, claim),
  };
  await mkdir(outputDir, { recursive: false });
  for (const [name, content] of Object.entries(files)) await writeExclusive(join(outputDir, name), content);
  const manifest = {
    schema_version: request.schema_version,
    run_id: request.run_id,
    files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { sha256: sha256(content), bytes: Buffer.byteLength(content) }])),
  };
  await writeExclusive(join(outputDir, "manifest.json"), canonicalJson(manifest));
  return { outputDir, report };
}
