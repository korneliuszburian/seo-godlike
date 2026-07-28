# Provider adapter contract

Labels: `wayfinder:grilling`
Status: closed
Map: `../map.md`

## Question

What smallest read-only provider adapter interface preserves scope, capability,
raw evidence, pagination, quotas, and normalized observations across GSC and
future GA4/Ahrefs/Localo adapters?

## Blocked by

[03-multi-property-execution.md](03-multi-property-execution.md)

## Resolution

ADR-0004 is the authoritative adapter decision. A provider adapter owns
transport, endpoint/API version, pagination, quota/retry classification, and
source-specific raw response shape. The policy gate owns tenant/capability
authorization; the evidence writer owns hashes, observations, claims, and
reports. The adapter returns no write authority and MCP remains a thin future
facade over the same seams.

The current GSC functions are the first concrete adapter implementation. A
shared abstraction will be introduced only when the second provider is
selected, so the interface is shaped by real variation rather than an
untyped universal payload.
