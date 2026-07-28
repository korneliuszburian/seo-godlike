# Large slice acceptance boundary

Labels: `wayfinder:grilling`
Status: closed
Map: `../map.md`

## Question

What is the smallest complete vertical slice that materially advances the
agency control plane after research — including implementation scope, proof,
operator action, and the fixed-point review boundary?

## Resolution

The next large slice is the local GA4 read-only adapter and capability path:
scope-aware OAuth preflight, numeric GA4 property validation, bounded
`runReport`, quota metadata, manifest-verified evidence, and focused tests.
It must not include SQLite, hosted operations, Fallow provider integration, Ads,
or write operations. Live GA4 proof is operator-gated if the keyring lacks the
new scope.

Research synthesis: `reconciled-route-single-large-slice`.

## Local proof

- `npm test` — passed: 42 TypeScript tests and 3 context-packet tests;
- `git diff --check` — passed;
- fixture CLI proof writes a GA4 bundle and verifies every manifest hash;
- transport test verifies the canonical `v1beta/properties/<id>:runReport`
  endpoint and quota request payload.

## Does not prove

No OAuth consent, live GA4 request, property ownership, or validated-real-domain
capability state was claimed or executed in this slice.
