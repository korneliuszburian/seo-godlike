# Client delivery surface boundary

Labels: `wayfinder:grilling`
Status: closed
Map: `../map.md`

## Question

What is the smallest client-facing output contract for the next local agency
delivery slice: Markdown, escaped local HTML, a static package, or another
explicit export?

The answer must define the consumer, tenant redaction boundary, links to
evidence, and whether the output is operator-only or safe to hand to a client.
Hosting, sharing, and outbound messaging remain outside the decision unless
explicitly earned.

## Resolution

The next slice is operator-only and local. It may emit the existing deterministic
JSON, Markdown, and escaped local HTML package, but it does not authorize client
sharing, hosting, links, messaging, or publication. Those are separate future
authority decisions.
