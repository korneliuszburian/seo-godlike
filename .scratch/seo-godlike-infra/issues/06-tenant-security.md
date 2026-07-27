# Tenant and property isolation

Labels: `wayfinder:grilling`, `HITL`
Status: closed
Claimed by: Codex
Map: `seo-godlike-infra`
Blocked by: `03-google-auth-and-secrets`

## Question

What invariant and registry model guarantees `client_id → property → provider`
isolation when one client has many sites, including explicit authorization,
selection, audit identity, and refusal of cross-client data?

## Resolution

Require every request to name `client_id`, `property_id`, and provider. Deny
missing, unmapped, cross-client, or unverified scopes. Reports and every
evidence artifact retain the same client/property identity. A visible property
in the agency account is not itself permission to use it.

This decision is recorded in [ADR-0003](../../../docs/adr/0003-tenant-property-isolation.md).
