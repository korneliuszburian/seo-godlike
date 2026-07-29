# ADR-0013: Escaped local HTML report boundary

- Status: accepted for local export
- Date: 2026-07-28

## Decision

The local agency report may emit a deterministic executive HTML summary and a
separate full evidence appendix alongside JSON and Markdown. The executive
view is presentation-only: it uses explicit `Observed`, `Estimated`,
`Derived`, `Rule-based signal`, and `Unavailable` labels and may show a bounded
preview. The appendix remains the complete local context/findings view. All
report-derived strings are HTML-escaped and rendered as text; bundle paths are
not turned into links. The CLI does not host, publish, or share the files.

## Rationale

Client-facing presentation needs an explicit escaping boundary. A local static
export provides a useful next consumer while avoiding a server, URL policy, or
cross-tenant sharing surface. Separating executive presentation from the full
appendix prevents a display limit from becoming an evidence limit.

## Consequences

HTML and Markdown are derived views; JSON and manifest hashes remain
authoritative. Linkification, CSP, authentication, and hosted delivery require
separate decisions.

## Falsifier

Revisit if a future renderer demonstrates that plain escaped text cannot serve
the intended report consumer, or if hosting introduces a stronger boundary.
