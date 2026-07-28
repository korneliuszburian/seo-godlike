# Second read-only provider

Labels: `wayfinder:research`
Status: closed
Map: `../map.md`

## Question

Which provider after GSC — GA4, Ahrefs, Localo, or another candidate — gives
the highest agency value with an attainable read-only credential and smallest
bounded proof, and what adapter boundary does its real API require?

## Resolution

GA4 Data API is the recommended second-provider candidate. It shares the Google
identity family but needs a distinct read-only scope, numeric property ID,
capability row, quota-aware request, and live proof. Ahrefs is deferred because
its paid-plan/unit and credential friction is higher for this first extension.

Research dispositions: `reconciled-route-single-large-slice`,
`ga4-large-slice-advances-three-ledgers`.
