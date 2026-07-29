# Second read-only provider

Labels: `wayfinder:research`
Status: closed
Map: `../map.md`

## Question

Which provider after GSC — GA4, Ahrefs, Localo, or another candidate — gives
the highest agency value with an attainable read-only credential and smallest
bounded proof, and what adapter boundary does its real API require?

## Resolution

GA4 Data API was the recommended second-provider candidate and is now
implemented as a local read-only adapter. Ahrefs is delivered separately under
ADR-0016 as a bounded Site Explorer profile provider; this ticket remains the
historical decision for the GA4 route.

Research dispositions: `reconciled-route-single-large-slice`,
`ga4-large-slice-advances-three-ledgers`.
