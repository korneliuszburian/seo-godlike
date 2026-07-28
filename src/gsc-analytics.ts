import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CapabilityRegistry,
  Claim,
  ClientRegistry,
  CompanyLogEvent,
  GscAnalyticsRequest,
  MetricObservation,
  PolicyError,
  Report,
  SourceRecord,
} from "./domain.js";
import {
  aggregateSearchAnalytics,
  AnalyticsDateRanges,
  AnalyticsSummary,
  comparePeriods,
  GSC_ANALYTICS_DIMENSIONS,
  parseSearchAnalyticsResponse,
  PeriodComparison,
} from "./analytics.js";
import { canonicalJson, sha256 } from "./serialize.js";
import { resolveRegisteredProperty } from "./registry.js";

export interface AnalyticsReport extends Report {
  client_display_name: string;
  analytics: {
    current_date_range: AnalyticsDateRanges["current"];
    previous_date_range: AnalyticsDateRanges["previous"];
    current: AnalyticsSummary;
    previous: AnalyticsSummary | null;
    period_over_period: PeriodComparison | null;
  };
}

export interface AnalyticsRunResult {
  outputDir: string;
  report: AnalyticsReport;
}

function assertAnalyticsRequest(request: GscAnalyticsRequest, registry: ClientRegistry, capabilities: CapabilityRegistry): string {
  if (request.policy_mode !== "read_only" || request.operation !== "search_analytics.query") throw new PolicyError("policy");
  if (request.provider !== "google-search-console" || request.metric !== "clicks") throw new PolicyError("scope");
  if (JSON.stringify(request.dimensions) !== JSON.stringify(GSC_ANALYTICS_DIMENSIONS) || request.row_limit !== 25_000) throw new PolicyError("schema");
  const resolved = resolveRegisteredProperty(registry, request.client_id, request.property_id, request.provider);
  const capability = capabilities.capabilities.find((item) => item.provider === request.provider && item.operation_id === request.operation);
  if (!capability || capability.read_write !== "read") throw new PolicyError("schema");
  return resolved.canonical_property_id;
}

async function writeExclusive(path: string, content: string): Promise<void> {
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });
}

function formatPercent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;
}

function markdownRows(rows: AnalyticsSummary["top_queries"]): string[] {
  return rows.map((row) => `| ${row.key.replaceAll("|", "\\|").replaceAll("\n", " ")} | ${row.clicks} | ${row.impressions} | ${formatPercent(row.ctr)} | ${row.position.toFixed(2)} |`);
}

function markdown(report: AnalyticsReport, observation: MetricObservation, claim: Claim): string {
  const analytics = report.analytics;
  const comparison = analytics.period_over_period;
  return [
    `# SEO analytics report: ${report.client_display_name}`,
    "",
    `- Property: ${observation.property_id}`,
    `- Current period: ${analytics.current_date_range.start} to ${analytics.current_date_range.end}`,
    `- Previous period: ${analytics.previous_date_range.start} to ${analytics.previous_date_range.end}`,
    `- Rows: ${analytics.current.rows_received} received, ${analytics.current.rows_deduplicated} after exact deduplication`,
    `- Clicks: ${analytics.current.clicks}`,
    `- Impressions: ${analytics.current.impressions}`,
    `- CTR: ${formatPercent(analytics.current.ctr)}`,
    `- Average position: ${analytics.current.position.toFixed(2)}`,
    `- Claim: ${claim.statement}`,
    "",
    "## Top queries",
    "",
    "| Query | Clicks | Impressions | CTR | Position |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...markdownRows(analytics.current.top_queries),
    "",
    "## Top pages",
    "",
    "| Page | Clicks | Impressions | CTR | Position |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...markdownRows(analytics.current.top_pages),
    "",
    "## CTR breakdown",
    "",
    `- Device: ${analytics.current.ctr_breakdown.device.map((row) => `${row.key} ${formatPercent(row.ctr)}`).join(", ") || "none"}`,
    `- Country: ${analytics.current.ctr_breakdown.country.map((row) => `${row.key} ${formatPercent(row.ctr)}`).join(", ") || "none"}`,
    "",
    "## Period over period",
    "",
    comparison
      ? `- Clicks: ${comparison.delta.clicks} (${formatPercent(comparison.change_pct.clicks)})\n- Impressions: ${comparison.delta.impressions} (${formatPercent(comparison.change_pct.impressions)})\n- CTR delta: ${formatPercent(comparison.delta.ctr)}\n- Position delta: ${comparison.delta.position.toFixed(2)}`
      : "- Not available",
    "",
    `- Canonical JSON hash: ${report.canonical_json_hash}`,
    "",
  ].join("\n");
}

export async function runGscAnalytics(
  request: GscAnalyticsRequest,
  registry: ClientRegistry,
  capabilities: CapabilityRegistry,
  currentRawText: string,
  previousRawText: string | undefined,
  outputDir: string,
): Promise<AnalyticsRunResult> {
  const canonicalPropertyId = assertAnalyticsRequest(request, registry, capabilities);
  const clientDisplayName = registry.clients.find((client) => client.client_id === request.client_id)?.display_name ?? request.client_id;
  const currentRows = parseSearchAnalyticsResponse(currentRawText);
  const previousRows = previousRawText === undefined ? null : parseSearchAnalyticsResponse(previousRawText);
  const current = aggregateSearchAnalytics(currentRows);
  const previous = previousRows === null ? null : aggregateSearchAnalytics(previousRows);
  const comparison = previous === null ? null : comparePeriods(current, previous);
  const requestText = canonicalJson(request);
  const requestHash = sha256(requestText);
  const responseHash = sha256(currentRawText);
  const previousResponseHash = previousRawText === undefined ? undefined : sha256(previousRawText);
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
    ...(previousResponseHash ? { comparison_response_hash: previousResponseHash, comparison_raw_artifact_ref: "raw-response-previous.json" } : {}),
  };
  const observation: MetricObservation = {
    observation_id: `observation_${request.run_id}`,
    metric_id: "gsc.clicks",
    client_id: request.client_id,
    property_id: canonicalPropertyId,
    period: request.date_range,
    value: current.clicks,
    source_ref: sourceId,
    normalized_at: request.captured_at,
  };
  const claim: Claim = {
    claim_id: `claim_${request.run_id}`,
    statement: `GSC clicks for ${canonicalPropertyId} from ${request.date_range.start} to ${request.date_range.end}: ${current.clicks}`,
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
  const analytics = {
    current_date_range: request.date_range,
    previous_date_range: request.comparison_date_range,
    current,
    previous,
    period_over_period: comparison,
  };
  const reportBase = {
    report_id: `report_${request.run_id}`,
    schema_version: request.schema_version,
    run_id: request.run_id,
    client_id: request.client_id,
    client_display_name: clientDisplayName,
    property_refs: [canonicalPropertyId],
    source_refs: [sourceId],
    observation_refs: [observation.observation_id],
    claim_refs: [claim.claim_id],
    generated_at: request.captured_at,
    evidence_manifest_ref: "manifest.json",
    analytics,
  };
  const reportHash = sha256(canonicalJson(reportBase));
  const report: AnalyticsReport = { ...reportBase, canonical_json_hash: reportHash };
  const files: Record<string, string> = {
    "request.json": requestText,
    "raw-response.json": currentRawText,
    ...(previousRawText === undefined ? {} : { "raw-response-previous.json": previousRawText }),
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
