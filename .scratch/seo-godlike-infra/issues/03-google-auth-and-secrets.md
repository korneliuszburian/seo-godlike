# Google authentication and secret boundary

Labels: `wayfinder:research`, `AFK`
Status: closed
Claimed by: Codex
Map: `seo-godlike-infra`
Blocks: `06-tenant-security`

## Question

For a shared agency identity spanning many clients and properties, which Google
OAuth/service-account model, scopes, consent posture, token storage, rotation,
and local operator handoff are supportable today for read-only GSC access?

Resolve with current official Google sources and an explicit disposition for
each alternative. Do not perform consent or handle secrets in this ticket.

## Resolution

**Decision: adopt** one agency-controlled Google user identity with OAuth 2.0
authorization-code flow and offline access for the first read-only proof.
Request only `https://www.googleapis.com/auth/webmasters.readonly`, use
incremental authorization, and require the operator to perform the first
consent. A refresh token may be used without another consent while it remains
valid and the same Google identity retains access to a property.

The provider must still verify that the identity has read permission on each
GSC property. A shared agency identity does not automatically grant access to a
new client property.

**Credential boundary:** the application stores only a secret reference in
configuration and never commits, logs, prints, or places refresh tokens in the
repository. The concrete local-versus-hosted secret store remains a downstream
infrastructure decision; hosted execution must use an audited secret store or
workload identity, not a service-account JSON key.

**Service-account disposition: defer.** Official documentation confirms that a
service account can be granted Search Console owner access, but the first proof
does not need that operational complexity. Revisit it only for unattended
execution with keyless workload identity or an equally strong identity
boundary.

## Source-to-decision evidence

- [Search Console authorization](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing): GSC API requests require OAuth 2.0; `webmasters.readonly` is the read-only scope.
- [Search Console prerequisites](https://developers.google.com/webmaster-tools/v1/prereqs): the Google Account needs appropriate permission on each property; `searchAnalytics.query` requires read permission.
- [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server): offline access returns a refresh token and permits later access-token refresh; incremental authorization is recommended.
- [OAuth security best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices): protect tokens at rest, validate `state`, handle revocation, and request minimal scopes.
- [Search Console service-account owner setup](https://developers.google.com/search/apis/indexing-api/v3/prereqs): a service account can be added as a delegated site owner, but this is a separate property-access operation.
- [Secret Manager best practices](https://docs.cloud.google.com/secret-manager/docs/best-practices): avoid passing secrets through files or environment variables; prefer identity-based access.
- [Service-account key guidance](https://docs.cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys): avoid service-account keys when stronger identity methods are available.

## Falsifier

Reject or revise this decision if the operator’s agency identity cannot obtain
read access to `bodymove.pl`, if the required read-only scope is unavailable,
or if a stable refresh token cannot be stored in an approved secret boundary.

## Does not prove

This decision does not prove that the agency identity can currently access
`bodymove.pl`, does not perform consent, and does not choose the final hosting
platform or secret-manager product.
