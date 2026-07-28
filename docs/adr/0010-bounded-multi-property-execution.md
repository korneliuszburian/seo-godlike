# ADR-0010: Bounded sequential multi-property execution

- Status: accepted
- Date: 2026-07-28

## Decision

The local `--analytics-batch` command executes requested properties sequentially
with one immutable output directory per canonical property. A property failure
is recorded in the batch result and does not prevent later properties from
running. The process exits non-zero when any property fails.

## Rationale

Sequential execution keeps provider quota pressure and operator traces simple
while the first agency multi-property path is established. Continuing after a
failure preserves evidence for authorized properties without presenting a
partial batch as fully successful.

## Consequences

Successful properties retain their bundles even when another property is
blocked. The batch summary identifies requested, completed, and failed property
IDs. Parallelism, queueing, locking, and retries remain separate reliability
decisions.

## Falsifier

Revisit if measured agency workloads cannot complete within the bounded
operator window, or if provider quota evidence shows sequential calls are
materially less safe than a bounded concurrency model.
