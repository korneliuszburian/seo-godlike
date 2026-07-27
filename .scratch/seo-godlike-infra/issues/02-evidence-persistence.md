# Evidence persistence and retention

Labels: `wayfinder:grilling`, `HITL`
Status: closed
Claimed by: Codex
Map: `seo-godlike-infra`
Blocks: `05-reliability-observability`
Blocked by: `01-execution-boundary`

## Question

What is the authoritative persistence model for immutable raw responses,
hashes, normalized observations, claims, and deterministic reports in the first
proof slice, including retention and redaction boundaries?

## Resolution

Use an append-only run bundle rather than a database for the first proof. It
contains redacted request metadata, raw response, hashes, observation, claim,
canonical JSON, derived Markdown, and a manifest. Secrets and full private
credentials are never part of the bundle. Retention is explicit run
configuration; later indexing may consume bundles but cannot replace them.

This decision is recorded in [ADR-0005](../../../docs/adr/0005-immutable-evidence-reliability.md).
