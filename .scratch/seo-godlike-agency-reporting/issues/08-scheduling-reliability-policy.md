# Scheduling and reliability policy

Labels: `wayfinder:grilling`
Status: closed
Map: `../map.md`

## Question

What are the local/hosted scheduling, locking, retry, retention, quota, and
operator-failure semantics for repeated agency runs?

## Blocked by

[03-multi-property-execution.md](03-multi-property-execution.md)

## Resolution

Local scheduler output now uses non-blocking per-client `flock`; GSC transport
keeps bounded 5xx/429 retries. `--schedule` remains stdout-only. Retention,
cleanup, cross-platform locking, and hosted queueing are explicitly deferred
to later runtime work. ADR-0012 records the boundary.

Proof:

- `npm run build` — passed;
- `npm test` — passed: 32 TypeScript tests and 3 context-packet tests;
- `git diff --check` — passed.
