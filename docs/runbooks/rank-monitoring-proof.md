# Rank monitoring proof — SERPROBOT

Ten runbook opisuje bezpieczne podłączenie istniejącego monitoringu SERPROBOT
do lokalnego pipeline’u. Raportowanie nie korzysta z PDF-a Looker Studio jako
źródła danych. Looker/Data Studio jest warstwą prezentacji, a SERPROBOT jest
źródłem rankingu.

## Potwierdzony kontrakt operatora

Oficjalny konektor SERPROBOT do Data Studio wymaga autoryzacji konektora,
klucza API z zakładki API, numerycznego ID projektu oraz zakresu `start`/`end`.
Projekt ID jest liczbą widoczną w adresie URL projektu. Konektor pozwala wybrać
wyszukiwarkę, lokalizację i urządzenie.

Źródło: [SERPROBOT Google Data Studio Connector](https://www.serprobot.com/data-studio-connector).

Nie zapisujemy klucza API w repozytorium. Oficjalna dokumentacja potwierdza
klucz, projekt i zakres dat dla konektora, ale nie publikuje lokalnego,
maszynowego kontraktu odpowiedzi API. Dlatego endpoint i odpowiedź adaptera
pozostają konfigurowalne oraz fail-closed: przed pierwszym użyciem operator musi
potwierdzić endpoint i wykonać jeden kontrolowany smoke test. Nieznany kształt
odpowiedzi kończy się błędem, a nie częściowym raportem. Do tego czasu używamy
manifest-bound snapshotu wejściowego.

Ścieżka API pozostaje eksperymentalna do czasu potwierdzenia kontraktu przez
operatora; scheduler wymaga jawnego endpointu HTTPS i odrzuca konfigurację bez
niego.

## Bezpośredni odczyt API

Jeżeli klucz SERPROBOT jest zapisany lokalnie jako
`keyring:seo-godlike/serprobot-api-key`, można wykonać jeden kontrolowany odczyt
projektu bez używania Looker Studio:

```bash
node dist/cli.js --pull-serprobot \
  --client-id bodymove \
  --project-id 123456 \
  --captured-at 2026-08-04T08:00:00.000Z \
  --date-start 2026-07-01 --date-end 2026-07-31 \
  --search-engine google.pl --location Warszawa --device desktop \
  --serprobot-api-endpoint https://OPERATOR-CONFIRMED-ENDPOINT \
  --output /absolute/path/artifacts/analysis/serprobot/bodymove-2026-07
```

Klucz jest pobierany wyłącznie z keyringa. Bundle zapisuje surową odpowiedź,
jej hash i znormalizowane wiersze; nie zapisuje klucza. Pole
`previous_position` pozostaje puste, gdyż porównanie okresów jest liczone z
osobnych, manifest-bound snapshotów, a nie z niejawnego indeksu dziennej
historii dostawcy.

Looker Studio pozostaje opcjonalnym podglądem oraz fallbackiem CSV. Nie
pobieramy PDF-a i nie scrapujemy dashboardu.

## Wejście do pipeline’u

### Jednorazowe onboardowanie źródła

Źródło można dopisać atomowo do istniejącego rejestru bez ręcznej edycji JSON:

```bash
node dist/cli.js --add-source /absolute/path/source-registry.json \
  --registry /absolute/path/client-registry.json \
  --source-id serprobot.bodymove \
  --client-id bodymove \
  --provider serprobot \
  --target 123456 \
  --status ready \
  --search-engine google.pl \
  --location Warszawa \
  --device desktop
```

Operacja odrzuca nieznanego klienta, niepoprawny target, duplikat `source_id`
oraz nieznany status przed zapisem. Zapis jest atomowy; przy błędzie istniejący
rejestr pozostaje bez zmian. Dla źródła jeszcze niepotwierdzonego użyj
`--status unavailable --reason "awaiting operator proof"` i nie podawaj targetu.

Operator przygotowuje lokalny, jednorazowy JSON zgodny z tym kształtem:

```json
{
  "schema_version": "1",
  "provider": "serprobot",
  "client_id": "bodymove",
  "captured_at": "2026-08-03T08:00:00.000Z",
  "date_range": { "start": "2026-07-01", "end": "2026-07-31" },
  "source_config": {
    "project_id": "123456",
    "search_engine": "google.pl",
    "location": "Warszawa",
    "device": "desktop"
  },
  "rows": [
    {
      "keyword": "rehabilitacja",
      "position": 7,
      "previous_position": 9,
      "search_engine": "google.pl",
      "location": "Warszawa",
      "url": "https://bodymove.pl/"
    }
  ]
}
```

`position: null` oznacza brak pozycji w snapshotcie. Nie oznacza to zera.
`previous_position` pochodzi z danych źródłowych; nie jest wyliczane przez
raport. Każdy snapshot musi mieć właściwy `client_id`, a `project_id` musi być
numeryczny.

Spakowanie wejścia jest lokalne i nie wykonuje żadnego requestu:

```bash
npm run build
node dist/cli.js \
  --pack-rank-monitoring \
  --input /absolute/path/serprobot-snapshot.json \
  --output /absolute/path/artifacts/serprobot/bodymove-2026-07
```

Następnie miesięczny pipeline dostaje katalog bundle przez
`--rank-monitoring`. Delivery zweryfikuje hash, byte count, klienta i
konfigurację projektu przed wyrenderowaniem HTML/PDF/email. Powtórne użycie
tego samego outputu jest odrzucane przez kontrakt exclusive-write.

Jeżeli operator eksportuje ranking jako CSV z SERPROBOT/Looker Studio, można
spakować go bez ponownego odpytywania dostawcy. CSV musi być znormalizowany i
zawierać kolumny `keyword,position`; opcjonalne kolumny to
`previous_position,search_engine,location,device,url`. Metadane projektu są
podawane jawnie, więc sam eksport nie przypisuje projektu do klienta:

```bash
node dist/cli.js --pack-rank-monitoring-csv \
  --input /absolute/path/serprobot-export.csv \
  --output /absolute/path/artifacts/analysis/serprobot/bodymove-2026-07 \
  --client-id bodymove --project-id 123456 \
  --captured-at 2026-08-04T08:00:00.000Z \
  --date-start 2026-07-01 --date-end 2026-07-31 \
  --search-engine google.pl --location Warszawa --device desktop
```

Eksport PDF nie jest wejściem do tego polecenia: nie zawiera wystarczająco
pewnej, maszynowej semantyki wierszy. Katalog `--output` musi znajdować się
wewnątrz `--rank-monitoring-root` używanego przez cron (a ten root musi być
wewnątrz `--artifacts-dir`); po spakowaniu można go wskazać jako aktualny
bundle albo pozostawić resolverowi najnowszego kompletnego exportu. Manifest
zachowuje SHA-256 wejściowego CSV oraz tryb `normalized_csv`.

Jeżeli ten sam eksport Looker/SERPROBOT zawiera tabelę „Działania dla strony”,
można ją zachować osobno jako rejestr działań operatora. Znormalizowany CSV
musi zawierać `period_start,period_end,type,status,title`; opcjonalne są
`action_id,target_url,published_at,notes`. Spakowanie wykonuje się lokalnie:

```bash
node dist/cli.js --pack-client-content-csv \
  --input /absolute/path/actions.csv \
  --output /absolute/path/artifacts/analysis/client-content/bodymove-2026-07 \
  --client-id bodymove
```

W raporcie miesięcznym nie wskazuj pojedynczego katalogu, tylko root bundle’ów
działań, np. `--client-content-root /absolute/path/artifacts/analysis/client-content`.
Resolver wybiera najnowszy zweryfikowany bundle po końcu okresu działania;
obce manifesty w tym katalogu są pomijane. Root powinien zawierać bundle’y dla
wszystkich klientów objętych danym raportem — częściowe pokrycie jest odrzucane
przy odczycie, zamiast cicho wygenerować niepełny raport.

Importer waliduje zakres dat oraz słownik typów i statusów, a manifest wiąże
bundle z SHA-256 pliku CSV i trybem `normalized_csv`. Brak wierszy oznacza
niepoprawny lub niedostarczony rejestr — importer odrzuca pusty CSV. Brak
zaakceptowanego bundle nie oznacza braku wykonanych działań. Rejestr nie jest
automatyczną rekomendacją i nie wykonuje żadnych zmian u dostawcy.

Przed uruchomieniem raportu klienta operator musi również jawnie oznaczyć
źródło SERPROBOT jako gotowe w `source-registry.json`, z tym samym numerem
projektu co w eksporcie, np. `serprobot.bodymove` z `status: "ready"` i
`target: "123456"`. Samo spakowanie CSV nie zmienia rejestru. Jeżeli źródło
pozostaje `unavailable`, ranking może być zachowany jako evidence, ale status
klienta nadal pokaże, że źródło nie zostało zatwierdzone — system nie podnosi
statusu automatycznie na podstawie samego pliku.

## Prerequisites for scheduled PDF delivery

The monthly cron invokes `dist/cli.js`, so a fresh checkout must build the
project before the first scheduled run:

```bash
npm run build
```

PDF delivery additionally requires `/usr/bin/systemd-run`, `/usr/bin/bwrap`,
`/usr/bin/chromium` and `/usr/bin/qpdf`. The cron process must run inside an
active user systemd session with `XDG_RUNTIME_DIR` set; otherwise delivery
fails closed with an explicit renderer-preflight error. A missing binary is
also reported before any PDF output is written.

## Granice

- Nie pobieramy danych z PDF-a raportu Looker Studio.
- Nie wykonujemy provider writes ani nie dodajemy/usuwamy fraz.
- Nie przypisujemy projektu do klienta na podstawie domeny lub nazwy.
- Nie uruchamiamy rank checku tylko po to, aby wygenerować raport.
- Jeżeli operator dostarczy eksport CSV albo bezpośredni API response, jego
  schemat musi zostać najpierw potwierdzony i dopiero potem może powstać
  osobny adapter; obecny normalized snapshot pozostaje źródłem przejściowym.
