# Agency control plane expansion wayfinder:map

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

## Not yet specified

- The durable evidence storage/index and retention contract for agency scale.
- The operator evidence and approval boundary for onboarding a new client/property.
- Which second provider earns priority and what its smallest read-only proof is.
- Whether Fallow is a provider, orchestration tool, review surface, or out of scope.
- The hosted execution model, secret manager, scheduling authority, and audit trail.
- The minimum client-facing delivery surface after the local control plane is stable.

## Out of scope

- Google Ads and all provider write operations.
- Automatic consent, credential acquisition, or secret copying into the repo.
- Public hosting, deployment, client messaging, or external publication without a
  separate authority gate.
- Enterprise SSO, multi-region infrastructure, and a universal MCP abstraction.
