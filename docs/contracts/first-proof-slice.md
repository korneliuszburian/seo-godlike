# First proof-slice domain contract

Status: accepted design contract; implementation pending.
Scope: one explicit client, one GSC property, one bounded date range, and the
`clicks` metric.

All objects carry `schema_version` and use stable identifiers. Unknown values
are explicit `null` or a typed `unknown` state; they are never inferred from
visibility in an account.

## AnalysisRequest

```text
AnalysisRequest {
  schema_version: string
  run_id: string
  client_id: string
  property_id: string
  provider: "google-search-console"
  operation: "search_analytics.query"
  metric: "clicks"
  date_range: { start: ISODate, end: ISODate }
  dimensions: []
  credential_ref: string
  policy_mode: "read_only"
}
```

Invariants: `client_id`, `property_id`, `credential_ref`, and the date range
are required; `dimensions` is empty for the first proof; the operation and
metric must be present in the capability registry; the request cannot carry a
write operation.

## CapabilityRecord

```text
CapabilityRecord {
  capability_id: string
  provider: string
  operation_id: string
  api_version: string | null
  transport: string
  auth_method: string
  scopes: string[]
  read_write: "read"
  state: "documented" | "installed" | "authenticated" | "reachable" |
         "schema_verified" | "validated_real_domain"
  evidence_ref: string
}
```

State transitions require a new local proof. Configuration alone cannot set
`authenticated`, `schema_verified`, or `validated_real_domain`.

## SourceRecord and raw evidence

```text
SourceRecord {
  source_id: string
  provider: string
  operation_id: string
  request_hash: string
  response_hash: string
  captured_at: ISODateTime
  redaction_policy: string
  raw_artifact_ref: string
}
```

The raw response is immutable after capture. The evidence manifest records its
algorithm, hash, byte length, and content type. Secrets, access tokens, and
unredacted private credentials are never raw evidence.

## MetricDefinition and MetricObservation

```text
MetricDefinition {
  metric_id: "gsc.clicks"
  provider: "google-search-console"
  operation_id: "search_analytics.query"
  unit: "count"
  aggregation: "sum"
  dimensions: []
}

MetricObservation {
  observation_id: string
  metric_id: "gsc.clicks"
  client_id: string
  property_id: string
  period: { start: ISODate, end: ISODate }
  value: number
  source_ref: string
  normalized_at: ISODateTime
}
```

An observation is valid only when its source reference, client/property scope,
period, metric definition, and numeric unit reconcile.

## Claim

```text
Claim {
  claim_id: string
  statement: string
  observation_refs: string[]
  confidence: "observed"
  validation: "passed" | "failed"
  created_at: ISODateTime
}
```

The first claim is a direct observation, not an SEO recommendation or causal
inference. A failed validation cannot enter the report.

## Report

```text
Report {
  report_id: string
  schema_version: string
  run_id: string
  client_id: string
  property_refs: string[]
  source_refs: string[]
  observation_refs: string[]
  claim_refs: string[]
  generated_at: ISODateTime
  evidence_manifest_ref: string
  canonical_json_hash: string
}
```

The JSON report is canonical. Markdown is rendered deterministically from this
object and cannot introduce claims absent from JSON.

## CompanyLogEvent

```text
CompanyLogEvent {
  event_id: string
  run_id: string
  capability_id: string
  operation_id: string
  client_id: string
  property_id: string
  request_hash: string
  response_hash: string | null
  outcome: "started" | "retried" | "succeeded" | "failed"
  error_category: string | null
  occurred_at: ISODateTime
}
```

Events contain metadata and hashes only; they never contain tokens or full
provider payloads.

## FailureEnvelope

```text
FailureEnvelope {
  failure_id: string
  run_id: string
  category: "authorization" | "scope" | "property" | "schema" |
            "quota" | "timeout" | "transport" | "validation" | "policy"
  retryable: boolean
  message: string
  provider_code: string | null
  request_hash: string | null
  occurred_at: ISODateTime
}
```

Authorization, scope, property, schema, policy, and validation failures fail
closed. Only bounded transient transport/quota failures may be retried.

## Cross-object invariants

1. Every object in a run resolves to exactly one `client_id` and explicit
   `property_id` unless it is a capability or failure before property selection.
2. Every observation links to one immutable source record and one metric
   definition.
3. Every claim links to validated observations; reports link to all included
   evidence and preserve the canonical JSON hash.
4. A report cannot be generated after a policy, scope, authorization, or
   validation failure.
5. A new provider or write operation requires a separate capability record,
   policy decision, and proof; it cannot reuse this read-only contract by
   implication.
