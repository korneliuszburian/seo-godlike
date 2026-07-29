# Capability inventory

Owner: capability inventory workflow.

Stan epistemiczny na `2026-07-29`, lokalny fixed point po scope/agent-plan slice.
To jest bezpieczny,
lokalny inventory; nie zawiera sekretów i nie ustanawia uprawnień.

## Vocabulary

`not_discovered` → `discovered` → `documented` → `installed` → `authenticated` → `reachable` → `schema_verified` → `validated_real_domain`

Przejście do kolejnego stanu wymaga osobnego lokalnego dowodu. Wpis konfiguracyjny lub dokumentacja nie wystarcza.

## Codex capability

The repository-side agent runtime uses `@openai/codex-sdk` with the local Codex
authentication posture. It passes only an allowlisted process environment,
removes API-key variables, and starts read-only, approval-free, network-disabled
threads. This is a control-plane capability proof; it does not claim provider
metrics or replace the evidence adapters.

| ID | Provider | Transport | States proven | States unknown | Read/write |
|---|---|---|---|---|---|
| `codex-cli` | OpenAI Codex | local CLI | `installed`, `authenticated`, `reachable` (doctor websocket) | SDK installed, schema verified, real-domain validation | local command surface; product read/write `unknown` |
| `codex-app-server` | OpenAI Codex | local app-server | `documented`, `installed` (CLI help) | running, authenticated session, schema verified | `unknown` |
| `@openai/codex-sdk` | OpenAI Codex | TypeScript package | `installed`, read-only SDK smoke passed | live thread continuation and hosted validation | local read-only control-plane only |
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
| `localo-mcp` | Localo | streamable HTTP | reachable | Bearer keyring | `schema_verified`; managed Body Move profile unavailable | `--localo-discover`, read-only `docs`/`query` probes |

## SEO providers

| Candidate | Local evidence | State |
|---|---|---|
| Google Search Console API | local read-only v3 adapter, agency keyring, real GSC proof | `validated_real_domain` |
| Google Analytics Data API | local fixture-tested read-only v1beta adapter; strict version gate; no live scope/property proof yet | `schema_verified` (live unknown) |
| CrUX / PageSpeed Insights | no local adapter, credential reference, or MCP operation discovered | `not_discovered` |
| Ahrefs Site Explorer API v3 | local read-only adapter, keyring API key, live metrics bundle | `validated_real_domain` for `bodymove.pl` |
| Semrush / DataForSEO | no local adapter, credential reference, or MCP operation discovered | `not_discovered` |

The candidate names above are documented possibilities from the onboarding prompt, not discovered capabilities.

## Verification gaps

- GA4 OAuth scope and numeric property access remain operator-gated.
- GA4 has no live non-zero runReport proof or validated-real-domain state yet.
- No real `properties/<id>` is currently registered for a client in the
  permanent fixture, and the GA4 capability record is intentionally absent
  until a real property proof is completed.
- Local proof: `npm test` passes (66 TypeScript tests + 3 context tests), and
  `--scope-plan`/`--agent-plan` both emit deterministic contracts.
- Localo MCP authentication and schema discovery are proven, but no managed
  Body Move profile is available; no Localo metric is represented as zero.
- The scope planner is the executable owner of client/property/provider/metric
  readiness; see `src/scope-plan.ts` and `--scope-plan`.
- Fallow has not been run against the current revision; it is not an SEO provider.

## Safe next action after Phase A approval

Operator must supply a numeric GA4 Property ID and authorize the agency identity
for `analytics.readonly`. Then the implementation owner can add the property
and capability record, run metadata-only preflight, execute one bounded live
`runReport`, verify a non-zero sessions bundle and all manifest hashes, and only
then promote GA4 to `validated_real_domain`.
