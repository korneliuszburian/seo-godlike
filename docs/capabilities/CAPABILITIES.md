# Capability inventory

Owner: capability inventory workflow.

Stan epistemiczny na `2026-07-27`. To jest bezpieczny, lokalny inventory; nie zawiera sekretów i nie ustanawia uprawnień.

## Vocabulary

`not_discovered` → `discovered` → `documented` → `installed` → `authenticated` → `reachable` → `schema_verified` → `validated_real_domain`

Przejście do kolejnego stanu wymaga osobnego lokalnego dowodu. Wpis konfiguracyjny lub dokumentacja nie wystarcza.

## Codex capability

| ID | Provider | Transport | States proven | States unknown | Read/write |
|---|---|---|---|---|---|
| `codex-cli` | OpenAI Codex | local CLI | `installed`, `authenticated`, `reachable` (doctor websocket) | SDK installed, schema verified, real-domain validation | local command surface; product read/write `unknown` |
| `codex-app-server` | OpenAI Codex | local app-server | `documented`, `installed` (CLI help) | running, authenticated session, schema verified | `unknown` |
| `@openai/codex-sdk` | OpenAI | TypeScript package | `not_discovered` locally | all later states | `unknown` |
| `openai-codex` | OpenAI | Python package | `not_discovered` locally | all later states | `unknown` |

## MCP capability

| ID | Provider | Transport | Local status | Auth status | SEO state | Evidence |
|---|---|---|---|---|---|---|
| `figma` | Figma | streamable HTTP | enabled/configured | OAuth (connector report) | `not_discovered` as SEO provider | `codex mcp list` |
| `openaiDeveloperDocs` | OpenAI Developers | streamable HTTP | enabled/configured | Unsupported | `documented` only for docs; not SEO data | `codex mcp list` |
| `krn_decision_packet` | KRN | stdio | enabled/configured | Unsupported | `not_discovered` as SEO provider | `codex mcp list` |
| `agent_browser` | local | stdio | disabled | Unsupported | `not_discovered` | `codex mcp list` |
| `context7` | Context7 | stdio | disabled | Unsupported | `not_discovered` | `codex mcp list` |
| `github` | GitHub | stdio | disabled | Unsupported | `not_discovered` | `codex mcp list` |

## SEO providers

| Candidate | Local evidence | State |
|---|---|---|
| Google Search Console API | no local adapter, credential reference, or MCP operation discovered | `not_discovered` |
| Google Analytics Data API | no local adapter, credential reference, or MCP operation discovered | `not_discovered` |
| CrUX / PageSpeed Insights | no local adapter, credential reference, or MCP operation discovered | `not_discovered` |
| Semrush / Ahrefs / DataForSEO | no local adapter, credential reference, or MCP operation discovered | `not_discovered` |

The candidate names above are documented possibilities from the onboarding prompt, not discovered capabilities.

## Verification gaps

- No provider has a verified read-only operation, schema fingerprint, limits, timeout, or known-answer reconciliation.
- No authorized domain/property is present in project files or operator input.
- No raw response, source, metric observation, claim, or report exists yet.
- Therefore `validated_real_domain` is not set for any capability.

## Safe next action after Phase A approval

Choose one provider only after the operator supplies an authorized domain/property and an existing secret reference, then run a bounded read-only capability verifier. Until then the correct outcome is `BLOCKED_MISSING_CAPABILITY` plus `BLOCKED_AUTHORIZATION`.
