export type Provider = "google-search-console";
export type Operation = "search_analytics.query";

export interface AnalysisRequest {
  schema_version: string;
  run_id: string;
  client_id: string;
  property_id: string;
  provider: Provider;
  operation: Operation;
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

export interface ClientRegistry {
  clients: Array<{
    client_id: string;
    properties: Array<{ property_id: string; provider: Provider }>;
  }>;
}

export interface CapabilityRegistry {
  capabilities: Array<{
    capability_id: string;
    provider: Provider;
    operation_id: Operation;
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
  metric_id: "gsc.clicks";
  client_id: string;
  property_id: string;
  period: { start: string; end: string };
  value: number;
  source_ref: string;
  normalized_at: string;
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
  constructor(public readonly category: "policy" | "scope" | "schema") {
    super(`${category}: request is not allowed`);
    this.name = "PolicyError";
  }
}
