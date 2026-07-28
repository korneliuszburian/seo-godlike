# External review follow-up: agency reporting ten-slice goal

- Fixed point reviewed: `c91bccf21d7e43090010d1c249a085ac04b7fe9f` →
  `86c2e21ea4d61c1d1fa36d5fe743e845da804276`
- External verdict: conditional PASS
- Follow-up fixed point: this report's commit

## Review findings and disposition

The reviewer requested targeted verification of scheduler lock cleanup and
multi-property failure visibility, and noted HTML escaping and cross-property
test coverage as deferred checks.

- `src/batch.ts` catches every task failure, records `{ id, error }` in
  `failed`, continues with later tasks, and `src/cli.ts` prints the result and
  exits non-zero when failures exist. The focused batch test proves all three
  behaviors.
- `src/report-history.ts` applies `htmlEscape` to every report-derived string
  interpolated into the HTML table and skipped-bundle list. Numeric totals are
  validated finite metrics before rendering. The HTML boundary test proves
  hostile path text is rendered as text, not markup.
- `flock` owns the lock for the lifetime of the child process and releases it
  when that process exits, including termination. A process-level proof
  confirmed that a second acquisition is rejected while the owner runs and
  succeeds after owner termination.

## Repair discovered during targeted verification

The generated command used `flock -n <path> -- node ...`. On the operator's
Linux `flock` implementation, `--` is not a command separator and caused
`flock` to try to execute a program named `--`. The scheduler now emits
`flock -n <path> node ...`, and the schedule assertion was updated accordingly.

This is a local scheduler syntax repair only; it does not install crontab,
perform provider writes, or alter credential handling.

## Proof

- focused schedule/history tests: PASS;
- `flock` process ownership proof: PASS;
- full `npm run build`: PASS after repair;
- full `npm test`: PASS after repair;
- `git diff --check`: required before publication;
- no secrets, tokens, OAuth client contents, or external writes included.

## Remaining deferred scope

Permanent onboarding of `sc-domain:hasmed.pl`, hosted credentials/runtime,
retention/cleanup policy, and a second live provider remain outside this
goal. They are not silently claimed by this follow-up.
