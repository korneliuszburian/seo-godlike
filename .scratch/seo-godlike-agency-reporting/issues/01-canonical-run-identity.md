# Canonical run identity

Labels: `wayfinder:grilling`
Status: open
Map: `../map.md`

## Question

Should generated `run_id` include canonical property and provider in addition
to client and date range, and what invariant must remain stable across retries?

## Context

ADR-0007 protects history with a compound key, but generation still omits the
property. Resolve whether prevention at creation is required for the next ten
slices.

## Blocked by

None.
