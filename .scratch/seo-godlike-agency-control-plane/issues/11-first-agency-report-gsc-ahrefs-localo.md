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
- Bounded live phrase research completed on 2026-08-03 using 4 Ahrefs
  Keywords Explorer requests, lowercase country `pl`, and an explicit 200-unit
  ceiling. The ignored bundle
  `artifacts/analysis/ahrefs-keyword-research-20260803/` contains 4 groups,
  41 returned rows, 3 retained notes, and 7 manifest-bound files; all hashes
  and byte counts verify. `wilmed.pl` was intentionally skipped because its
  supplied section contained no phrases. This proves the phrase endpoint and
  bundle path, not a complete keyword universe or client-facing report.
- Local report composition completed without provider rerun at
  `artifacts/analysis/bodymove-full-seo-report-20260803-final-v2/`. It combines
  the existing 3 accepted Bodymove bundles with the verified phrase bundle,
  preserves all 5 supplied input groups and 41 phrases (including empty
  `wilmed.pl`), renders all 41 returned keyword rows and selected fields, and
  verifies the five-file executive/appendix manifest. Final status remains
  `partial` because GA4 and Localo are unavailable; this is a complete local
  evidence report, not a claim of complete provider coverage.
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

## Client delivery proof — 2026-08-03

- A split client-delivery layer was generated from the existing verified agency
  report and accepted source bundles only:
  `artifacts/analysis/client-delivery-20260803-v4/`.
- The output contains one Bodymove client PDF/HTML and five separate domain
  PDF/HTML units for the supplied phrase groups. The phrase domains are kept
  as `Client mapping pending`; no ownership or client assignment was inferred.
- All 41 returned keyword rows, the empty `wilmed.pl` group, Bodymove source
  context, and rule-based signals remain available in the rendered units. GSC
  cards are labelled `Observed — Google Search Console`; Ahrefs cards and
  keyword research are labelled `Estimated — Ahrefs`.
- Previous-period deltas are rendered only where the accepted bundle contains a
  non-zero comparable baseline. Missing/zero baselines remain `—`; no month-
  over-month claim or invented delta is emitted.
- Delivery manifest verifies 13 generated HTML/PDF/index files by SHA-256 and
  byte count; `provider_calls: 0`. Chromium produced A4 PDFs: Bodymove 17
  pages; each phrase-domain unit 5–6 pages. No provider rerun was performed.

## Client delivery hardening proof — 2026-08-03

- Fixed delivery output: `artifacts/analysis/client-delivery-20260803-v17/`;
  identical rerender proof: `artifacts/analysis/client-delivery-20260803-v18/`.
- Inputs were existing manifest-verified bundles only: the two GSC bundles from
  `bodymove-gsc-all-20260729/`, the verified Ahrefs profile from
  `bodymove-agency-run-20260729-v7/`, and the existing Keywords Explorer bundle.
  No provider adapter or credential path was invoked.
- Runtime hardening now rejects absolute, traversal, and backslash bundle paths;
  verifies accepted-bundle identity (`client_id`, provider, and property) before
  consuming `report.json`; derives phrase-domain units from explicit property
  hosts rather than a tenant-specific suffix; and writes every delivery file
  and PDF with mode 0600 under mode-0700 unit/output directories.
- Chromium is executed through a user systemd sandbox with
  `RestrictAddressFamilies=AF_UNIX` and `PrivateNetwork=yes`, plus a bwrap
  filesystem/process sandbox. The traced final render produced no IPv4/IPv6
  `connect()` calls. The delivery manifest records `provider_calls: 0` and the
  renderer network policy.
- The six PDFs from v17 and v18 have byte-identical SHA-256 values. Bodymove is
  14-page A4; the five domain units remain separately scoped. `qpdf --check`
  passes for the Bodymove PDF, all generated files are hash/byte-bound in the
  delivery manifest, and the rendered copy is Polish with property-scoped GSC
  labels, explicit Ahrefs date/market, unavailable-source wording, and visible
  comparison semantics for CTR and average position.
- Local proof gates: `npm test` passes with 88 TypeScript tests and 3 context
  tests; strict build passes; `npm audit --omit=dev --audit-level=high` reports
  zero vulnerabilities; `git diff --check` passes.

## Operator handoff

## Recurring delivery follow-up — 2026-08-03

- OpenCode second-opinion tooling is now repository-local and bounded through
  `.opencode/agents/second-opinion.md` (`steps: 6`, read-only permissions) and
  `.codex/skills/opencode-second-opinion/scripts/run-review.sh`; the selected
  model was `opencode-go/deepseek-v4-flash`. The raw advisory output is retained
  outside the repository at `/tmp/seo-godlike-second-opinion-ca065b7-final.json`.
- The review found no security blocker in the inspected fixed point. Its
  actionable findings were: a hardcoded client status pill, keyword rows for
  registered hosts omitted from client units, an emitted placeholder OAuth path,
  dead content-renderer locals, and an undercounted delivery manifest counter.
- Those findings are addressed in the working slice: client status is derived
  from scoped source status, registered-host keyword groups are rendered in the
  owning client unit, agency scheduling requires explicit `--oauth-client`, dead
  locals are removed, and the manifest counter includes an optional verified
  rank-monitoring manifest. Local gates remain green: 92 TypeScript tests + 3
  context tests, strict build, zero high npm audit findings, and clean diff
  whitespace.
- A follow-up review identified two provenance gaps and they are now closed:
  accepted source entries carry the manifest SHA-256 captured by the report
  package and delivery compares it before reading a bundle; the Keywords
  Explorer bundle is confined to `artifactsDir`, every declared file is
  rechecked, and its manifest hash is recorded/countable in delivery. Focused
  falsifiers cover source-manifest tampering and keyword bundle traversal.

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

## Looker-aligned source inventory — 2026-08-03

- The public Studio danych report was inspected read-only. Its visible sections
  correspond to analytics, Ahrefs visibility, SERPROBOT rank history,
  operator-managed off-site actions, and glossary content. The report is a
  presentation layer, not itself an evidence source.
- The source registry now accepts explicit `serprobot` and `semstorm` entries.
  Both are currently `unavailable` because no verified snapshot/API export has
  been imported. No data was inferred from screenshots or Looker internals.
- Current Bodymove output was regenerated as
  `artifacts/analysis/client-delivery-20260803-final-v6/`: one client unit plus
  five separately scoped phrase-domain units, three accepted bundles, 207
  joined context rows, 36 rule-based signals, 41 keyword rows, and explicit
  blocked status for GA4, Localo, SERPROBOT, and Semstorm. No provider rerun
  occurred.
- Source registry extension is proven by a focused test for unavailable rank
  and visibility entries; full local gates remain green.
- A `ready` SERPROBOT registry entry now requires a numeric project ID. This
  matches the official connector setup contract; the live endpoint/response
  schema remains intentionally unimplemented until verified from operator
  documentation, so no API request was made.

## Manifest-bound operator inputs — 2026-08-03

- Client actions/glossary can now be packed through `--pack-client-content`
  into a mode-restricted `client-content.json` + `manifest.json` bundle.
- SERPROBOT-compatible normalized rank snapshots can now be packed through
  `--pack-rank-monitoring`; delivery verifies every declared byte and the
  client identity before rendering.
- Monthly scheduling accepts `--client-content-bundle`; delivery records its
  manifest hash and counts it among verified inputs.
- These are import seams, not proof of a SERPROBOT API connection. No
  provider call or rerun was made; the official connector/API contract still
  needs operator-provided credentials and a confirmed project/schema before a
  live adapter is implemented.
- Local proof: `npm test` passes with 96 TypeScript tests and 3 context tests;
  strict build and `git diff --check` pass.

## Follow-up hardening — 2026-08-03

- Monthly cron now forwards the keyword bundle and phrase-input paths, so the
  recurring agency run does not silently drop keyword research.
- Agency report files are created with mode `0600`; appendix Markdown escapes
  pipe/newline content in keyword cells; cross-source missing GSC fields remain
  `null`/unavailable rather than being rendered as zero.
- Focused proof now covers keyword cron wiring, report permissions, appendix
  escaping, and missing-field preservation. Local gates pass with 97
  TypeScript tests and 3 context tests.
- OpenCode review of `1570b9b` found the keyword wiring gap and these hardening
  items; it was an interim review because its bounded step cap did not read the
  full repository diff. A fresh fixed-point review is required after this
  follow-up commit.

## Bodymove v7 local proof — 2026-08-03

- Re-composed the report from the existing GSC/Ahrefs/Keywords Explorer
  bundles only; no provider adapter or credential path was invoked.
- Agency report: `artifacts/analysis/bodymove-full-seo-report-20260803-final-v7/`.
  Delivery: `artifacts/analysis/client-delivery-20260803-v19/` (deterministic
  rerender: `client-delivery-20260803-v20/`).
- Delivery contains 1 Bodymove client unit plus 5 explicitly unassigned
  phrase-domain units, 13 manifest-listed files, 6 PDFs, and 5 verified input
  manifests. All generated files are `0600`; all PDFs pass `qpdf --check` and
  both renders have identical PDF hashes.
- `npm audit --omit=dev --audit-level=high` reports zero vulnerabilities.
- `.env.example` now names the operator inputs for SERPROBOT and the
  manifest-bound actions bundle; no secret values were added.
- OpenCode `deepseek-v4-flash` review of `1f9ba8b` was also partial because its
  bounded step cap expired during source inspection. It reported no verified
  blocker; the remaining review items are explicitly unverified and require a
  future full-capacity review.

## OpenCode fixed-point review — 2026-08-03

- Review target: `7ec440be`; working tree was clean and the reviewer found no
  proven blocker in the inspected delivery surface. The review was partial,
  not a PASS: the bounded step cap left the schedule, registry, CLI and full
  test execution unverified.
- One actionable data-quality finding was verified locally: phrase parsing used
  content heuristics (`dla`/`tutaj`) that could silently remove a real keyword.
  The parser now treats post-URL lines as phrases and accepts notes only with
  an explicit `# note:` marker. Focused falsifiers cover both cases.
- The review artifact is retained outside the repository at
  `/tmp/seo-godlike-second-opinion-7ec440b.json`; it contains no credentials or
  provider payloads. A fresh review is required after this repair.

## Review follow-up disposition — 2026-08-03

- Fresh OpenCode review of `0958d41` remained partial because its bounded step
  cap stopped before the full ledger and gates. It identified two concrete
  parser risks, both now repaired locally: unmarked text before the first URL
  is rejected, and comma-containing phrases are rejected before `fetch` so the
  provider request cannot silently change phrase boundaries.
- The review's hash concern was checked against `src/serialize.ts`: the
  manifest-producing text artifacts and their verifier both use UTF-8 text
  bytes; no mismatch was reproduced. It remains deferred as a future shared
  byte-verifier cleanup, not an accepted blocker.
- Focused keyword proof now passes with 9 tests; full local gates are being
  rerun after this repair. No provider call or rerun was made.

## Delivery automation follow-up — 2026-08-03

- Monthly cron now forwards `--artifacts-dir`, keeping scheduled agency runs
  connected to the manifest-bound history root used for comparisons.
- Client delivery now emits one deterministic, local draft `.eml` per unit.
  The draft is `draft-only`: it does not send mail, uses contact data only from
  the operator-managed client-content input, links the generated HTML/PDF
  package paths, and is included in the delivery manifest with SHA-256 and byte
  count.
- Local proof: focused delivery/history tests and the full suite pass (97
  TypeScript tests + 3 context tests); `npm audit --omit=dev
  --audit-level=high` reports zero vulnerabilities. No provider rerun or new
  network request was made.
- Monthly scheduling now runs the local history dashboard step after the
  agency delivery step, with a deterministic per-month history output root;
  the schedule test proves the ordering and artifact-root wiring.

## OpenCode fixed-point follow-up — 2026-08-03

- Review target: `8bad915`; OpenCode used `opencode-go/deepseek-v4-flash` in
  read-only non-interactive mode. The review stopped at its bounded step limit
  after inspecting registry, capability and manifest seams; it did not inspect
  the larger delivery/schedule/CLI files or run tests, so it is partial and not
  a PASS.
- One concrete construction risk was verified: `reportEntry` initialized
  `manifest_sha256` to an empty string before a later mutation. Commit
  `8379570` now requires the hash as a constructor argument, and the report
  package test asserts a 64-character SHA-256 value. No provider or artifact
  collection was rerun.
- Remaining review output is unverified or deferred: Semstorm ready-target
  syntax has no provider contract yet; the Keywords Explorer capability is
  backed by the existing bounded local proof; a full external review remains
  required before advancing the provider-boundary slice.

## SERPROBOT connector boundary — 2026-08-03

- Official SERPROBOT connector documentation confirms the operator flow:
  authorize the connector, enter the account API key, select the numeric
  project ID from the project URL, and provide start/end dates. The page does
  not publish a stable response schema for a direct application API adapter.
- The rank snapshot seam now preserves the connector configuration
  (`project_id`, search engine, location, device) inside the manifest-bound
  normalized input and rejects malformed project IDs before writing. Delivery
  displays that provenance next to the rank period. This is an import seam,
  not a live provider connector; no SERPROBOT request was made.
