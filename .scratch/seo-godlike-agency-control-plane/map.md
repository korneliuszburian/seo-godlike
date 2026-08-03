# Agency control plane expansion wayfinder:map

Map status: active route, explicitly confirmed for the current goal at fixed
point `b95bfec`. Ticket status and the capability inventory are the current
authority; this map is only the decision navigation for the route.

Freshness rule: when the route, blocker, or next decision changes, update the
owning ticket and this map in the same slice. Do not create a status snapshot
or mirror the update in `docs/ARCHITECTURE.md`.

## Destination

A decision-ready, agency-grade multi-tenant reporting control plane that can
onboard many clients and properties, retain immutable evidence, add a second
read-only provider safely, and define the boundary for future hosted execution.
The destination is a production-oriented foundation; Ads, provider writes, and
public client sharing remain outside this map unless a later decision earns them.

## Notes

This map follows the completed local GSC foundation in
`.scratch/seo-godlike-agency-reporting/`. Wayfinder owns the decision frontier;
`second-opinion-review` owns bounded external research; after the route is clear,
`implement` and `delivery-loop` own the large vertical slice, proof, review, and
publication. The operator has delegated routine sequencing, but irreversible
ownership, credential, and publication decisions remain explicit.

## Decisions so far

- [Completed local GSC foundation](../seo-godlike-agency-reporting/map.md) — one
  agency OAuth account, read-only GSC, registry, immutable evidence, history,
  batch execution, local scheduling, and fixed-point review are proven.
- [Tenant/property isolation](../../docs/adr/0003-tenant-property-isolation.md)
  — client and canonical property scope fail closed.
- [Provider seam](../../docs/adr/0004-provider-adapter-mcp-boundary.md) — keep
  provider-specific transport behind an adapter and avoid speculative universals.
- [Hosted runtime deferral](../../docs/adr/0014-hosted-runtime-deferral.md) —
  hosted credentials and deployment require a separate decision and authority.
- [GA4 second-provider route](issues/03-second-provider.md) — GA4 remains the
  next operator-gated Google provider; Ahrefs profile reporting is delivered
  for explicitly registered properties.
- [Fallow boundary](issues/04-fallow-boundary.md) — Fallow is a parallel,
  read-only repository-quality aid, not a provider or evidence authority.
- [Bundle-first storage](issues/01-evidence-storage-retention.md) — SQLite is
  optional and rebuildable, not a prerequisite for the next slice.
- [Large slice acceptance](issues/06-large-slice-acceptance.md) — implement the
  local GA4 adapter/capability/evidence path without hosting or consent.
- [Evidence quality frontier](issues/09-quality-evidence-frontier.md) — hard
  reportability gates remain evidence/policy based; Fallow stays advisory.
- [Retention and legal-hold authority](issues/07-retention-and-legal-hold.md) —
  deletion and legal hold are deferred; the local slice preserves bundles.
- [Client delivery surface boundary](issues/08-client-delivery-surface.md) —
  output is operator-only local JSON/Markdown/escaped HTML; no sharing or host.
- [Agency delivery slice acceptance](issues/10-large-slice-acceptance.md) —
  build one manifest-gated local report package over existing bundles.

## Not yet specified

- [Retention and legal-hold authority](issues/07-retention-and-legal-hold.md) —
  default retention, deletion authority, and hold representation.
- [Client delivery surface boundary](issues/08-client-delivery-surface.md) —
  smallest safe operator/client export contract.
- [Evidence quality frontier](issues/09-quality-evidence-frontier.md) —
  reject-versus-advisory checks for reportable evidence packages.
- [Agency delivery slice acceptance](issues/10-large-slice-acceptance.md) —
  one bounded implementation seam after the three decisions above.
- The live GA4 property and OAuth scope remain operator-gated.

## Out of scope

- Google Ads and all provider write operations.
- Automatic consent, credential acquisition, or secret copying into the repo.
- Public hosting, deployment, client messaging, or external publication without a
  separate authority gate.
- Enterprise SSO, multi-region infrastructure, and a universal MCP abstraction.
