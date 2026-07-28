# Client-facing report boundary

Labels: `wayfinder:grilling`
Status: closed
Map: `../map.md`

## Question

Which report formats are operator-only versus client-facing, and what escaping,
link, tenant-redaction, and export rules are required before HTML or sharing?

## Blocked by

[06-provider-adapter-contract.md](06-provider-adapter-contract.md)

## Resolution

History now emits a local escaped HTML summary in addition to authoritative JSON
and operator Markdown. Report-derived strings are text-escaped and bundle paths
are not linkified. Hosting, sharing, authentication, and client-specific
redaction remain out of scope. ADR-0013 records the boundary.

Proof:

- HTML file boundary test confirms `<unsafe>` becomes escaped text;
- empty and normal dashboard tests pass;
- full build, test, and diff gates pass: 33 TypeScript tests and 3
  context-packet tests.
