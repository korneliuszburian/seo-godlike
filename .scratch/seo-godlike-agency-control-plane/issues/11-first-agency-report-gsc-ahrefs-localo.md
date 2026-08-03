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

## History comparison follow-up — 2026-08-03

- The local history dashboard now derives a comparison per `client_id` and
  canonical property from the previous non-overlapping verified period. It
  exposes clicks, impressions, CTR, and position deltas in JSON, Markdown, and
  Polish HTML; position deltas retain the lower-is-better semantics.
- The comparison is derived only from existing manifest-verified analytics
  bundles. No provider call, rerun, or new evidence collection was performed.

## Rank provenance follow-up — 2026-08-03

- Commit `e8784a9` binds an imported SERPROBOT snapshot to the agency report
  through its client identity, date range, row count, source configuration and
  manifest SHA-256. Client delivery rejects a rank bundle that does not match
  this provenance.
- The CLI and monthly agency schedule now pass the rank snapshot into report
  composition, so the recurring path retains the rank evidence instead of
  attaching it only at final rendering.
- Focused rank/report/delivery proof passes; the full local suite passes with
  103 TypeScript tests and 3 context tests. No provider request or rerun was
  performed.
- This does not claim a live SERPROBOT API adapter: the official connector is
  still represented by an operator-provided manifest-bound snapshot until a
  stable direct response schema is verified.

## OpenCode review follow-up — 2026-08-03

- Review target: `17b2f8e` through `opencode-go/deepseek-v4-flash` in the
  read-only non-interactive launcher; raw output is retained outside the repo
  at `/tmp/seo-godlike-second-opinion-e8784a9.json`.
- The reviewer loaded the local review skill and inspected the clean fixed
  point, diff ledger, delivery, client content and rank/report surfaces, but
  stopped before a final response. This is therefore **partial**, not PASS;
  no reviewer finding is accepted from it without a reproducible claim.
- No provider request, credential read, edit, commit, or tracker mutation was
  performed by the reviewer.

## Recurring rank task follow-up — 2026-08-03

- Commit `7a41b13` gives the monthly agency run an explicit local SERPROBOT
  source task. A matching manifest-bound snapshot is verified read-only and
  succeeds; a missing snapshot is recorded as `blocked`; unsupported external
  providers no longer appear as ready tasks without an executor.
- Focused agency-run/rank proof passes. This remains an import-based source
  until a stable direct SERPROBOT response contract is verified.

## Rank history follow-up — 2026-08-03

- Commit `b85d83a` adds a local rank-history dashboard. It scans only verified
  SERPROBOT manifests already present under the artifacts root and compares
  shared keywords across non-overlapping snapshots; it performs no provider
  request and does not treat missing positions as zero.
- The monthly cron now emits both analytics history and rank history outputs.
- Focused history/scheduler proof passes; live SERPROBOT collection remains
  explicitly outside this slice.

## Recurring and rank-history hardening — 2026-08-03

- Commit `8d28ef1` removes the shared-delivery Bodymove hardcode, rejects
  ambiguous keyword-host ownership across clients, and keeps rank comparisons
  separate by search engine, location and device.
- Commit `18d03b5` makes daily and monthly cron output paths timestamped to
  seconds, so a retry after a partial local failure does not target the same
  exclusive-write directory. The monthly run is offset from the daily run.
- Commit `ce28ce8` requires the rank-history command to receive registry-owned
  client IDs, rejects out-of-scope snapshots, compares only immediately
  adjacent periods, and records both current and previous snapshot manifest
  hashes in JSON/Markdown/HTML.
- Local proof: 109 TypeScript tests + 3 context tests, build, audit and
  `git diff --check` pass. No provider request or evidence rerun was made.
- Remaining boundary: SERPROBOT is still an operator-imported snapshot seam;
  no direct response schema or live connector is claimed.

## Ahrefs budget guard follow-up — 2026-08-03

- Commit `bc26fa9` makes Keywords Explorer fail closed unless the operator
  explicitly passes `--allow-estimated-budget`. The existing request-count and
  minimum-unit checks remain in place, but the request manifest now states that
  the estimate is only a minimum request-cost bound; actual cost depends on
  returned rows and selected fields.
- A focused test proves the missing flag causes zero network calls. Local proof
  passes with 110 TypeScript tests and 3 context tests, build, audit and
  `git diff --check`. No Ahrefs request, rerun or credential read was made.
- This is a safety boundary, not a claim that the provider cost can be
  predicted exactly from the current input. The operator must deliberately
  accept that uncertainty before any future keyword collection.

## Client period comparison follow-up — 2026-08-03

- Commit `eccafce` exposes the adjacent previous GSC period in client HTML,
  PDF and draft email output. Clicks, impressions and CTR show explicit
  absolute/percentage or percentage-point changes; average position uses the
  correct lower-is-better wording.
- Comparisons are rendered only when both ranges exist and the previous range
  ends immediately before the current range. Otherwise the client receives
  `Brak porównywalnej bazy`, avoiding a misleading month-over-month claim.
- Focused delivery proof is included in the full local suite: 110 TypeScript
  tests + 3 context tests pass. No provider request or evidence rerun was made.
- Commit `40d70fd` adds the opposite-case falsifier: a non-adjacent previous
  range renders `Brak porównywalnej bazy` instead of a fabricated delta.

## Delivery identity hardening — 2026-08-03

- Commit `14ab467` requires every accepted analytics bundle to contain exactly
  one canonical `property_refs` entry matching the accepted manifest identity.
  The delivery PDF renderer now invokes pinned system binaries for
  `systemd-run`, `bwrap`, `chromium`, and `qpdf`, reducing PATH ambiguity.
- A focused multi-property bundle falsifier rejects an extra property reference
  before client output is written. No provider request or PDF rerun was made.
- OpenCode review of fixed point `14ab467` via
  `opencode-go/deepseek-v4-flash` is retained at
  `/tmp/seo-godlike-second-opinion-14ab467.json`; it is **partial**, not PASS,
  because the bounded step limit prevented the full path ledger and suite
  execution. It found no certified blocker in the inspected rank-history seam;
  remaining claims are explicitly unverified in that packet.

## Ahrefs profile context delivery follow-up — 2026-08-03

- Client delivery now renders the complete bounded Ahrefs profile context
  already present in verified local bundles: top pages, organic keyword rows,
  and organic competitors, including provider-returned deltas, positions,
  URLs, difficulty, SERP features, traffic and competitor fields.
- Every section is explicitly labelled `Estimated — Ahrefs`, scoped to the
  canonical property, market and snapshot date. Ahrefs values remain separate
  from observed GSC metrics and are never aggregated into a combined traffic
  KPI.
- A focused fixture falsifier proves the three bounded sections and
  representative provenance fields render without any provider call. No
  Ahrefs rerun, credential read, or external mutation was performed.

## OpenCode review follow-up — 2026-08-03

- Review target: `0c6104c`, read-only non-interactive
  `opencode-go/deepseek-v4-flash`; raw packet:
  `/tmp/seo-godlike-second-opinion-0c6104c.json`.
- The review was **partial** because its step budget ended before the full
  repository ledger and suite. It identified one concrete root mismatch:
  accepted bundle paths were validated relative to the agency report
  directory but consumed relative to `--artifacts-dir`.
- Commit `0c6104c` itself adds the full bounded Ahrefs profile renderer.
  The follow-up fixes the reviewer finding by using the same artifacts root
  for validation and consumption, and adds a sibling-layout falsifier.
- No provider request, credential read, artifact regeneration, or external
  mutation was performed.

## Fixed-point review after confinement repair — 2026-08-03

- Review target: `9d55a74`; raw packet:
  `/tmp/seo-godlike-second-opinion-9d55a74.json`.
- OpenCode/DeepSeek review remained **partial**: the bounded session exhausted
  before source reads and test execution. It therefore reports no accepted
  blocker and leaves full-repository claims unverifiable.
- Local evidence closes the one actionable finding from the prior packet:
  client delivery tests pass with the agency report in a separate report
  directory and accepted bundles in the independent `--artifacts-dir`.
- Current local proof remains: 111 TypeScript tests + 3 context tests, build,
  audit with zero high vulnerabilities, and `git diff --check`. No provider
  request, rerun, credential read, or artifact regeneration was performed.

## Agency appendix completeness follow-up — 2026-08-03

- The canonical agency report now preserves the complete bounded Ahrefs
  `site-explorer.profile` context already present in accepted bundles: top
  pages, organic keyword rows and organic competitors, scoped by client,
  canonical property, market and snapshot date.
- The same normalized rows are rendered in the agency Markdown and HTML
  evidence appendices. Empty profile sections remain explicit and Ahrefs is
  labelled as estimated context; no GSC/Ahrefs metric aggregation was added.
- A focused test proves deterministic profile extraction and preservation of
  representative page, keyword and competitor rows. The full local suite,
  build, audit and whitespace checks are the proof boundary; no provider
  request, Ahrefs rerun, credential read or generated-report rerun was made.

## Fixed-point review — 4bd92b1 — 2026-08-03

- OpenCode/DeepSeek `opencode-go/deepseek-v4-flash` review packet:
  `/tmp/seo-godlike-second-opinion-4bd92b1.json`.
- Review status is **partial**. The reviewer pinned the clean fixed point but
  exhausted its bounded step budget before reading production seams or running
  tests. It therefore reports no accepted blocker and does not prove any
  repository-wide PASS claim.
- Local proof for this slice remains authoritative: build, 112 TypeScript
  tests + 3 context tests, `npm audit --omit=dev --audit-level=high`, and
  `git diff --check`. No provider request, rerun, credential read or artifact
  regeneration was performed.

## History provenance follow-up — 2026-08-03

- The recurring analytics-history dashboard now emits its own hash-bound
  `manifest.json` for `executive-summary.json`, Markdown and HTML outputs.
- Each history period now retains the SHA-256 of the verified source bundle
  manifest, so a monthly comparison can be traced back to the exact accepted
  evidence rather than only to a path.
- Focused history proof verifies dashboard file hashes and bytes; no provider
  request, rerun or generated production report was performed.
- Full local proof after the test-helper correction: 112 TypeScript tests + 3
  context tests, build, `npm audit --omit=dev --audit-level=high` with zero
  vulnerabilities, and `git diff --check` all pass.

## Monthly scheduler timestamp fix — 2026-08-03

- Fixed the default history and rank-history output paths in the monthly cron
  builder so the timestamp command remains outside the quoted base path and is
  actually expanded by the shell.
- Added a scheduler falsifier for the quoting boundary; focused scheduler and
  history tests pass. This changes only local command generation and performs
  no provider request or report rerun.

## Multi-client operator content follow-up — 2026-08-03

- Operator-managed client content bundles now accept a manifest-bound
  collection of uniquely identified client records while preserving the
  single-client input format.
- Delivery selects actions, glossary and contact data by explicit `client_id`
  for every client unit; unknown identities are rejected before rendering.
- Focused proof covers deterministic sorting, duplicate/unknown identity
  rejection and preservation of two client action registers. No provider
  request, credential read or report rerun was performed.

## Multi-client SERPROBOT snapshot follow-up — 2026-08-03

- The existing normalized SERPROBOT import seam now accepts either the legacy
  single snapshot or one manifest-bound `{ snapshots: [...] }` collection.
  Snapshot identities are unique, sorted deterministically and checked against
  the declared source/client scope; project IDs are verified per client.
- Agency report, delivery and rank-history consumers preserve the collection
  boundary and select only the matching client's rows. A single client still
  emits the legacy shape for compatibility.
- Focused proof covers multi-client packing, per-client source validation,
  tenant-separated HTML delivery and history consumption. This remains an
  operator-imported SERPROBOT snapshot; no live connector/API call was added.
  No provider request, credential read, Ahrefs rerun or generated production
  report rerun was performed.

## Delivery symlink-boundary hardening — 2026-08-03

- OpenCode/DeepSeek review of `eb05310` was again **partial** because its
  bounded step budget ended before the full suite, but it identified a
  concrete lexical-vs-real-path risk in delivery reads.
- Client delivery now re-checks existing bundle roots and manifest files with
  `realpath` against the resolved artifacts root. A symlinked bundle escaping
  that root is rejected before evidence is consumed; the focused falsifier
  covers this path.
- Local proof after the hardening: 116 TypeScript tests + 3 context tests,
  build, zero high audit vulnerabilities and `git diff --check`. No provider
  request, credential read, Ahrefs rerun or generated production report rerun
  was performed.

## SERPROBOT connector boundary confirmation — 2026-08-03

- Official [SERPROBOT connector documentation](https://www.serprobot.com/data-studio-connector) confirms the Looker/Data Studio connector
  requires connector authorization, an API key, numeric project ID and
  `start`/`end` dates. It does not publish a stable direct-API response schema
  suitable for an unverified application adapter.
- The repository therefore keeps the normalized, manifest-bound snapshot as
  the read-only boundary. Implementing a guessed endpoint would weaken the
  evidence contract; a direct adapter can be added only after the operator
  supplies the official API schema or a real response fixture.

## Fixed-point review — b304050 — 2026-08-03

- OpenCode/DeepSeek packet:
  `/tmp/seo-godlike-second-opinion-b304050.json`; status **partial** because
  the bounded agent stopped before reading every module and executing tests.
- Evidence-backed checks on the inspected delivery seam confirm the
  `realpath` confinement, manifest provenance, tenant filtering, network
  isolation and PDF permission controls. No new blocker was established.
- The reviewer noted that explicitly supplied fixed output directories fail on
  `EEXIST`; this is intentional write-once behavior for retry safety, while
  the generated monthly schedule uses timestamped directories. It remains an
  operator configuration constraint, not an idempotent overwrite mode.
- The wording claiming “complete” comparison ranges was narrowed to
  “verified adjacent ranges”; the code proves adjacency, not completeness.
- Local proof remains authoritative: 116 TypeScript tests + 3 context tests,
  build, zero high audit vulnerabilities and `git diff --check`. No provider
  request, credential read, Ahrefs rerun or generated production report rerun
  was performed.

## Bounded follow-up review — `b304050..4f50320` — 2026-08-03

- A bounded packet was supplied for the two-commit follow-up instead of asking
  OpenCode to review the entire historical branch. OpenCode/DeepSeek completed
  the changed-scope review with no blockers.
- The review confirms that the adjacent-period wording in
  `src/client-delivery.ts` no longer claims completeness: the code proves only
  directly adjacent, verified ranges before showing deltas.
- The SERPROBOT tracker entry correctly separates the official Looker/Data
  Studio connector inputs from an unverified direct API adapter. No endpoint or
  response schema was invented.
- Review output: `/tmp/seo-godlike-second-opinion-4f50320-bounded.json`;
  status: no blocker, with local build/test/audit results treated as supplied
  evidence rather than independently rerun by the reviewer.
- No provider request, credential read, Ahrefs rerun or generated production
  report rerun was performed.

## Client delivery empty-section slice — 2026-08-03

- Keyword-only domain units no longer render empty `Widoczność organiczna`
  or `Sygnały do omówienia` pages; populated client evidence remains visible.
- The renderer decides omission from the typed unit data (`context` and
  `insights`), not from arbitrary text inside report rows. Focused tests cover
  both omission and retention paths.
- Local proof: 116 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities and `git diff --check`. No provider request, credential read,
  Ahrefs rerun or generated production report rerun was performed.
- Independent OpenCode bounded review found no blocker; it recorded only the
  non-blocking coupling between the omission helper and current section markup.

## Client delivery Polish copy slice — 2026-08-03

- Client-facing HTML, action tables, notes and draft email now render provider,
  action-type and action-status identifiers as deterministic Polish labels.
  Unavailable source status is also rendered in Polish; evidence values and
  manifest structure are unchanged apart from rendered output bytes.
- The supplied Looker/Data Studio PDF was used only as a presentation and copy
  reference. No metrics were imported and no provider or Ahrefs request was
  performed.
- Local proof: 116 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities and `git diff --check`.
- OpenCode/DeepSeek bounded read-only review found no blockers. It noted and
  this slice addressed cosmetic email/HTML status-case drift; the remaining
  provider label fallback is intentionally defensive for future schema values.

## Client delivery verified history slice — 2026-08-03

- Client delivery now embeds manifest-verified Google Search Console history
  for explicit `(client_id, property_id, provider)` identities, including
  period rows, deltas and Polish comparison wording. Ahrefs, GA4 and Localo
  are not rerun or mixed into this history layer.
- History comparisons require directly adjacent verified periods. Unrelated
  malformed bundles are ignored under scoped reads; recognizable malformed
  in-scope reports fail closed. The delivery manifest records unique history
  manifest SHA-256 values and includes them in the verified-manifest count.
- Focused falsifiers cover history rendering, scope isolation, in-scope
  corruption, non-adjacent periods and delivery manifest provenance.
- Local proof: 118 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities and `git diff --check`.
- OpenCode/DeepSeek was invoked read-only against the bounded four-file diff;
  the run stopped at its step cap before a final prose verdict. The preceding
  bounded review found no blocker, and the current run performed no provider
  request, credential read, Ahrefs rerun or generated production report rerun.

## Recurring delivery execution provenance — 2026-08-03

- The monthly `--agency-run` path now passes its generated `agency-run.json`
  into client delivery. Delivery validates its schema/result shape and the
  read-only policy (`read_only`, no external writes, operator-managed
  retention, operator-only deletion), then records its SHA-256 in the delivery
  manifest as `agency_run_record_sha256`.
- A focused falsifier covers both successful provenance binding and rejection
  of a run record declaring a write policy. Standalone delivery remains
  compatible when no run record is supplied.
- Local proof: 118 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities and `git diff --check`.
- OpenCode/DeepSeek bounded review inspected the changed delivery/CLI seam in
  read-only mode but stopped at its step cap before a final prose verdict; no
  concrete blocker was emitted. No provider request, credential read, Ahrefs
  rerun or generated production report rerun was performed.

## Generated evidence permission hardening — 2026-08-03

- Agency run records are now written `0600`; agency-report and report-package
  output directories are created `0700`. This keeps recurring execution
  metadata and generated evidence private on shared local machines.
- A focused test asserts the agency-run record mode. Existing delivery and
  report file modes remain `0600`; no overwrite behavior changed.
- Local proof: 118 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities and `git diff --check`. No provider request, credential
  read, Ahrefs rerun or generated production report rerun was performed.

## Recurring Ahrefs Keywords Explorer automation — 2026-08-03

- The monthly `--agency-run` path now supports explicit opt-in
  `--keyword-research`. It requires `--keyword-input`, uses bounded
  `--keyword-max-requests`/`--keyword-max-api-units`, and fails closed unless
  `--allow-estimated-budget` is present before any credential or provider
  access.
- A successful keyword task feeds its new manifest-bound bundle into the
  existing agency report and client delivery stages. The default monthly
  schedule remains unchanged unless `keywordResearch: true` is explicitly
  configured and an input file is supplied. Task failures remain visible in
  `agency-run.json` and set the CLI exit code without aborting sibling tasks.
- Keyword-research and agency-run output directories are created `0700`; the
  generated files remain `0600`.
- Local proof: 119 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities and `git diff --check`. No provider request, credential
  read, Ahrefs rerun or generated production report rerun was performed.
- OpenCode/DeepSeek bounded review fully inspected the new keyword automation
  diff and returned no blocker in opt-in, budget or provenance logic. It found
  and this slice fixed the missing `0700` keyword bundle directory mode. The
  review was partial for older delivery/history modules because its step cap
  was reached; those boundaries were already covered by earlier local proof
  and bounded reviews.
