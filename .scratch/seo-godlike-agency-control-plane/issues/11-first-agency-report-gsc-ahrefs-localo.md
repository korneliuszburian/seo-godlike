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

## Final delivery review follow-up — 2026-08-03

- Fixed point `ce73e7c` incorporates the final OpenCode/DeepSeek findings from
  `6266e1a`: keyword bundle paths are relative to the explicitly supplied
  keyword bundle root, direct client content outside the delivery scope is
  rejected, and delivery history is filtered to the report's accepted bundle
  set.
- Added a non-default keyword-root proof and retained symlink-escape and
  out-of-scope-content falsifiers. Local proof passes with 157 tests, build,
  zero high audit vulnerabilities and `git diff --check`.
- No provider request, credential read, Ahrefs rerun or production report
  rerun occurred. The remaining OpenCode notes are low/deferred: standalone
  delivery agency-run record policy, environment-dependent PDF determinism,
  and host-gated renderer/network proof.
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

## Monthly scheduler timestamp binding — 2026-08-03

- The generated monthly cron now captures one `agency_run_stamp` immediately
  after entering the repository and reuses it for the raw run, report,
  delivery, keyword bundle, report history and rank history paths.
- This prevents a second-boundary rollover from splitting one scheduled run
  across unrelated output identities or placing the keyword bundle outside its
  run directory.
- Focused schedule assertions prove one timestamp expression and reuse of the
  shell variable across all derived paths. Local proof remains 119 TypeScript
  tests + 3 context tests, build, zero high audit vulnerabilities and
  `git diff --check`; no provider request or rerun was performed.

## Keyword budget argument hardening — 2026-08-03

- `--keyword-max-requests` and `--keyword-max-api-units` are now parsed as
  positive safe integers before the agency output directory is created or any
  agency task can run. Malformed values therefore cannot defer failure until
  after provider tasks have started.
- A CLI falsifier proves malformed keyword limits reject before output creation
  and before task execution. Local proof: 120 TypeScript tests + 3 context
  tests, build, zero high audit vulnerabilities and `git diff --check`; no
  provider request, credential read or Ahrefs rerun was performed.
- The final bounded OpenCode review found no confirmed blocker in the changed
  scheduler/keyword surface. It was step-budget limited for older delivery
  modules, which remain covered by prior focused tests and reviews.

## Standalone keyword budget parity — 2026-08-03

- The standalone `--ahrefs-keyword-research` command now uses the same positive
  safe-integer validation as recurring `--agency-run`; malformed request or
  unit limits fail before its output bundle is created.
- A second CLI falsifier covers the standalone unit-limit path. Local proof:
  121 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities and `git diff --check`; no provider request, credential
  read or Ahrefs rerun was performed.
- Focused OpenCode review returned `PASS` with no blockers for the changed CLI
  and schedule surface. It noted only non-blocking follow-ups: broader legacy
  delivery modules were outside this focused pass, and the test harness relies
  on the existing build-before-test command.

## Fresh-install monthly scheduler roots — 2026-08-03

- The generated monthly cron now prepares the configured analysis, report and
  delivery roots with `install -d -m 700` before creating the run timestamp.
  A first run therefore does not depend on manually pre-created directories,
  while cron installation itself remains operator-owned.
- Schedule tests assert the preparation command and the existing one-timestamp
  invariant. Local proof: 121 TypeScript tests + 3 context tests, build, zero
  high audit vulnerabilities and `git diff --check`; no provider request or
  rerun was performed.

## Local agency readiness snapshot — 2026-08-03

- Added `--agency-readiness`, a local read-only preflight that combines the
  registered property scope, external-source registry and operator-supplied
  input presence into one deterministic JSON snapshot. It does not inspect
  credential contents and does not call any provider.
- The snapshot distinguishes ready scope entries from unavailable capability
  entries, preserves each external source's explicit blocker, reports whether
  OAuth/keyword/rank/content inputs were supplied, and keeps
  `credential_posture: not_inspected` explicit.
- Focused falsifiers cover partial Bodymove readiness, missing OAuth input and
  empty scope. Local proof: 124 TypeScript tests + 3 context tests, build,
  zero high audit vulnerabilities and `git diff --check`; no provider request,
  credential read or Ahrefs rerun was performed.

## Monthly history after partial run — 2026-08-03

- The generated monthly cron no longer chains report-history and rank-history
  behind the agency-run exit status with `&&`. It records each exit code,
  attempts both local history dashboards, and returns the agency failure first
  (or the history failure when collection succeeded).
- This keeps historical dashboards refreshable after a controlled partial
  provider run while preserving a non-zero cron result for operator alerting.
- Focused schedule/history proof: 20 tests pass; full local proof remains 124
  TypeScript tests + 3 context tests, build, zero high audit vulnerabilities
  and `git diff --check`. No provider request or report rerun was performed.
- The follow-up hardening keeps the history/status block behind a successful
  root preparation step, so a failed `install -d` cannot run history commands
  with an empty run timestamp. Schedule assertions cover agency, history and
  rank-history exit propagation.

## Explicit scheduled Ahrefs budget acceptance — 2026-08-03

- Monthly keyword research scheduling now requires a separate
  `--allow-estimated-budget` flag in addition to `--keyword-research` and the
  keyword input. The generated cron no longer grants estimated-budget
  acceptance implicitly.
- This changes only schedule generation and validation; no provider request or
  keyword rerun was performed.
- Focused schedule tests cover rejection without the explicit acceptance and
  emission with it.

## Monthly pipeline lock scope — 2026-08-03

- The monthly scheduler now holds its `flock` around the complete local
  pipeline, including report history and rank history, rather than only the
  provider/task command. Concurrent monthly invocations therefore cannot race
  the local history writers.
- The fixed-point map was refreshed to `f6076bc`; no provider request or
  generated report rerun was performed.

## Multi-provider history in client delivery — 2026-08-03

- Client delivery now reads manifest-verified history for accepted GSC, GA4
  and Ahrefs snapshots under one provider-scoped identity; it does not merge
  values into a cross-provider total.
- Comparisons are emitted only for directly adjacent, non-overlapping date
  ranges. Position deltas retain the lower-is-better interpretation, while
  ratios and counts use their native units.
- The new history reader validates report shape, manifest bytes/hashes and
  symlink confinement. Focused falsifiers cover provider separation, scope,
  tampering, non-adjacent ranges and escaping manifest entries.
- No provider request, credential read, Ahrefs rerun or generated production
  report rerun was performed.

## Provider history evidence-boundary hardening — 2026-08-03

- The history artifact walker now resolves and confines traversed symlinks to
  the configured artifacts root; an in-root bundle symlink is followed without
  silently dropping its manifest, while an escaping manifest symlink fails
  closed.
- Client delivery passes accepted provider bundle paths to history loading, so
  a missing or unreadable `report.json` in an accepted history bundle is an
  explicit error rather than an omitted history entry. Non-history accepted
  provider reports remain ignored when their shape is not the history contract.
- Focused proof covers missing required reports, missing required bundles,
  dangling symlinks and symlinked bundles. Full local proof: 135 TypeScript
  tests + 3 context tests, build, zero high audit vulnerabilities and
  `git diff --check`.
- No provider request, credential read, Ahrefs rerun or generated production
  report rerun was performed.

## Provider history follow-up review — 2026-08-03

- The bounded OpenCode second opinion found no blocker. Its residual cases were
  addressed: dangling unrelated symlinks are ignored, missing required bundle
  paths fail closed, and absolute required paths are rejected when outside the
  configured artifacts root.
- The second opinion was read-only and did not run providers, read credentials
  or rerun production reports. The fixed point is ready for the next operator
  gate, not for publication or client delivery by itself.

## Monthly Ahrefs scope propagation — 2026-08-03

- The monthly schedule now forwards optional `--ahrefs-date` and
  `--ahrefs-country` values to the recurring agency run. The CLI already
  resolved registry country defaults, but the scheduler previously had no way
  to preserve an explicit operator override across months.
- Schedule proof asserts both flags are emitted when configured; no cron,
  provider request or production report rerun was performed.

## Recurring rank-export selection — 2026-08-03

- Monthly agency scheduling now supports `--rank-monitoring-root`. The local
  resolver scans manifest-bound SERPROBOT exports, requires a complete snapshot
  for every registered SERPROBOT client, and deterministically selects the
  newest captured export.
- A tampered candidate fails closed instead of silently falling back to older
  rank data. The existing exact `--rank-monitoring` bundle path remains
  supported for one-off/operator runs.
- This improves recurring local automation but is not a live SERPROBOT API
  connector: exports still enter through the documented operator/Looker source
  boundary. No provider request, credential read or production rerun occurred.
- Focused and full local proof now passes with 137 TypeScript tests + 3 context
  tests, build, zero high audit vulnerabilities and `git diff --check`.

## Rank-export resolver follow-up — 2026-08-03

- The resolver now rejects an unparseable `captured_at` instead of allowing
  `NaN` to affect recency ordering.
- Readiness recognizes both the exact `--rank-monitoring` input and the
  recurring `--rank-monitoring-root` input. Schedule generation rejects both
  rank inputs together before emitting a cron command.
- Focused and full local proof now passes with 139 TypeScript tests + 3 context
  tests, build, zero high audit vulnerabilities and `git diff --check`.
- OpenCode second opinion for fixed point `c4cab8c` found no blocker; its
  static verification gap was replaced by the local proof above. No provider
  request, credential read, Ahrefs rerun or production report rerun occurred.

## Rank-only source identity alignment — 2026-08-03

- Agency report rank evidence now validates identities against the explicit
  SERPROBOT source registry, not only analytics scope entries. Source-only
  clients can therefore have a verified rank report without an invented GSC,
  GA4 or Ahrefs property.
- The report validation client set now includes source-registry clients, while
  provider and project checks remain manifest-bound and read-only.
- A focused falsifier covers a rank-only client; full local proof passes with
  140 TypeScript tests + 3 context tests, build, zero high audit vulnerabilities
  and `git diff --check`. No provider request or report rerun occurred.

## Rank-only isolation proof follow-up — 2026-08-03

- The rank provider identity is now owned by one exported constant in the rank
  monitoring module instead of another independent provider literal in report
  composition.
- The rank-only test now asserts ready source attribution, blocked report
  status with no analytics bundles, and rejects a manifest containing a foreign
  client snapshot.
- Local proof remains green: 140 TypeScript tests + 3 context tests, build,
  zero high audit vulnerabilities and `git diff --check`. No provider request,
  credential read, Ahrefs rerun or production report rerun occurred.

## Rank provider literal deduplication — 2026-08-03

- The shared rank-provider constant now also owns the serialized report and
  manifest provider fields; no independent runtime write literal remains.
- Focused rank/report proof and `git diff --check` pass. OpenCode's final
  bounded review found no blocker; its only retained note was this low-risk
  literal drift, now closed. No provider request or production rerun occurred.

## No-rerun rank evidence composition — 2026-08-03

- Standalone `--agency-report` and `--client-delivery` now accept
  `--rank-monitoring-root` and select the newest complete manifest-bound
  SERPROBOT export without running any provider adapter.
- Exact bundle paths and root selection are mutually exclusive. Delivery
  derives expected rank identities from the report's explicit source registry
  status, then re-verifies the selected bundle and declared provenance.
- This gives the operator a no-rerun path from existing evidence to the full
  local report/PDF/email bundle; it does not implement or invent a direct
  SERPROBOT API schema.
- Full local proof: 140 TypeScript tests + 3 context tests, build, zero high
  audit vulnerabilities and `git diff --check`. No provider request, credential
  read, Ahrefs rerun or production report rerun occurred.

## Rank root mixed-provider hardening — 2026-08-03

- The recurring rank resolver now ignores unrelated provider manifests while
  continuing to fail closed for a manifest explicitly declared as SERPROBOT
  when its report, hash or client identities are invalid.
- The CLI uses the shared rank-provider identity for root selection, and the
  delivery seam has a focused mutual-exclusion falsifier for exact path versus
  root input.
- Fixed point `b57239d`; local proof passes with 141 TypeScript tests + 3
  context tests, build, zero high audit vulnerabilities and `git diff --check`.
  No provider request, credential read, Ahrefs rerun or production report rerun
  occurred.

## Operator action-register isolation — 2026-08-03

- Client-managed action content now fails closed when an action declares a
  different `client_id` instead of silently dropping that entry. Duplicate
  `action_id` values are also rejected before rendering.
- This keeps sponsored articles, forum marketing, NAP listings and other
  operator-supplied actions tenant-scoped and deterministic in recurring
  delivery. No action is inferred from provider metrics.
- Fixed point `146977c`; local proof passes with 143 TypeScript tests + 3
  context tests, build, zero high audit vulnerabilities and `git diff --check`.
  No provider request, credential read, Ahrefs rerun or production report rerun
  occurred.

## Rank resolver second-opinion follow-up — 2026-08-03

- OpenCode/DeepSeek bounded review identified a recurring-run risk: an older
  valid SERPROBOT bundle containing a retired or foreign client could prevent
  selection of a newer complete bundle. It also identified duplicated rank
  client identity derivation and duplicated source labels.
- Fixed point `46858f8` now skips only the stale identity-mismatch candidate,
  while hash-invalid, malformed or otherwise corrupted SERPROBOT candidates
  still fail closed. Client-ID derivation and the observed SERPROBOT label are
  centralized in `src/rank-monitoring.ts`.
- A focused falsifier covers stale foreign-client exports alongside a newer
  valid export; tampered matching exports remain fail-closed. Local proof now
  passes with 144 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities and `git diff --check`. No provider request, credential
  read, Ahrefs rerun or production report rerun occurred.
- The reviewer confirmed no blocker. Remaining operator/product gate:
  recurring rank collection still consumes an existing manifest-bound export;
  no direct SERPROBOT API schema is invented.

## Rank-root fail-closed and confinement follow-up — 2026-08-03

- The follow-up OpenCode review identified two risks: an unparseable root
  manifest could be silently skipped, and a rank root had no explicit
  realpath confinement to the analytics artifacts directory.
- Fixed point `6948d31` now fails on an unparseable manifest, preserves the
  existing skip-only policy for valid stale identity-mismatch bundles, and
  keeps hash-invalid matching bundles fail-closed. Rank-root resolution is
  confined to `artifactsDir` through realpath validation in CLI and delivery.
- Focused falsifiers cover corrupt manifests, root confinement, stale foreign
  exports and tampered matching exports. Local proof passes with 146
  TypeScript tests + 3 context tests, build, zero high audit vulnerabilities
  and `git diff --check`. No provider request, credential read, Ahrefs rerun
  or production report rerun occurred.

## Delivery prerequisite and history fail-closed follow-up — 2026-08-03

- Executive metrics now preserve missing provider values as `null` and render
  them as `—`; delivery manifest counting deduplicates the same manifest when
  it appears in both current and historical evidence.
- Provider history now fails closed for a required malformed history report,
  while continuing to ignore accepted non-history Ahrefs profile bundles.
- PDF delivery performs a preflight for the four required host binaries and
  `XDG_RUNTIME_DIR` before creating renderer output. The SERPROBOT runbook now
  documents the required build and user-systemd prerequisites for scheduled
  PDF runs.
- Fixed point `5be4c62`; OpenCode/DeepSeek review of the preceding fixed point
  `0366758` found no blocker and identified these risks. Local proof after the
  fixes passes with 149 TypeScript tests + 3 context tests, build, zero high
  audit vulnerabilities and `git diff --check`. No provider request,
  credential read, Ahrefs rerun or generated production report rerun occurred.

## Final delivery second-opinion follow-up — 2026-08-03

- OpenCode/DeepSeek (`opencode-go/deepseek-v4-flash`, non-interactive,
  read-only) reviewed fixed point `a440279` and found no blocker. It confirmed
  tenant/path confinement, deterministic rendering controls, unavailable-vs-
  zero semantics, adjacent history comparisons, recurring schedule wiring and
  the local proof gates.
- The review identified three low-severity hardening items. Fixed point
  `138f921` now rejects a required identity-stripped history report, performs
  PDF renderer preflight before creating the delivery output directory, and
  fails clearly when the API caller omits `artifactsDir`. A new falsifier covers
  the identity-stripped report; the Ahrefs delivery fixture now carries the
  complete history identity/range contract.
- Final local proof passes with 150 TypeScript tests + 3 context tests, build,
  zero high audit vulnerabilities and `git diff --check`. No provider request,
  credential read, Ahrefs rerun or generated production report rerun occurred.
- Review output is transient at `/tmp/seo-godlike-opencode-a440279-r2.json`;
  current status remains owned by this ticket. Remaining gates are operator
  mapping/authorization, GA4 numeric property and consent, managed Localo
  profile, verified SERPROBOT source input/API schema, retention/export policy,
  and any hosted/public delivery decision.

## SERPROBOT API contract audit — 2026-08-03

- Official SERPROBOT documentation confirms the read-only Data Studio connector
  requires connector authorization, an API key, numeric project ID, and
  `start`/`end` dates. It does not publish a stable HTTP endpoint or response
  schema for a standalone application adapter: [official connector guide](https://www.serprobot.com/data-studio-connector).
- Decision: keep `--pack-rank-monitoring` and `--rank-monitoring-root` as the
  current manifest-bound ingestion boundary. Do not infer an endpoint, scrape
  Looker Studio, or spend ranking/provider units during report generation.
- To activate recurring rank collection, the operator must provide either a
  normalized SERPROBOT export per the runbook or a provider-confirmed API
  request/response fixture. The existing recurring schedule and report delivery
  can consume that immutable snapshot without rerunning Ahrefs.

## Final fixed-point hardening — 2026-08-03

- The final OpenCode/DeepSeek review of `a895d23` found no blocker and noted
  three low-risk improvements: symlink confinement asymmetry in content/rank
  readers, absolute source paths in the delivery manifest, and a stale map
  pointer.
- Fixed point `68bfdc9` introduces the shared realpath confinement helper for
  manifest readers, adds symlink-escape falsifiers, and makes the delivery
  manifest source field deterministic (`agency-report.json`). The map now
  points to this fixed point.
- Local proof passes with 152 TypeScript tests + 3 context tests, build, zero
  high audit vulnerabilities and `git diff --check`. PDF renderer execution
  remains host-gated and SERPROBOT collection remains operator-gated; no
  provider request, credential read, Ahrefs rerun or production report rerun
  occurred.

## Current-versus-history bundle selection — 2026-08-03

- Fixed point `8c73819` selects the newest accepted bundle per registered
  source identity for current metrics, while retaining all accepted bundle
  paths for bounded historical comparisons. This prevents duplicate historical
  Ahrefs snapshots from inflating the current report without losing period
  history.
- Focused falsifier covers two accepted bundles for one identity and proves
  that the newer bundle is the only current bundle. Local Bodymove proof from
  existing evidence reports 3 current bundles, 4 history bundles, 207
  cross-source rows, 36 rule-based signals and 41 keyword rows. Delivery
  renders 6 isolated units and 6 checked A4 PDFs; no provider request,
  credential read or Ahrefs rerun occurred.

## OpenCode second opinion and portability follow-up — 2026-08-03

- OpenCode/DeepSeek (`opencode-go/deepseek-v4-flash`, non-interactive,
  read-only) reviewed fixed point `769bd61` and found no blocker. It confirmed
  current/history separation, tenant and manifest boundaries, recurring
  schedule wiring, Polish delivery semantics and local proof gates.
- The only actionable finding was a portability defect: the history dashboard
  manifest persisted an absolute artifacts path. Fixed point `9c14233` now
  stores a stable relative label and adds a two-root reproducibility falsifier.
  Remaining deferred item: PDF byte-identical reproducibility across pinned
  Chromium environments is not proven by the local test suite.
- Final local proof after the follow-up passes with 156 TypeScript tests + 3
  context tests, build, zero high audit vulnerabilities and `git diff --check`.
  No provider request, credential read, Ahrefs rerun or production collection
  occurred. The local delivery proof remains operator-only and partial because
  GA4, Localo, SERPROBOT/Semstorm evidence and client mapping/actions are not
  present in the accepted inputs.

## Ahrefs appendix percentage consistency — 2026-08-03

- Fixed point `4cdcfe3` makes the operator agency appendix render the same
  canonical Ahrefs percentage as client delivery: legacy `-230` is shown as
  `-2.30%` in both Markdown and HTML, while normalized ratio fields remain
  authoritative.
- Added an end-to-end falsifier through `writeAgencyReport` for a legacy-only
  profile row; both appendix surfaces are asserted. Local proof passes with
  157 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities and `git diff --check`.
- OpenCode/DeepSeek (`opencode-go/deepseek-v4-flash`, non-interactive,
  read-only) re-reviewed the fixed point and found no blocker. Deferred risks:
  provider unit semantics for unusual non-integer values, recurring schedule
  installation, and pinned Chromium reproducibility. No provider request or
  Ahrefs rerun occurred.

## Client delivery completeness and Ahrefs display follow-up — 2026-08-03

- Fixed point `59c0857` makes missing client supplements explicit: every mapped
  client report with a declared SERPROBOT source now shows `Unavailable` for
  the absent actions register and SERPROBOT rank snapshot instead of silently
  omitting those surfaces.
- The client renderer now normalizes Ahrefs `traffic_diff_percent` values from
  the provider's hundredths-of-a-percent representation (for example `-230`
  renders as `-2,30%`), while preserving normalized fixture ratios.
- Local delivery proof `artifacts/analysis/client-delivery-20260803-fixed-v5/`
  contains 6 units, 19 manifest-bound files, 4 history manifests and
  `provider_calls: 0`; Bodymove HTML contains the explicit unavailable actions
  and rank statuses, and its PDF passes `qpdf --check`. No provider request or
  Ahrefs rerun occurred.

## Minimalist dashboard shell — 2026-08-03

- Fixed point `7eb2f30` adds a deterministic local dashboard shell to client
  delivery: Polish navigation, client/domain cards, a bottom circular report
  switcher, stable anchors, and preserved HTML/PDF/email links. It consumes
  existing manifest-bound evidence only; no provider request or Ahrefs rerun.
- Local proof `artifacts/analysis/client-delivery-20260803-ui-v2/` renders 6
  units from the existing Bodymove agency report. The separate PDF proof is
  mode `0600`, A4 and qpdf-valid.
- OpenCode/DeepSeek reviewed clean fixed point `7eb2f30` read-only and found no
  blocker. Deferred: canonical Ahrefs percentage units at the adapter boundary,
  scheduler falsifiers, and replacing fragile supplement string surgery.
- Unassigned phrase domains remain operator-only; live SERPROBOT/Semstorm/GA4/
  Localo access and client publication remain unproven and unauthorized.

## MIME delivery drafts — 2026-08-03

- Fixed point `37cb113` upgrades local `.eml` outputs from path-only text
  into deterministic `multipart/mixed` drafts with embedded HTML and optional
  PDF attachments. The drafts remain draft-only and are never sent.
- The PDF test seam records `renderer_custom`; production CLI rendering
  continues to record the isolated renderer policy. Plain-text fields collapse
  CR/LF to prevent body-line injection.
- Local proof remains green: 157 TypeScript tests + 3 context tests, build,
  zero high audit vulnerabilities and `git diff --check`. No provider request,
  credential read, Ahrefs rerun or report collection occurred.
- OpenCode/DeepSeek v2 review found no blocker; v3 did not return a final
  verdict within its bounded run and is not treated as approval. Remaining
  deferred items are pinned Chromium reproducibility, recurring installation,
  and operator authorization for live SERPROBOT/Semstorm, GA4, Localo and
  client publication.

## Standalone delivery input forwarding — 2026-08-03

- Fixed point `2d731dd` closes a CLI seam: standalone
  `--client-delivery` now forwards operator content bundles, exact or rooted
  SERPROBOT snapshots, and keyword bundle roots exactly like `--agency-run`.
- The CLI rejects conflicting `--rank-monitoring` and
  `--rank-monitoring-root` inputs before reading the evidence package.
- Proof passes with 158 TypeScript tests + 3 context tests, build, zero high
  audit vulnerabilities and `git diff --check`. No provider request, secret
  read or Ahrefs rerun occurred.

- Fixed point `d2c1330` also accepts `--agency-run-record` on standalone
  delivery, preserving the read-only execution trace in the output manifest.

## Readiness executor truthfulness — 2026-08-03

- Fixed point `2f2d659` makes `--agency-readiness` fail closed when a
  ready SERPROBOT source lacks `--rank-monitoring` or
  `--rank-monitoring-root`, and when a ready external source has no
  agency-run executor (currently Localo/Semstorm).
- Added a focused readiness falsifier. Proof passes with 159 TypeScript tests
  + 3 context tests, build, zero high audit vulnerabilities and
  `git diff --check`; no provider request or Ahrefs rerun occurred.

## Keyword bundle provenance guard — 2026-08-03

- The operator-provided input `frazy strony (1).txt` was audited without
  reading or calling any provider: its metadata describes 5 host groups and 44
  normalized phrases. The existing Ahrefs Keywords Explorer bundle declares
  the same input SHA-256 but contains only 4 queried groups and 41 returned
  rows. It must not be presented as a complete result for the current input.
- Fixed point `67eba1a` makes agency report ingestion require and cross-check
  the manifest-bound `request.json`: provider/operation/country, non-empty
  input groups, and returned group phrase sets must agree. A tampered request
  falsifier rejects before report output is written.
- No Ahrefs rerun, credential read, provider request, or generated production
  report rerun was performed. The correct operator state is `needs operator
  action`: either provide an accepted bundle matching the current input or
  explicitly keep the older 4-group bundle under its original input identity.

## OpenCode provenance follow-up — 2026-08-03

- OpenCode/DeepSeek (`opencode-go/deepseek-v4-flash`, non-interactive,
  read-only) reviewed fixed point `c176dbb` and found no blocker. It confirmed
  the request/report/input group binding and the existing 159 TypeScript + 3
  context test proof.
- The review identified the retained ignored delivery proof as stale relative
  to the portability fix; it is not used as current evidence and was not
  regenerated to avoid a report rerun. The `|value| == 1` Ahrefs percentage
  interpretation remains deferred technical debt, not a blocker.
- Map pointer was refreshed to `c176dbb`. Remaining operator gates are live
  SERPROBOT/GA4/Localo evidence, explicit client mapping/actions, and any
  publication authority.

## Bundle-only report rebuild — 2026-08-03

- A local rebuild using only the already accepted artifacts and the existing
  four-group Ahrefs keyword bundle succeeded with `report_status: partial`, 3
  accepted source bundles, and 41 returned keyword rows. The rebuild omitted
  the current phrase input intentionally, so it did not call Ahrefs or any
  other provider and is not a fresh collection.
- The current 5-group/44-phrase input remains separate from that historical
  evidence. Passing it to the report writer correctly fails closed; no report
  is allowed to imply coverage for the two additional Babka phrases or the
  Wilmed phrase until a matching accepted bundle exists.

## Agency-run keyword preflight — 2026-08-03

- Fixed point `1d543e8` moves existing keyword bundle verification ahead of
  `--agency-run` output creation and provider task execution. A supplied input
  must match the manifest-bound bundle before GSC, Ahrefs, or external source
  tasks can start.
- The CLI falsifier uses a locally generated test bundle with a changed input,
  proves the exact hash failure, and proves the run directory is not created.
  Full proof passes with 160 TypeScript tests + 3 context tests, build, zero
  high audit vulnerabilities, and `git diff --check`.
- This is a local policy guard only: no provider request, credential read,
  Ahrefs rerun, or production report rerun was performed.

## Keyword preflight review follow-up — 2026-08-03

- OpenCode/DeepSeek reviewed fixed point `963a657` read-only. It found no
  blocker, but identified a medium operator-path defect: an existing keyword
  bundle without an explicit root was checked against the fresh run directory
  instead of `--artifacts-dir`.
- Fixed point `dde0897` aligns the default root with `--artifacts-dir` (falling
  back to the run output only when no artifacts root is supplied) and updates
  the CLI falsifier to cover the omitted-root path. The guard still runs before
  output creation and provider tasks.
- Review-deferred low risks: the portable history manifest intentionally keeps
  a relative artifacts label, and legacy Ahrefs integer percentage values have
  an ambiguous `|value| == 1` boundary. Neither affects current normalized
  bundles or blocks this slice.
- Local proof after the fix: 160 TypeScript tests + 3 context tests, build,
  zero high audit vulnerabilities, and `git diff --check`. No provider
  request, credential read, or Ahrefs rerun occurred.

## Operator configuration truthfulness — 2026-08-03

- OpenCode/DeepSeek follow-up on `2efc936` found no blocker. It identified
  that `.env.example` described variables which the CLI does not load; the
  actual contract is explicit CLI flags plus keyring references.
- Fixed point `ba28613` replaces the inert dotenv template with a truthful
  operator reference and aligns the remaining analytics-batch output directory
  with the `0700` permission policy.
- Local proof passes with 160 TypeScript tests + 3 context tests, build, zero
  high audit vulnerabilities, and `git diff --check`. No provider request,
  credential read, or Ahrefs rerun occurred. Legacy percentage ambiguity and
  recurring-job installation remain deferred as previously recorded.

## Standalone keyword preflight follow-up — 2026-08-03

- OpenCode/DeepSeek final follow-up on `2ab2eb7` found no security blocker but
  identified two fail-closed operator-path issues: standalone `--agency-report`
  could leave a partial output directory before keyword verification, and a
  missing bundle root produced a raw filesystem error.
- Fixed point `a47edce` verifies an existing keyword bundle before standalone
  report output creation and requires `--keyword-bundle-root` or
  `--artifacts-dir` for `--agency-run` reuse. Focused falsifiers cover both
  paths and prove no output directory is created on rejection.
- Local proof passes with 162 TypeScript tests + 3 context tests, build, zero
  high audit vulnerabilities, and `git diff --check`. No provider request,
  credential read, or Ahrefs rerun occurred.

## Bundle-only preflight follow-up — 2026-08-03

- OpenCode/DeepSeek follow-up on `ca48bc3` found one remaining medium timing
  gap: bundle-only `--agency-run` skipped preflight when no current phrase file
  was supplied, so a tampered bundle could be detected only after provider
  tasks and partial output creation.
- Fixed point `4a6c88e` makes existing-bundle verification unconditional in
  both `--agency-run` and `--agency-report`. A tampered `request.json` now
  fails before output creation even in bundle-only mode; a dedicated CLI
  falsifier covers that path.
- Local proof passes with 163 TypeScript tests + 3 context tests, build, zero
  high audit vulnerabilities, and `git diff --check`. No provider request,
  credential read, or Ahrefs rerun occurred. Remaining deferred items are
  legacy percentage edge semantics, recurring-job installation, and live
  operator-gated providers.

## Evidence semantics and freshness hardening — 2026-08-04

- Fixed point `5cec71c` changes persisted Ahrefs claims from `confidence:
  observed` to `confidence: estimated`, matching the rendered `Estimated —
  Ahrefs` contract.
- Standalone agency report selection now excludes an Ahrefs snapshot older than
  the selected GSC observation period; the source is marked unavailable and no
  cross-source join is composed. Equality at the GSC period boundary remains
  accepted. Current evidence is not re-collected.
- Follow-up polish validates report periods as date-only ISO values at package
  ingest and renders stale-Ahrefs status/reason in Polish client delivery.
- Proof: 166 TypeScript tests + 3 context tests, build, `npm audit --omit=dev
  --audit-level=high` with zero vulnerabilities, and `git diff --check`.
- OpenCode/DeepSeek non-interactive review of `5cec71c` found no blocker. The
  review’s three follow-up observations were closed in the working tree: Polish
  stale status, date-only ingest validation, and fresh-boundary acceptance
  falsifier. No provider request, credential read, Ahrefs rerun, or report
  regeneration occurred.

## Final fixed-point review — 2026-08-04

- OpenCode/DeepSeek (`opencode-go/deepseek-v4-flash`, non-interactive,
  read-only) reviewed `ce114f5`; no blockers. It independently reproduced
  the normal persisted-artifact path and a tampered-but-rehashed stale Ahrefs
  scenario: stale context becomes unavailable, is excluded from joins, and
  the report becomes partial.
- Deferred quality notes: replace the string-coupled stale reason with a
  structured reason code; decide whether reverse staleness (old GSC versus
  fresh Ahrefs) needs a policy; immutable historical bundles may retain the
  former `confidence: observed` value because they are not rewritten.
- Fixed point is ready for operator external-review handoff. No provider
  request, credential read, Ahrefs rerun, report regeneration, or publication
  was performed during this proof.

## Structured stale-source reason — 2026-08-04

- The stale-Ahrefs report status now carries the typed `reason_code:
  stale_snapshot`; client delivery uses that code rather than matching the
  English evidence reason string.
- Focused and full local proof passes with 166 TypeScript tests + 3 context
  tests, build, zero high audit vulnerabilities, and `git diff --check`.
- No provider request, credential read, Ahrefs rerun, report regeneration, or
  publication occurred.

## Client delivery rank-history slice — 2026-08-04

- Client delivery now consumes the explicit `--rank-monitoring-root` source
  root when supplied, derives only adjacent verified SERPROBOT comparisons, and
  renders a Polish `HISTORIA MONITORINGU` section with previous/current
  positions, delta, search configuration and both source manifest hashes.
- The delivery manifest records every rank-history source manifest and counts
  it among verified inputs. A dashboard manifest is marked with
  `artifact_type: rank-history-dashboard`, so recurring source discovery cannot
  mistake the derived dashboard for a raw snapshot.
- Focused delivery proof covers a two-period multi-client input and confirms
  Bodymove history is not leaked into the other client. Local proof: 193
  TypeScript tests + 3 context tests, build, zero high audit vulnerabilities,
  and `git diff --check`.
- OpenCode/DeepSeek reviewed exact HEAD `fefe0bb` read-only and reached the
  changed delivery seams plus the full test run, but its bounded session ended
  before a final verdict. This remains partial review evidence, not a PASS. No
  provider request, credential read, Ahrefs rerun, report regeneration, or
  publication occurred.

## Rank-history output provenance — 2026-08-04

- `writeRankHistoryDashboard` now emits a private `manifest.json` binding the
  JSON, Markdown and HTML dashboard files by SHA-256 and byte count, plus the
  distinct verified SERPROBOT source-manifest hashes consumed by the summary.
- A focused falsifier verifies the output hashes, bytes, provider label and
  `0600` file modes. Local proof: 193 TypeScript tests + 3 context tests,
  build, zero high audit vulnerabilities, and `git diff --check`.
- OpenCode/DeepSeek was invoked against exact HEAD `f6fe0f1` in non-interactive
  read-only mode; the bounded session reached repository/context inspection but
  ended before a final verdict. Treat it as partial review evidence, not as a
  PASS. No provider request, credential read, Ahrefs rerun, report regeneration,
  or publication occurred.

## Exact-head OpenCode second opinion — 2026-08-04

- OpenCode/DeepSeek reviewed exact HEAD `ef7eb07` read-only in non-interactive
  mode. It found no blocker in the recurring history/rank-monitoring route.
- Reproduced gates: 193 TypeScript tests, 3 context tests, strict TypeScript,
  build, `git diff --check`; the local audit also passed with zero high-severity
  vulnerabilities. No provider request, credential read, Ahrefs rerun, report
  regeneration, or publication occurred.
- Deferred low-risk items: schedule path-policy symmetry, GA4 blocked-task
  observability, PDF byte-level reproducibility, and the documented realpath/
  read TOCTOU residual. These do not change the current operator route.
- Remaining operator gates are unchanged: explicit Bodymove/property mapping,
  SERPROBOT/Looker source authority, GA4 numeric property plus consent, Localo
  managed profile, retention/export authority, and observed cron installation.

## Rank walker dangling-alias follow-up — 2026-08-04

- A final second-opinion review found that a dangling `manifest.json` symlink
  could abort rank-root discovery before valid nested bundles were scanned.
  The walker now skips that dangling alias and continues through the subtree.
- Focused falsifier plus local gates pass: 193 TypeScript tests + 3 context
  tests, build, zero high audit vulnerabilities, and `git diff --check`.
- Fixed point: `c7b8a6e`. No provider request, credential read, Ahrefs rerun,
  report regeneration, or publication occurred.

## OpenCode second-opinion follow-up — 2026-08-04

- OpenCode/DeepSeek review of `01c1346` found no blocker. Its scoped-read and
  unused-marker risks were addressed in `ec5cce4`; the focused scoped symlink
  falsifier and the full local gates pass.
- The review confirms path confinement, manifest/hash provenance, tenant
  isolation, unavailable-versus-zero semantics, Polish client delivery, and
  deterministic local output. It did not verify live provider values or cron
  installation, by design.
- Operator-owned external review remains pending for this security/evidence
  slice. No provider request, credential read, Ahrefs rerun, report
  regeneration, or publication occurred.

## Candidate-read confinement follow-up — 2026-08-04

- Provider and GSC history candidate reports now use the shared symlink-aware
  confinement helper before parsing bytes. Escaping report symlinks fail closed
  instead of being silently treated as unrelated unreadable bundles, including
  scoped history reads.
- History dashboard manifests contain only the hashes and byte counts of their
  rendered files; the skipped-bundle label is Polish in both rendered surfaces.
- Local proof at fixed point `ec5cce4`: 186 TypeScript tests + 3 context tests,
  build, zero high audit vulnerabilities, and `git diff --check`.
- No provider request, credential read, Ahrefs rerun, report regeneration, or
  publication occurred.

## External-source evidence-path wording — 2026-08-04

- OpenCode/DeepSeek found that ready Localo, GA4, or Semstorm registry entries
  have no standalone evidence ingestion path and were therefore permanently
  partial under the missing-bundle rule.
- The report now uses `reason_code: no_evidence_path` for those sources, while
  SERPROBOT without a supplied rank snapshot keeps
  `missing_evidence_bundle`. Client delivery renders distinct Polish reasons;
  a focused Localo falsifier covers the distinction.
- Proof: 169 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`; no provider request, credential
  read, Ahrefs rerun, report regeneration, or publication.

## Fail-closed missing evidence — 2026-08-04

- OpenCode/DeepSeek review of `628b5f4` found a medium truthfulness gap: a
  capability-ready source without an accepted evidence bundle could remain
  `ready`, and a mixed report could be marked `reportable`.
- Fixed in the follow-up slice: such a source is now `unavailable` with the
  typed `reason_code: missing_evidence_bundle`, is included in
  `blocked_sources`, and cannot make the report reportable. Client delivery
  renders an explicit Polish missing-evidence explanation.
- Focused mixed-source falsifier plus full proof pass: 167 TypeScript tests +
  3 context tests, build, zero high audit vulnerabilities, and
  `git diff --check`. No provider request, credential read, Ahrefs rerun,
  report regeneration, or publication occurred.

## GA4 readiness executor alignment — 2026-08-04

- Readiness no longer reports a ready Google Analytics 4 source as lacking an
  external executor: GA4 is collected by the existing agency scope executor,
  while SERPROBOT, Localo and Semstorm retain their separate source-input
  boundaries.
- A focused readiness falsifier proves a ready GA4 source with a registered
  numeric property and read-only capability is not blocked by executor
  classification. No OAuth credential was read and no provider request ran.

- Follow-up OpenCode/DeepSeek review confirmed the same boundary for
  standalone external sources: a ready SERPROBOT/Localo/GA4/visibility
  registry entry without its corresponding evidence is now unavailable and
  blocked. SERPROBOT becomes ready only when a matching, verified rank
  snapshot is supplied.
- A second focused falsifier covers one accepted GSC bundle plus one ready
  external source without rank evidence. Proof now passes with 168 TypeScript
  tests + 3 context tests, build, zero high audit vulnerabilities, and
  `git diff --check`. No provider request, credential read, Ahrefs rerun,
  report regeneration, or publication occurred.

## Current-scope downgrade precedence — 2026-08-04

- Final OpenCode/DeepSeek review found a low-risk fail-open edge where an old
  accepted bundle could revive a source currently downgraded by the scope
  plan. The report now checks the current scope status before accepting any
  historical bundle.
- A focused falsifier proves an unavailable current GSC scope does not consume
  an older ready bundle. Proof: 170 TypeScript tests + 3 context tests, build,
  zero high audit vulnerabilities, and `git diff --check`; no provider request,
  credential read, Ahrefs rerun, report regeneration, or publication.

## Current-bundle freshness scope — 2026-08-04

- The freshness guard now compares Ahrefs only against the selected current GSC
  bundle periods, not every historical GSC bundle retained in the artifacts
  directory. This prevents a non-current historical period from rejecting a
  valid current Ahrefs snapshot.
- An end-to-end falsifier covers the historical-later/current-selected case.
  Proof: 171 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`; no provider request, credential
  read, Ahrefs rerun, report regeneration, or publication.

## Delivery status semantics — 2026-08-04

- Client delivery now distinguishes stale, missing-bundle, and no-evidence-path
  sources in the headline status, not only in the detailed source table.
- A verified rank-only report counts as reportable evidence when no analytics
  bundle exists; an entirely empty evidence set remains blocked.
- Proof: 171 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`. No provider request, credential
  read, Ahrefs rerun, report regeneration, or publication occurred.

## Delivery email status parity — 2026-08-04

- The independent OpenCode/DeepSeek review identified that HTML used the typed
  stale/missing-evidence labels while draft email headers still collapsed them
  into a generic three-state status.
- Draft emails now reuse the same semantic source interpretation as HTML, so
  stale Ahrefs, missing evidence, and absent ingestion paths remain explicit in
  both local delivery surfaces. A focused client-delivery falsifier covers the
  stale Ahrefs wording.
- Proof: 171 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`. No provider request, credential
  read, Ahrefs rerun, report regeneration, or publication occurred.

## Tenant-scoped Ahrefs freshness — 2026-08-04

- The exact-HEAD OpenCode/DeepSeek review reproduced a cross-client freshness
  defect: a later GSC period for one client could downgrade another client's
  Ahrefs snapshot even when it matched that client's own period.
- Freshness now indexes selected current GSC period ends by `client_id`; an
  Ahrefs snapshot is compared only with the same client's selected GSC scope.
  A two-client falsifier proves the valid client remains ready while the
  client without an accepted Ahrefs bundle fails closed independently.
- Proof: 172 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`. No provider request, credential
  read, Ahrefs rerun, report regeneration, or publication occurred.

## GA4 accepted-bundle positive proof — 2026-08-04

- Added the missing positive-path falsifier: a ready external GA4 source with
  a manifest-verified bundle whose canonical `property_refs` matches the
  registry target remains `ready` and carries its accepted bundle path.
- This complements the fail-closed missing-bundle test; no live GA4 request or
  credential read was performed.
- Proof: 173 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`. No Ahrefs rerun, report
  regeneration, or publication occurred.

## Scheduled history-root preparation — 2026-08-04

- Monthly cron generation now prepares explicitly configured history and rank
  history roots with private directory permissions before the agency run and
  history writers execute. Default timestamped roots remain created inside the
  locked shell pipeline.
- A focused schedule falsifier asserts both explicit roots are included in the
  `install -d -m 700` preparation command. No cron was installed and no
  provider request or report rerun occurred.

## Ahrefs freshness baseline gate — 2026-08-04

- Ahrefs is now unavailable with `missing_freshness_baseline` when a matching
  ready GSC property exists in the scope but no accepted current GSC bundle
  exists to establish the comparison period. This prevents an old estimated
  snapshot from being presented as ready merely because the baseline is
  absent.
- Delivery renders the condition in Polish as a missing comparison baseline;
  it remains distinct from a stale snapshot and from missing evidence.
- A focused falsifier covers an accepted Ahrefs bundle alongside a ready but
  evidence-missing GSC property. Proof: 174 TypeScript tests + 3 context tests,
  build, zero high audit vulnerabilities, and `git diff --check`. No provider
  request, credential read, Ahrefs rerun, report regeneration, or publication
  occurred.

## Review hygiene and deduplicated delivery status — 2026-08-04

- The control-plane map now points at fixed point `4a0711d`; it remains a
  navigation surface, while the ticket remains the status authority.
- Client headline and source-summary labels deduplicate identical provider
  reason labels while retaining the full per-property source table.
- Proof: 174 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`. No provider request, credential
  read, Ahrefs rerun, report regeneration, or publication occurred.

## Verified keyword-only evidence status — 2026-08-04

- A final exact-HEAD review found that a verified Keywords Explorer bundle was
  rendered in the report while `report_status` still said `blocked` when no
  analytics or rank bundle was present.
- `keyword_research` now counts as evidence for reportability after its own
  manifest/input verification; the focused keyword-only test asserts
  `reportable`. Zero-evidence reports remain blocked.
- The review's history-totals zero-vs-unavailable edge remains deferred because
  correcting it requires a deliberate nullable metric contract across the
  history JSON, Markdown, and HTML surfaces.
- Proof: 172 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`. No provider request, credential
  read, Ahrefs rerun, report regeneration, or publication occurred.

## History dashboard permission hardening — 2026-08-04

- The final OpenCode/DeepSeek review found that history dashboard output used
  process defaults instead of the repository's private evidence modes.
- History output directories now use `0700` and generated JSON/Markdown/HTML/
  manifest files use `0600`; a focused test asserts both boundaries.
- History totals' zero-vs-unavailable representation remains explicitly
  deferred because it requires a nullable metric contract across all history
  renderers.
- Proof: 172 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`. No provider request, credential
  read, Ahrefs rerun, report regeneration, or publication occurred.

## Evidence writer permission hardening — 2026-08-04

- The exact-HEAD review found the same default-mode gap in standalone GSC,
  GA4, Ahrefs, pipeline, report-package, and rank-history writers.
- Evidence directories now request `0700` and their exclusive JSON/Markdown/
  HTML writes request `0600`, aligning standalone providers with the agency
  run and delivery boundaries. Existing umask-safe output behavior is covered
  by the full writer suite; no provider transport was exercised.
- Proof: 172 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`. No provider request, credential
  read, Ahrefs rerun, report regeneration, or publication occurred.

## Property-scoped freshness — 2026-08-04

- Freshness now prefers the GSC period matching the Ahrefs target host for the
  same client, instead of conservatively using the latest period across all of
  that client's GSC properties. If no host match exists, it retains the
  client-level fail-closed fallback.
- A focused two-property falsifier covers a root GSC property and a later
  Kraków subdomain period without downgrading the root Ahrefs snapshot.
- Proof: 172 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`. No provider request, credential
  read, Ahrefs rerun, report regeneration, or publication occurred.

## Unsupported source summary — 2026-08-04

- Client delivery now labels non-ready sources explicitly in the source
  summary: ready sources remain named directly, stale sources are
  `Niedostępne`, and unsupported sources are `Zablokowane`. The detailed
  source table and the headline status retain their existing semantics.
- A focused delivery falsifier covers a mixed GSC/Ahrefs/Semstorm source set;
  no provider request, credential read, Ahrefs rerun, report regeneration, or
  publication occurred.

## Provider-specific evidence paths — 2026-08-04

- External source gating now distinguishes providers with an implemented
  evidence path: SERPROBOT requires a verified rank snapshot, and Google
  Analytics may consume an accepted GA4 bundle. Localo and Semstorm remain
  `no_evidence_path` until their own persisted evidence contracts exist.
- A focused falsifier proves ready GA4 without an accepted bundle is
  `missing_evidence_bundle`, while ready Localo remains `no_evidence_path`;
  this prevents future GA4 readiness from being mislabeled or duplicated.
- Proof: 172 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`. No provider request, credential
  read, Ahrefs rerun, report regeneration, or publication occurred.

## Cross-host freshness fail-closed — 2026-08-04

- Property-scoped Ahrefs freshness no longer falls back to another GSC host of
  the same client when the matching host baseline is absent. The prior fallback
  could make an Ahrefs snapshot appear freshness-verified against Kraków data
  while the root property had no selected baseline.
- A focused falsifier keeps a ready Kraków GSC bundle, omits the root GSC bundle,
  and asserts `missing_freshness_baseline` for the root Ahrefs source.
- No provider request, credential read, Ahrefs rerun, report regeneration, or
  publication occurred.

## Freshness and email status follow-up — 2026-08-04

- Ahrefs now fails closed whenever the same client has a ready GSC scope but no
  selected baseline for the Ahrefs host, including `sc-domain:` versus `www`
  host mismatches. The dedicated falsifier covers that subdomain case.
- Draft email source labels are deduplicated like the HTML headline, and an
  unsupported source retains its concrete reason instead of the generic
  "wymaga wyjaśnienia" label.
- No provider request, credential read, Ahrefs rerun, report regeneration, or
  publication occurred.

## Fixed-point second opinion — 2026-08-04

- OpenCode non-interactive review using `opencode-go/deepseek-v4-flash` checked
  fixed point `4bd7b82`; it found no runtime blocker. It verified the new
  cross-host freshness falsifier, email deduplication, manifest provenance,
  path confinement, tenant separation, network-silent PDF boundary and Polish
  source semantics.
- The review records two low-risk policy notes: Ahrefs-only scopes have no GSC
  baseline to compare, and `www` versus `sc-domain:` remains intentionally
  conservative and therefore unavailable without an exact baseline.
- Local proof at this fixed point: 175 TypeScript tests + 3 context tests,
  build, zero high audit vulnerabilities, and `git diff --check`. The review
  was read-only; no provider request, credential read, Ahrefs rerun, report
  regeneration, or publication occurred.

## Schedule and GA4 executor alignment — 2026-08-04

- Follow-up review of `d134c8d` found two blockers. The explicit history-root
  preparation pre-created leaf directories that history writers create
  exclusively; the schedule now prepares only their parent directories.
- GA4 is owned by the property/scope executor and is no longer emitted as a
  blocked external-source task. Localo and other unsupported external sources
  retain their explicit blocked status.
- Focused falsifiers cover both the parent-only schedule preparation and the
  GA4/external-task boundary. Local proof: 178 TypeScript tests + 3 context
  tests, build, zero high audit vulnerabilities, and `git diff --check`.
- No provider request, credential read, Ahrefs rerun, report regeneration, or
  publication occurred. The remaining review follow-up is report-history
  symlink hardening and operator-owned cron installation.

## Readiness and schedule follow-up — 2026-08-04

- A second-opinion review of `0764852` identified two operational truthfulness
  issues: a single-segment history root could resolve to `.`, and a ready GA4
  source could exist without a matching ready scope property.
- The schedule now filters `.`/empty parent paths and has a single-segment
  falsifier. Readiness now fails closed with an explicit blocker when a ready
  GA4 target is not present in the ready scope plan.
- Proof: 182 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`. No provider request, credential
  read, Ahrefs rerun, report regeneration, or publication occurred.

## Cross-tenant readiness and root-path hardening — 2026-08-04

- GA4 readiness matching now requires both the source `client_id` and exact
  ready scope `property_id`; a same-property entry belonging to another client
  cannot satisfy readiness. A focused cross-client falsifier covers this.
- Schedule root preparation now excludes `.`, empty paths, and `/`; a focused
  absolute-root falsifier covers the last case.
- The control-plane map is pinned to `e685be7` as the current route fixed point.
- No provider request, credential read, Ahrefs rerun, report regeneration, or
  publication occurred.

## Schedule parent-traversal hardening — 2026-08-04

- Explicit history roots now reject `..` path segments before cron text is
  emitted; the dedicated falsifier covers `custom/../history`.
- Map and tracker pins now identify `e685be7`, the reviewed fixed point.
- Local proof after this hardening: 183 TypeScript tests + 3 context tests,
  build, zero high audit vulnerabilities, and `git diff --check`.
- No provider request, credential read, Ahrefs rerun, report regeneration, or
  publication occurred.

## Report history symlink hardening — 2026-08-04

- GSC history manifest discovery now resolves traversed directories and
  manifest symlinks against the configured artifacts root. In-root bundle
  symlinks remain readable; escaping manifest symlinks fail closed; unrelated
  escaping directory symlinks are ignored.
- Focused falsifiers cover both allowed in-root aliases and rejected escaping
  manifests. Local proof: 185 TypeScript tests + 3 context tests, build, zero
  high audit vulnerabilities, and `git diff --check`.
- No provider request, credential read, Ahrefs rerun, report regeneration, or
  publication occurred.

## Recurring history output hardening — 2026-08-04

- History and rank-history roots supplied to the monthly schedule now receive
  timestamped child output directories, so subsequent monthly runs do not
  collide with write-once directory creation.
- Each history manifest entry is now resolved through the shared confinement
  helper before bytes are consumed; the Polish HTML label for skipped bundles
  is aligned with the Markdown surface.
- Map pin advanced to `5218d9b`. Local proof: 186 TypeScript tests + 3 context
  tests, build, zero high audit vulnerabilities, and `git diff --check`.
- No provider request, credential read, Ahrefs rerun, report regeneration, or
  publication occurred.

## Imported rank snapshot confinement — 2026-08-04

- SERPROBOT/Looker snapshot bundle reads now confine both `manifest.json` and
  `report.json` through the shared symlink-aware resolver.
- Rank-monitoring root discovery follows only in-root directory aliases,
  ignores escaping directory aliases, and rejects escaping manifest aliases.
- Focused falsifiers plus the full local proof pass: 189 TypeScript tests + 3
  context tests, build, zero high audit vulnerabilities, and `git diff --check`.
- Fixed point: `e6e83dd`. No provider request, credential read, Ahrefs rerun,
  report regeneration, or publication occurred.

## Unified history confinement — 2026-08-04

- Scoped GSC history now rejects an in-scope manifest that omits `report.json`;
  unrelated nested output manifests remain ignored.
- Rank history now follows the same symlink-aware in-root walker as the other
  history readers and rejects escaping manifest aliases. Focused falsifiers
  cover both in-root bundle aliases and escaped manifests.
- Local proof at fixed point `0a266cd`: 192 TypeScript tests + 3 context tests,
  build, zero high audit vulnerabilities, and `git diff --check`.
- No provider request, credential read, Ahrefs rerun, report regeneration, or
  publication occurred.

## SERPROBOT history configuration guard — 2026-08-04

- Rank-history comparisons now require adjacent snapshots to belong to the same
  SERPROBOT project and search configuration. A project change is not treated
  as a position delta; nullable location/device fields remain compatible with
  row-level configuration supplied by the snapshot.
- Added a focused falsifier for adjacent snapshots from different project IDs.
  Existing multi-client delivery and same-keyword configuration tests remain
  green. No provider request, credential read, Ahrefs rerun, SERPROBOT rerun,
  report regeneration, or publication occurred.

## Foreign rank snapshot tolerance — 2026-08-04

- Aligned rank-history consumption with latest-rank selection: a verified
  snapshot bundle whose client identity is outside the requested registry
  scope is skipped instead of aborting the complete recurring delivery. Other
  manifest, hash, path, and schema failures still fail closed.
- The scope falsifier now proves a foreign-only bundle yields zero history
  entries. OpenCode review of `88f960f` found this as S1; the review had no
  blocker otherwise and is superseded by this repair. No provider request,
  credential read, Ahrefs rerun, SERPROBOT rerun, report regeneration, or
  publication occurred.

## Rank-history duplicate-period guard — 2026-08-04

- Rank-history summaries now deduplicate repeated exports by client, date range,
  and SERPROBOT configuration, retaining the newest captured snapshot. This
  prevents retry/merge duplicates from producing phantom position deltas.
- Client delivery labels each row `Okres porównania` rather than implying that
  every historical row is the report's current period, and its test verifies
  rank-history manifest provenance is exposed in delivery output. No provider
  request, credential read, Ahrefs rerun, SERPROBOT rerun, report regeneration,
  or publication occurred.

## Rank-history scope and timestamp hardening — 2026-08-04

- History consumption now filters foreign clients per verified multi-client
  bundle, preserving in-scope Bodymove snapshots while keeping the public
  `readRankMonitoringBundle` default fail-closed for identity mismatch.
- Repeated-period selection compares parsed capture instants rather than raw
  timestamp strings; focused falsifiers cover mixed-client bundles and ISO
  timestamp formatting. No provider request, credential read, Ahrefs rerun,
  SERPROBOT rerun, report regeneration, or publication occurred.

## Agency-run rank-history wiring repair — 2026-08-04

- Fixed the recurring agency-run handoff so root mode passes only
  `rankMonitoringRoot` to client delivery; the resolved current bundle is still
  used by agency-report, but is no longer passed alongside the root and rejected
  as mutually exclusive. Delivery now validates the rank root against the
  actual `--artifacts-dir`, which permits the scheduled sibling layout while
  keeping the root confined. This makes the scheduled
  `--rank-monitoring-root` → report → delivery path reachable.
- OpenCode review of `d8ab919` reproduced this as blocker B1. The standalone
  conflicting-input guard remains unchanged. A CLI falsifier runs the full
  sibling-root path with a local SERPROBOT bundle and no provider IO. No
  provider request, credential read, Ahrefs rerun, SERPROBOT rerun, report
  regeneration, or publication occurred.

## Client delivery copy hardening — 2026-08-04

- Client-facing source and rank-monitoring status text now localizes known
  GA4, Localo, SERPROBOT, Semstorm, and unsupported-metric reasons instead of
  leaking raw technical English into HTML or draft email output.
- Focused delivery falsifiers cover translated unavailable-source reasons and
  absence of the raw GA4/Localo reason strings. Full local proof remains green:
  198 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`.
- Existing local Bodymove evidence was rendered without provider IO: 6 delivery
  units and 13 manifest-bound files verified by hash and byte count. No GSC,
  Ahrefs, SERPROBOT, GA4, or Localo rerun occurred.
- Fixed point: `53c98f2` (`fix(delivery): localize unavailable source reasons`).

## Client delivery unknown-reason fail-closed guard — 2026-08-04

- Unknown future provider reasons are now rendered as a Polish operator-facing
  placeholder instead of being copied verbatim into client HTML or draft email.
  Focused delivery coverage includes known GA4/Semstorm mappings and an
  unknown Localo reason. No provider request or evidence rerun occurred.
- Fixed point: `931b9d6` (`fix(delivery): fail closed on unknown source reasons`).

## Independent OpenCode review — 2026-08-04

- Fixed point `693d6ae` was reviewed read-only with
  `opencode-go/deepseek-v4-flash`; the raw packet is retained outside the
  repository at `/tmp/seo-godlike-review-693d6ae-run2.json`.
- Verdict: no blockers. The reviewer reproduced the clean tree, path
  confinement, isolated PDF renderer policy, tenant checks, recurring route,
  and 201/201 local tests. No credentials, provider calls, or writes occurred.
- Deferred risks: monthly cron hard-codes `--pdf` and depends on a user-systemd
  session; CLI and delivery resolve a rank bundle twice; null location/device
  values act as wildcard configuration matches; `manifests_verified` includes
  the self-authored delivery manifest in its count. None blocks the current
  local fixed point; renderer-stack proof remains unverified in this review.
- Next action: preserve the current fixed point for operator acceptance, then
  harden scheduled PDF preflight and rank-bundle identity before live recurring
  use. Operator-gated mapping, GA4 consent/property, Localo profile,
  SERPROBOT/Looker snapshot authority, action register, retention, and cron
  installation remain outside code-only proof.

## Scheduled PDF preflight — 2026-08-04

- Monthly cron generation now checks `XDG_RUNTIME_DIR` and the required PDF
  renderer binaries before starting `--agency-run`. A missing renderer no
  longer allows provider work to start and fail later during client delivery.
- Focused schedule/history proof passes; this change does not install cron,
  execute a provider, rerun Ahrefs, or regenerate client evidence.

## Rank bundle identity binding — 2026-08-04

- Agency-run delivery now receives the exact rank bundle path already resolved
  and consumed for the agency report, while still constraining that path inside
  the configured rank root. Delivery retains the root for history aggregation,
  but does not independently select a potentially newer bundle for the current
  report.
- A focused falsifier places a newer valid bundle beside the selected bundle;
  delivery remains bound to the declared manifest hash. CLI, delivery, full
  test suite, audit, and diff checks pass. No provider request or rerun occurred.

## Scheduled rank-root confinement repair — 2026-08-04

- Independent OpenCode review of `7f9fc50` found one blocker: the schedule
  fixture generated `artifacts/rank-exports` beside, rather than inside,
  `--artifacts-dir artifacts/analysis`, while runtime confinement correctly
  rejected that layout.
- The schedule generator now rejects a `rankMonitoringRoot` outside
  `artifactsDir`, and the complete-pipeline fixture uses the valid nested root
  `artifacts/analysis/rank-exports`. This keeps the recurring command and its
  runtime policy aligned instead of relying on a test-only layout.
- Focused falsifier covers the rejected sibling root. Full proof passes with
  199 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`. No provider request, credential
  read, Ahrefs rerun, SERPROBOT rerun, report regeneration, or publication
  occurred.

## Independent OpenCode re-review — 2026-08-04

- Fixed point `101a260` was reviewed read-only with
  `opencode-go/deepseek-v4-flash`; the raw packet is retained outside the
  repository at `/tmp/seo-godlike-review-101a260.json`.
- Verdict: no blockers. The reviewer reproduced 199 TypeScript tests + 3
  context tests, build/type proof, zero high audit vulnerabilities, clean
  working tree, path confinement, manifest provenance, tenant isolation,
  deterministic ordering, and the corrected nested rank-root schedule.
- Remaining items are deferred rather than hidden: XDG/PDF renderer
  dependency in cron, operator-side cron installation proof, real Chromium
  network/determinism proof, nullable SERPROBOT location/device wildcard,
  `manifests_verified` count semantics, and GA4 readiness observability in a
  recurring run. No provider request, credential read, Ahrefs rerun, SERPROBOT
  rerun, report regeneration, or publication occurred during review.

## Standalone rank snapshot provenance — 2026-08-04

- Agency reports now retain the manifest-bound rank bundle path relative to the
  artifacts root. Standalone client delivery uses that declared path when a
  rank root is supplied, rather than silently selecting a newer sibling
  snapshot; the path is still constrained by realpath confinement.
- A focused delivery falsifier places a newer valid bundle beside the declared
  one and verifies standalone delivery renders the declared snapshot. Legacy
  summaries without the optional path retain the existing latest-bundle
  fallback and fail closed on provenance mismatch.
- Full proof passes with 199 TypeScript tests + 3 context tests, build, zero
  high audit vulnerabilities, and `git diff --check`. No provider request,
  credential read, Ahrefs rerun, SERPROBOT rerun, report regeneration, or
  publication occurred.

## Independent OpenCode review — 2026-08-04 (`f4ee86a`)

- Fixed point `f4ee86a` was reviewed read-only with
  `opencode-go/deepseek-v4-flash`; the raw packet is retained outside the
  repository at `/tmp/seo-godlike-review-f4ee86a.json`.
- Verdict: no blockers. The reviewer reproduced 200 TypeScript tests + 3
  context tests, clean build, audit-clean dependencies, path confinement,
  manifest provenance, tenant isolation, and the standalone declared-rank
  snapshot binding.
- Deferred items: daily schedule placeholder OAuth path (addressed in the next
  local slice), PDF/cron operator proof, nullable SERPROBOT config matching,
  history nullable-metric semantics, delivery manifest count semantics, and
  the existing TOCTOU window. No provider request, credential read, Ahrefs
  rerun, SERPROBOT rerun, report regeneration, or publication occurred.

## Daily schedule OAuth fail-closed guard — 2026-08-04

- `--schedule` now requires an explicit `--oauth-client` before generating the
  daily analytics cron. The former placeholder path could create a cron entry
  that only failed at runtime; the command now matches agency schedule's
  fail-closed authority boundary.
- Added a CLI falsifier for the missing OAuth argument. Full proof passes with
  200 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`. No provider request or evidence
  rerun occurred.

## GA4 scope mismatch run visibility — 2026-08-04

- Agency-run now emits a blocked task when a ready GA4 source-registry target
  has no matching ready property-scope entry. Valid GA4 entries remain owned
  by the property scope executor and are not duplicated as external tasks.
- The focused falsifier proves the mismatch appears as
  `no matching ready GA4 scope entry is registered`; no GA4 request is
  possible on that path. Full proof passes with 201 TypeScript tests + 3
  context tests, build, zero high audit vulnerabilities, and
  `git diff --check`. No provider request or rerun occurred.

## OpenCode review attempt — 2026-08-04 (`5ca2b5f`)

- Two bounded, read-only runs with `opencode-go/deepseek-v4-flash` inspected
  the current clean fixed point, including the GA4 scope-mismatch guard and
  recurring rank/schedule wiring. Raw packets are retained outside the
  repository at `/tmp/seo-godlike-review-5ca2b5f.json` and
  `/tmp/seo-godlike-review-5ca2b5f-retry.json`.
- Both runs stopped during tool inspection before producing a final review
  verdict. This is incomplete review evidence, not a PASS or blocker finding;
  the prior completed `f4ee86a` review remains the latest completed external
  opinion. No provider request, credential read, Ahrefs rerun, SERPROBOT rerun,
  report regeneration, or publication occurred.

## Recurring run identity binding — 2026-08-04

- The generated monthly cron now passes one explicit `--run-id`
  (`agency-run-$agency_run_stamp`) to the agency runner. Its run record,
  agency report, delivery output, history output, and rank-history output now
  share the same shell-generated run stamp instead of relying on separate
  process timestamps.
- A schedule falsifier checks the generated command contains the shared run
  identity. Full local proof passes with 201 TypeScript tests + 3 context
  tests, build, zero high audit vulnerabilities, and `git diff --check`. No
  provider request, credential read, Ahrefs rerun, SERPROBOT rerun, report
  regeneration, or publication occurred.

## OpenCode review attempt — 2026-08-04 (`241e5cd`)

- A bounded, read-only `opencode-go/deepseek-v4-flash` run inspected the clean
  recurring fixed point and its schedule/delivery/path-confinement seams. The
  raw packet is retained outside the repository at
  `/tmp/seo-godlike-review-241e5cd.json`.
- The run stopped during repository inspection before producing a final
  verdict. It is incomplete review evidence, not a PASS or blocker finding;
  local proof for the slice remains authoritative. No provider request,
  credential read, Ahrefs rerun, SERPROBOT rerun, report regeneration, or
  publication occurred.

## Keyword bundle/research rerun guard — 2026-08-04

- Monthly schedule generation now rejects a configuration that supplies both
  an existing Keywords Explorer bundle and `keywordResearch`. This prevents a
  recurring run from silently issuing a new costed Ahrefs query while an
  accepted local bundle was also supplied.
- A focused falsifier covers the conflicting configuration. Full local proof
  passes with 202 TypeScript tests + 3 context tests, build, zero high audit
  vulnerabilities, and `git diff --check`. No provider request, credential
  read, Ahrefs rerun, SERPROBOT rerun, report regeneration, or publication
  occurred.

## Readiness audit — 2026-08-04

- A local `--agency-readiness` run over the current fixture registry reports
  three ready scope entries for Bodymove (GSC root, GSC Kraków, and Ahrefs)
  and four explicitly unavailable sources: GA4, Localo, SERPROBOT, and
  Semstorm.
- The readiness command reports `credential_posture: not_inspected` and
  `policy_mode: read_only`; supplied paths were treated only as presence
  flags. No credential file was read and no provider request or rerun occurred.

## SERPROBOT/Looker CSV import seam — 2026-08-04

- Looker Studio remains a presentation layer; the official SERPROBOT connector
  is the upstream read source. The downloaded PDF is therefore not parsed as
  evidence and no ranking rerun is required.
- Added `--pack-rank-monitoring-csv` for an operator-supplied, explicitly
  normalized CSV (`keyword,position` plus optional previous position, search,
  location, device and URL columns). Project identity, dates and client scope
  are supplied as CLI metadata and are validated before the existing
  manifest-bound packer runs.
- The CLI path is covered by a no-provider-IO falsifier; malformed or guessed
  column names fail closed. This does not claim a live SERPROBOT API
  connection, nor does it infer ownership from a Looker report.
- Focused proof: build and rank-monitoring suite pass (18 tests); full suite,
  audit and diff checks are the remaining gates for this slice. No GSC,
  Ahrefs, SERPROBOT, GA4 or Localo request was made and no report rerun was
  performed.

## CSV provenance review follow-up — 2026-08-04

- OpenCode/DeepSeek review of fixed point `9724418` completed with no blocker;
  it reproduced 206 TypeScript + 3 context tests, build, audit and clean tree.
- The reviewer found one client-visible status gap: imported rank evidence can
  render while an intentionally `unavailable` `serprobot.<client>` registry
  entry still says the source is not approved. This is fail-closed by design,
  not an evidence leak; the runbook now explicitly requires the operator to
  set `status: "ready"` and the matching numeric project `target` after
  verifying the export.
- Low risks remain deferred: packer output confinement is an operator
  obligation, the CSV format intentionally rejects multiline fields, and the
  direct SERPROBOT API/Looker live connector is still not implemented. No
  provider request, credential read, Ahrefs/SERPROBOT rerun, report
  regeneration or publication occurred.

## Existing keyword input provenance audit — 2026-08-04

- The operator-supplied `/home/krn/Downloads/frazy strony (1).txt` has SHA-256
  `fffbd06f4bed92070a29d40d502b115633e4dab52e4f93b2db190e630821608f`, exactly
  matching `artifacts/analysis/ahrefs-keyword-research-20260803/report.json`.
- The accepted Ahrefs Keywords Explorer bundle retains all four supplied
  groups: `babkamedica.pl` 15/15, `cmr-ostroleka.pl` 9/9,
  `kartysimusa.pl` 10/10 and `www.goldenmed.pl` 7/7 (41/41 rows total,
  country `pl`). No keyword request, credential read or report regeneration
  was performed for this audit.
- The matching hash is the evidence that the existing client-delivery output
  can reuse this phrase input; a new Ahrefs run would be redundant and is not
  authorized by this goal.

## Operator actions CSV intake — 2026-08-04 (`682cf67`)

- Added a local-only `--pack-client-content-csv` seam for the operator-managed
  Looker/SERPROBOT „Działania dla strony” table. Required columns are
  `period_start,period_end,type,status,title`; optional columns preserve
  `action_id,target_url,published_at,notes`.
- The importer validates calendar dates, ordered periods, supported action
  types/statuses, duplicate identities and quoted CSV fields. It writes the
  existing manifest-bound `client-content.json` bundle and records the input
  SHA-256 plus `import_mode: normalized_csv`; it does not call a provider.
- The recurring schedule and client delivery already consume the same
  `--client-content-bundle` seam, so a verified action register will appear in
  the Polish client HTML/PDF/email output without manual report assembly.
- Local proof: 209 TypeScript tests + 3 context tests, build, npm audit with
  zero high vulnerabilities and `git diff --check` pass. No action CSV was
  supplied in this slice, so no client-facing action output was fabricated.
- The next operator input is the normalized actions CSV (and, separately, a
  verified SERPROBOT rank export if rank history is required). Existing Ahrefs
  evidence remains reusable; no Ahrefs rerun is needed.

## Bounded OpenCode review — 2026-08-04 (`327dbb0` / `682cf67`)

- `opencode-go/deepseek-v4-flash` completed a bounded read-only review of the
  current tracker fixed point and its parent implementation. The reviewer
  found **no blockers** across CSV parsing, provenance, tenant identity,
  recurring CLI integration, date/dictionary validation and focused tests.
- One documentation inconsistency was corrected immediately: the runbook now
  states that a header-only/empty actions CSV is rejected and that absence of
  an accepted bundle is not evidence that no actions occurred.
- Non-blocking deferred notes remain: multiline quoted CSV fields are outside
  the normalized import contract, and operator-supplied `client_id` is
  intentionally not inferred from a domain or provider export.
- Review output is retained outside the repository at
  `/tmp/opencode-review-327dbb0-bounded.json`. No provider request, credential
  read, report rerun or publication occurred during review.

## SERPROBOT connector decision follow-up — 2026-08-04

- Official SERPROBOT documentation confirms that the Data Studio connector
  reads saved data using an API key, numeric project ID and explicit `start` /
  `end` dates, with connector authorization handled in Google Data Studio.
- The public documentation does not expose a stable response schema or
  endpoint contract for a first-party local adapter. Therefore the repository
  keeps the normalized, hash-bound CSV import as the safe recurring seam and
  does not guess an API endpoint or spend provider quota. A direct adapter is
  deferred until SERPROBOT supplies a documented response contract.

## Recurring operator-content root — 2026-08-04 (`94eee8f`)

- Client delivery and the monthly schedule now accept `--client-content-root`
  alongside the existing explicit bundle path. Delivery recursively selects the
  newest verified operator-managed content bundle by the latest action period;
  it does not infer client ownership or read provider data.
- A delivery invocation now rejects simultaneous direct JSON, fixed bundle and
  bundle-root inputs instead of silently preferring one. The schedule test uses
  the root form, making the intended recurring path explicit.
- Local proof: 211 TypeScript tests + 3 context tests, build, audit with zero
  high vulnerabilities and `git diff --check` pass. No provider request,
  credential read, Ahrefs/SERPROBOT rerun or report generation occurred.
- OpenCode/DeepSeek review of parent `ed3d9d1` found no blockers; its main
  recurring-content risk is addressed by this slice. The direct SERPROBOT API
  remains intentionally deferred pending a documented response contract.
