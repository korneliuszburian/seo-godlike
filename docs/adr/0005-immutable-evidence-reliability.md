# ADR-0005: Immutable evidence and reliability

- Status: accepted for the first proof
- Date: 2026-07-27

## Decision

Each run writes an append-only evidence bundle containing the redacted request
metadata, immutable raw response, SHA-256 hashes, normalized observation,
validated claim, canonical JSON report, deterministic Markdown rendering, and
manifest. JSON is authoritative; Markdown is derived.

Read-only calls use bounded timeouts and exponential backoff only for
transient transport/quota responses. Every retry and final outcome is recorded
without secrets. Non-retryable authorization, scope, schema, and property
errors fail closed.

## Rationale

A report is useful only when its metric can be traced to a specific provider
response and request scope. Bounded retries improve reliability without hiding
quota or authorization failures.

## Consequences

Evidence retention and storage location are explicit run configuration, never
an accidental log side effect. The first proof does not require a database;
later indexing may consume the immutable bundles.

## Falsifier

Revisit if the known-answer run cannot reproduce the same canonical report from
the preserved raw response, or if retry behavior can duplicate or conceal an
observable provider failure.
