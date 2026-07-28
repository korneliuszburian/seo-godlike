# Registry onboarding policy

Labels: `wayfinder:grilling`
Status: closed
Map: `../map.md`

## Question

What is the explicit operator confirmation and idempotency contract for adding
discovered properties, aliases, display names, and future client records?

## Related decision

[04-known-answer-data-window.md](04-known-answer-data-window.md)

## Resolution

Property onboarding is an explicit operator CLI mutation. The registry accepts
only validated canonical IDs and aliases for an existing client, rejects
duplicates and unknown clients, and writes through temporary-file replacement.
Repeated onboarding is not silently idempotent: a duplicate fails closed so an
operator must resolve the conflict deliberately.

The existing registry implementation and tests are the proof authority:

- duplicate canonical/alias rejection — passed;
- validated property plus alias persistence — passed;
- unsafe client ID rejection — passed;
- `npm run build`, `npm test`, and `git diff --check` — passed.
