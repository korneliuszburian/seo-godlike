# ADR-0003: Tenant and property isolation

- Status: accepted
- Date: 2026-07-27

## Decision

Every analysis request must carry an explicit `client_id`, `property_id`, and
provider identity. The registry maps `client_id → property_id → provider`
without implicit discovery-to-execution promotion. A request is denied when
the property is absent, belongs to another client, has no approved provider
mapping, or lacks a verified authorization grant.

Reports are generated per client and may contain multiple explicitly mapped
properties. Raw evidence, observations, claims, and audit events retain the
same client and property scope.

## Rationale

The agency model has many clients and a client may have many sites. Visibility
through one Google identity is not a sufficient authorization or tenancy
boundary.

## Consequences

Property inventory and report generation are separate operations. Cross-client
joins are impossible by default and must be an explicit future decision.

## Falsifier

Revisit if a provider cannot expose a stable property identifier or if a
known-answer test demonstrates that the registry cannot prevent a mismatched
client/property request.
