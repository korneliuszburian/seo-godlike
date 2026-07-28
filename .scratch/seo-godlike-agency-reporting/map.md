# Agency reporting goal wayfinder:map

## Destination

Agency-grade, multi-tenant, read-only SEO reporting foundation: many clients
and properties, Google Search Console as the first provider, immutable evidence,
deterministic JSON/Markdown reports, and a route to additional providers.
This goal excludes Ads, provider writes, automatic consent, and hosted
deployment until their decisions are separately earned.

## Notes

This map owns decisions and fog, not implementation. The user requested one
goal containing ten bounded implementation slices followed by one external
review fixed point. After the decision frontier is clear, `$slice-work` owns
the ten-slice decomposition and `$delivery-loop` owns execution and proof.

The repository-local Markdown tracker is the source of truth because
`docs/agents/issue-tracker.md` defines no native wayfinder operations. Child
tickets below are one decision each; `Blocked by` names the prerequisite ticket
path rather than inventing a second tracker.

## Decisions so far

- [Tenant and property isolation](../seo-godlike-infra/issues/06-tenant-security.md)
  — explicit client/property/provider scope and fail-closed access.
- [Compound history identity](../seo-godlike-infra/issues/11-compound-history-dedup.md)
  — deduplicate by run ID, client, and canonical property.
- [Skipped bundle presentation](../seo-godlike-infra/issues/12-skipped-bundles-markdown.md)
  — JSON authority plus operator-facing Markdown section.
- [ADR-0003](../../docs/adr/0003-tenant-property-isolation.md) and
  [ADR-0007](../../docs/adr/0007-history-deduplication-identity.md) are the
  durable architecture authorities for those boundaries.
- [Canonical run identity](issues/01-canonical-run-identity.md) — new analytics
  run IDs encode client, canonical property, provider, and date range.
- [New bundle timestamp contract](issues/02-timestamp-contract.md) — writers
  require canonical ISO timestamps while readers accept legacy evidence.
- [Bounded multi-property execution](issues/03-multi-property-execution.md) —
  sequential per-property bundles continue after failures and report non-zero
  status for partial batches.
- [Registry onboarding policy](issues/05-registry-onboarding-policy.md) —
  onboarding is explicit, validated, duplicate-rejecting, and atomic.
- [Provider adapter contract](issues/06-provider-adapter-contract.md) —
  transport/provider details stay behind adapters while policy and evidence
  remain separate owners; a shared interface waits for the second provider.
- [Capability version gates](issues/07-capability-version-policy.md) — explicit
  incompatible versions fail closed and legacy missing versions default to the
  current provider version.
- [Local schedule reliability guard](issues/08-scheduling-reliability-policy.md)
  — Linux `flock`, bounded provider retries, and stdout-only schedule rendering;
  retention remains deferred.
- [Escaped local HTML boundary](issues/09-client-report-boundary.md) — HTML is
  a derived local export with escaped text and no hosted/link-sharing surface.
- [Hosted runtime deferral](issues/10-hosted-credential-boundary.md) — hosted
  credentials, deployment, and public runtime belong to a separate goal with
  new authority and review.
- [Known-answer live proof](issues/04-known-answer-data-window.md) — temporary
  non-production scope proved non-zero GSC analytics and manifest integrity;
  tenant ownership was not inferred.

## Frontier tickets

- [01 canonical run identity](issues/01-canonical-run-identity.md) — decide
  whether generated run IDs include canonical property and provider.
- [02 timestamp contract](issues/02-timestamp-contract.md) — decide legacy
  acceptance versus strict ISO input for new bundles.
- [03 multi-property execution](issues/03-multi-property-execution.md) — decide
  batch/partition semantics and report isolation for one client with many sites.
- [04 known-answer data window](issues/04-known-answer-data-window.md) — decide
  the live non-zero GSC proof property and date-window acceptance.
- [05 registry onboarding policy](issues/05-registry-onboarding-policy.md) —
  decide discovery, explicit confirmation, aliases, and idempotency.
- [06 provider adapter contract](issues/06-provider-adapter-contract.md) —
  decide the common read-only adapter seam before GA4/Ahrefs/Localo.
- [07 capability/version policy](issues/07-capability-version-policy.md) —
  decide provider API versions, capability states, and compatibility gates.
- [08 scheduling/reliability policy](issues/08-scheduling-reliability-policy.md)
  — decide locking, retries, retention, and operator-visible failures.
- [09 client-facing report boundary](issues/09-client-report-boundary.md) —
  decide Markdown/HTML/export safety and tenant redaction rules.
- [10 hosted credential boundary](issues/10-hosted-credential-boundary.md) —
  decide when and how local keyring moves to hosted secret management.

## Not yet specified

- Which exact properties/date ranges constitute the first non-zero live proof.
- Whether the ten slices stop at a local agency tool or include a hosted runtime.
- The final provider set and ordering after GSC.
- Retention duration and storage/index strategy for agency-scale evidence.
- Whether client-facing HTML is in this goal or a following goal.

## Out of scope

- Google Ads and all provider write operations.
- Automatic Google consent or credential acquisition.
- Production MCP server implementation.
- Unreviewed external publication, deployment, or client messaging.
- Multi-region infrastructure and enterprise SSO.
- Hosted credential migration and deployment for this goal; see ADR-0014.
