# ADR-0004: Provider adapter and MCP boundary

- Status: accepted
- Date: 2026-07-27

## Decision

Official provider API/client calls are authoritative for the first proof. A
provider adapter owns transport, API version, pagination, source errors, and
read-only operation metadata. It emits immutable raw evidence and canonical
observations through a policy gate.

An MCP facade is deferred. When introduced, it is a thin tool surface over the
same adapter and policy seams; it cannot invoke arbitrary URLs, receive raw
secrets, bypass tenant scope, or create write authority.

## Rationale

The first proof needs deterministic schemas and evidence, while MCP is a tool
transport concern. Separating them prevents a conversational surface from
becoming the source of truth or an authorization bypass.

## Consequences

The first implementation targets one GSC read operation. Other providers and
MCP tools require separate capability verification and do not inherit access
from Google.

## Falsifier

Revisit if the official provider surface cannot provide a stable, documented
read operation or if a bounded test shows that the adapter cannot preserve raw
response provenance.
