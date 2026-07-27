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

Installed global skills own implementation, diagnosis, review, and reusable engineering procedure. Do not copy or rename them in this repository.
<!-- krn-agent-workflow:end -->
