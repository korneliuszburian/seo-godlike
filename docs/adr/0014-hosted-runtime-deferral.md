# ADR-0014: Hosted runtime is a separate goal

- Status: deferred
- Date: 2026-07-28

## Decision

The current ten-slice goal remains local and read-only. Hosted execution,
Secret Manager migration, refresh-token custody, public endpoints, deployment,
and hosted audit infrastructure are deferred to a separate goal with its own
authority and external research.

## Rationale

The local keyring and explicit CLI boundary are proven. Moving credentials or
execution to a hosted runtime would materially change the threat model,
publication authority, operational controls, and failure surface.

## Consequences

This goal does not claim hosted production readiness. The local adapter,
registry, evidence, reporting, batch, and scheduler contracts must remain
portable so a later hosted runtime can adopt them behind a new credential seam.

## Falsifier

Reopen when the operator approves a hosted deployment target and a completed
credential/secret-management design exists with independent review.
