# First agency report: GSC, Ahrefs, Localo

Labels: `delivery:deadline`, `provider-boundary`
Status: in_progress
Map: `../map.md`

## Outcome

Produce the first operator-only report for `bodymove.pl` using the existing
GSC evidence plus read-only Ahrefs metrics and a verified Localo MCP snapshot.
The report must distinguish live evidence, unavailable capability, and
operator-provided data; no source may be represented as successful when its
auth or schema is unknown.

## Acceptance

- GSC uses the existing agency keyring and canonical property
  `sc-domain:bodymove.pl`.
- Ahrefs uses API v3 Site Explorer profile endpoints (`metrics`, `top-pages`,
  `organic-keywords`, and `organic-competitors`), a keyring-only API key
  reference, explicit target and country scope, bounded limits, and immutable
  evidence bundles.
- Localo is accepted only after MCP discovery proves an actual read operation
  and its returned snapshot is bound to a request, source, observation, claim,
  and manifest; no invented Localo schema is allowed.
- One local report package contains source status, metrics, hashes, and
  explicit rejection/blocker information.
- No consent, writes, publication, client sharing, or secrets in the repo.

## Current evidence and blockers

- GSC: `validated_real_domain` for the existing bodymove property.
- Bodymove GSC scope now explicitly includes the discovered URL-prefix
  property `https://krakow.bodymove.pl/` alongside the canonical domain
  property `sc-domain:bodymove.pl`; both belong to the `bodymove` client in
  the registry. No Ahrefs target was inferred for the subdomain.
- Ahrefs: `bodymove.pl` is explicitly registered as a read-only `v3`
  profile capability; the live profile request succeeded with organic traffic
  `67021`, organic keywords `4791`, Top 3 keywords `1935`, 100 top-page rows,
  100 returned organic-keyword rows within the 500-row request bound, and 20
  competitor rows. Bounded list manifest entries now preserve both requested
  and returned row counts, so the 100/500/20 responses are machine-detectable
  as bounded deliveries rather than silently treated as complete inventories.
  GSC/Ahrefs joins are kept separate and preserve `matched`, `gsc_only`, and
  `ahrefs_only` rows instead of dropping one-sided context.
- Ahrefs Keywords Explorer wiring is locally proven for the supplied operator
  phrase file: five domain groups were parsed, 39 unique phrases were
  identified, one group had no phrases and three lines were retained as notes.
  The adapter has a read-only capability gate, lowercase-country validation
  before network IO, a preflight unit budget, and one raw response artifact per
  group. A prior manual smoke observed four HTTP 200 responses but did not
  persist raw output; it is not accepted as the final phrase research bundle.
- Localo: MCP discovery now succeeds with protocol `2025-03-26` and server
  `localo 1.0.0`. The current schema exposes read-only `query` and `docs`
  tools; `mutation` exists but remains outside this slice. A read-only search
  found a Body Move snapshot in Warsaw, but `place(id)` returned null, so the
  result is not a managed profile and no Localo metric evidence is claimed.

## Local proof

- fixed point: commit `8d29da1` on `main`, with the Ahrefs profile implementation
  at `6bd6396` and batch onboarding at `49a5990`;
- Ahrefs adapter: bounded profile falsifiers, read-only bundle hash proof, and
  report-package integration pass; live profile bundle:
  `artifacts/analysis/bodymove-full-profile-20260729-v2/`;
- combined package:
  `artifacts/analysis/bodymove-report-package-20260729/`, status `partial`,
  with accepted GSC and Ahrefs bundles;
- final handoff package:
  `artifacts/analysis/bodymove-report-package-20260729-final/`, manifest
  verified; Localo is explicitly omitted because no managed Body Move profile
  was available to query.
- agency batch proof:
  `artifacts/analysis/bodymove-agency-run-20260729-final-v3/`, GSC and Ahrefs
  completed sequentially, while GA4 and Localo are recorded as blocked tasks;
  its report package is `partial` with 2 accepted bundles and 2 blocked
  sources;
- final agency report:
  `artifacts/analysis/bodymove-full-seo-report-20260729-v4/`, manifest
  verified, HTML/Markdown/JSON cross-source context present, and source status
  includes GA4 and Localo as unavailable without invented metrics;
- operator report v6:
  `artifacts/analysis/bodymove-full-seo-report-20260729-v6-rerun/`, with a
  deterministic executive JSON/Markdown/HTML layer plus full Markdown/HTML
  evidence appendix. The executive preview shows 25 of 207 context entries;
  the appendix preserves all 207 entries and all 29 rule-based signals. Five
  generated files are verified by the output manifest, including the corrected
  canonical properties `sc-domain:bodymove.pl` and `bodymove.pl`.
- report findings layer: deterministic low-CTR, striking-distance, and Ahrefs
  opportunity signals are present in the regenerated report; 29 signals were
  emitted for Bodymove and are explicitly labeled as evidence-derived, not
  automated recommendations;
- repository suite: `npm test` passes (80 TypeScript tests + 3 context tests);
- Codex manager proof: `--codex-manager` returned a read-only execution
  checklist containing GSC/Ahrefs ready sources and GA4/Localo unavailable
  blockers, without an application API key;
- GSC OAuth preflight: `READY_FOR_OPERATOR_CONSENT`, with the existing JSON
  readable at mode 600 and the refresh-token reference present;
- live Ahrefs evidence is claimed for the verified `bodymove.pl` bundle; Localo
  authentication and discovery succeed, but no managed Body Move profile exists,
  so no Localo metric evidence is claimed.
- Bodymove-only GSC batch proof:
  `artifacts/analysis/bodymove-gsc-all-20260729/`; both registered GSC
  properties completed for 2026-06-29 through 2026-07-26 with no failed
  properties. Each bundle contains 10 manifest-bound files and passes SHA-256
  and byte-count verification. The root property returned 17,098 current rows
  and 0 previous rows; the Krakow property returned 22,690 current and 24,258
  previous rows. These are Search Console observations only, not ownership or
  Ahrefs authorization proof.
- A bounded Ahrefs attempt for `krakow.bodymove.pl` was rejected with HTTP
  403 on the organic-keywords request. The target is therefore not retained in
  the registry and is not represented as Ahrefs-ready; only the verified
  `bodymove.pl` Ahrefs target remains eligible for collection.
- Bodymove client report v7:
  `artifacts/analysis/bodymove-client-report-20260729-v7/`; it combines the
  two completed GSC properties with the verified root Ahrefs profile, keeps the
  Krakow Ahrefs 403 outside accepted evidence, and remains `partial` because
  GA4 and Localo are unavailable. The executive layer reports 2 observed GSC
  properties, 1 estimated Ahrefs property, 207 joined context entries, and 36
  rule-based signals; the five-file report manifest and nested package
  manifest both verify.
- Only explicitly registered properties are eligible for Ahrefs collection.
  GSC discovery results are not treated as proof of client ownership or Ahrefs
  authorization for additional domains.
- Batch onboarding now accepts an explicit client/property manifest through
  `--add-properties`; the whole manifest is validated before one atomic
  registry write. The mixed valid/invalid manifest falsifier confirms no
  partial mutation. Ahrefs country is stored per Ahrefs property, with an
  explicit CLI override available for a run.
- Latest read-only GSC discovery on 2026-07-29 returned 39 properties: the
  current registry has 2 Bodymove properties and 37 discovered property entries
  remain outside that registered scope. After collapsing URL-prefix and
  `sc-domain` variants, the fresh result is 35 unique hosts, including the
  newly observed `fala-uderzeniowa.warszawa.pl`. No candidate was assigned to a
  client automatically. An ignored operator mapping template and handoff are
  retained under `docs/agents/runs/2026-07-29-property-mapping-dbf9b18/`.
- Localo discovery seam: `--localo-discover` performs only MCP `initialize`
  and `tools/list`, redacts auth, and fails closed when
  `keyring:seo-godlike/localo-mcp-token` is absent; the missing-keyring path is
  now covered by an injected-loader falsifier; fixed point `65e117e`.

## Operator handoff

1. In Localo, add/activate the managed Business Profile representing
   `bodymove.pl` (the read-only API cannot import it in this slice).
2. Confirm that the profile is the intended Body Move location; do not assume
   the Warsaw search snapshot is the canonical client profile.
3. Confirm that `bodymove.pl` remains the Ahrefs target.
4. For the 37 unregistered GSC property entries (representing 34 normalized
   unassigned hosts), provide an explicit mapping of `client_id`, canonical
   GSC property/alias, Ahrefs target, and Ahrefs country before enabling
   collection. Do not confuse raw property-entry count with normalized-host
   count; URL-prefix and `sc-domain` variants are separate GSC identifiers.
