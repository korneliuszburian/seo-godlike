# Agency delivery slice acceptance

Labels: `wayfinder:grilling`
Status: open
Map: `../map.md`
Blocked by: `07-retention-and-legal-hold.md`, `08-client-delivery-surface.md`, `09-quality-evidence-frontier.md`

## Question

What is the one large bounded implementation slice after the three frontier
decisions: its caller-to-output seam, owned paths, acceptance proof, and exact
non-goals?

The slice must consume existing verified bundles and preserve read-only,
multi-tenant, evidence-first boundaries. It must not silently include hosted
credentials, Ads, provider writes, automatic consent, or a universal MCP layer.
