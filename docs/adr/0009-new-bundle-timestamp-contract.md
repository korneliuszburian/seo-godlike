# ADR-0009: New bundle timestamp contract

- Status: accepted
- Date: 2026-07-28

## Decision

New evidence writers require `captured_at` to be canonical ISO-8601 with
milliseconds and a `Z` timezone, for example
`2026-07-28T08:00:00.000Z`. History readers continue normalizing and accepting
legacy Date-parseable `generated_at` values from existing bundles.

## Rationale

Writers control the timestamp contract and should emit one deterministic form.
Readers must remain compatible with already-preserved evidence while the
agency archive is migrated organically.

## Consequences

Invalid or non-canonical timestamps fail before a new bundle directory is
written. Existing reports are not rewritten. Future hosted ingestion can
reject the same contract at its transport boundary.

## Falsifier

Revisit if a preserved provider response requires a timezone representation
that cannot be normalized to this form without changing evidence meaning.
