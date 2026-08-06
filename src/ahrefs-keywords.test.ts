import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AHREFS_KEYWORDS_OVERVIEW_URL, parsePhraseInput, queryAhrefsKeywordOverview, writeAhrefsKeywordResearch } from "./ahrefs-keywords.js";
import { CapabilityRegistry } from "./domain.js";
import { AhrefsCollectionPolicy } from "./provider-collection-policy.js";

const capabilities: CapabilityRegistry = { capabilities: [{ capability_id: "ahrefs.keywords-explorer.overview", provider: "ahrefs", operation_id: "keywords-explorer.overview", api_version: "v3", metric_ids: ["ahrefs.keyword_metrics"], read_write: "read", state: "schema_verified" }] };
const enabledCollectionPolicy: AhrefsCollectionPolicy = { provider: "ahrefs", collection: "enabled", reason: null };

test("phrase parser separates domains, notes, and duplicate phrases", () => {
  const input = parsePhraseInput("https://example.pl/\nFizjo Warszawa\nfizjo warszawa\ndla klienta później\n# note: wyłączona lokalizacja\n\nhttps://second.pl/\nfraza");
  assert.deepEqual(input.groups, [{ host: "example.pl", phrases: ["fizjo warszawa", "dla klienta później"] }, { host: "second.pl", phrases: ["fraza"] }]);
  assert.deepEqual(input.notes, ["example.pl: wyłączona lokalizacja"]);
});

test("phrase parser does not treat ordinary phrases as implicit notes", () => {
  const input = parsePhraseInput("https://example.pl/\ntutaj rehabilitacja\n# note: operator context");
  assert.deepEqual(input.groups[0]?.phrases, ["tutaj rehabilitacja"]);
  assert.deepEqual(input.notes, ["example.pl: operator context"]);
});

test("phrase parser rejects an unmarked line before the first URL", () => {
  assert.throws(() => parsePhraseInput("operator context\nhttps://example.pl/\nfraza"), /must declare a URL before phrases/);
  assert.deepEqual(parsePhraseInput("# note: operator context\nhttps://example.pl/\nfraza").notes, ["operator context"]);
});

test("keyword query sends one bounded Keywords Explorer request", async () => {
  let requested: URL | undefined;
  const fetchImpl: typeof fetch = async (input) => {
    requested = new URL(String(input));
    return new Response(JSON.stringify({ keywords: [{ keyword: "fraza", volume: 100 }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const raw = await queryAhrefsKeywordOverview("test-key", ["fraza"], "pl", fetchImpl, enabledCollectionPolicy);
  assert.equal(JSON.parse(raw).keywords[0].keyword, "fraza");
  assert.ok(requested);
  assert.equal(requested.origin + requested.pathname, AHREFS_KEYWORDS_OVERVIEW_URL);
  assert.equal(requested.searchParams.get("country"), "pl");
  assert.equal(requested.searchParams.get("keywords"), "fraza");
  assert.equal(requested.searchParams.get("select")?.includes("difficulty"), true);
});

test("Ahrefs keyword transport is globally paused before network IO", async () => {
  let calls = 0;
  await assert.rejects(
    queryAhrefsKeywordOverview("test-key", ["fraza"], "pl", async () => {
      calls += 1;
      return new Response(JSON.stringify({ keywords: [] }), { status: 200 });
    }),
    /Ahrefs collection is globally disabled by budget policy/,
  );
  assert.equal(calls, 0);
});

test("keyword query rejects uppercase country before network", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  };
  await assert.rejects(() => queryAhrefsKeywordOverview("test-key", ["fraza"], "PL", fetchImpl), /invalid Ahrefs keyword country 'PL'/);
  assert.equal(calls, 0);
});

test("keyword query rejects comma-containing phrases before network", async () => {
  let calls = 0;
  await assert.rejects(() => queryAhrefsKeywordOverview("test-key", ["fraza, druga"], "pl", async () => { calls += 1; return new Response("{}"); }), /must not contain commas/);
  assert.equal(calls, 0);
});

test("keyword writer fails closed when the capability is missing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-keywords-capability-"));
  try {
    const inputPath = join(directory, "phrases.txt");
    await writeFile(inputPath, "https://example.pl/\nfraza\n");
    await assert.rejects(() => writeAhrefsKeywordResearch({ inputPath, outputDir: join(directory, "output"), capabilities: { capabilities: [] }, apiKey: "test-key", collectionPolicy: enabledCollectionPolicy }), /unsupported Ahrefs Keywords Explorer capability/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keyword research writes a hash-bound deterministic bundle and refuses over-budget input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-keywords-"));
  try {
    const inputPath = join(directory, "phrases.txt");
    await writeFile(inputPath, "https://example.pl/\nfraza\n");
    const outputDir = join(directory, "output");
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ keywords: [{ keyword: "fraza", volume: 100 }] }), { status: 200 });
    const report = await writeAhrefsKeywordResearch({ inputPath, outputDir, capabilities, apiKey: "test-key", allowEstimatedBudget: true, fetchImpl, collectionPolicy: enabledCollectionPolicy });
    assert.equal(report.groups[0]?.rows[0]?.keyword, "fraza");
    assert.equal((await stat(outputDir)).mode & 0o777, 0o700);
    const manifest = JSON.parse(await readFile(join(outputDir, "manifest.json"), "utf8"));
    assert.equal(Object.keys(manifest.files).length, 4);
    const request = JSON.parse(await readFile(join(outputDir, "request.json"), "utf8"));
    assert.equal(request.estimated_budget_explicitly_accepted, true);
    assert.equal(request.budget_basis, "minimum_request_cost_only; actual_cost_depends_on_returned_rows_and_selected_fields");
    assert.equal(await readFile(join(outputDir, "raw-response.001.example.pl.json"), "utf8"), JSON.stringify({ keywords: [{ keyword: "fraza", volume: 100 }] }));
    await assert.rejects(() => queryAhrefsKeywordOverview("test-key", [], "pl", fetchImpl, enabledCollectionPolicy), /invalid phrase count/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keyword writer rejects an insufficient unit budget before network", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-keywords-budget-"));
  let calls = 0;
  try {
    const inputPath = join(directory, "phrases.txt");
    await writeFile(inputPath, "https://example.pl/\nfraza\n");
    await assert.rejects(() => writeAhrefsKeywordResearch({ inputPath, outputDir: join(directory, "output"), capabilities, apiKey: "test-key", maxApiUnits: 49, fetchImpl: async () => { calls += 1; return new Response("{}"); }, collectionPolicy: enabledCollectionPolicy }), /keyword API unit budget exceeded/);
    assert.equal(calls, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keyword writer fails closed without explicit estimated-budget acceptance before network", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-keywords-explicit-budget-"));
  let calls = 0;
  try {
    const inputPath = join(directory, "phrases.txt");
    await writeFile(inputPath, "https://example.pl/\nfraza\n");
    await assert.rejects(() => writeAhrefsKeywordResearch({ inputPath, outputDir: join(directory, "output"), capabilities, apiKey: "test-key", fetchImpl: async () => { calls += 1; return new Response("{}"); }, collectionPolicy: enabledCollectionPolicy }), /requires explicit --allow-estimated-budget/);
    assert.equal(calls, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
