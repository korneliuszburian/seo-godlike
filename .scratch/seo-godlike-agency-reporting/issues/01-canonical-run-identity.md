# Canonical run identity

Labels: `wayfinder:grilling`
Status: closed
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

## Resolution

New analytics runs use encoded `client_id`, canonical `property_id`, provider,
and current date range in `run_id`. History compound identity remains the
authoritative retry guard. Provider and property scope are therefore visible
at bundle creation time without exposing URL separators in the identifier.

Proof is recorded in `src/run-id.test.ts` and the CLI wiring:

- `npm run build` — passed;
- `npm test` — passed: 28 TypeScript tests and 3 context-packet tests;
- `git diff --check` — passed.
