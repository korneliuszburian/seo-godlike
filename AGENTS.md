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

- Update the existing canonical document before creating a new one. One fact,
  one owner, one durable location.
- Do not create a durable document for a routine slice, status update, review
  result, or code explanation when the existing owner can be updated or the
  code and tests already make it observable.
- Create an ADR only for an earned architectural decision with alternatives,
  consequences, and a falsifier. Create a retained report only for a named
  consumer. Create a runbook only for an operator action that cannot be
  inferred safely from the CLI and tests.
- Keep current status, queue, claims, and blockers in the configured local
  tracker; do not mirror them in architecture pages, ADR indexes, capability
  pages, or ad-hoc summaries.
- Keep transient prompts, review packets, logs, and research runs under the
  ignored `docs/agents/runs/` boundary. Never promote them to durable docs just
  because a workflow produced them.
- No new root-level `docs/*.md`, tracker, backlog, decision register, or
  duplicate index without an explicit reason and an owner. Prefer links over
  copied sections.
- A documentation-only change must name the canonical owner it updates and
  state why code/tests/evidence cannot carry the information alone. If it
  cannot satisfy that test, do not create the document.

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
