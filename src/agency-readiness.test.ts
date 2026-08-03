import assert from "node:assert/strict";
import test from "node:test";
import { buildAgencyReadiness } from "./agency-readiness.js";
import { buildScopePlan } from "./scope-plan.js";
import { CapabilityRegistry, ClientRegistry, SourceRegistry } from "./domain.js";

const registry: ClientRegistry = {
  clients: [{ client_id: "bodymove", display_name: "Bodymove", properties: [
    { property_id: "sc-domain:bodymove.pl", provider: "google-search-console" },
    { property_id: "bodymove.pl", provider: "ahrefs", country: "pl" },
  ] }],
};
const capabilities: CapabilityRegistry = {
  capabilities: [{ capability_id: "gsc", provider: "google-search-console", operation_id: "search_analytics.query", api_version: "v3", metric_ids: ["gsc.clicks"], read_write: "read", state: "schema_verified" }],
};

test("readiness is deterministic and reports unavailable scope and sources", () => {
  const scope = buildScopePlan(registry, capabilities, "2026-08-03T00:00:00.000Z");
  const sources: SourceRegistry = { sources: [{ source_id: "serprobot.bodymove", client_id: "bodymove", provider: "serprobot", target: null, status: "unavailable", reason: "snapshot not imported" }] };
  const readiness = buildAgencyReadiness(scope, sources, { oauth_client_supplied: true, keyword_input_supplied: false, rank_monitoring_supplied: false, client_content_supplied: false }, "2026-08-03T00:00:00.000Z");
  assert.equal(readiness.status, "partial");
  assert.equal(readiness.scope.total_entries, 2);
  assert.equal(readiness.scope.ready_entries, 1);
  assert.equal(readiness.scope.unavailable_entries, 1);
  assert.equal(readiness.credential_posture, "not_inspected");
  assert.deepEqual(readiness.blockers, [
    "bodymove:ahrefs:bodymove.pl: no read-only capability registered for provider 'ahrefs'",
    "bodymove:serprobot: snapshot not imported",
  ]);
});

test("readiness flags a missing OAuth input without reading the credential", () => {
  const scope = buildScopePlan(registry, capabilities, "2026-08-03T00:00:00.000Z");
  const readiness = buildAgencyReadiness(scope, { sources: [] }, { oauth_client_supplied: false, keyword_input_supplied: false, rank_monitoring_supplied: false, client_content_supplied: false }, "2026-08-03T00:00:00.000Z");
  assert.match(readiness.blockers.at(-1) ?? "", /--oauth-client/);
});

test("readiness does not inspect credentials or call providers", () => {
  const scope = buildScopePlan({ clients: [] }, { capabilities: [] }, "2026-08-03T00:00:00.000Z");
  const readiness = buildAgencyReadiness(scope, { sources: [] }, { oauth_client_supplied: false, keyword_input_supplied: false, rank_monitoring_supplied: false, client_content_supplied: false }, "2026-08-03T00:00:00.000Z");
  assert.equal(readiness.status, "blocked");
  assert.deepEqual(readiness.blockers, []);
  assert.equal(readiness.policy_mode, "read_only");
});
