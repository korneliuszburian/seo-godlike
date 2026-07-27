# Provider adapter and MCP boundary

Labels: `wayfinder:grilling`, `HITL`
Status: closed
Claimed by: Codex
Map: `seo-godlike-infra`
Blocked by: `01-execution-boundary`
Blocks: `05-reliability-observability`

## Question

Where is the authoritative boundary between official provider APIs, future MCP
facades, capability verification, canonical observations, and tenant policy so
that MCP cannot bypass read-only scope or evidence capture?

## Resolution

Official provider API/client calls are authoritative. The adapter owns
transport, API version, pagination, provider errors, and operation metadata;
the policy gate owns scope and read/write classification. MCP is deferred and,
when introduced, must remain a thin facade over these seams.

This decision is recorded in [ADR-0004](../../../docs/adr/0004-provider-adapter-mcp-boundary.md).
