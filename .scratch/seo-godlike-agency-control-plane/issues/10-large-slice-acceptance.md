# Agency delivery slice acceptance

Labels: `wayfinder:grilling`
Status: open
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
