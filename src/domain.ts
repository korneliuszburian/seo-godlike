export type Provider = "google-search-console" | "google-analytics" | "ahrefs";
export type ExternalProvider = "localo" | "google-analytics";
export type Operation = "search_analytics.query" | "properties.runReport" | "site-explorer.metrics";
export type MetricId = "gsc.clicks" | "gsc.impressions" | "gsc.ctr" | "gsc.position" | "ga4.sessions" | "ahrefs.org_traffic" | "ahrefs.org_keywords" | "ahrefs.org_keywords_top_3";

export interface AnalysisRequest {
  schema_version: string;
  run_id: string;
  client_id: string;
  property_id: string;
  provider: "google-search-console";
  operation: "search_analytics.query";
  metric: "clicks";
  date_range: { start: string; end: string };
  dimensions: [];
  credential_ref: string;
  policy_mode: "read_only";
  captured_at: string;
}

export type SearchAnalyticsDimension = "query" | "page" | "country" | "device";

export interface GscAnalyticsRequest {
  schema_version: string;
  run_id: string;
  client_id: string;
  property_id: string;
  provider: Provider;
  operation: Operation;
  metric: "clicks";
  date_range: { start: string; end: string };
  comparison_date_range: { start: string; end: string };
  dimensions: SearchAnalyticsDimension[];
  row_limit: 25000;
  credential_ref: string;
  policy_mode: "read_only";
  captured_at: string;
}

export interface Ga4AnalyticsRequest {
  schema_version: string;
  run_id: string;
  client_id: string;
  property_id: string;
  provider: "google-analytics";
  operation: "properties.runReport";
  metric: "sessions";
  date_range: { start: string; end: string };
  dimensions: ["date"];
  row_limit: 10_000;
  credential_ref: string;
  policy_mode: "read_only";
  captured_at: string;
}

export interface AhrefsAnalyticsRequest {
  schema_version: string;
  run_id: string;
  client_id: string;
  property_id: string;
  provider: "ahrefs";
  operation: "site-explorer.metrics";
  metric: "org_traffic";
  date_range: { start: string; end: string };
  credential_ref: string;
  policy_mode: "read_only";
  captured_at: string;
}

export interface ClientRegistry {
  clients: Array<{
    client_id: string;
    display_name?: string;
    properties: Array<{
      property_id: string;
      provider: Provider;
      canonical_property?: boolean;
      aliases?: string[];
    }>;
  }>;
}

export interface SourceRegistry {
  sources: Array<{
    source_id: string;
    client_id: string;
    provider: ExternalProvider;
    target: string;
    status: "ready" | "unavailable";
    reason: string | null;
  }>;
}

export interface CapabilityRegistry {
  capabilities: Array<{
    capability_id: string;
    provider: Provider;
    operation_id: Operation;
    api_version?: string;
    metric_ids?: MetricId[];
    dimensions?: string[];
    discovery?: "fixture_declared" | "live_discovered" | "operator_declared";
    read_write: "read";
    state: "schema_verified" | "validated_real_domain";
  }>;
}

export interface SourceRecord {
  source_id: string;
  provider: Provider;
  operation_id: Operation;
  request_hash: string;
  response_hash: string;
  captured_at: string;
  redaction_policy: "fixture_no_secrets" | "provider_response_no_credentials";
  raw_artifact_ref: string;
  comparison_response_hash?: string;
  comparison_raw_artifact_ref?: string;
}

export interface MetricObservation {
  observation_id: string;
  metric_id: MetricId;
  client_id: string;
  property_id: string;
  period: { start: string; end: string };
  value: number;
  source_ref: string;
  normalized_at: string;
}

export interface MetricDefinition {
  metric_id: MetricId;
  provider: Provider;
  operation: Operation;
  label: string;
  unit: "count" | "ratio" | "position";
  dimensions: string[];
  read_only: true;
}

export type ScopeStatus = "ready" | "unavailable" | "unsupported";

export interface ScopePlanEntry {
  client_id: string;
  client_display_name: string;
  property_id: string;
  provider: Provider;
  status: ScopeStatus;
  reason: string | null;
  metrics: MetricDefinition[];
}

export interface ScopePlan {
  schema_version: "1";
  generated_at: string;
  status: "ready" | "partial" | "empty";
  entries: ScopePlanEntry[];
}

export interface Claim {
  claim_id: string;
  statement: string;
  observation_refs: string[];
  confidence: "observed";
  validation: "passed";
  created_at: string;
}

export interface Report {
  report_id: string;
  schema_version: string;
  run_id: string;
  client_id: string;
  property_refs: string[];
  source_refs: string[];
  observation_refs: string[];
  claim_refs: string[];
  generated_at: string;
  evidence_manifest_ref: string;
  canonical_json_hash: string;
  provider: Provider;
  operation: Operation;
}

export interface CompanyLogEvent {
  event_id: string;
  run_id: string;
  capability_id: string;
  operation_id: Operation;
  client_id: string;
  property_id: string;
  request_hash: string;
  response_hash: string;
  outcome: "succeeded";
  error_category: null;
  occurred_at: string;
}

export class PolicyError extends Error {
  constructor(public readonly category: "policy" | "scope" | "schema", message?: string) {
    super(message ?? `${category}: request is not allowed`);
    this.name = "PolicyError";
  }
}
