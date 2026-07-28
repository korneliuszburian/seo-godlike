# Compound history deduplication identity

Labels: `implementation`, `HITL`
Status: closed
Claimed by: Codex
Map: `seo-godlike-infra`
Blocked by: `10-history-dashboard-and-schedule`

## Outcome

Prevent valid multi-property agency bundles from colliding when their
provider-generated `run_id` values are equal.

## Acceptance

- [x] Deduplication key includes `run_id`, `client_id`, and canonical
  `property_id`.
- [x] Same tuple retains the later normalized `generated_at`.
- [x] Equal run IDs across different canonical properties remain separate.
- [x] Existing same-property duplicate warning and `skipped_bundles` behavior
  remains deterministic.
- [x] ADR records the durable identity decision.

## Non-goals

- No provider calls, authentication changes, schema migration, push, or
  client-facing Markdown redesign.

## Proof

- `npm run build` — passed.
- `npm test` — passed: 26 TypeScript tests and 3 context-packet tests.
- `git diff --check` — passed.
