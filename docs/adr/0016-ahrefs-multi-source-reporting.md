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
joins and preserves provider provenance.

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

## Falsifier

Revisit if a live profile cannot stay within the declared endpoint/row budget,
if URL/query joins cross a registered property boundary, or if the report
cannot reproduce every headline and opportunity row from manifest-verified raw
responses.
