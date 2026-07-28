# Agency delivery slice acceptance

Labels: `wayfinder:grilling`
Status: closed
Map: `../map.md`
Blocked by: `09-quality-evidence-frontier.md`

## Question

What is the one large bounded implementation slice after the three frontier
decisions: its caller-to-output seam, owned paths, acceptance proof, and exact
non-goals?

The slice must consume existing verified bundles and preserve read-only,
multi-tenant, evidence-first boundaries. It must not silently include hosted
credentials, Ads, provider writes, automatic consent, or a universal MCP layer.

## Resolution

Implement one local operator-only report-package path over existing bundles:

- caller: CLI command with an artifacts directory and exclusive output path;
- gate: verify every manifest before reading report data, apply the existing
  hard reportability checks, and preserve per-bundle failures instead of
  turning them into zero metrics;
- output: deterministic JSON authority plus Markdown and escaped local HTML;
- advisory: expose Fallow as a separate quality signal only when an operator
  supplies an already-produced result; it never rejects evidence by itself;
- proof: tampered manifest, invalid reportability metadata, partial bundle set,
  empty input, deterministic output, and all manifest hashes;
- non-goals: retention/deletion, legal hold, client sharing, hosting, consent,
  Ads, writes, and new provider adapters.

## Proof

- implementation: `src/report-package.ts` plus `--report-package` in `src/cli.ts`;
- accepted providers: existing GSC and GA4 report shapes, after manifest and
  canonical report-hash verification;
- rejected input remains explicit in `rejected_bundles` and sets `partial`,
  never zero-fills metrics;
- outputs: deterministic `report-package.json`, Markdown, escaped local HTML,
  and an exclusive-write manifest for all three output files;
- local evidence: `npm run build`, `npm test` (46 TypeScript tests + 3
  context tests), focused package tests, `git diff --check`, and CLI empty-input
  boundary proof all passed;
- fixed point: pending commit after the operator’s mixed worktree is preserved;
- Fallow was not invoked and remains advisory only (`not_supplied`).
