# KRN context packet adapter

Labels: `implementation`, `HITL`
Status: closed
Claimed by: Codex
Claim ID: `claim_context_packet_v1`
Map: `seo-godlike-infra`
Blocks: none
Blocked by: `01-execution-boundary`, `02-evidence-persistence`

## Question

How does one claimed local Markdown ticket become an immutable, validated
context packet for a Sandcastle execution without creating a second durable
tracker or executable prompt input?

## Acceptance

- [ ] Compile one local Markdown ticket into a packet v1 JSON file.
- [ ] Validate packet shape, identity hashes, authority fields, and safe text.
- [ ] Reject missing bounded sections, executable bang commands, and secret-like text.
- [ ] Write the packet exclusively so an existing output cannot be overwritten.
- [ ] Keep GitHub Issue, PR, merge, and KRN state outside this adapter.

## Owned paths

- `scripts/context-packet.mjs`
- `scripts/context-packet.test.mjs`
- `docs/contracts/context-packet-v1.md`

## Non-goals

- Creating or updating GitHub Issues.
- Calling Sandcastle, opening or merging a PR.
- Updating the local ticket after execution.
- Reading secrets or resolving runtime state from KRN.

## Context

The packet is an immutable snapshot compiled by KRN before execution. It must
contain enough bounded task context for `--prompt-file` without re-reading the
local tracker during the Sandcastle run. GitHub remains Sandcastle's execution
handle and queue, while KRN remains the product tracker and state owner.

## Proof

- `node --test scripts/context-packet.test.mjs` — 3/3
- `npm run build` — passed
- `npm run test:focused` — 2/2
- real ticket compile to a fresh output — passed
- deterministic `packet.md` render for Sandcastle `--prompt-file` — passed
- `git diff --check` — passed
