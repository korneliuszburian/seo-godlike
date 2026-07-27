# Execution boundary for the first proof slice

Labels: `wayfinder:grilling`, `HITL`
Status: closed
Claimed by: Codex
Map: `seo-godlike-infra`
Blocks: `02-evidence-persistence`, `04-provider-boundary`

## Question

Should the first proof slice run as a local CLI, a local service, or a hosted
service, and what execution boundary is authoritative for credentials, raw
evidence, and report generation?

## Resolution

Use a local, single-purpose CLI. It runs only when explicitly invoked, has no
public endpoint or background worker, and writes the evidence bundle and
deterministic report to the configured run directory. Hosting is deferred until
the local proof establishes the contracts and known-answer behavior.

This decision is recorded in [ADR-0001](../../../docs/adr/0001-local-read-only-proof-boundary.md).
