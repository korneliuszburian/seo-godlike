# History dashboard and local schedule output

Labels: `implementation`, `HITL`
Status: closed
Claimed by: Codex
Map: `seo-godlike-infra`
Blocked by: `08-gsc-analytics-pipeline`, `09-multi-tenant-property-registry`

## Outcome

Add a local, read-only history reader that verifies immutable bundle manifests
before consuming reports, renders deterministic JSON/Markdown executive
summaries, and prints (but never installs) a daily cron entry for the existing
read-only analytics CLI.

## Acceptance

- [x] Scan nested bundle directories and verify every manifest-listed file
  before parsing any report data.
- [x] Aggregate chronological clicks, impressions, CTR, and position from
  analytics bundles; skip valid non-analytics proof bundles.
- [x] Generate exclusive-write `executive-summary.json` and `.md`; empty input
  is a valid zero-bundle summary.
- [x] Print a cron-compatible daily `--analytics` command without modifying the
  system crontab.
- [x] Add relative links to prior bundle reports in analytics Markdown when an
  artifacts directory is supplied.
- [x] Add tampered-manifest, two-bundle chronology, and empty-directory tests.

## Non-goals

- Installing cron, hosting, external writes, GitHub issue creation, or secrets.

## Proof

- `npm run build` — passed.
- `npm test` — 22 TypeScript tests and 3 context-packet tests passed.
- `git diff --check` — passed.
- `node dist/cli.js --report-history artifacts/analysis --output <fresh>` —
  verified existing nested bundles and wrote deterministic JSON/Markdown.
- `node dist/cli.js --schedule ...` — printed a daily cron entry only; no
  system crontab was changed.

The history dashboard found two analytics bundles and skipped the non-analytics
proof bundles after verifying their manifests. Empty-directory and tampered
manifest behavior are covered by focused tests.

## Review follow-up — Slice 4 fixes

- The schedule output prefix now uses the shell-safe `client_id` instead of a
  hardcoded `bodymove` value.
- `--schedule` warns on stderr when any production identity/configuration flag
  is omitted and defaults are used.
- History deduplicates identical `run_id` values with a deterministic
  last-generated-at-wins policy and warns with the skipped `bundle_path`.
- Focused tests cover a non-bodymove client and duplicate runs with different
  `generated_at` values.
