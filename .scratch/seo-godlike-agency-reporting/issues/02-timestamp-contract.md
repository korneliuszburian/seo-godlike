# Timestamp contract

Labels: `wayfinder:grilling`
Status: closed
Map: `../map.md`

## Question

Are legacy Date-parseable `generated_at` values accepted indefinitely, or must
new bundles emit and readers require strict canonical ISO-8601?

## Blocked by

None.

## Resolution

New evidence writers require canonical ISO-8601 timestamps with milliseconds
and `Z`; history readers remain legacy-compatible through normalization.
`src/timestamps.ts` owns the shared runtime boundary and ADR-0009 records the
decision.

Proof:

- `npm run build` — passed;
- `npm test` — passed: 30 TypeScript tests and 3 context-packet tests;
- `git diff --check` — passed.
