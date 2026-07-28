import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Ga4AnalyticsRequest, CapabilityRegistry, ClientRegistry, PolicyError } from "./domain.js";
import { runGa4Analytics } from "./ga4-analytics.js";
import { queryGa4Report } from "./google.js";

const execFileAsync = promisify(execFile);

const registry: ClientRegistry = {
  clients: [{
    client_id: "bodymove",
    display_name: "Bodymove",
    properties: [{ property_id: "properties/123456789", provider: "google-analytics", canonical_property: true }],
  }],
};

const capabilities: CapabilityRegistry = {
  capabilities: [{ capability_id: "ga4.properties.runReport", provider: "google-analytics", operation_id: "properties.runReport", api_version: "v1beta", read_write: "read", state: "schema_verified" }],
};

const request: Ga4AnalyticsRequest = {
  schema_version: "1",
  run_id: "analytics_bodymove_properties%2F123456789_google-analytics_2026-06-28_2026-07-25",
  client_id: "bodymove",
  property_id: "properties/123456789",
  provider: "google-analytics",
  operation: "properties.runReport",
  metric: "sessions",
  date_range: { start: "2026-06-28", end: "2026-07-25" },
  dimensions: ["date"],
  row_limit: 10_000,
  credential_ref: "keyring:seo-godlike/google-agency-refresh-token",
  policy_mode: "read_only",
  captured_at: "2026-07-28T12:00:00.000Z",
};

const raw = JSON.stringify({
  rows: [
    { dimensionValues: [{ value: "20260628" }], metricValues: [{ value: "12" }] },
    { dimensionValues: [{ value: "20260629" }], metricValues: [{ value: "8" }] },
  ],
  propertyQuota: { tokensPerDay: { consumed: 10, remaining: 199990 }, tokensPerHour: { consumed: 2, remaining: 39998 } },
});

test("GA4 raw proof produces a manifest-verified sessions bundle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-ga4-test-"));
  const output = join(directory, "bundle");
  const result = await runGa4Analytics(request, registry, capabilities, `${raw}\n`, output);
  assert.equal(result.report.property_refs[0], "properties/123456789");
  assert.equal(result.report.analytics.current.sessions, 20);
  assert.equal(result.report.analytics.current.property_quota?.tokens_per_day?.remaining, 199990);
  const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8")) as { files: Record<string, { sha256: string; bytes: number }> };
  for (const [name, expected] of Object.entries(manifest.files)) {
    const bytes = await readFile(join(output, name));
    assert.equal(bytes.byteLength, expected.bytes, name);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected.sha256, name);
  }
  await rm(directory, { recursive: true, force: true });
});

test("GA4 fails closed for an unregistered property", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-ga4-test-"));
  await assert.rejects(
    runGa4Analytics({ ...request, property_id: "properties/999999999" }, registry, capabilities, `${raw}\n`, join(directory, "bundle")),
    (error: unknown) => error instanceof PolicyError && error.category === "scope",
  );
  await rm(directory, { recursive: true, force: true });
});

test("GA4 fails closed for malformed metric values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-ga4-test-"));
  await assert.rejects(
    runGa4Analytics(request, registry, capabilities, JSON.stringify({ rows: [{ metricValues: [{ value: "not-a-number" }] }] }), join(directory, "bundle")),
    /invalid GA4 sessions value/,
  );
  await rm(directory, { recursive: true, force: true });
});

test("GA4 fails closed for an incompatible capability version", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-ga4-test-"));
  await assert.rejects(
    runGa4Analytics(request, registry, { capabilities: [{ ...capabilities.capabilities[0]!, api_version: "v1alpha" }] }, `${raw}\n`, join(directory, "bundle")),
    /unsupported Google Analytics API version/,
  );
  await rm(directory, { recursive: true, force: true });
});

test("GA4 fails closed when capability version is missing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-ga4-test-"));
  const missingVersion = { capabilities: [{ ...capabilities.capabilities[0]!, api_version: undefined }] };
  await assert.rejects(
    runGa4Analytics(request, registry, missingVersion, `${raw}\n`, join(directory, "bundle")),
    /unsupported Google Analytics API version 'missing'/,
  );
  await rm(directory, { recursive: true, force: true });
});

test("GA4 report Markdown escapes report-derived values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-ga4-test-"));
  const hostileRegistry: ClientRegistry = {
    clients: [{
      ...registry.clients[0]!,
      display_name: "<Agency & Co>",
    }],
  };
  const hostileRequest = {
    ...request,
    property_id: "properties/123456789",
    date_range: { start: "2026-06-28", end: "2026-07-25" },
  } satisfies Ga4AnalyticsRequest;
  await runGa4Analytics(hostileRequest, hostileRegistry, capabilities, `${raw}\n`, join(directory, "bundle"));
  const markdown = await readFile(join(directory, "bundle", "report.md"), "utf8");
  assert.match(markdown, /# GA4 analytics report: &lt;Agency &amp; Co&gt;/);
  assert.doesNotMatch(markdown, /<Agency & Co>/);
  await rm(directory, { recursive: true, force: true });
});

test("CLI GA4 raw path reaches the evidence writer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-ga4-cli-test-"));
  const registryPath = join(directory, "registry.json");
  const capabilitiesPath = join(directory, "capabilities.json");
  const rawPath = join(directory, "raw.json");
  const output = join(directory, "bundle");
  await writeFile(registryPath, JSON.stringify(registry), "utf8");
  await writeFile(capabilitiesPath, JSON.stringify(capabilities), "utf8");
  await writeFile(rawPath, `${raw}\n`, "utf8");
  await execFileAsync(process.execPath, [
    "dist/cli.js", "--ga4-analytics", "--raw", rawPath, "--client-id", "bodymove",
    "--property-id", "properties/123456789", "--registry", registryPath,
    "--capabilities", capabilitiesPath, "--output", output,
  ], { cwd: process.cwd() });
  const report = JSON.parse(await readFile(join(output, "report.json"), "utf8")) as { provider: string; analytics: { current: { sessions: number } } };
  assert.equal(report.provider, "google-analytics");
  assert.equal(report.analytics.current.sessions, 20);
  await rm(directory, { recursive: true, force: true });
});

test("GA4 transport targets the canonical runReport resource and quota payload", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = "";
  let calledBody = "";
  globalThis.fetch = async (input, init) => {
    calledUrl = String(input);
    calledBody = String(init?.body);
    return new Response(JSON.stringify({ rows: [] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await queryGa4Report("access-token", "properties/123456789", "2026-06-28", "2026-07-25");
    assert.equal(calledUrl, "https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport");
    assert.deepEqual(JSON.parse(calledBody), {
      dateRanges: [{ startDate: "2026-06-28", endDate: "2026-07-25" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
      limit: "10000",
      returnPropertyQuota: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
