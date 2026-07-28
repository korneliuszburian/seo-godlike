# Google GSC proof runbook

This runbook performs one read-only discovery and one bounded Search Analytics
query using the agency Google identity. It never requests a write scope and
never stores credentials in the repository.

## Operator prerequisites

1. Create or select the agency Google Cloud project.
2. Enable the Google Search Console API.
3. Create an OAuth client for a local application or a web client that accepts
   the loopback redirect used by the CLI.
4. Keep the downloaded OAuth client JSON outside this repository, with local
   file permissions restricted to the operator.
5. Confirm that the agency Google identity has at least read permission on the
   relevant Search Console property. The API cannot grant that permission.

## Discovery

Before any network access, run the local readiness gate. It checks only OAuth
client path metadata, the fixed OS-keyring reference, the read-only scope, and
the requested property identifier; it does not parse the client JSON, inspect
the token store, open a consent URL, or call Google:

```bash
npm run build
node dist/cli.js \
  --preflight \
  --oauth-client /absolute/path/outside/repository/oauth-client.json \
  --property-id sc-domain:bodymove.pl
```

The expected result is `READY_FOR_OPERATOR_CONSENT`. A missing path, unsafe
file mode, repository-local path, unsupported token-store reference, or
invalid property identifier returns `BLOCKED_AUTHORIZATION`.

Build the CLI, then run:

```bash
npm run build
node dist/cli.js \
  --discover \
  --oauth-client /absolute/path/outside/repository/oauth-client.json
```

The command prints only the returned property identifiers. On first use it
prints a Google authorization URL and starts a loopback callback. The operator
opens that URL, selects the agency account, reviews the requested
`webmasters.readonly` scope, and completes consent. The refresh token is stored
through the local OS keyring (`secret-tool`), never in stdout or a file in this
repository.

Record the exact returned `siteUrl` for `bodymove.pl`; do not substitute a
`sc-domain:` or URL-prefix value without discovery evidence.

## Bounded report

Create a request containing the discovered `property_id`, the intended
`client_id`, and a bounded date range at least two or three days behind the
current date because Search Console data is delayed. Use the client and
capability registry format in `fixtures/` as the local shape, replacing the
fixture property only after the operator confirms it.

Run:

```bash
node dist/cli.js \
  --request /absolute/path/request.json \
  --registry /absolute/path/client-registry.json \
  --capabilities /absolute/path/capability-registry.json \
  --oauth-client /absolute/path/outside/repository/oauth-client.json \
  --output /absolute/path/evidence/bodymove-run-001
```

The output directory must not already exist. The bundle contains the raw
response, hashes, source record, observation, claim, audit event, canonical
JSON report, deterministic Markdown, and manifest. No Ads or write endpoint is
called.

## Stop conditions

Stop without writing a report when the OAuth state is invalid, consent is
denied, the refresh token is unavailable, the property is not returned by
discovery, the property is not mapped to the requested client, or the provider
returns an authorization/scope/schema error.
