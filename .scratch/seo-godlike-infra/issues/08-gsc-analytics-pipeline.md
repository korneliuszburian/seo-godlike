# Full read-only GSC analytics pipeline

Labels: `implementation`, `HITL`
Status: in_progress
Claimed by: Codex
Map: `seo-godlike-infra`
Blocked by: `03-google-auth-and-secrets`, `06-tenant-security`

## Outcome

Extend the verified `sc-domain:bodymove.pl` proof into a bounded agency-ready
analytics run: automatically select a lagged 28-day window, query GSC with
`query`, `page`, `country`, and `device`, aggregate deterministic summaries,
compare the previous period, and persist immutable evidence.

## Acceptance

- [ ] Calculate current and previous inclusive 28-day ranges from system UTC
  date minus a three-day lag.
- [ ] Run two read-only GSC Search Analytics queries with rowLimit 25000 and
  the exact four dimensions.
- [ ] Deduplicate identical provider rows, aggregate top queries/pages, and
  expose CTR breakdowns by device and country.
- [ ] Include period-over-period totals with null percentage changes when the
  previous denominator is zero.
- [ ] Write raw current/previous responses, hashes, normalized observation,
  claim, report, Markdown, and manifest with exclusive file creation.
- [ ] Add focused tests for ranges, aggregation/deduplication, and bundle shape.

## Non-goals

- Ads, write operations, MCP, recommendations, ranking interpretation, or
  automatic client/property onboarding.
- Publishing, GitHub issue creation, or hosted deployment.

## Proof

Pending implementation and real bounded smoke.
