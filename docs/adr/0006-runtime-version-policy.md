# ADR-0006: Runtime and dependency version policy

- Status: accepted
- Date: 2026-07-27

## Decision

Use the newest stable TypeScript release available at adoption time, pinned
exactly in `package.json` and reproducibly locked in `package-lock.json`. The
current baseline is TypeScript `7.0.2` with `@types/node` `26.1.1`.

Use Node `24.18.0` LTS as the production baseline and keep Node `26` Current
in compatibility CI while it is not LTS. The repository declares the supported
range in `package.json` and the local baseline in `.node-version`.

## Rationale

“Latest” is valuable for security and platform capability, but a Current Node
branch is not the same operational risk as an LTS branch. Exact dependency
versions plus a lockfile give us current APIs without silently changing the
runtime during a client report run.

## Consequences

Dependency upgrades are deliberate changes with a fresh typecheck and focused
proof. CI should exercise the LTS baseline and the current Node branch before a
runtime upgrade is accepted as production baseline.

## Falsifier

Revisit if Node 26 enters LTS, Node 24 leaves supported maintenance, or a
required dependency cannot support the selected baseline without a security or
correctness regression.

## Sources

- [Node.js release status](https://nodejs.org/en/about/previous-releases) distinguishes Current from LTS and recommends LTS for production.
- [TypeScript releases](https://github.com/microsoft/TypeScript/releases) identifies the adopted TypeScript release line.
