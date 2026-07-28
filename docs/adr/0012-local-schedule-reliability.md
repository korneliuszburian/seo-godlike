# ADR-0012: Local schedule reliability guard

- Status: accepted for local execution
- Date: 2026-07-28

## Decision

The generated Linux cron command uses non-blocking `flock` with a per-client
lock file. Existing GSC transport retries transient 5xx and 429 responses up
to three attempts with bounded backoff. The scheduler only renders stdout and
never installs or mutates crontab state.

## Rationale

Overlapping local runs can collide on exclusive evidence output. A lock is the
smallest guard that preserves append-only bundle semantics while leaving
operator scheduling authority intact.

## Consequences

The generated command assumes Linux `flock`; macOS/hosted scheduling requires a
separate adapter decision. Retention, cleanup, and long-running queue policy
remain outside this local guard and are not silently automated.

## Falsifier

Revisit if the operator environment lacks `flock`, if bounded retries conceal a
provider failure, or if measured runs need a queue rather than skip-on-lock.
