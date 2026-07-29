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
- Ahrefs: `bodymove.pl` is explicitly registered as a read-only `v3`
  profile capability; the live profile request succeeded with organic traffic
  `67021`, organic keywords `4791`, Top 3 keywords `1935`, 100 top-page rows,
  100 returned organic-keyword rows within the 500-row request bound, and 20
  competitor rows. GSC/Ahrefs joins are kept separate and produced 32
  normalized page/query context entries in the agency report.
- Localo: MCP discovery now succeeds with protocol `2025-03-26` and server
  `localo 1.0.0`. The current schema exposes read-only `query` and `docs`
  tools; `mutation` exists but remains outside this slice. A read-only search
  found a Body Move snapshot in Warsaw, but `place(id)` returned null, so the
  result is not a managed profile and no Localo metric evidence is claimed.

## Local proof

- fixed point: commit `f15c7ec` on `main`, with the Ahrefs profile implementation
  at `6bd6396`;
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
  `artifacts/analysis/bodymove-full-seo-report-20260729-v3/`, manifest
  verified, HTML/Markdown/JSON cross-source context present, and source status
  includes GA4 and Localo as unavailable without invented metrics;
- report findings layer: deterministic low-CTR, striking-distance, and Ahrefs
  opportunity signals are present in the regenerated report; 29 signals were
  emitted for Bodymove and are explicitly labeled as evidence-derived, not
  automated recommendations;
- repository suite: `npm test` passes (74 TypeScript tests + 3 context tests);
- Codex manager proof: `--codex-manager` returned a read-only execution
  checklist containing GSC/Ahrefs ready sources and GA4/Localo unavailable
  blockers, without an application API key;
- GSC OAuth preflight: `READY_FOR_OPERATOR_CONSENT`, with the existing JSON
  readable at mode 600 and the refresh-token reference present;
- live Ahrefs evidence is claimed for the verified `bodymove.pl` bundle; Localo
  authentication and discovery succeed, but no managed Body Move profile exists,
  so no Localo metric evidence is claimed.
- Only explicitly registered properties are eligible for Ahrefs collection.
  GSC discovery results are not treated as proof of client ownership or Ahrefs
  authorization for additional domains.
- Localo discovery seam: `--localo-discover` performs only MCP `initialize`
  and `tools/list`, redacts auth, and fails closed when
  `keyring:seo-godlike/localo-mcp-token` is absent; fixed point `65e117e`.

## Operator handoff

1. In Localo, add/activate the managed Business Profile representing
   `bodymove.pl` (the read-only API cannot import it in this slice).
2. Confirm that the profile is the intended Body Move location; do not assume
   the Warsaw search snapshot is the canonical client profile.
3. Confirm that `bodymove.pl` remains the Ahrefs target.
