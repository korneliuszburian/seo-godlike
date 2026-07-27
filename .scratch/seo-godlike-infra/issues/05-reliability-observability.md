# Reliability, quota, and audit signals

Labels: `wayfinder:grilling`, `HITL`
Status: closed
Claimed by: Codex
Map: `seo-godlike-infra`
Blocked by: `02-evidence-persistence`, `04-provider-boundary`

## Question

What retry, timeout, quota, idempotency, redaction, failure-envelope, and audit
signals are required for a trustworthy read-only GSC proof without introducing
production operations prematurely?

## Resolution

Use bounded timeouts and exponential backoff only for transient transport or
quota responses. Fail closed on authorization, scope, schema, and property
errors. Record retries and final outcomes with redacted capability, operation,
scope, request hash, response hash, and error category. No production
observability platform is required for the local proof.

This decision is recorded in [ADR-0005](../../../docs/adr/0005-immutable-evidence-reliability.md).
