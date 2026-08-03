# ADR-0016: Bounded Ahrefs context in agency reports

- Status: accepted for the next reporting slice
- Date: 2026-07-29

## Decision

Extend the Ahrefs adapter from domain headline metrics to a bounded Site
Explorer context profile per registered Ahrefs property:

- `metrics` for domain-level estimated traffic and keyword totals;
- `top-pages` for the top 100 pages;
- `organic-keywords` for the top 500 keyword rows;
- `organic-competitors` for the top 20 competitor rows.

Each response remains a separate immutable raw artifact with request metadata,
source hash, normalized data, and manifest entry. The agency report composes
GSC observed metrics with Ahrefs estimated context through explicit URL/query
joins and preserves provider provenance. Bounded list artifacts also record the
requested row limit and returned row count, so a provider-side short response
is machine-detectable without treating it as a complete inventory. Cross-source
joins retain one of `matched`, `gsc_only`, or `ahrefs_only` rather than dropping
one-sided rows.

Keyword phrase research is a separate `keywords-explorer.overview` read-only
operation. It accepts only operator-supplied phrase groups, uses lowercase
country codes, applies a 100-phrase and preflight unit budget, and writes one
raw response artifact per group. Its estimated keyword metrics are not added
to Site Explorer or GSC totals and are not part of the page/query join unless
an explicit later decision defines that provenance.

## Alternatives rejected

- Pull every available row: rejected because Ahrefs API units are consumed by
  rows/fields and each paid request has a minimum cost.
- Treat Ahrefs traffic as an observed conversion or GSC click metric: rejected
  because it is an estimate from a different provider and data model.
- Let an LLM invent the report from raw payloads: rejected; model output may
  summarize verified normalized context but cannot become evidence.

## Consequences

The first full profile is bounded, repeatable, and suitable for all registered
domains. A larger export or Site Audit crawl requires a separate budgeted
decision. Missing endpoint access produces partial output rather than zeros.
Short list responses remain evidence, but are explicitly distinguishable from
the requested bound. One-sided joins remain visible as context with their
provider side absent.

## Falsifier

Revisit if a live profile cannot stay within the declared endpoint/row budget,
if URL/query joins cross a registered property boundary, or if the report
cannot reproduce every headline and opportunity row from manifest-verified raw
responses.
