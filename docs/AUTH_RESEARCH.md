# Auth research and bounded decision

Data researchu: `2026-07-27`
Consumer: przyszły read-only discovery i raport dla wielu klientów.
Owner: operator repozytorium + implementacja `seo-godlike`.
Pytanie: jak uzyskać centralny, wieloklientowy dostęp do danych bez ponownego OAuth dla każdej strony, zachowując izolację klienta i możliwość audytu?

## Decyzja

**Adoptuj jako pierwszy wariant:** dedykowana agencyjna tożsamość Google + jeden web-server OAuth offline dla Google APIs + bezpieczny refresh-token store + rejestr klient/property.

**Defer:** service account jako drugi wariant automatyzacji. Nie używać pobranego JSON key jako jedynego mechanizmu produkcyjnego przed ustaleniem secret managera i sposobu rotacji.

**Adoptuj jako zasadę:** każdy provider ma osobne credential reference (`google`, `ahrefs`, `localo`), ale raport ma jeden `client_id` i jawne mapowanie property. Dostęp do jednego klienta nigdy nie oznacza dostępu do danych innego klienta.

## Co wynika ze źródeł

### Google OAuth

Google OAuth web-server flow obsługuje access token i refresh token. Przy `access_type=offline` aplikacja może odświeżać access token bez obecności użytkownika; refresh token musi być przechowywany w bezpiecznym, długoterminowym magazynie. Źródło: [Google OAuth web-server](https://developers.google.com/identity/protocols/oauth2/web-server), [Google OAuth overview](https://developers.google.com/identity/protocols/oauth2).

**Implikacja:** pierwsze logowanie może zasilić centralne połączenie Google. Dodanie nowej strony nie wymaga nowego OAuth, jeśli ta sama tożsamość ma już dostęp do nowej property. Osobne konto klienta nadal wymaga jednorazowego nadania dostępu tej samej tożsamości.

**Gotcha:** OAuth app w trybie `Testing` może dostać refresh token wygasający po 7 dniach; produkcyjne użycie sensitive/restricted scopes może wymagać weryfikacji Google. Źródło: [OAuth scopes](https://developers.google.com/identity/protocols/oauth2/scopes), [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies).

### Search Console

Search Console API pozwala listować dostępne verified sites i odpytuje Search Analytics przez `webmasters.readonly` lub szerszy scope. Property jest identyfikowana dokładnie jako URL-prefix albo `sc-domain:example.com`. Źródło: [Search Console API](https://developers.google.com/webmaster-tools), [Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [Search Console users](https://support.google.com/webmasters/answer/7687615).

**Implikacja:** po OAuth możemy wykonać read-only inventory property i dopiero po potwierdzeniu operatora zmapować `bodymove.pl`. GSC nie daje nam prawa do automatycznego dodawania się do cudzych property; właściciel musi nadać dostęp.

**Gotcha danych:** Search Analytics nie gwarantuje pełnego zbioru wierszy; zapytania są ograniczone, paginacja ma znaczenie, dane zwykle mają opóźnienie 2–3 dni, a daty API są w czasie Pacific. Jest limit 50k wierszy dziennie na search type, load quota oraz limity per site/user/project. Źródło: [Search Console performance data](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data), [Search Console limits](https://developers.google.com/webmaster-tools/limits).

### GA4

Google Analytics API wspiera zarówno user account, jak i service account. Quickstart oficjalnie pokazuje listowanie kont dostępnych dla uwierzytelnionej tożsamości, a service account musi dostać dostęp do konkretnej GA4 property. Źródło: [GA4 API quickstart](https://developers.google.com/analytics/devguides/config/admin/v1/quickstart), [GA4 access management](https://support.google.com/analytics/answer/9305587).

**Implikacja:** jeśli konto agencyjne ma dostęp na poziomie GA4 account, można wykrywać wiele property bez kolejnego consentu. Raport nadal musi wymagać konkretnego numerycznego `property_id`; nie wolno mieszać property tylko dlatego, że są widoczne w jednym koncie.

### Ahrefs

Ahrefs API v3 pracuje na danych workspace, wymaga kwalifikowanego płatnego planu, a klucze tworzą i zarządzają nimi workspace owners/admins. Wiele endpointów zużywa API units; minimum i koszt zależą od odpowiedzi/pól. Ahrefs zaleca test queries i limity kluczy. Źródło: [Ahrefs API introduction](https://docs.ahrefs.com/en/api/docs/introduction).

**Implikacja:** Ahrefs może mieć jedną credential reference agencyjną, ale projekty, scope i koszt muszą być jawne w registry. Nie zakładamy, że sam klucz zapewnia dostęp do każdego klienta ani że odczyt jest darmowy.

### Localo

Oficjalny materiał Localo opisuje MCP jako kontrolowane połączenie z autoryzowanym kontem i podaje URL MCP oraz OAuth client credentials. Nie dowodzi to jeszcze lokalnej reachability ani pełnego read-only schema. Źródło: [Localo MCP integration](https://docs.localo.com/en/articles/14687216-localo-api-mcp-integration).

**Implikacja:** Localo pozostaje osobnym capability do lokalnego discovery; nie włączamy go do pierwszego proof slice bez potwierdzenia operacji, scopes i klasyfikacji read/write.

## Reddit: użyteczne sygnały, nie dowód

- W aktualnym wątku `r/TechSEO` operatorzy opisują zarówno service account dodany do property, jak i OAuth 2.0; jeden komentarz zgłaszał wcześniejsze zakłócenia service-account flow. To jest sygnał ryzyka operacyjnego, nie potwierdzenie awarii Google. [wątek](https://www.reddit.com/r/TechSEO/comments/1uht580/anyone_worked_with_the_google_search_console_api/).
- W `r/GoogleAnalytics` praktycy potwierdzają, że standardowe GA4 nie daje natywnej agregacji wielu property; agregację robi się poza GA4 przez API/BigQuery/Looker. To wspiera naszą zasadę raportów per klient/property. [wątek](https://www.reddit.com/r/GoogleAnalytics/comments/1s0ddgi/does_ga4_free_support_aggregating_metrics_from/).

Reddit nie jest źródłem lokalnego dostępu, gwarancji SLA ani decyzji o credentialach.

## Jak wykonam to samodzielnie

Po Twoim jednorazowym udziale w punktach wymagających konta:

1. Przygotuję minimalny Google Cloud project i OAuth client z wyłącznie read-only scopes.
2. Uruchomię lokalny, audytowalny callback/CLI flow; Ty wybierzesz właściwe konto i zaakceptujesz consent w przeglądarce.
3. Nie zobaczę ani nie zapiszę surowego refresh tokena w rozmowie. Zapiszemy tylko secret reference w uzgodnionym magazynie.
4. Wykonam read-only listę dostępnych GSC sites i GA4 accounts/properties, z redakcją danych w logach.
5. Zbuduję mapowanie `client_id → domain → provider property IDs`; nowe strony będą przechodziły przez discovery + jawne potwierdzenie.
6. Dla `bodymove.pl` wykonam jeden known-answer read-only smoke test, zachowując raw response i hash.
7. Dopiero po przejściu bramek dodamy Ahrefs/Localo osobnymi adapterami.

Nie mogę samodzielnie wykonać kliknięcia consent, nadać dostępu w cudzym Search Console, odzyskać nieznanego secretu ani ominąć OAuth. Mogę przygotować komendy, callback, walidację, inventory i testy po tym, jak operator wykona te jawne czynności.

## Falsifier decyzji

Wariant centralnego user OAuth zostanie odrzucony lub rozszerzony o service account, jeśli pierwszy test na `bodymove.pl` pokaże którykolwiek z warunków: brak read-only dostępu do GSC/GA4, wymóg ponownego consentu mimo stabilnego refresh tokena, niemożliwa weryfikacja scopes, nieakceptowalne wymagania OAuth verification albo brak bezpiecznego magazynu tokenów.

## Update snapshot na 2026-07-27

### Google Search Console API

- Reference nadal udostępnia Search Analytics, Sites, Sitemaps i URL Inspection; `Sites.list` jest właściwym punktem startu do read-only inventory, a `SearchAnalytics.query` do pierwszej metryki.
- Dokumentacja zapowiada usunięcie obsługi FAQ rich results w Search Console API w sierpniu 2026. Nie projektujemy pierwszej metryki wokół tego search appearance. Źródło: [Search Console API](https://developers.google.com/webmaster-tools), [Search API reference](https://developers.google.com/webmaster-tools/v1/api_reference_index), [Google Search Central update](https://developers.google.com/search/blog/2025/11/update-on-our-efforts).
- Aktualne limity pozostają istotne: Search Analytics ma load quota oraz limity per-site/per-user/per-project; query może zwracać maksymalnie 25 000 wierszy na stronę i nie gwarantuje kompletności wszystkich wierszy. Źródło: [limits](https://developers.google.com/webmaster-tools/limits), [performance data](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data).

### GA4 Admin/Data API

- Changelog Admin API z 2026-06-18 dodał `UpdateReportingIdentitySettings` oraz `can_edit` w `PropertySummary`.
- Changelog Data API z 2026-04-23 dodał conversion reporting w v1alpha. Dla pierwszego raportu nie używamy alpha; wybieramy stabilny odczyt raportowy.
- W Admin API nadal istnieje wyraźny podział alpha/beta: alpha może zmieniać się kompatybilnościowo, beta ma być stabilniejsza. Do inventory używamy tylko metod read-only i oznaczamy wersję API w evidence.
- Oficjalny Google Analytics MCP jest read-only i nie może edytować konfiguracji ani ustawień Analytics. To może być narzędzie eksploracyjne, ale nie zastępuje deterministycznego adaptera API w produkcie. Źródło: [GA Admin changelog](https://developers.google.com/analytics/devguides/config/admin/v1/changelog), [GA Data changelog](https://developers.google.com/analytics/devguides/reporting/data/v1/changelog), [Google Analytics MCP](https://developers.google.com/analytics/devguides/MCP).

### Oficjalne Google MCP

- Google ogłosiło oficjalne wsparcie MCP dla usług Google w grudniu 2025, a 28 kwietnia 2026 podało dostępność ponad 50 Google-managed MCP servers w GA lub preview. Źródła: [Google Cloud announcement](https://cloud.google.com/blog/products/ai-machine-learning/announcing-official-mcp-support-for-google-services), [availability update](https://cloud.google.com/blog/products/ai-machine-learning/google-managed-mcp-servers-are-available-for-everyone).
- Google Account Linking dla MCP wymaga OAuth 2.1 authorization-code flow; implicit flow nie jest właściwą ścieżką dla agentic/MCP integrations. Źródło: [Google Account Linking](https://developers.google.com/identity/account-linking).
- W oficjalnej dokumentacji znaleziono Google Analytics MCP, ale nie potwierdzono oficjalnego Search Console MCP. Stan lokalny naszego środowiska nadal nie ma odkrytego Google Analytics/GSC MCP capability; dokumentacja publiczna nie jest dowodem lokalnej konfiguracji.

### Ahrefs API

- Aktualna dokumentacja API v3 obejmuje Site Explorer, Keywords Explorer, SERP Overview, Rank Tracker, Site Audit, Brand Radar i Social Media Management oraz management/subscription endpoints.
- API wymaga eligible paid plan; większość zapytań kosztuje API units, minimum kosztu wielu requestów to 50 units. Ahrefs zaleca bezpłatne test queries, limity kluczy i monitoring usage przed integracją.
- W pierwszym przebiegu Ahrefs pozostaje osobnym, późniejszym adapterem; nie wykonujemy requestów bez potwierdzenia planu i budżetu units. Źródło: [Ahrefs API introduction](https://docs.ahrefs.com/en/api/docs/introduction).

### Localo MCP

- Oficjalna strona Localo została zaktualizowana w czerwcu/lipcu 2026 i opisuje MCP/OAuth, URL `https://api.localo.com/api/mcp`, OAuth client ID/secret oraz ograniczenia MCP.
- To jest account-level connector surface, ale nie znaleziono publicznego kontraktu pełnego read/write schema dla naszego use case. Przed użyciem potrzebny jest lokalny discovery capability i klasyfikacja każdej operacji.
- Nie traktujemy Localo MCP jako źródła metryk dopóki nie przejdzie tego samego verifiera co API. Źródło: [Localo MCP Integration](https://docs.localo.com/en/articles/14687216-localo-api-mcp-integration).

### Codex / lokalny runtime

- Lokalny Codex CLI to `0.145.0`; upstream release page pokazuje serię 0.145.x z wydaniami z 14–15 lipca 2026. Lokalny `codex doctor` wykazał auth ChatGPT OK, ale niespójność npx/npm i brak uruchomionego app-servera.
- Codex SDK nadal nie jest lokalnie zainstalowany. Do produktu nie używamy Codexa jako źródła metryk; może później dostać zwalidowany evidence bundle.
- Źródło wersji: [OpenAI Codex releases](https://github.com/openai/codex/releases). Lokalny dowód pozostaje ważniejszy niż upstream changelog.

## Następna bramka przed kliknięciem OAuth

Nie wykonujemy jeszcze żadnego consentu. Najpierw operator potwierdza wybraną agencyjną tożsamość Google, a implementacja przygotowuje minimalny read-only client z wąskimi scopes. Po consent wykonujemy tylko `Sites.list`/GA4 inventory, bez write calls, bez Ads i bez automatycznego dodawania property.

## BDOS.ai jako materiał decyzyjny

Źródło: [bdos.ai](https://bdos.ai/) oraz publiczny opis firmy/produktu na [LinkedIn](https://www.linkedin.com/company/bdos-ai). Są to materiały własne dostawcy; deklaracje o liczbie linii, testów, klientów i oszczędnościach nie są lokalnym dowodem ani benchmarkiem.

### Mechanizmy, które można przenieść

- per-account/per-client folders i jawny kontekst klienta;
- read layer oddzielony od write layer;
- `dry_run → preview → confirm` przed każdą mutacją;
- safety limits blokujące duże zmiany i operacje destrukcyjne;
- mutation log z tym, co zmieniono, kiedy i dlaczego;
- walidacja requestu przed API, normalizacja jednostek/enums i cache ograniczający quota;
- idempotencja i weryfikacja stanu po mutacji.

**Disposition: adopt** jako wzorce mechaniczne dla późniejszego `Write Gateway`, bez kopiowania kodu, promptów, wiedzy ani materiałów BDOS. Consumer: przyszłe operacje write w `seo-godlike`. Falsifier: bounded write lab na disposable/test resource, w którym preview nie odpowiada efektowi API albo log nie pozwala odtworzyć decyzji.

### Czego nie adoptujemy teraz

- BDOS jest systemem Google Ads-first; jego `Google Ads API v24`, GAQL validators, kampanie/PMax/feeds i safety rules nie są dowodem, że GSC/GA4 mają analogiczne write operations.
- Nie kopiujemy i nie reverse-engineerujemy prywatnego endpointu, kodu ani knowledge base BDOS. Publiczny opis nie daje prawa do użycia ich implementacji.
- Nie budujemy jednego ogólnego MCP jako źródła prawdy. MCP będzie później cienką warstwą narzędziową nad capability registry i provider adapters.

**Disposition: reject** dla kopiowania implementacji; **defer** dla inspiracji write do czasu ukończenia read-only proof slice.

### Co faktycznie oznacza „GSC write”

Search Console API reference udostępnia operacje Sites add/delete/list/get oraz Sitemaps submit/delete/list/get, ale Search Analytics i URL Inspection pozostają odczytowe. „GSC write” nie oznacza więc edycji treści, SEO ustawień strony ani zmiany rankingu. Źródło: [Search Console API reference](https://developers.google.com/webmaster-tools/v1/api_reference_index).

### Szacunek prac — po uzyskaniu auth, bez ukrywania kosztu proof

| Slice | Realistyczny zakres |
|---|---:|
| jeden read-only MCP facade nad gotowym, stabilnym endpointem | 0.5–2 dni na proof; 3–7 dni z auth, schema, timeoutami, redakcją i testami |
| GSC inventory + Search Analytics jedna metryka | 2–4 dni |
| GA4 inventory + jeden report | 2–4 dni |
| Ahrefs jeden endpoint/report | 1–3 dni, zależnie od planu i API units |
| Localo MCP | 1–3 dni tylko po potwierdzeniu auth/schema; obecnie `unknown` |
| registry klientów/property, evidence/raw/hash, report compiler | 1–2 tygodnie po pierwszym proof slice |
| jeden bounded write adapter | 3–7 dni po read-only proof, zależnie od API i dry-run support |
| bezpieczny multi-provider write gateway | tygodnie, nie weekend; wymaga approval, audit, rollback/idempotencji i niezależnej weryfikacji |

To są estymaty inżynierskie, nie obietnica. Falsifier estymaty: pierwsza integracja GSC/GA4 po consent; jeśli auth, quota albo schema wymaga ręcznej pracy ponad założenia, aktualizujemy plan na podstawie pomiaru.

### Własne MCP-y: rekomendowany kształt

```text
provider API / official MCP
        ↓
provider adapter + capability verifier
        ↓
canonical observations + immutable raw evidence
        ↓
policy / tenant / budget gate
        ↓
thin MCP tools (read first, write later)
```

Nie „odtwarzamy serwerów” przez kopiowanie ich zachowania. Implementujemy własny, wersjonowany contract MCP, który wywołuje zatwierdzone adaptery i nigdy nie dostaje surowych sekretów, nieznanych URL-i ani write authority poza policy gate.
