# ADR-0013: Escaped local HTML report boundary

- Status: accepted for local export
- Date: 2026-07-28

## Decision

The history dashboard may emit a deterministic local HTML summary alongside
JSON and Markdown. All report-derived strings are HTML-escaped and rendered as
text; bundle paths are not turned into links. The CLI does not host, publish,
or share the file.

## Rationale

Client-facing presentation needs an explicit escaping boundary. A local static
export provides a useful next consumer while avoiding a server, URL policy, or
cross-tenant sharing surface.

## Consequences

HTML is a derived view; JSON remains authoritative. Linkification, CSP,
authentication, and hosted delivery require separate decisions.

## Falsifier

Revisit if a future renderer demonstrates that plain escaped text cannot serve
the intended report consumer, or if hosting introduces a stronger boundary.
