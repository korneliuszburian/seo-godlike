# Onboarding discovery

Status: `DISCOVERY`
Data obserwacji: `2026-07-27`
Zakres: wyłącznie Faza A z `ONBOARDING_PROMPT.md`; bez implementacji produktu i bez zewnętrznych zapisów.

## Repozytorium i instrukcje

- Katalog roboczy: `/home/krn/coding/krn/active/seo-godlike`.
- Odczytano `AGENTS.md`, `.codex/AGENTS.md` i `ONBOARDING_PROMPT.md`.
- Odczytano lokalne workflow w `docs/agents/`; nie są one dowodem istnienia capability SEO.
- `git -C . rev-parse --show-toplevel` oraz próby dla katalogów nadrzędnych kończą się `not a git repository`. Typ repozytorium: nieustalony; brak `.git`.
- Przed tym artefaktem obecne były tylko pliki instrukcji, profil capability i lokalny workflow. Nie ma README, manifestu, lockfile ani skryptów projektu.

## Runtime i package manager

| Element | Stan | Dowód |
|---|---|---|
| Node.js | zainstalowany, `v26.2.0` | `command -v node; node --version` |
| npm | zainstalowany, `12.0.1` | `command -v npm; npm --version` |
| pnpm | zainstalowany, `11.3.0` | `command -v pnpm; pnpm --version` |
| Python | zainstalowany, `3.14.6` | `command -v python; python --version` |
| uv | zainstalowany, `0.11.29` | `command -v uv; uv --version` |
| runtime projektu | `unknown` | brak manifestu i lockfile w tym katalogu |
| package manager projektu | `unknown` | brak manifestu i lockfile w tym katalogu |

Nie instalowano zależności.

## Codex CLI, SDK, app-server i auth

- Codex CLI: zainstalowany, `codex-cli 0.145.0`; binarny entrypoint: `/home/krn/.local/bin/codex`.
- `codex login status`: `Logged in using ChatGPT`.
- `codex doctor --json`: auth `ok`; tryb `chatgpt`; przechowywany API key: `false`; przechowywane ChatGPT tokens: `true`. Nie odczytywano zawartości pliku auth.
- `OPENAI_API_KEY` nie został użyty ani utworzony. Nie wypisywano sekretów.
- Oficjalne SDK: `@openai/codex-sdk` nie znaleziono w lokalnych `node_modules` ani globalnych pakietach npm. Pythonowy `openai-codex` nie jest dostępny przez lokalny import.
- App-server: CLI udostępnia komendę `codex app-server`; `codex doctor --json` raportuje `background server is not running`. Nie uruchamiano demona.
- Bezpieczny status sandbox/approval z `codex doctor --json`: konfiguracja jest czytelna, approval policy `OnRequest`, sandbox filesystem/network `restricted`.
- `codex doctor --json` ma status ogólny `fail` z powodu niespójności instalacji: bieżący runtime pochodzi z npx, a npm global wskazuje inną instalację. To blocker reprodukowalności środowiska CLI, ale nie unieważnia zaobserwowanego statusu auth.

## Lokalna konfiguracja MCP/capability

Źródło: `codex mcp list` i redacted `codex doctor --json`; endpointy/zmienne sekretne nie są zapisywane.

| Capability ID | Transport / endpoint | Stan lokalny | Auth | Operacje SEO |
|---|---|---|---|---|
| `figma` | streamable HTTP, publiczny endpoint Figma | enabled | OAuth | `unknown`; nie jest providerem SEO |
| `openaiDeveloperDocs` | streamable HTTP, publiczny endpoint OpenAI Developers | enabled | Unsupported | dokumentacja, nie dane SEO |
| `krn_decision_packet` | stdio przez `pnpm` w `/home/krn/coding/krn/active/mise-en-palace` | enabled | Unsupported | `unknown`; nie jest potwierdzonym providerem SEO |
| `agent_browser` | stdio, lokalny executable | disabled | Unsupported | `unknown`; brak prawa do użycia |
| `context7` | stdio przez `npx` | disabled | Unsupported | `unknown`; brak prawa do użycia |
| `github` | stdio, lokalny executable | disabled | Unsupported | `unknown`; brak prawa do użycia |

Dla żadnej capability nie wykonano w tej fazie calla, smoke testu, schema fingerprintu ani testu domeny. Sam wpis konfiguracyjny nie dowodzi reachability, auth, schema verification ani `validated_real_domain`.

## Blockery i nierozstrzygnięte pytania

1. `BLOCKED_MISSING_CAPABILITY`: nie odkryto lokalnie providerowego API/MCP SEO z potwierdzoną operacją read-only, metryką i schematem.
2. `BLOCKED_AUTHORIZATION`: nie podano autoryzowanej domeny/property ani secret reference dla providera SEO.
3. `BLOCKED_SDK_RUNTIME`: brak lokalnego `@openai/codex-sdk`/`openai-codex`; preferowanym bezpiecznym fallbackiem pozostaje lokalny Codex app-server, lecz nie jest uruchomiony. Nie wolno przełączać się samodzielnie na API-key runtime.
4. `ENVIRONMENT_INCONSISTENCY`: `codex doctor` wykrywa rozjazd instalacji npx i npm global.
5. Nie ustalono jeszcze: tenant scope, domeny, property identifier, metric pack, okna analizy, timezone, retencji, budżetów ani secret manager reference.

## Ustalenia operatora po discovery

Poniższe informacje pochodzą z rozmowy z operatorem i wymagają późniejszej weryfikacji technicznej; nie są dowodem lokalnego dostępu:

- Docelowy model: jedno wspólne konto agencyjne/menedżerskie z wieloma klientami i wieloma stronami/property.
- Osobne konta klienckie są wyjątkiem, a nie domyślnym modelem.
- Konto agencyjne ma prawdopodobnie dostęp do `bodymove.pl` w usługach Google, ale zakres nie został jeszcze zweryfikowany.
- Ahrefs, Localo i pozostałe narzędzia mają być używane z jednego wspólnego konta agencyjnego; lokalna reachability i schema nadal są niepotwierdzone.
- `bodymove.pl` został wskazany jako pierwsza domena pilotażowa.
- Pierwszy przebieg ma być read-only i raportowy; na obecnym etapie nie planuje się zmian w Google Ads.
- Intencją biznesową jest późniejsze wykorzystanie narzędzia do dalszych działań, po zbudowaniu bezpiecznej warstwy raportowania i kontroli scope’u.
- Typ konta agencyjnego Google: `unknown` — operator potrzebuje instrukcji, jak to sprawdzić.
- Zakres uprawnień administratora/właściciela do OAuth i property: `unknown`.
- Minimalny onboardingowy zestaw identyfikatorów property: `unknown`.
- Izolacja danych: wymagana zawsze per klient; klient może posiadać wiele stron/property.
- Secret manager: nie istnieje; wybór i bezpieczny setup pozostają do zaplanowania.
- Próba wejścia na `admin.google.com` zakończyła się komunikatem wymagającym konta administratora. Wniosek: dla aktualnie wybranego konta nie potwierdzono uprawnień Google Workspace/Cloud Identity admin; nie oznacza to braku dostępu do konkretnych property.

## Zakres wykonanych zmian

W tej fazie utworzono wyłącznie ten dokument oraz inventory capability. Nie zmieniano konfiguracji Codex, capability, auth, domeny ani systemów zewnętrznych.

## Evidence hashes

Hash wejściowych artefaktów do powtórzenia discovery:

- `ONBOARDING_PROMPT.md`: `29df776cb2a0880f14fabecccb2d39853300e4829a44228791e13b3b0593083f`.
- `.codex/capability-profiles.json`: `4e5c0b83b8d46ee8d7f6f0468e55789992f8bfdf453ada1a5d2e19e7bb536695`.
