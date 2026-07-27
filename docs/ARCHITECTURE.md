# SEO Godlike architecture

Status: accepted for the first read-only proof slice
Scope: `bodymove.pl` → Google Search Console → one canonical metric → immutable
evidence → deterministic JSON and Markdown report.

This document is the navigation surface for the durable decisions in
[`docs/adr/`](adr/). It does not claim that provider access, OAuth consent, or
the runtime already exists.

## Runtime boundary

The first proof runs as a local, single-purpose CLI. It has no hosted service,
background worker, public endpoint, or write authority. A later hosted runtime
must preserve the same provider, tenant, evidence, and policy boundaries before
it is accepted as an extension.

## Request and data flow

```text
operator request
  → validated AnalysisRequest
  → explicit client/property/provider scope
  → capability and policy gate
  → read-only provider adapter
  → immutable raw response + request/response hashes
  → normalized MetricObservation
  → validated Claim
  → canonical JSON report
  → deterministic Markdown rendering
```

The canonical JSON report and evidence manifest are authoritative. Markdown is
a deterministic presentation of the JSON, never the source of truth.

The field-level contract for the first proof is [documented separately](contracts/first-proof-slice.md)
so implementation can validate it without turning this architecture overview
into an API schema dump.

## Ownership boundaries

- The client/property registry owns tenant scope and provider property IDs.
- The auth boundary owns credential references and token refresh; application
  code never receives or logs raw refresh tokens outside the credential client.
- Provider adapters own endpoint details, API version, pagination, quotas, and
  source-specific normalization.
- The policy gate owns read/write classification and refuses undeclared scope.
- The evidence writer owns immutable raw payloads, hashes, observations, claims,
  and report manifests.
- A future MCP facade may expose approved tools, but cannot bypass adapters,
  policy, tenant selection, or evidence capture.

## First proof contract

The first run must contain:

- one explicit `client_id`;
- one explicit GSC property identifier;
- one bounded date range;
- one read-only operation and one canonical metric: `clicks`;
- the raw provider response and its SHA-256 hash;
- a normalized observation linked to the raw artifact;
- a claim linked to the observation;
- deterministic JSON and Markdown reports;
- a redacted audit event with capability, operation, scope, request hash,
  response hash, and outcome.

## Deliberate deferrals

Service-account JSON keys, hosted deployment, multi-region infrastructure,
MCP server implementation, Google Ads, all provider writes, automatic property
onboarding, and broad multi-provider aggregation are outside this first proof.

## Durable decisions

- [ADR-0001: Local read-only proof boundary](adr/0001-local-read-only-proof-boundary.md)
- [ADR-0002: Agency OAuth and credential boundary](adr/0002-agency-oauth-credential-boundary.md)
- [ADR-0003: Tenant and property isolation](adr/0003-tenant-property-isolation.md)
- [ADR-0004: Provider adapter and MCP boundary](adr/0004-provider-adapter-mcp-boundary.md)
- [ADR-0005: Immutable evidence and reliability](adr/0005-immutable-evidence-reliability.md)
