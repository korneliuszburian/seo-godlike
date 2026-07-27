# SEO Godlike infrastructure wayfinder

## Destination

Decision-complete infrastructure blueprint for the first safe read-only proof
slice: `bodymove.pl` → Google Search Console → one canonical metric → immutable
evidence → deterministic JSON/Markdown report.

## Notes

This map owns decisions, not implementation. Resolve one ticket at a time and
record the decision in that ticket. Consult `domain-modeling`,
`source-to-decision`, and `second-opinion-review` where the ticket requires it.
The current repository is a clean documentation-layout commit with no product
runtime or provider adapter.

## Decisions so far

- [Google authentication and secret boundary](issues/03-google-auth-and-secrets.md) — adopt agency user OAuth with offline read-only GSC scope; defer service-account keys.
- [Execution boundary for the first proof slice](issues/01-execution-boundary.md) — local explicit CLI; hosting deferred.
- [Tenant and property isolation](issues/06-tenant-security.md) — fail closed on explicit `client_id → property_id → provider` scope.
- [Evidence persistence and retention](issues/02-evidence-persistence.md) — append-only evidence bundles; JSON authoritative.
- [Provider adapter and MCP boundary](issues/04-provider-boundary.md) — official API adapter first; MCP thin and deferred.
- [Reliability, quota, and audit signals](issues/05-reliability-observability.md) — bounded retry and redacted audit signals.

## Not yet specified

- Exact Google Cloud project and secret-manager choice for hosted execution.
- Concrete GSC property identifier and known-answer date window after consent.
- Operational deployment shape beyond the first local proof slice.

## Out of scope

- Google Ads and all write operations.
- Production MCP server implementation.
- Automatic property onboarding without explicit scope confirmation.
- Multi-region deployment, paid observability, and enterprise SSO before the
  read-only proof exists.
