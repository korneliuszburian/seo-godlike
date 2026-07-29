import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CapabilityRegistry, ClientRegistry, PolicyError, AnalysisRequest } from "./domain.js";
import { runFixtureAnalysis } from "./pipeline.js";

const request: AnalysisRequest = {
  schema_version: "1",
  run_id: "run_fixture_001",
  client_id: "bodymove",
  property_id: "sc-domain:bodymove.pl",
  provider: "google-search-console",
  operation: "search_analytics.query",
  metric: "clicks",
  date_range: { start: "2026-07-01", end: "2026-07-07" },
  dimensions: [],
  credential_ref: "fixture:gsc",
  policy_mode: "read_only",
  captured_at: "2026-07-27T12:00:00.000Z",
};
const registry: ClientRegistry = {
  clients: [{ client_id: "bodymove", properties: [{ property_id: "sc-domain:bodymove.pl", provider: "google-search-console" }] }],
};
const capabilities: CapabilityRegistry = {
  capabilities: [{ capability_id: "gsc.search_analytics.query", provider: "google-search-console", operation_id: "search_analytics.query", api_version: "v3", read_write: "read", state: "schema_verified" }],
};

test("fails closed for a property mapped to another client", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-test-"));
  await assert.rejects(
    runFixtureAnalysis({ ...request, client_id: "other-client" }, registry, capabilities, '{"rows":[]}', join(directory, "run")),
    (error: unknown) => error instanceof PolicyError && error.category === "scope",
  );
  await rm(directory, { recursive: true, force: true });
});

test("produces a traceable canonical report from a fixture response", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-test-"));
  const result = await runFixtureAnalysis(request, registry, capabilities, '{"rows":[{"clicks":3},{"clicks":2}]}\n', join(directory, "run"));
  const report = JSON.parse(await readFile(join(result.outputDir, "report.json"), "utf8")) as { canonical_json_hash: string };
  assert.equal(result.report.canonical_json_hash, report.canonical_json_hash);
  assert.match(await readFile(join(result.outputDir, "report.md"), "utf8"), /Value: 5/);
  await rm(directory, { recursive: true, force: true });
});
