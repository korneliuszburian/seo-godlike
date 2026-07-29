import assert from "node:assert/strict";
import test from "node:test";
import { buildManagerPrompt, CODEX_READ_ONLY_POLICY, createCodexReadonlyRuntime } from "./codex-runtime.js";
import { buildScopePlan } from "./scope-plan.js";
import { CapabilityRegistry, ClientRegistry } from "./domain.js";

const registry: ClientRegistry = {
  clients: [{ client_id: "bodymove", display_name: "Bodymove", properties: [{ property_id: "sc-domain:bodymove.pl", provider: "google-search-console", canonical_property: true }] }],
};
const capabilities: CapabilityRegistry = {
  capabilities: [{ capability_id: "gsc.search_analytics.query", provider: "google-search-console", operation_id: "search_analytics.query", state: "validated_real_domain", api_version: "v3", metric_ids: ["gsc.clicks"], dimensions: ["query"], discovery: "fixture_declared", read_write: "read" }],
};

test("Codex runtime is explicitly read-only and does not inherit API keys", () => {
  const runtime = createCodexReadonlyRuntime({ workingDirectory: process.cwd() });
  assert.equal(runtime.threadOptions.sandboxMode, "read-only");
  assert.equal(runtime.threadOptions.approvalPolicy, "never");
  assert.equal(runtime.threadOptions.networkAccessEnabled, false);
  assert.equal(runtime.threadOptions.webSearchMode, "disabled");
  assert.match(CODEX_READ_ONLY_POLICY, /OPENAI_API_KEY/);
});

test("manager prompt is scope-bounded and does not invoke Codex", () => {
  const prompt = buildManagerPrompt(buildScopePlan(registry, capabilities));
  assert.match(prompt, /sc-domain:bodymove\.pl/);
  assert.match(prompt, /Do not modify files/);
  assert.doesNotMatch(prompt, /refresh_token|client_secret|auth\.json/);
});
