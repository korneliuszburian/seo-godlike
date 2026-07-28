# `seo-godlike` repository instructions

This repository uses the installed engineering contract in
`.codex/AGENTS.md`. Read that file before making any change; it is the source
of truth for shell safety, authority boundaries, preservation of unrelated
work, and proof requirements.

Before implementation, read [ONBOARDING_PROMPT.md](ONBOARDING_PROMPT.md) and
execute only its Phase A discovery step. Do not assume that any API, MCP,
credential, Codex SDK, provider, domain, or production capability exists until
local evidence proves it.

The first product slice is read-only and must follow:

```text
one authorized domain
→ one locally discovered provider
→ one read-only operation
→ one canonical metric
→ immutable raw response
→ normalized observation
→ validated claim
→ deterministic JSON and Markdown report
```

Do not create external writes, publish changes, expose secrets, use an
`OPENAI_API_KEY` for Codex, or bypass Codex approvals/sandbox. Prefer the
official Codex SDK or local Codex app-server using the existing Codex auth
posture. If that cannot be established safely, stop and report the blocker.

## Documentation minimalism and source of truth

Treat documentation as a thin layer around the executable system, not as a
second implementation. Code, tests, schemas, fixtures, and generated evidence
are authoritative for behavior and data shape; Markdown must not restate those
facts unless it points to the authoritative source.

- One fact has one owner and one durable location. Update that owner before
  creating anything new; link to it instead of copying its content.
- Runtime behavior, data shape, and proof belong in code, tests, schemas,
  fixtures, and generated evidence. Do not create prose to explain a routine
  implementation slice or repeat a test result.
- A user or operator procedure belongs in an existing how-to/runbook. Create
  one only when the safe procedure cannot be inferred from the CLI and tests.
- An architectural decision belongs in an existing ADR, or in one new ADR only
  when the decision has alternatives, consequences, and a falsifier. An ADR is
  not a progress update, research dump, or index of other ADRs.
- Source research is retained only when it changes a named project decision;
  keep the mechanism, disposition, provenance, and falsifier rather than a
  transcript or a collection of notes.
- Current queue, claims, status, and blockers belong in the configured local
  tracker. Closed tracker tickets are historical evidence, not a second
  current-status surface. Do not mirror tracker state in architecture pages,
  capability inventories, ADR indexes, or reports.
- Review packets, prompts, logs, and research runs are transient material under
  ignored `docs/agents/runs/`. Retain a report only when a named consumer,
  owner, and future lookup need exist.
- `docs/ARCHITECTURE.md` is the sole durable documentation map. It contains
  short descriptions and links to owners; it does not duplicate their facts.
  Do not create another README, backlog, decision register, or index.

Before writing documentation, answer this decision tree:

```text
Does the change alter runtime behavior or data shape?
  → code/tests/schema/fixtures/evidence; update docs only for a public contract.
Does an operator need a procedure that cannot be inferred safely?
  → update the owning how-to/runbook.
Did a durable architectural choice change?
  → update the owning ADR, or earn one ADR with alternatives and a falsifier.
Is this status, a blocker, a plan, a review result, or session output?
  → tracker or transient run artifact; do not create durable docs.
Is there already an owner for the fact?
  → update and link that owner; do not create a parallel representation.
Otherwise
  → do not write documentation.
```

When a change makes a durable page stale, update, supersede, or remove that
page in the same slice. Do not append a new snapshot and leave the old one
looking current. Every documentation change must name its canonical owner and
why executable code, tests, or existing evidence cannot carry the information.

<!-- krn-agent-workflow:start -->
## Agent workflow

### Issue tracker

local Markdown owns the durable queue and claim state. See `docs/agents/issue-tracker.md`.

### Domain docs

Use the single-context domain layout. See `docs/agents/domain.md`.

### Delivery

Use the local delivery profile. See `docs/agents/delivery.md`.

### Agent artifacts

Use the repository-local working and retained report paths in `docs/agents/artifacts.md`.

### Review context

Give reviewers the complete bounded decision packet defined in `docs/agents/review.md`.

### External review gate

The operator owns external-review handoff. Every larger vertical slice and
every change touching security, authentication, provider boundaries, evidence
persistence, authority, or publication must stop after local proof and produce
a fixed-point handoff for the operator. The operator sends that handoff to the
selected external reviewer, currently Perplexity/Grok, and returns the feedback
to the implementation workflow.

The external reviewer is advisory and read-only: it receives the bounded review
packet, cannot edit the repository, execute tools, merge, or change tracker
state. Findings must be classified, addressed or explicitly deferred, and
re-tested before the slice is accepted. Small mechanical, documentation-only,
or already-proven changes may use local review only when their risk does not
cross these boundaries.

Installed global skills own implementation, diagnosis, review, and reusable engineering procedure. Do not copy or rename them in this repository.
<!-- krn-agent-workflow:end -->
