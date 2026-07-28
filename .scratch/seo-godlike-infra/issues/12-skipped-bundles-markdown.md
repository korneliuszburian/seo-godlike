# Skipped bundles in Markdown dashboard

Labels: `implementation`, `HITL`
Status: closed
Claimed by: Codex
Map: `seo-godlike-infra`
Blocked by: `11-compound-history-dedup`

## Outcome

Expose deduplicated bundle paths in the operator-facing Markdown executive
summary while retaining JSON as the machine-readable authority.

## Acceptance

- [x] Render a deterministic `## Skipped bundles` section when paths exist.
- [x] Keep the section absent for summaries without skipped bundles.
- [x] Cover the rendered path at the dashboard file boundary.

## Non-goals

- No provider calls, authentication changes, storage migration, push, or cron
  changes.

## Proof

- `npm run build` — passed.
- `npm test` — passed: 26 TypeScript tests and 3 context-packet tests.
- `git diff --check` — passed.
