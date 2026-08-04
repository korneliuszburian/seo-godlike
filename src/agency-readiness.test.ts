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
  assert.deepEqual(readiness.blockers, ["no registered scope entries are available"]);
  assert.equal(readiness.policy_mode, "read_only");
});

test("readiness fails closed for ready external sources without a runnable input", () => {
  const scope = buildScopePlan(registry, capabilities, "2026-08-03T00:00:00.000Z");
  const readiness = buildAgencyReadiness(scope, {
    sources: [
      { source_id: "serprobot.bodymove", client_id: "bodymove", provider: "serprobot", target: "123", status: "ready", reason: null },
      { source_id: "semstorm.bodymove", client_id: "bodymove", provider: "semstorm", target: "bodymove.pl", status: "ready", reason: null },
    ],
  }, { oauth_client_supplied: true, keyword_input_supplied: false, rank_monitoring_supplied: false, client_content_supplied: false }, "2026-08-03T00:00:00.000Z");
  assert.equal(readiness.status, "partial");
  assert.deepEqual(readiness.blockers.slice(-2), [
    "bodymove:serprobot: --rank-monitoring, --rank-monitoring-root or --serprobot-api was not supplied",
    "bodymove:semstorm: no agency-run executor is available for this external source",
  ]);
});

test("readiness does not block a ready GA4 source handled by the agency scope executor", () => {
  const ga4Registry: ClientRegistry = {
    clients: [{ client_id: "bodymove", display_name: "Bodymove", properties: [{ property_id: "properties/123456789", provider: "google-analytics" }] }],
  };
  const ga4Capabilities: CapabilityRegistry = {
    capabilities: [{ capability_id: "ga4", provider: "google-analytics", operation_id: "properties.runReport", api_version: "v1beta", metric_ids: ["ga4.sessions"], read_write: "read", state: "schema_verified" }],
  };
  const readiness = buildAgencyReadiness(
    buildScopePlan(ga4Registry, ga4Capabilities, "2026-08-03T00:00:00.000Z"),
    { sources: [{ source_id: "ga4.bodymove", client_id: "bodymove", provider: "google-analytics", target: "properties/123456789", status: "ready", reason: null }] },
    { oauth_client_supplied: true, keyword_input_supplied: false, rank_monitoring_supplied: false, client_content_supplied: false },
    "2026-08-03T00:00:00.000Z",
  );
  assert.equal(readiness.status, "ready");
  assert.doesNotMatch(readiness.blockers.join("\n"), /no agency-run executor/);
});

test("readiness blocks a ready GA4 source without a matching scope property", () => {
  const readiness = buildAgencyReadiness(
    { schema_version: "1", generated_at: "2026-08-04T00:00:00.000Z", status: "ready", entries: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, metrics: [] }] },
    { sources: [{ source_id: "ga4.bodymove", client_id: "bodymove", provider: "google-analytics", target: "properties/123456789", status: "ready", reason: null }] },
    { oauth_client_supplied: true, keyword_input_supplied: false, rank_monitoring_supplied: false, client_content_supplied: false },
    "2026-08-04T00:00:00.000Z",
  );
  assert.equal(readiness.status, "partial");
  assert.deepEqual(readiness.blockers, ["bodymove:google-analytics:properties/123456789: no matching ready GA4 scope entry is registered"]);
});

test("readiness does not match a GA4 scope property across clients", () => {
  const readiness = buildAgencyReadiness(
    { schema_version: "1", generated_at: "2026-08-04T00:00:00.000Z", status: "ready", entries: [{ client_id: "acme", client_display_name: "Acme", property_id: "properties/123456789", provider: "google-analytics", status: "ready", reason: null, metrics: [] }] },
    { sources: [{ source_id: "ga4.bodymove", client_id: "bodymove", provider: "google-analytics", target: "properties/123456789", status: "ready", reason: null }] },
    { oauth_client_supplied: true, keyword_input_supplied: false, rank_monitoring_supplied: false, client_content_supplied: false },
    "2026-08-04T00:00:00.000Z",
  );
  assert.deepEqual(readiness.blockers, ["bodymove:google-analytics:properties/123456789: no matching ready GA4 scope entry is registered"]);
});
