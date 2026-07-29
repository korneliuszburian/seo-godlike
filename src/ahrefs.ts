import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { AhrefsAnalyticsRequest, CapabilityRegistry, Claim, ClientRegistry, CompanyLogEvent, MetricObservation, PolicyError, Report, SourceRecord } from "./domain.js";
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
  const claim: Claim = { claim_id: `claim_${request.run_id}`, statement: `Ahrefs estimated organic traffic for ${canonicalPropertyId} on ${request.date_range.end}: ${metrics.org_traffic}`, observation_refs: [observation.observation_id], confidence: "observed", validation: "passed", created_at: request.captured_at };
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
