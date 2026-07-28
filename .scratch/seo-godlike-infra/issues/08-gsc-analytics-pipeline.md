# Full read-only GSC analytics pipeline

Labels: `implementation`, `HITL`
Status: closed
Claimed by: Codex
Map: `seo-godlike-infra`
Blocked by: `03-google-auth-and-secrets`, `06-tenant-security`

## Outcome

Extend the verified `sc-domain:bodymove.pl` proof into a bounded agency-ready
analytics run: automatically select a lagged 28-day window, query GSC with
`query`, `page`, `country`, and `device`, aggregate deterministic summaries,
compare the previous period, and persist immutable evidence.

## Acceptance

- [x] Calculate current and previous inclusive 28-day ranges from system UTC
  date minus a three-day lag.
- [x] Run two read-only GSC Search Analytics queries with rowLimit 25000 and
  the exact four dimensions.
- [x] Deduplicate identical provider rows, aggregate top queries/pages, and
  expose CTR breakdowns by device and country.
- [x] Include period-over-period totals with null percentage changes when the
  previous denominator is zero.
- [x] Write raw current/previous responses, hashes, normalized observation,
  claim, report, Markdown, and manifest with exclusive file creation.
- [x] Add focused tests for ranges, aggregation/deduplication, and bundle shape.

## Non-goals

- Ads, write operations, MCP, recommendations, ranking interpretation, or
  automatic client/property onboarding.
- Publishing, GitHub issue creation, or hosted deployment.

## Proof

- `npm run build` — passed.
- `npm test` — 11 TypeScript tests and 3 context-packet tests passed.
- `git diff --check` — passed.
- `--preflight` — `READY_FOR_OPERATOR_CONSENT`, no consent/network in gate.
- Real bounded smoke — two read-only queries for `sc-domain:bodymove.pl`,
  current `2026-06-28..2026-07-25`, previous `2026-05-31..2026-06-27`.
- Final bundle — `artifacts/analysis/bodymove-analytics-pipeline-20260728/`,
  10 manifest entries with independent SHA-256 verification.

The real property returned zero rows in both periods. Non-empty aggregation,
deduplication, and report-shape behavior is covered by focused unit tests;
the smoke proves the provider boundary and immutable empty-result evidence.
