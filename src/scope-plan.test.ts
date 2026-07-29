import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";
import { buildScopePlan, metricCatalog, validateCapabilityRegistry } from "./scope-plan.js";
import { CapabilityRegistry, ClientRegistry } from "./domain.js";

const execFileAsync = promisify(execFile);

const registry: ClientRegistry = {
  clients: [{ client_id: "bodymove", display_name: "Bodymove", properties: [
    { property_id: "sc-domain:bodymove.pl", provider: "google-search-console" },
    { property_id: "bodymove.pl", provider: "ahrefs" },
    { property_id: "properties/123456789", provider: "google-analytics" },
  ] }],
};

const capabilities: CapabilityRegistry = {
  capabilities: [{ capability_id: "gsc", provider: "google-search-console", operation_id: "search_analytics.query", api_version: "v3", metric_ids: ["gsc.clicks", "gsc.impressions"], dimensions: ["query", "page"], read_write: "read", state: "schema_verified" }],
};

test("scope plan maps every registered property and fails closed per capability", () => {
  const plan = buildScopePlan(registry, capabilities, "2026-07-29T00:00:00.000Z");
  assert.equal(plan.status, "partial");
  assert.deepEqual(plan.entries.map((entry) => entry.status), ["ready", "unavailable", "unavailable"]);
  assert.deepEqual(plan.entries[0].metrics.map((metric) => metric.metric_id), ["gsc.clicks", "gsc.impressions"]);
  assert.deepEqual(plan.entries[0].metrics[0].dimensions, ["query", "page"]);
  assert.match(plan.entries[1].reason ?? "", /no read-only capability/);
});

test("scope plan preserves multiple clients and properties without collapsing identity", () => {
  const multiClientRegistry: ClientRegistry = {
    clients: [
      { client_id: "bodymove", properties: [{ property_id: "sc-domain:bodymove.pl", provider: "google-search-console" }, { property_id: "bodymove.pl", provider: "ahrefs" }] },
      { client_id: "acme", properties: [{ property_id: "sc-domain:acme.example", provider: "google-search-console" }] },
    ],
  };
  const multiProviderCapabilities: CapabilityRegistry = {
    capabilities: [
      capabilities.capabilities[0]!,
      { capability_id: "ahrefs", provider: "ahrefs", operation_id: "site-explorer.metrics", api_version: "v3", metric_ids: ["ahrefs.org_traffic"], read_write: "read", state: "schema_verified" },
    ],
  };
  const plan = buildScopePlan(multiClientRegistry, multiProviderCapabilities, "2026-07-29T00:00:00.000Z");
  assert.equal(plan.entries.length, 3);
  assert.deepEqual(plan.entries.map((entry) => `${entry.client_id}:${entry.property_id}:${entry.provider}`), [
    "bodymove:sc-domain:bodymove.pl:google-search-console",
    "bodymove:bodymove.pl:ahrefs",
    "acme:sc-domain:acme.example:google-search-console",
  ]);
  assert.ok(plan.entries.every((entry) => entry.status === "ready"));
});

test("capability validation fails closed for an unknown metric declaration", () => {
  assert.throws(() => validateCapabilityRegistry({ capabilities: [{ capability_id: "bad", provider: "google-search-console", operation_id: "search_analytics.query", metric_ids: ["ga4.sessions"], read_write: "read", state: "schema_verified" }] }), /outside its provider operation/);
});

test("metric catalog is provider-scoped and returns independent dimensions", () => {
  const gsc = metricCatalog("google-search-console");
  assert.equal(gsc.length, 4);
  gsc[0].dimensions.push("hostile-test");
  assert.equal(metricCatalog("google-search-console")[0].dimensions.includes("hostile-test"), false);
});

test("scope plan CLI exposes the agency scope contract", async () => {
  const result = await execFileAsync(process.execPath, ["dist/cli.js", "--scope-plan", "--registry", "fixtures/client-registry.json", "--capabilities", "fixtures/capability-registry.json"], { cwd: process.cwd() });
  const plan = JSON.parse(result.stdout) as ReturnType<typeof buildScopePlan>;
  assert.equal(plan.schema_version, "1");
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.entries.map((entry) => `${entry.provider}:${entry.status}`), ["google-search-console:ready", "ahrefs:ready"]);
});
