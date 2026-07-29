# First agency report: GSC, Ahrefs, Localo

Labels: `delivery:deadline`, `provider-boundary`
Status: in_progress
Map: `../map.md`

## Outcome

Produce the first operator-only report for `bodymove.pl` using the existing
GSC evidence plus read-only Ahrefs metrics and a verified Localo MCP snapshot.
The report must distinguish live evidence, unavailable capability, and
operator-provided data; no source may be represented as successful when its
auth or schema is unknown.

## Acceptance

- GSC uses the existing agency keyring and canonical property
  `sc-domain:bodymove.pl`.
- Ahrefs uses API v3 `site-explorer/metrics`, a keyring-only API key reference,
  explicit target scope, and an immutable evidence bundle.
- Localo is accepted only after MCP discovery proves an actual read operation
  and its returned snapshot is bound to a request, source, observation, claim,
  and manifest; no invented Localo schema is allowed.
- One local report package contains source status, metrics, hashes, and
  explicit rejection/blocker information.
- No consent, writes, publication, client sharing, or secrets in the repo.

## Current evidence and blockers

- GSC: `validated_real_domain` for the existing bodymove property.
- Ahrefs: adapter is locally implemented and fixture-tested; live API key,
  plan eligibility, target scope, and request proof remain unknown.
- Localo: official MCP endpoint is documented, but this runtime has no Localo
  connector/tool and no verified operation schema; live auth/discovery is
  operator-gated.

## Local proof

- fixed point: `85f6cbc`;
- Ahrefs adapter: three focused falsifiers, read-only bundle hash proof, and
  report-package integration pass;
- repository suite: `npm test` passes (52 TypeScript tests + 3 context tests);
- live Ahrefs and Localo evidence is not claimed until operator auth and scope
  are present.
- Localo discovery seam: `--localo-discover` performs only MCP `initialize`
  and `tools/list`, redacts auth, and fails closed when
  `keyring:seo-godlike/localo-mcp-token` is absent; fixed point `65e117e`.

## Operator handoff

1. Create an Ahrefs API key in the agency workspace and store it in the local
   secret manager under service `seo-godlike`, account `ahrefs-api-key`.
2. In Localo Pro Tools → Settings → MCP, create a read-only-capable token and
   record the MCP URL and organization/client identifier in the local secret
   manager; do not paste either secret into chat or commit them.
3. Confirm the exact Ahrefs target and the Localo profile/location representing
   `bodymove.pl`.
