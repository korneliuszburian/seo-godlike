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
