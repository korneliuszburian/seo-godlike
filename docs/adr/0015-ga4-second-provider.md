# ADR-0015: GA4 as the second read-only provider

- Status: accepted for local adapter implementation
- Date: 2026-07-28

## Decision

Google Analytics Data API is the next provider after GSC. The local slice owns
only a read-only `properties.runReport` path for the `sessions` metric, with a
distinct `analytics.readonly` scope, numeric GA4 resource IDs in the canonical
form `properties/<digits>`, an explicit `google-analytics` capability record,
quota metadata, and the existing manifest-verified evidence bundle contract.

The live GA4 property, OAuth scope consent, and validated-real-domain state are
operator-gated. No GA4 capability is marked live in the repository fixture until
that proof exists.

The shared `Report` contract requires `provider` and `operation`. These fields
are evidence metadata, not optional presentation fields; both provider writers
must persist them in `report.json`. This keeps the GSC and GA4 bundles
machine-disambiguated without introducing a second report base type.

## Rationale

GA4 shares the Google identity family and keyring boundary already proven for
GSC, while exercising real provider variation: a different scope, resource
identity, endpoint, response shape, metric, and quota model. Ahrefs is deferred
because its first proof has higher plan/unit and credential friction. Fallow is
a repository-quality aid, not a reporting provider.

## Consequences

The adapter is local and fixture-testable without consent. `--ga4-analytics
--raw` proves parsing and evidence writing; the OAuth path is available only
after operator authorization. SQLite, hosted runtime, Ads, and writes remain
outside this decision.

## Falsifier

Revisit if the agency Google identity cannot obtain a bounded GA4 read-only
proof, if the documented API contract cannot preserve the evidence seam, or if
an alternative provider has demonstrably lower access and proof friction.
