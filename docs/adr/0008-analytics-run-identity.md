# ADR-0008: Analytics run identity

- Status: accepted
- Date: 2026-07-28

## Decision

New analytics `run_id` values encode the client ID, canonical property ID,
provider, and current date range. Each component is URI-encoded and joined in
the stable form `analytics_<client>_<property>_<provider>_<start>_<end>`.

## Rationale

The run identity should carry enough scope to distinguish two properties owned
by one client before history indexing. Encoding keeps URL-prefix properties and
other identifiers from introducing path separators or ambiguous delimiters.
The history compound key remains necessary for legacy bundles and retry policy.

## Consequences

New CLI analytics bundles are self-describing at the run ID boundary. Existing
bundles remain readable and are deduplicated using their report fields. A later
provider-specific execution ID may replace this derived identity only through
a new compatibility decision.

## Falsifier

Revisit if a provider supplies a globally unique immutable execution ID with
stronger retry semantics, or if URI-encoded run IDs cannot be consumed by the
evidence manifest and downstream report identifiers.
