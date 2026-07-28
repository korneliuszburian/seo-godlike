# Hosted operations boundary

Labels: `wayfinder:research`
Status: closed
Map: `../map.md`

## Question

When local execution becomes hosted, which runtime, secret manager, refresh
token boundary, approval model, audit trail, scheduler, and failure recovery
contract preserve the current read-only and fail-closed guarantees?

## Resolution

Secret Manager and Cloud Run Jobs are viable future primitives, but hosted
operations stay deferred behind ADR-0014 and a new operator-approved runtime
decision. The GA4 slice remains local keyring + local scheduler + bundle-first.

Research disposition: `hosted-operations-deferred-and-consistency-constraints`.
