# Documentation ownership classification

Classification recorded before the documentation migration on 2026-07-27.
This is a workflow report for the documentation-cleanup consumer, not a
status register, backlog, or architectural decision register.

| Existing document or artifact | Owner | Classification | Action |
|---|---|---|---|
| `AGENTS.md` | repository maintainers and the local workflow contract | repository contract and routing | keep at repository root |
| `.codex/AGENTS.md` | environment-owned global engineering contract | external instruction source, exposed locally by symlink | read-only; do not migrate or publish |
| `ONBOARDING_PROMPT.md` | repository maintainers | onboarding procedure and product-scope guardrails | keep at repository root; update output paths |
| `docs/agents/*.md` | `setup-repository-workflow` as source owner; repository as consumer | generated local workflow contract | keep under `docs/agents/`; do not move |
| `docs/agents/artifact-paths.json` | `setup-repository-workflow` as source owner; repository as consumer | generated artifact resolver | keep under `docs/agents/`; extend only for this local layout |
| `docs/agents/runs/**` | the workflow that created the run | temporary agent run material | keep under `docs/agents/runs/`; ignored by Git |
| onboarding discovery document (pre-migration) | onboarding/discovery workflow | environment observations | migrate to `docs/discovery/` |
| capability inventory document (pre-migration) | capability inventory workflow | capability inventory and states | migrate to `docs/capabilities/` |
| auth research document (pre-migration) | source-to-decision/research workflow | source research and bounded research decision | migrate to `docs/research/` |
| `.gitignore` | repository maintainers | repository-local source control policy | keep at repository root |
| `CONTEXT.md` | none; file absent | no existing domain context document | do not create |
| `docs/ARCHITECTURE.md` | none; file absent | no earned architecture document | do not create |
| `docs/DECISIONS.md` | none; file absent | no durable ADR register | do not create; use `docs/adr/` only for earned ADRs |

The migration separates temporary workflow material from durable domain
documentation. No domain document is promoted to `docs/agents/reports/`.
