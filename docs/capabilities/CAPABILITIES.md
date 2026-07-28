# Capability inventory

Owner: capability inventory workflow.

Stan epistemiczny na `2026-07-28`, fixed point `73418e5`. To jest bezpieczny,
lokalny inventory; nie zawiera sekretów i nie ustanawia uprawnień.

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
| Google Search Console API | local read-only v3 adapter, agency keyring, real GSC proof | `validated_real_domain` |
| Google Analytics Data API | local fixture-tested read-only v1beta adapter; strict version gate; no live scope/property proof yet | `schema_verified` (live unknown) |
| CrUX / PageSpeed Insights | no local adapter, credential reference, or MCP operation discovered | `not_discovered` |
| Semrush / Ahrefs / DataForSEO | no local adapter, credential reference, or MCP operation discovered | `not_discovered` |

The candidate names above are documented possibilities from the onboarding prompt, not discovered capabilities.

## Verification gaps

- GA4 OAuth scope and numeric property access remain operator-gated.
- GA4 has no live non-zero runReport proof or validated-real-domain state yet.
- No real `properties/<id>` is currently registered for a client in the
  permanent fixture, and the GA4 capability record is intentionally absent
  until a real property proof is completed.
- Local proof at `73418e5`: `npm test` passed (44 TypeScript tests + 3 context
  tests), including strict missing-version rejection and GA4 Markdown escaping.
- Fallow has not been run against the current revision; it is not an SEO provider.

## Safe next action after Phase A approval

Operator must supply a numeric GA4 Property ID and authorize the agency identity
for `analytics.readonly`. Then the implementation owner can add the property
and capability record, run metadata-only preflight, execute one bounded live
`runReport`, verify a non-zero sessions bundle and all manifest hashes, and only
then promote GA4 to `validated_real_domain`.
