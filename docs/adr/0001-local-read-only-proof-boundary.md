# ADR-0001: Local read-only proof boundary

- Status: accepted
- Date: 2026-07-27
- Scope: first `bodymove.pl` proof slice

## Decision

Run the first proof as a local CLI with no hosted service, public endpoint,
background worker, or write authority.

## Rationale

The repository has no product runtime yet. A local CLI gives the smallest
auditable execution boundary while preserving the future provider, policy, and
evidence seams. Hosting is a separate decision after the read-only proof is
verified.

## Consequences

The operator launches each run explicitly. Credentials and evidence remain
outside source control. A future hosted runtime must reproduce the same
contracts and may not be inferred from the local proof.

## Falsifier

This decision is revisited if the first proof requires a callback or runtime
capability that cannot be safely provided by a local CLI, or if scheduled
execution becomes an accepted requirement.
