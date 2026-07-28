# Multi-property execution

Labels: `wayfinder:grilling`
Status: closed
Map: `../map.md`

## Question

For one client with many properties, should execution be sequential, bounded
parallel, or queue-backed, and how are partial failures represented without
cross-tenant aggregation?

## Blocked by

[01-canonical-run-identity.md](01-canonical-run-identity.md)

## Resolution

`--analytics-batch` runs properties sequentially, writes one output directory
per canonical property, continues after per-property failures, prints a batch
summary, and exits non-zero if any property failed. ADR-0010 records the
decision; parallelism and queueing remain deferred.

Proof:

- `npm run build` — passed;
- `npm test` — passed: 31 TypeScript tests and 3 context-packet tests;
- `git diff --check` — passed.
