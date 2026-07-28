# Hosted credential boundary

Labels: `wayfinder:research`
Status: closed
Map: `../map.md`

## Question

When the tool leaves local execution, which runtime, secret manager, OAuth
refresh-token boundary, audit trail, and operator approval model are accepted?

## Blocked by

[08-scheduling-reliability-policy.md](08-scheduling-reliability-policy.md)

## Resolution

Hosted credential/runtime work is explicitly deferred to a separate goal.
Current scope remains local keyring, local CLI, read-only provider access, and
immutable evidence. ADR-0014 records the boundary; no hosted secret or deploy
surface is introduced here.
