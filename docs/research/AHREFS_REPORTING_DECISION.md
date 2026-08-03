# Ahrefs multi-source reporting decision

## Decision question

How should the agency pipeline collect enough Ahrefs context for every
registered domain and combine it with GSC evidence into a client-readable SEO
report without confusing estimated provider metrics with observed search
performance or spending API units without a bound?

Consumer: the agency run planner and report composer.

Owner: Ahrefs adapter and agency report package.

Current local behavior: one read-only `site-explorer/metrics` request per
registered Ahrefs property, producing organic traffic, keyword count, and
Top-3 keyword count.

The phrase-research path is separate: one read-only
`keywords-explorer/overview` request per non-empty domain group from an
operator-supplied phrase file. It uses lowercase two-letter country codes,
the documented comma-separated `keywords` parameter, selected fields, and a
50-unit minimum estimate per request. It does not join keyword volume or
estimated clicks into GSC observations.

## Source mechanisms and dispositions

### Ahrefs API v3 introduction

Source: [Ahrefs API introduction](https://docs.ahrefs.com/en/api/docs/introduction),
current documentation retrieved 2026-07-29.

Mechanism: API v3 exposes Site Explorer overview, organic search, backlinks,
and other report families. Paid requests consume API units; cost depends on
rows and fields with a 50-unit minimum. Ahrefs recommends limiting fields and
rows, using free test queries during development, and limiting API-key usage.

Disposition: **adopt** a bounded request plan. The planner records endpoint,
target, date, row limit, selected fields, and credential reference in the
evidence request. It does not issue unbounded pagination or fetch raw secrets.

Falsifier: a live request plan exceeds the declared per-domain endpoint/row
budget or the response cannot be verified from its manifest.

### Site Explorer metrics

Source: [Metrics endpoint](https://docs.ahrefs.com/en/api/reference/site-explorer/get-metrics),
current documentation retrieved 2026-07-29.

Mechanism: `GET /v3/site-explorer/metrics` returns estimated organic traffic,
organic keyword count, Top-3 keyword count, and optional paid metrics for a
target/date/mode. Traffic is an Ahrefs estimate, not a Search Console
observation.

Disposition: **adopt** as the domain-level headline context, retaining the
provider label and date.

Falsifier: response fields are missing, negative, or cannot be parsed as the
declared numeric schema.

### Organic keywords

Source: [Organic keywords endpoint](https://docs.ahrefs.com/en/api/reference/site-explorer/get-organic-keywords),
current documentation retrieved 2026-07-29.

Mechanism: the endpoint supports target/date/comparison date, country,
`select`, `where`, `order_by`, and bounded `limit`; rows include keyword,
best position, position bucket, ranking URL, traffic estimate, volume,
difficulty, intent flags, SERP features, and previous-date fields.

Disposition: **adopt** a bounded opportunity table. Default report selection
is the top 500 rows ordered by estimated traffic, with position-change and
intent fields retained where supplied. This supports wins/losses and quick-win
segments without claiming a complete universe of keywords.

Falsifier: a report labels a limited response as complete inventory or mixes
Ahrefs estimated traffic with GSC clicks without separate provenance.

### Top pages

Source: [Top pages endpoint](https://docs.ahrefs.com/en/api/reference/site-explorer/get-top-pages),
current documentation retrieved 2026-07-29.

Mechanism: the endpoint returns page-level traffic, keyword counts, URL,
top keyword, ranking position, referring domains, URL rating, and comparison
fields; it accepts `select`, `order_by`, `limit`, target, mode, and dates.

Disposition: **adopt** a top-100 page table and URL-level join with GSC page
rows. URL normalization is deterministic and never changes the provider's
canonical raw value.

Falsifier: the join merges different hosts/properties or reports a page match
without preserving both provider references.

### Organic competitors

Source: [Organic competitors endpoint](https://docs.ahrefs.com/en/api/reference/site-explorer/get-organic-competitors),
current documentation retrieved 2026-07-29.

Mechanism: competitor rows expose competitor domain, Domain Rating, common /
target-only / competitor-only keyword counts, traffic, share, and comparison
fields. This is competitive context, not evidence of the client's own
performance.

Disposition: **adopt** a top-20 competitor context table, clearly labelled as
Ahrefs competitive estimates.

Falsifier: competitors are presented as verified business competitors or the
report omits target/date/mode provenance.

### Keywords Explorer overview

Source: [Keywords Explorer overview endpoint](https://docs.ahrefs.com/en/api/reference/keywords-explorer/get-overview),
current documentation retrieved 2026-08-03.

Mechanism: `GET /v3/keywords-explorer/overview` accepts a bounded
comma-separated phrase list, lowercase country, and explicit field selection.
The local adapter allows at most 100 phrases per request and records each
provider response as its own raw manifest-bound artifact.

Disposition: **adopt** as estimated phrase-level research context. The local
budget is checked before network IO using the 50-unit minimum per non-empty
domain group; response rows remain provider estimates and do not become
observed GSC metrics.

Falsifier: an uppercase country reaches the network, a request exceeds the
declared phrase or unit bound, or a report cannot reproduce a response from
its raw artifact and manifest.

### Cross-source composition

Sources: [Google Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
and the Ahrefs endpoint references above.

Mechanism: GSC groups observed clicks, impressions, CTR, and position by the
requested dimensions and may return only the top rows within internal limits;
Ahrefs supplies estimated rankings/traffic and page/keyword context. They can
be joined by canonical `client_id`, provider property, normalized URL, exact
case-folded query, and reporting period, but their values must remain separate.

Disposition: **adopt** a context layer with three explicit classes:

1. observed GSC performance;
2. estimated Ahrefs market/ranking context;
3. derived interpretation, which is never persisted as a provider metric.

Falsifier: a derived statement cannot point to both source rows or a missing
source is rendered as zero.

## Agentic execution contract

The manager creates one bounded Ahrefs specialist task per registered
`client_id/property_id`, with child fetch tasks for metrics, top pages, organic
keywords, and competitors. The evidence verifier accepts only manifest-bound
raw responses. The report composer consumes normalized context, not secrets or
unverified model prose. Failures remain per property/endpoint and produce
`partial` output with an explicit reason.

No automatic content recommendations, Ads changes, backlink outreach, or
provider writes are included in this decision.

## Cost and scope boundary

The initial production profile is four Ahrefs Site Explorer requests per
registered domain: metrics, top pages (100), organic keywords (500), and
organic competitors (20), with only selected fields. The API reference notes a
50-unit minimum for paid requests and the introduction documents a default
60-requests-per-minute limit. Before widening limits, the operator must verify
the workspace allowance and key limit.

Phrase research is budgeted separately: one overview request per non-empty
domain group, with a local default ceiling of 500 estimated units (10 groups ×
50 units) and no live run before parser, capability, and manifest tests pass.

## Does not prove

This decision does not prove that every registry domain is accessible by the
current Ahrefs key, that a competitor is commercially real, or that GSC and
Ahrefs numbers are directly comparable. Live proof remains per target and
per endpoint.
