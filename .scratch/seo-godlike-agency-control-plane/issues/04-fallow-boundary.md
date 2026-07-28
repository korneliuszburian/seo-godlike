# Fallow integration boundary

Labels: `wayfinder:research`
Status: closed
Map: `../map.md`

## Question

What is Fallow in this system, what authoritative interface does it expose,
and should it be a provider adapter, orchestration/runtime tool, review aid,
or explicit non-goal for the next large slice?

## Resolution

Fallow is a local, read-only repository-quality/review aid with CLI/MCP/CI
surfaces. It is not a SEO data provider, tenant credential holder, evidence
writer, or hosted authority. Adoption is a reversible parallel quality track;
its mutating `fix_apply` and hosted MCP surfaces remain operator decisions.

Research disposition: `fallow-role-reconciled-parallel-quality-track`.
