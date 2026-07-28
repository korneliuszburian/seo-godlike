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

On Linux and macOS, use a local filesystem with effective `600` permissions
for the client file. Some SMB/CIFS mounts report permissive modes regardless
of the requested setting; copy the file to a local, operator-only directory
instead of weakening this gate.

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

## Agency analytics pipeline

For the production-shaped read-only analytics run, the CLI calculates a
current inclusive 28-day window ending three UTC days before the system date,
plus the immediately preceding inclusive 28-day window. It sends both
requests with dimensions `query`, `page`, `country`, and `device`, and
`rowLimit=25000`:

```bash
mkdir -p artifacts/analysis
node dist/cli.js \
  --analytics \
  --client-id bodymove \
  --property-id sc-domain:bodymove.pl \
  --registry fixtures/client-registry.json \
  --capabilities fixtures/capability-registry.json \
  --oauth-client /absolute/path/outside/repository/oauth-client.json \
  --output artifacts/analysis/bodymove-analytics-pipeline-YYYYMMDD
```

The output contains current and previous raw responses, exact-deduplicated
top-query/page aggregates, device/country CTR breakdowns, period-over-period
totals, and the same exclusive-write manifest contract. The output directory
must not already exist.

For multiple properties of one registered client, use the bounded sequential
batch path. Repeat `--property-id`; it writes one bundle per canonical property,
continues after an individual failure, prints completed/failed IDs, and exits
non-zero if any property failed:

```bash
node dist/cli.js \
  --analytics-batch \
  --client-id bodymove \
  --property-id sc-domain:bodymove.pl \
  --property-id sc-domain:another-authorized-property.pl \
  --registry fixtures/client-registry.json \
  --capabilities fixtures/capability-registry.json \
  --oauth-client /absolute/path/outside/repository/oauth-client.json \
  --output artifacts/analysis/bodymove-batch-YYYYMMDD
```

## Add a property for an existing client

Onboarding is an explicit registry mutation. It never grants Google access;
the agency identity must already be authorized for the canonical property.
Aliases are input normalization only and are resolved to the canonical ID
before a provider request:

```bash
node dist/cli.js \
  --add-property \
  --registry fixtures/client-registry.json \
  --client-id bodymove \
  --property-id sc-domain:newbodymove.pl \
  --canonical-property true \
  --alias https://newbodymove.pl/
```

The command fails closed for unknown clients, invalid property identifiers,
duplicate canonical IDs, duplicate aliases, or aliases attached to a
non-canonical property. It writes the registry through an exclusive temporary
file and replacement, and never touches OAuth credentials.

## History dashboard and schedule output

Verify and aggregate all nested analytics bundles without modifying them:

```bash
node dist/cli.js \
  --report-history artifacts/analysis \
  --output artifacts/analysis/executive-summary-20260728
```

The command verifies every manifest-listed file before parsing any report,
skips verified non-analytics proof bundles, and writes exclusive
`executive-summary.json`, `executive-summary.md`, and escaped local
`executive-summary.html`. An empty artifacts directory produces a valid
zero-bundle summary. The HTML file is a local export only; it is not hosted or
published by the CLI.

To print (only) a daily cron-compatible command for the existing analytics
run, use:

```bash
node dist/cli.js --schedule \
  --oauth-client /absolute/path/outside/repository/oauth-client.json
```

The generated Linux cron line wraps the analytics command with non-blocking
`flock` using a per-client lock file, so overlapping runs exit without
corrupting an evidence directory. Google transport already applies three
bounded retries for transient 5xx/429 responses. No system crontab is modified
by `--schedule`.

This prints a `17 3 * * *` entry and never installs or edits crontab. When
`--artifacts-dir` is supplied to `--analytics`, the generated Markdown also
contains relative links to verified previous analytics bundle reports.

## GA4 adapter readiness

The repository includes a fixture-testable, read-only GA4 `sessions` adapter.
It uses canonical numeric GA4 resources such as `properties/123456789`, the
`analytics.readonly` scope, capability `google-analytics/properties.runReport`,
and the same exclusive manifest bundle contract. The repository does not mark
GA4 as live until the operator grants the agency identity access to a real GA4
property and completes the new scope consent.

Preflight is metadata-only and does not start consent:

```bash
node dist/cli.js \
  --preflight \
  --provider google-analytics \
  --oauth-client /absolute/path/outside/repository/oauth-client.json \
  --property-id properties/123456789
```

For local parser/evidence proof without network or consent, use a redacted
fixture response and a temporary registry/capability file containing the GA4
property and `v1beta` read capability:

```bash
node dist/cli.js \
  --ga4-analytics \
  --raw /absolute/path/ga4-response.json \
  --client-id bodymove \
  --property-id properties/123456789 \
  --registry /absolute/path/client-registry.json \
  --capabilities /absolute/path/capability-registry.json \
  --output /absolute/path/evidence/ga4-run-001
```

Do not add a real property to the permanent fixture or run the OAuth path until
the operator confirms the client/property ownership and authorizes the scope.

### Current fixed point

The GA4 quality cleanup is recorded at commit `73418e5`. The adapter now fails
closed when the capability omits `api_version`, escapes report-derived values
in Markdown, and requires `provider` plus `operation` in every persisted
`Report`. Local proof is green (`npm test`: 44 TypeScript tests plus 3 context
tests), but this does not prove a live GA4 property.

The remaining operator handoff is:

1. provide the real numeric GA4 Property ID;
2. add it for the intended client with `--add-property --provider
   google-analytics`;
3. add the matching read-only `v1beta` capability record;
4. run GA4 preflight and complete the displayed `analytics.readonly` consent;
5. run `--ga4-analytics` and verify non-zero sessions plus every manifest hash.

Until those steps pass, keep GA4 at `schema_verified` and do not claim
`validated_real_domain`.
