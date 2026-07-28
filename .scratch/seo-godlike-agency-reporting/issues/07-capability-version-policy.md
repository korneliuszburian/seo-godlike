# Capability and provider version policy

Labels: `wayfinder:research`
Status: closed
Map: `../map.md`

## Question

How are provider API versions, capability states, deprecations, and read/write
classification declared and fail-closed at runtime?

## Blocked by

[06-provider-adapter-contract.md](06-provider-adapter-contract.md)

## Resolution

Capabilities may declare `api_version`; GSC uses `v3` and rejects an explicit
incompatible version as a schema error. Missing version remains a legacy
compatibility path that defaults to the current supported version. ADR-0011
records the decision and the fixture now declares `v3` explicitly.

Proof includes the unsupported-version test plus the full build/test/diff
gates:

- `npm run build` — passed;
- `npm test` — passed: 32 TypeScript tests and 3 context-packet tests;
- `git diff --check` — passed.
