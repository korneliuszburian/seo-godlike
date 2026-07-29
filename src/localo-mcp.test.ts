import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverLocaloMcp } from "./localo-mcp.js";

test("Localo discovery performs only initialize and tools/list and redacts auth", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { method: string };
    calls.push(body.method);
    if (body.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", serverInfo: { name: "localo" }, capabilities: { tools: {} } } }), { status: 200 });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "rankings", description: "Read rankings", inputSchema: { type: "object" } }, { name: "publish_post" }] } }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await discoverLocaloMcp("https://example.test/mcp", "secret-that-must-not-be-output");
    assert.deepEqual(calls, ["initialize", "tools/list"]);
    assert.equal(result.provider, "localo");
    assert.equal(result.tools[0]?.name, "rankings");
    assert.equal(result.tools[1]?.name, "publish_post");
    assert.doesNotMatch(JSON.stringify(result), /secret-that-must-not-be-output/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Localo discovery fails closed on an unauthorized MCP response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("", { status: 401 })) as typeof fetch;
  try {
    await assert.rejects(discoverLocaloMcp("https://example.test/mcp", "redacted-test-token"), /Localo MCP request failed: 401/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Localo discovery fails closed when the keyring token is absent", async () => {
  await assert.rejects(discoverLocaloMcp("https://example.test/mcp", undefined, async () => { throw new Error("missing secret reference 'keyring:seo-godlike/localo-mcp-token'"); }), /missing secret reference 'keyring:seo-godlike\/localo-mcp-token'/);
});
