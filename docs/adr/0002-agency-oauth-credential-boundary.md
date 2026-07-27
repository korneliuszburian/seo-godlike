# ADR-0002: Agency OAuth and credential boundary

- Status: accepted for the first read-only proof
- Date: 2026-07-27
- Source decision: [Google authentication ticket](../../.scratch/seo-godlike-infra/issues/03-google-auth-and-secrets.md)

## Decision

Use one agency-controlled Google user identity with OAuth 2.0 authorization
code flow, offline access, incremental authorization, and only the
`https://www.googleapis.com/auth/webmasters.readonly` scope for the first GSC
proof.

Store only a credential reference in application configuration. Never commit,
print, log, or persist raw refresh tokens in the repository. The final hosted
secret store remains deferred; service-account JSON keys are not an accepted
default.

## Rationale

One authorized identity can cover multiple properties to which it has been
granted access, without a new consent for every property. This does not grant
access automatically: each client property must be explicitly accessible to
the identity.

## Consequences

The first operator action is an explicit consent. Token revocation, expiry,
scope mismatch, and missing property access are typed failures. Service-account
access may be reconsidered for unattended execution only with a keyless
identity boundary.

## Falsifier

Revisit if the agency identity cannot read `bodymove.pl`, the read-only scope is
unavailable, or no approved local credential boundary can hold the refresh
token.
