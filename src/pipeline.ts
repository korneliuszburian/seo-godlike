import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AnalysisRequest,
  CapabilityRegistry,
  Claim,
  ClientRegistry,
  CompanyLogEvent,
  MetricObservation,
  PolicyError,
  Report,
  SourceRecord,
} from "./domain.js";
import { canonicalJson, sha256 } from "./serialize.js";

interface SearchAnalyticsResponse {
  rows?: Array<{ clicks?: number }>;
}

export interface RunResult {
  outputDir: string;
  report: Report;
}

function assertRequest(
  request: AnalysisRequest,
  registry: ClientRegistry,
  capabilities: CapabilityRegistry,
): void {
  if (request.policy_mode !== "read_only" || request.operation !== "search_analytics.query") {
    throw new PolicyError("policy");
  }
  if (request.provider !== "google-search-console" || request.metric !== "clicks") {
    throw new PolicyError("scope");
  }
  const client = registry.clients.find((item) => item.client_id === request.client_id);
  const property = client?.properties.find(
    (item) => item.property_id === request.property_id && item.provider === request.provider,
  );
  if (!property) throw new PolicyError("scope");
  const capability = capabilities.capabilities.find(
    (item) => item.provider === request.provider && item.operation_id === request.operation,
  );
  if (!capability || capability.read_write !== "read") throw new PolicyError("schema");
}

function clicksFrom(raw: SearchAnalyticsResponse): number {
  const rows = raw.rows ?? [];
  return rows.reduce((total, row) => total + (row.clicks ?? 0), 0);
}

function markdown(report: Report, observation: MetricObservation, claim: Claim): string {
  return [
    `# SEO report: ${report.client_id}`,
    "",
    `- Property: ${observation.property_id}`,
    `- Period: ${observation.period.start} to ${observation.period.end}`,
    `- Metric: ${observation.metric_id}`,
    `- Value: ${observation.value}`,
    `- Claim: ${claim.statement}`,
    `- Canonical JSON hash: ${report.canonical_json_hash}`,
    "",
  ].join("\n");
}

async function writeExclusive(path: string, content: string): Promise<void> {
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });
}

export async function runFixtureAnalysis(
  request: AnalysisRequest,
  registry: ClientRegistry,
  capabilities: CapabilityRegistry,
  rawText: string,
  outputDir: string,
): Promise<RunResult> {
  assertRequest(request, registry, capabilities);
  const raw = JSON.parse(rawText) as SearchAnalyticsResponse;
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
    redaction_policy: "fixture_no_secrets",
    raw_artifact_ref: "raw-response.json",
  };
  const observation: MetricObservation = {
    observation_id: `observation_${request.run_id}`,
    metric_id: "gsc.clicks",
    client_id: request.client_id,
    property_id: request.property_id,
    period: request.date_range,
    value: clicksFrom(raw),
    source_ref: sourceId,
    normalized_at: request.captured_at,
  };
  const claim: Claim = {
    claim_id: `claim_${request.run_id}`,
    statement: `GSC clicks for ${request.property_id} from ${request.date_range.start} to ${request.date_range.end}: ${observation.value}`,
    observation_refs: [observation.observation_id],
    confidence: "observed",
    validation: "passed",
    created_at: request.captured_at,
  };
  const capabilityId = capabilities.capabilities.find(
    (item) => item.provider === request.provider && item.operation_id === request.operation,
  )?.capability_id;
  if (!capabilityId) throw new PolicyError("schema");
  const log: CompanyLogEvent = {
    event_id: `event_${request.run_id}`,
    run_id: request.run_id,
    capability_id: capabilityId,
    operation_id: request.operation,
    client_id: request.client_id,
    property_id: request.property_id,
    request_hash: requestHash,
    response_hash: responseHash,
    outcome: "succeeded",
    error_category: null,
    occurred_at: request.captured_at,
  };
  const manifestRef = "manifest.json";
  const reportBase = {
    report_id: `report_${request.run_id}`,
    schema_version: request.schema_version,
    run_id: request.run_id,
    client_id: request.client_id,
    property_refs: [request.property_id],
    source_refs: [sourceId],
    observation_refs: [observation.observation_id],
    claim_refs: [claim.claim_id],
    generated_at: request.captured_at,
    evidence_manifest_ref: manifestRef,
  };
  const reportHash = sha256(canonicalJson(reportBase));
  const report: Report = { ...reportBase, canonical_json_hash: reportHash };
  const files: Record<string, string> = {
    "request.json": requestText,
    "raw-response.json": rawText,
    "source.json": canonicalJson(source),
    "observation.json": canonicalJson(observation),
    "claim.json": canonicalJson(claim),
    "audit-event.json": canonicalJson(log),
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
  await writeExclusive(join(outputDir, manifestRef), canonicalJson(manifest));
  return { outputDir, report };
}
