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

Nie zapisujemy klucza API w repozytorium i nie zgadujemy endpointu aplikacyjnego,
jeżeli dostawca nie przekazał jego stabilnego schematu. Do czasu potwierdzenia
takiego schematu używamy manifest-bound snapshotu wejściowego.

## Wejście do pipeline’u

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
