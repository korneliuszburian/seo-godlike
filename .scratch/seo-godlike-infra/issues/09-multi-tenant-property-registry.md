# Multi-tenant property registry and onboarding

Labels: `implementation`, `HITL`
Status: closed
Claimed by: Codex
Map: `seo-godlike-infra`
Blocked by: `06-tenant-security`, `08-gsc-analytics-pipeline`

## Outcome

Extend the client/property registry with canonical property metadata, explicit
aliases, display names, and a fail-closed CLI onboarding path. Analytics input
may use a registered alias, but the provider request and evidence resolve to
the explicitly registered canonical property.

## Acceptance

- [x] Support optional `canonical_property`, `aliases`, and client
  `display_name` fields without breaking existing registry consumers.
- [x] Add `--add-property` with property-format, alias-format, client, and
  duplicate validation plus atomic registry replacement.
- [x] Reject an unregistered analytics property with an exact scope error
  before provider access.
- [x] Resolve canonical IDs and aliases to one evidence property.
- [x] Add focused CLI duplicate, unknown-property, alias, and persistence
  tests without changing existing passing tests.

## Proof

- `npm run build` — passed.
- `npm test` — 15 TypeScript tests and 3 context-packet tests passed.
- `git diff --check` — passed.
- preflight for `sc-domain:bodymove.pl` — `READY_FOR_OPERATOR_CONSENT`.

No consent, token output, or provider write operation was performed in this
slice.
