import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readRankMonitoringBundle } from "./rank-monitoring.js";
import { parseSerprobotProjectResponse, querySerprobotProject, writeSerprobotApiBundle } from "./serprobot.js";

const request = {
  client_id: "bodymove",
  project_id: "123",
  captured_at: "2026-08-04T08:00:00.000Z",
  date_range: { start: "2026-07-01", end: "2026-07-31" },
  search_engine: "google.pl",
  location: "Warszawa",
  device: "desktop",
  endpoint: "https://operator-confirmed.example/api",
};

const response = {
  keywords: [
    { id: 10, keyword: "rehabilitacja", current_position: 7, latest_found_serp: "https://bodymove.pl/oferta", check_data: [null, { position: 9 }] },
    { id: 11, keyword: "fizjoterapia", current_position: "-", latest_found_serp: null },
  ],
};

test("SERPROBOT project response normalizes current and historical positions without inventing zeros", () => {
  const snapshot = parseSerprobotProjectResponse(response, request);
  assert.deepEqual(snapshot.rows, [
    { keyword: "fizjoterapia", position: null, previous_position: null, search_engine: "google.pl", location: "Warszawa", device: "desktop", url: null },
    { keyword: "rehabilitacja", position: 7, previous_position: null, search_engine: "google.pl", location: "Warszawa", device: "desktop", url: "https://bodymove.pl/oferta" },
  ]);
  assert.equal(snapshot.source_config?.project_id, "123");
});

test("SERPROBOT API query is read-only, date-bound and does not put the key in returned evidence", async () => {
  let requested: URL | undefined;
  const result = await querySerprobotProject("secret-api-key", request, async (url) => {
    requested = url;
    return { ok: true, status: 200, json: async () => response };
  });
  assert.equal(requested?.searchParams.get("action"), "project");
  assert.equal(requested?.searchParams.get("project_id"), "123");
  assert.equal(requested?.searchParams.get("start"), "2026-07-01");
  assert.equal(requested?.searchParams.get("end"), "2026-07-31");
  assert.equal(result.raw.includes("secret-api-key"), false);
});

test("SERPROBOT API bundle preserves raw responses and verifies their manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-serprobot-api-"));
  try {
    const output = join(root, "bundle");
    await writeSerprobotApiBundle("secret-api-key", [request], output, async () => ({ ok: true, status: 200, json: async () => response }));
    const read = await readRankMonitoringBundle(output, ["bodymove"]);
    assert.equal(read.snapshot.import_mode, "api");
    assert.equal(JSON.parse(await readFile(join(output, "raw-response.json"), "utf8")).keywords.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SERPROBOT parser fails closed when the provider response has no keyword array", () => {
  assert.throws(() => parseSerprobotProjectResponse({ data: [] }, request), /keywords array/);
});

test("SERPROBOT query rejects an invalid or reversed date range before network IO", async () => {
  await assert.rejects(
    querySerprobotProject("secret", { ...request, date_range: { start: "2026-08-05", end: "2026-08-04" } }, async () => { throw new Error("network must not be reached"); }),
    /date range must be valid and ordered/,
  );
});

test("SERPROBOT query rejects a missing or non-HTTPS endpoint before network IO", async () => {
  await assert.rejects(querySerprobotProject("secret", { ...request, endpoint: "" }, async () => { throw new Error("network must not be reached"); }), /valid HTTPS URL/);
  await assert.rejects(querySerprobotProject("secret", { ...request, endpoint: "http://operator-confirmed.example/api" }, async () => { throw new Error("network must not be reached"); }), /HTTPS URL/);
});
