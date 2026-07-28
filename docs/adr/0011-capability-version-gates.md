# ADR-0011: Capability version gates

- Status: accepted
- Date: 2026-07-28

## Decision

Provider capabilities may declare an API version. The GSC read-only analytics
path uses API `v3`; an explicit incompatible capability version fails closed.
Legacy capability fixtures with no version remain compatible and resolve to the
current supported version until migrated.

## Rationale

An operation name alone does not prove endpoint compatibility. Versioning the
capability registry makes provider upgrades visible and prevents a stale
capability declaration from silently calling a changed endpoint.

## Consequences

The capability registry remains the policy allowlist for read/write state and
now also documents provider API version. Future adapters own their supported
version constant and compatibility check. Deprecation and migration workflow
remain future reliability work.

## Falsifier

Revisit if the provider guarantees a versionless stable endpoint, or if an API
version cannot be represented without splitting one capability into separate
operation identities.
