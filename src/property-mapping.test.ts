import assert from "node:assert/strict";
import test from "node:test";
import { buildPropertyMappingTemplate } from "./property-mapping.js";

test("property mapping template is deterministic and does not infer ownership", () => {
  const template = buildPropertyMappingTemplate([
    "https://WWW.Example.pl/",
    "sc-domain:example.pl",
    "https://krakow.example.pl/",
  ], "2026-08-04T00:00:00.000Z");
  assert.deepEqual(template, {
    schema_version: "1",
    provider: "google-search-console",
    source: "operator-confirmed-discovery",
    generated_at: "2026-08-04T00:00:00.000Z",
    ownership_inferred: false,
    candidates: [
      { candidate_id: "gsc-001", discovered_property_id: "https://WWW.Example.pl/", normalized_host: "www.example.pl", client_id: null, canonical_property_id: null, aliases: [], ahrefs_target: null, ahrefs_country: null, status: "needs_operator_mapping" },
      { candidate_id: "gsc-002", discovered_property_id: "https://krakow.example.pl/", normalized_host: "krakow.example.pl", client_id: null, canonical_property_id: null, aliases: [], ahrefs_target: null, ahrefs_country: null, status: "needs_operator_mapping" },
      { candidate_id: "gsc-003", discovered_property_id: "sc-domain:example.pl", normalized_host: "example.pl", client_id: null, canonical_property_id: null, aliases: [], ahrefs_target: null, ahrefs_country: null, status: "needs_operator_mapping" },
    ],
  });
});

test("property mapping template rejects malformed discovery entries", () => {
  assert.throws(() => buildPropertyMappingTemplate(["sc-domain:good.pl", "bad property"]), /without whitespace/);
});

test("property mapping template keeps an unparseable discovery id unmapped", () => {
  const template = buildPropertyMappingTemplate(["legacy-property-id"], "2026-08-04T00:00:00.000Z");
  assert.equal(template.candidates[0]?.normalized_host, null);
  assert.equal(template.ownership_inferred, false);
});
