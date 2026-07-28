import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GSC_ANALYTICS_DIMENSIONS } from "./analytics.js";
import { CapabilityRegistry, ClientRegistry, GscAnalyticsRequest, PolicyError } from "./domain.js";
import { runGscAnalytics } from "./gsc-analytics.js";
import { resolveRegisteredProperty } from "./registry.js";

const execFileAsync = promisify(execFile);
const capabilities: CapabilityRegistry = {
  capabilities: [{ capability_id: "gsc.search_analytics.query", provider: "google-search-console", operation_id: "search_analytics.query", read_write: "read", state: "schema_verified" }],
};
const registry: ClientRegistry = {
  clients: [{
    client_id: "bodymove",
    display_name: "Bodymove",
    properties: [{ property_id: "sc-domain:bodymove.pl", provider: "google-search-console", canonical_property: true, aliases: ["https://bodymove.pl/"] }],
  }],
};

function request(propertyId: string): GscAnalyticsRequest {
  return {
    schema_version: "1",
    run_id: "registry_test_001",
    client_id: "bodymove",
    property_id: propertyId,
    provider: "google-search-console",
    operation: "search_analytics.query",
    metric: "clicks",
    date_range: { start: "2026-06-28", end: "2026-07-25" },
    comparison_date_range: { start: "2026-05-31", end: "2026-06-27" },
    dimensions: GSC_ANALYTICS_DIMENSIONS,
    row_limit: 25_000,
    credential_ref: "keyring:seo-godlike/google-agency-refresh-token",
    policy_mode: "read_only",
    captured_at: "2026-07-28T08:00:00.000Z",
  };
}

test("--add-property fails closed on a duplicate canonical or alias id", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-registry-test-"));
  const registryPath = join(directory, "client-registry.json");
  await writeFile(registryPath, JSON.stringify(registry), "utf8");
  const args = ["dist/cli.js", "--add-property", "--registry", registryPath, "--client-id", "bodymove", "--property-id", "sc-domain:bodymove.pl"];
  await assert.rejects(execFileAsync(process.execPath, args, { cwd: process.cwd() }), /duplicate property 'sc-domain:bodymove.pl'/);
  await assert.rejects(execFileAsync(process.execPath, [...args.slice(0, -1), "https://bodymove.pl/"], { cwd: process.cwd() }), /duplicate property 'https:\/\/bodymove.pl\/'/);
  await rm(directory, { recursive: true, force: true });
});

test("analytics rejects an unregistered property with an exact scope error", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-registry-test-"));
  await assert.rejects(
    runGscAnalytics(request("sc-domain:not-registered.pl"), registry, capabilities, '{"rows":[]}', '{"rows":[]}', join(directory, "run")),
    (error: unknown) => error instanceof PolicyError && error.message === "scope: property 'sc-domain:not-registered.pl' is not registered for client 'bodymove'",
  );
  await rm(directory, { recursive: true, force: true });
});

test("canonical property and alias resolve to one canonical evidence property", async () => {
  assert.equal(resolveRegisteredProperty(registry, "bodymove", "sc-domain:bodymove.pl", "google-search-console").canonical_property_id, "sc-domain:bodymove.pl");
  assert.equal(resolveRegisteredProperty(registry, "bodymove", "https://bodymove.pl/", "google-search-console").canonical_property_id, "sc-domain:bodymove.pl");
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-registry-test-"));
  const result = await runGscAnalytics(request("https://bodymove.pl/"), registry, capabilities, '{"rows":[]}', undefined, join(directory, "run"));
  assert.deepEqual(result.report.property_refs, ["sc-domain:bodymove.pl"]);
  assert.equal(result.report.client_display_name, "Bodymove");
  await rm(directory, { recursive: true, force: true });
});

test("analytics writer rejects non-canonical timestamps for new bundles", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-registry-test-"));
  await assert.rejects(
    runGscAnalytics({ ...request("sc-domain:bodymove.pl"), captured_at: "2026-07-28" }, registry, capabilities, '{"rows":[]}', undefined, join(directory, "run")),
    /captured_at must be canonical ISO-8601/,
  );
  await rm(directory, { recursive: true, force: true });
});

test("analytics rejects an explicitly unsupported provider API version", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-registry-test-"));
  await assert.rejects(
    runGscAnalytics(request("sc-domain:bodymove.pl"), registry, { capabilities: [{ ...capabilities.capabilities[0], api_version: "v2" }] }, '{"rows":[]}', undefined, join(directory, "run")),
    (error: unknown) => error instanceof PolicyError && error.category === "schema" && /unsupported Google Search Console API version/.test(error.message),
  );
  await rm(directory, { recursive: true, force: true });
});

test("--add-property writes a validated property and optional alias", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-registry-test-"));
  const registryPath = join(directory, "client-registry.json");
  await writeFile(registryPath, JSON.stringify(registry), "utf8");
  await execFileAsync(process.execPath, [
    "dist/cli.js", "--add-property", "--registry", registryPath, "--client-id", "bodymove",
    "--property-id", "sc-domain:newbodymove.pl", "--canonical-property", "true", "--alias", "https://newbodymove.pl/",
  ], { cwd: process.cwd() });
  const persisted = JSON.parse(await readFile(registryPath, "utf8")) as ClientRegistry;
  assert.deepEqual(persisted.clients[0]?.properties[1], {
    property_id: "sc-domain:newbodymove.pl",
    provider: "google-search-console",
    canonical_property: true,
    aliases: ["https://newbodymove.pl/"],
  });
  await rm(directory, { recursive: true, force: true });
});

test("--add-property rejects a client id that is unsafe for shell-generated paths", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-registry-test-"));
  const registryPath = join(directory, "client-registry.json");
  await writeFile(registryPath, JSON.stringify(registry), "utf8");
  await assert.rejects(
    execFileAsync(process.execPath, [
      "dist/cli.js", "--add-property", "--registry", registryPath, "--client-id", "bad/client",
      "--property-id", "sc-domain:newbodymove.pl",
    ], { cwd: process.cwd() }),
    /shell-safe path segment/,
  );
  await rm(directory, { recursive: true, force: true });
});
