# SEO Godlike architecture

Status: accepted foundation; agency control-plane expansion in progress
Scope: agency clients → registered properties → provider capabilities → metric
catalog → read-only evidence → deterministic reports.

This document is the navigation surface for the durable decisions in
[`docs/adr/`](adr/). It does not claim that provider access, OAuth consent, or
the runtime already exists.

## Documentation map

This is the repository's only durable documentation index. The linked surface
owns the information described by its name; this page only provides navigation
and stable architecture context.

- [Contracts](contracts/first-proof-slice.md) — executable-facing field and
  boundary contracts.
- [Architecture decisions](adr/0001-local-read-only-proof-boundary.md) —
  alternatives, consequences, and falsifiers for durable choices.
- [Capability inventory](capabilities/CAPABILITIES.md) — evidence-backed
  capability state and unknowns.
- [Discovery](discovery/ONBOARDING_DISCOVERY.md) — bounded environment and
  provider observations.
- [Research decisions](research/AUTH_RESEARCH.md) — source-backed decisions,
  not a transcript or a second implementation.
- [Operator runbooks](runbooks/google-gsc-proof.md) — procedures that cannot
  be inferred safely from the CLI and tests.
- [Scope planner](../../src/scope-plan.ts) — executable client/property/provider
  scope and metric-capability map exposed by `--scope-plan`.
- [External source registry](../../fixtures/source-registry.json) — sources
  such as Localo that are discovered separately from property adapters and must
  remain explicitly ready or unavailable.
- [Agent plan and Codex boundary](../../src/agent-plan.ts) — deterministic
  manager/specialist task plan plus the read-only local Codex SDK adapter;
  provider IO remains in the adapters.
- [Agent workflow](agents/artifacts.md) — tracker, domain, review, and artifact
  routing. Transient runs remain under the ignored `docs/agents/runs/` path.

Current queue, blockers, and claims remain in the local tracker below
`.scratch/`; they are intentionally not copied into this architecture page.
The current route is the [active control-plane map](../.scratch/seo-godlike-agency-control-plane/map.md).

## Ownership map

Each surface has one information owner. A page may link across surfaces, but
it must not become a second owner for another surface's facts.

| Surface | Canonical owner | Owns | Does not own |
|---|---|---|---|
| Runtime and data shape | `src/`, tests, schemas, fixtures, evidence | behavior, invariants, proof, machine-readable output | explanatory snapshots of implementation |
| Architecture navigation | this file | stable boundaries and links to owners | current status, ticket queue, copied ADR content |
| Contracts | `docs/contracts/` | public field and boundary contracts | implementation progress or research notes |
| Durable decisions | `docs/adr/` | alternatives, consequences, falsifiers | status updates and decision indexes |
| Capability state | `docs/capabilities/` | evidence-backed capability states and unknowns | ticket claims or OAuth secrets |
| Discovery and research | `docs/discovery/`, `docs/research/` | bounded observations and source-backed decisions | raw transcripts and runtime behavior |
| Operator procedures | `docs/runbooks/` | safe actions not inferable from CLI/tests | architecture rationale and session logs |
| Queue and claims | `.scratch/` local tracker | current ticket state, blockers, acceptance, proof | durable architecture and duplicated summaries |
| Transient workflow material | ignored `docs/agents/runs/` | prompts, packets, logs, intermediate review | retained product documentation |

When a fact appears to fit two rows, resolve the ownership conflict before
adding prose. Prefer moving or linking the fact over creating a third surface.

## Runtime boundary

The current proof runs as a local CLI. It has no hosted service, background
worker, public endpoint, or write authority. The next control-plane layer will
use a manager agent to plan scope and delegate to provider specialists, while
deterministic adapters remain the only owners of provider IO and evidence. Any
hosted runtime must preserve the same provider, tenant, evidence, and policy
boundaries before it is accepted as an extension.

## Request and data flow

```text
operator request
  → agency scope plan (client/property/provider/metric)
  → capability and policy gate
  → manager-agent delegation (deterministic plan; optional local Codex review)
  → read-only provider adapter
  → immutable raw response + request/response hashes
  → normalized MetricObservation
  → validated Claim
  → canonical JSON report
  → deterministic Markdown rendering
```

The canonical JSON report and evidence manifest are authoritative. Markdown is
a deterministic presentation of the JSON, never the source of truth.

The field-level contract for the first proof is [documented separately](contracts/first-proof-slice.md)
so implementation can validate it without turning this architecture overview
into an API schema dump.

## Ownership boundaries

- The client/property registry owns tenant scope and provider property IDs.
- The auth boundary owns credential references and token refresh; application
  code never receives or logs raw refresh tokens outside the credential client.
- Provider adapters own endpoint details, API version, pagination, quotas, and
  source-specific normalization.
- The policy gate owns read/write classification and refuses undeclared scope.
- The evidence writer owns immutable raw payloads, hashes, observations, claims,
  and report manifests.
- The scope planner owns the registry-to-capability-to-metric projection and
  emits `ready`, `unavailable`, or `unsupported`; it never invents zero values
  for missing access.
- The deterministic manager plan owns task ordering and delegation boundaries;
  the optional local Codex runtime may review or continue that plan in a
  read-only thread, but cannot call provider endpoints outside the adapters.
- A future MCP facade may expose approved tools, but cannot bypass adapters,
  policy, tenant selection, or evidence capture.

## Current executable contract

The first run must contain:

- one explicit `client_id`;
- one or more explicitly registered client/property/provider scopes;
- a capability-backed metric catalog for every planned property;
- `ready`, `unavailable`, or `unsupported` status per scope;
- one bounded date range per provider adapter;
- the raw provider response and its SHA-256 hash;
- a normalized observation linked to the raw artifact;
- a claim linked to the observation;
- deterministic JSON and Markdown reports;
- a redacted audit event with capability, operation, scope, request hash,
  response hash, and outcome.

## Deliberate deferrals

Service-account JSON keys, hosted deployment, multi-region infrastructure,
Google Ads, all provider writes, automatic property onboarding, and live GA4
scope validation remain deferred. Cross-provider report composition is now
implemented locally for the proven GSC/Ahrefs sources; Localo remains discovery-
only until a managed Body Move profile is available.

## Durable decisions

- [ADR-0001: Local read-only proof boundary](adr/0001-local-read-only-proof-boundary.md)
- [ADR-0002: Agency OAuth and credential boundary](adr/0002-agency-oauth-credential-boundary.md)
- [ADR-0003: Tenant and property isolation](adr/0003-tenant-property-isolation.md)
- [ADR-0004: Provider adapter and MCP boundary](adr/0004-provider-adapter-mcp-boundary.md)
- [ADR-0005: Immutable evidence and reliability](adr/0005-immutable-evidence-reliability.md)
