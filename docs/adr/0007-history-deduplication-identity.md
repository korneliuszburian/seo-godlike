# ADR-0007: Compound identity for history deduplication

- Status: accepted
- Date: 2026-07-28

## Decision

History deduplication identity is the tuple `run_id`, `client_id`, and the
canonical `property_id`. A duplicate is replaced by the entry with the later
normalized `generated_at`; equal timestamps use deterministic `bundle_path`
ordering.

## Rationale

An agency client may own multiple properties. The current analytics run ID
contains the client and date range but not necessarily the property, so
deduplicating by `run_id` alone can discard valid evidence for another site.
The canonical property ID is already resolved before bundle creation and is
the stable identity used by downstream reports.

## Consequences

Retries for the same client/property/run retain only the latest generated
bundle. Identical run IDs for different clients or canonical properties remain
independent history entries. Legacy bundles continue to work because the
identity is derived from fields already present in `report.json`.

## Falsifier

Revisit if a provider emits a stable execution identity that is guaranteed
globally unique across clients and properties, or if a known-answer multi-site
fixture demonstrates that the tuple merges distinct evidence.
