import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { writeAhrefsKeywordResearch } from "./ahrefs-keywords.js";
import { writeRankMonitoringBundle } from "./rank-monitoring.js";
import { canonicalJson, sha256 } from "./serialize.js";

const execFileAsync = promisify(execFile);

test("dashboard delivery root fails closed when no verified recurring delivery exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-cli-dashboard-root-"));
  try {
    await assert.rejects(
      execFileAsync(process.execPath, ["dist/cli.js", "--serve-dashboard", "--delivery-root", root], { cwd: process.cwd() }),
      /no verified client delivery found/,
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("dashboard requires exactly one explicit delivery selector", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "dist/cli.js", "--serve-dashboard", "--delivery", "delivery", "--delivery-root", "deliveries",
    ], { cwd: process.cwd() }),
    /requires exactly one of --delivery or --delivery-root/,
  );
});

test("dashboard CLI serves the newest verified recurring delivery", { timeout: 10_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-cli-dashboard-success-"));
  const delivery = join(root, "client-delivery-20260806T030000");
  const reportHtml = "<!doctype html><html><body>verified recurring report</body></html>";
  await mkdir(join(delivery, "bodymove"), { recursive: true });
  await writeFile(join(delivery, "bodymove", "report.html"), reportHtml);
  await writeFile(join(delivery, "manifest.json"), JSON.stringify({
    schema_version: "1",
    source: "agency-report.json",
    execution: { provider_calls: 0 },
    files: { "bodymove/report.html": { sha256: sha256(reportHtml), bytes: Buffer.byteLength(reportHtml) } },
    units: [{ id: "bodymove", kind: "client", html: "bodymove/report.html", pdf: null, email: "bodymove/report.eml" }],
  }));
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolveClose, rejectClose) => probe.close((error) => error ? rejectClose(error) : resolveClose()));
  const child = spawn(process.execPath, ["dist/cli.js", "--serve-dashboard", "--delivery-root", root, "--port", String(port)], { cwd: process.cwd() });
  try {
    const [stdout] = await once(child.stdout, "data") as [Buffer];
    const ready = JSON.parse(stdout.toString("utf8")) as { url: string; delivery_selection: string; delivery_dir: string };
    assert.equal(ready.delivery_selection, "latest_verified");
    assert.equal(ready.delivery_dir, delivery);
    const response = await fetch(ready.url);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Bodymove — SEO intelligence/);
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await once(child, "exit");
    await rm(root, { recursive: true, force: true });
  }
});

test("daily schedule fails closed without an OAuth client path", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ["dist/cli.js", "--schedule"], { cwd: process.cwd() }),
    /--schedule requires --oauth-client for daily analytics schedule/,
  );
});

test("CLI packs a normalized SERPROBOT CSV without provider IO", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-cli-rank-csv-"));
  try {
    const input = join(root, "rank.csv");
    const output = join(root, "bundle");
    await writeFile(input, "keyword,position,previous_position\nrehabilitacja,7,9\n");
    const result = await execFileAsync(process.execPath, [
      "dist/cli.js", "--pack-rank-monitoring-csv", "--input", input, "--output", output,
      "--client-id", "bodymove", "--project-id", "123", "--captured-at", "2026-08-04T10:00:00.000Z",
      "--date-start", "2026-07-01", "--date-end", "2026-07-31", "--search-engine", "google.pl",
    ], { cwd: process.cwd() });
    assert.match(result.stdout, /"client_id": "bodymove"/);
    assert.match(await readFile(join(output, "manifest.json"), "utf8"), /report\.json/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CLI packs operator actions CSV without provider IO", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-cli-content-csv-"));
  try {
    const input = join(root, "actions.csv");
    const output = join(root, "bundle");
    await writeFile(input, "period_start,period_end,type,status,title\n2026-07-01,2026-07-31,nap_listing,published,Wizytówka NAP\n");
    const result = await execFileAsync(process.execPath, ["dist/cli.js", "--pack-client-content-csv", "--input", input, "--output", output, "--client-id", "bodymove"], { cwd: process.cwd() });
    assert.match(result.stdout, /\"actions\": 1/);
    assert.match(await readFile(join(output, "manifest.json"), "utf8"), /normalized_csv/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CLI atomically onboards a source batch", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-cli-source-batch-"));
  try {
    const registryPath = join(root, "client-registry.json");
    const sourcePath = join(root, "source-registry.json");
    const intakePath = join(root, "source-intake.json");
    await writeFile(registryPath, JSON.stringify({ clients: [{ client_id: "bodymove", properties: [] }] }));
    await writeFile(sourcePath, JSON.stringify({ sources: [] }));
    await writeFile(intakePath, JSON.stringify({ sources: [
      { source_id: "ga4.bodymove", client_id: "bodymove", provider: "google-analytics", target: "properties/123456789", status: "ready" },
      { source_id: "serprobot.bodymove", client_id: "bodymove", provider: "serprobot", target: "123456", status: "ready", search_engine: "google.pl", location: "Warszawa", device: "desktop" },
    ] }));
    const result = await execFileAsync(process.execPath, ["dist/cli.js", "--add-sources", intakePath, "--source-registry", sourcePath, "--registry", registryPath], { cwd: process.cwd() });
    assert.match(result.stdout, /ga4\.bodymove/);
    const persisted = JSON.parse(await readFile(sourcePath, "utf8")) as { sources: Array<{ source_id: string }> };
    assert.deepEqual(persisted.sources.map((source) => source.source_id), ["ga4.bodymove", "serprobot.bodymove"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CLI rejects a mixed source batch without mutating the source registry", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-cli-source-batch-invalid-"));
  try {
    const registryPath = join(root, "client-registry.json");
    const sourcePath = join(root, "source-registry.json");
    const intakePath = join(root, "source-intake.json");
    await writeFile(registryPath, JSON.stringify({ clients: [{ client_id: "bodymove", properties: [] }] }));
    const original = JSON.stringify({ sources: [] });
    await writeFile(sourcePath, original);
    await writeFile(intakePath, JSON.stringify({ sources: [
      { source_id: "ga4.bodymove", client_id: "bodymove", provider: "google-analytics", target: "properties/123456789", status: "ready" },
      { source_id: "serprobot.bodymove", client_id: "bodymove", provider: "serprobot", target: "not-a-project", status: "ready" },
    ] }));
    await assert.rejects(execFileAsync(process.execPath, ["dist/cli.js", "--add-sources", intakePath, "--source-registry", sourcePath, "--registry", registryPath], { cwd: process.cwd() }), /numeric SERPROBOT project target/);
    assert.equal(await readFile(sourcePath, "utf8"), original);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CLI applies a confirmed property mapping atomically without provider IO", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-cli-property-mapping-"));
  try {
    const registryPath = join(root, "client-registry.json");
    const templatePath = join(root, "mapping.json");
    await writeFile(registryPath, JSON.stringify({ clients: [{ client_id: "bodymove", properties: [] }] }));
    await writeFile(templatePath, JSON.stringify({
      schema_version: "1", provider: "google-search-console", source: "operator-confirmed-discovery",
      generated_at: "2026-08-04T00:00:00.000Z", ownership_inferred: false,
      candidates: [{ candidate_id: "gsc-001", discovered_property_id: "sc-domain:bodymove.pl", normalized_host: "bodymove.pl", client_id: "bodymove", client_display_name: "Bodymove", canonical_property_id: "sc-domain:bodymove.pl", aliases: ["https://bodymove.pl/"], ahrefs_target: "bodymove.pl", ahrefs_country: "pl", status: "needs_operator_mapping" }],
    }));
    await execFileAsync(process.execPath, ["dist/cli.js", "--apply-property-mapping", "--input", templatePath, "--registry", registryPath], { cwd: process.cwd() });
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as { clients: Array<{ properties: Array<{ property_id: string; provider: string; aliases?: string[] }> }> };
    assert.deepEqual(registry.clients[0]?.properties.map((property) => property.property_id), ["bodymove.pl", "sc-domain:bodymove.pl"]);
    assert.deepEqual(registry.clients[0]?.properties[1]?.aliases, ["https://bodymove.pl/"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("agency-run rejects malformed keyword budget before creating output or running tasks", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-cli-budget-"));
  const output = join(root, "run");
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        "dist/cli.js", "--agency-run",
        "--registry", "fixtures/client-registry.json",
        "--capabilities", "fixtures/capability-registry.json",
        "--oauth-client", "/operator-only/oauth-client.json",
        "--output", output,
        "--keyword-input", "fixtures/keywords.txt",
        "--keyword-research",
        "--keyword-max-requests", "not-a-number",
      ], { cwd: process.cwd() }),
      /--keyword-max-requests must be a positive integer/,
    );
    await assert.rejects(access(output));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agency-run rejects a mismatched existing keyword bundle before creating output or running tasks", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-cli-keyword-provenance-"));
  const output = join(root, "run");
  const originalInput = join(root, "original-phrases.txt");
  const mismatchedInput = join(root, "current-phrases.txt");
  const keywordBundle = join(root, "keyword-bundle");
  try {
    await writeFile(originalInput, "https://example.test/\noriginal phrase\n");
    await writeFile(mismatchedInput, "https://example.test/\ncurrent phrase\n");
    await writeAhrefsKeywordResearch({
      inputPath: originalInput,
      outputDir: keywordBundle,
      capabilities: { capabilities: [{ capability_id: "ahrefs.keywords-explorer.overview", provider: "ahrefs", operation_id: "keywords-explorer.overview", api_version: "v3", metric_ids: ["ahrefs.keyword_metrics"], read_write: "read", state: "schema_verified" }] },
      apiKey: "test-key",
      allowEstimatedBudget: true,
      fetchImpl: async () => new Response(JSON.stringify({ keywords: [{ keyword: "original phrase" }] }), { status: 200 }),
    });
    await assert.rejects(
      execFileAsync(process.execPath, [
        "dist/cli.js", "--agency-run",
        "--registry", "fixtures/client-registry.json",
        "--capabilities", "fixtures/capability-registry.json",
        "--output", output,
        "--artifacts-dir", root,
        "--keyword-bundle", keywordBundle,
        "--keyword-input", mismatchedInput,
      ], { cwd: process.cwd() }),
      /keyword input hash does not match bundle/,
    );
    await assert.rejects(access(output));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agency-report rejects a mismatched keyword bundle before creating output", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-cli-report-keyword-provenance-"));
  const output = join(root, "report");
  const originalInput = join(root, "original-phrases.txt");
  const mismatchedInput = join(root, "current-phrases.txt");
  const keywordBundle = join(root, "keyword-bundle");
  try {
    await writeFile(originalInput, "https://example.test/\noriginal phrase\n");
    await writeFile(mismatchedInput, "https://example.test/\ncurrent phrase\n");
    await writeAhrefsKeywordResearch({
      inputPath: originalInput,
      outputDir: keywordBundle,
      capabilities: { capabilities: [{ capability_id: "ahrefs.keywords-explorer.overview", provider: "ahrefs", operation_id: "keywords-explorer.overview", api_version: "v3", metric_ids: ["ahrefs.keyword_metrics"], read_write: "read", state: "schema_verified" }] },
      apiKey: "test-key",
      allowEstimatedBudget: true,
      fetchImpl: async () => new Response(JSON.stringify({ keywords: [{ keyword: "original phrase" }] }), { status: 200 }),
    });
    await assert.rejects(
      execFileAsync(process.execPath, [
        "dist/cli.js", "--agency-report",
        "--registry", "fixtures/client-registry.json",
        "--capabilities", "fixtures/capability-registry.json",
        "--artifacts-dir", root,
        "--output", output,
        "--keyword-bundle", keywordBundle,
        "--keyword-input", mismatchedInput,
      ], { cwd: process.cwd() }),
      /keyword input hash does not match bundle/,
    );
    await assert.rejects(access(output));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agency-run rejects a tampered bundle before creating output when no input file is supplied", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-cli-keyword-tamper-"));
  const output = join(root, "run");
  const input = join(root, "phrases.txt");
  const keywordBundle = join(root, "keyword-bundle");
  try {
    await writeFile(input, "https://example.test/\noriginal phrase\n");
    await writeAhrefsKeywordResearch({
      inputPath: input,
      outputDir: keywordBundle,
      capabilities: { capabilities: [{ capability_id: "ahrefs.keywords-explorer.overview", provider: "ahrefs", operation_id: "keywords-explorer.overview", api_version: "v3", metric_ids: ["ahrefs.keyword_metrics"], read_write: "read", state: "schema_verified" }] },
      apiKey: "test-key",
      allowEstimatedBudget: true,
      fetchImpl: async () => new Response(JSON.stringify({ keywords: [{ keyword: "original phrase" }] }), { status: 200 }),
    });
    const requestPath = join(keywordBundle, "request.json");
    const request = JSON.parse(await readFile(requestPath, "utf8")) as { groups: unknown[] };
    const tamperedRequest = canonicalJson({ ...request, groups: [] });
    await writeFile(requestPath, tamperedRequest);
    const manifestPath = join(keywordBundle, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { files: Record<string, { sha256: string; bytes: number }> };
    manifest.files["request.json"] = { sha256: sha256(tamperedRequest), bytes: Buffer.byteLength(tamperedRequest) };
    await writeFile(manifestPath, canonicalJson(manifest));
    await assert.rejects(
      execFileAsync(process.execPath, [
        "dist/cli.js", "--agency-run",
        "--registry", "fixtures/client-registry.json",
        "--capabilities", "fixtures/capability-registry.json",
        "--artifacts-dir", root,
        "--output", output,
        "--keyword-bundle", keywordBundle,
      ], { cwd: process.cwd() }),
      /keyword request groups do not match supplied input/,
    );
    await assert.rejects(access(output));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agency-run explains the required root when reusing a keyword bundle without an artifacts root", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-cli-keyword-root-"));
  const output = join(root, "run");
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        "dist/cli.js", "--agency-run",
        "--registry", "fixtures/client-registry.json",
        "--capabilities", "fixtures/capability-registry.json",
        "--output", output,
        "--keyword-bundle", join(root, "keyword-bundle"),
        "--keyword-input", join(root, "phrases.txt"),
      ], { cwd: process.cwd() }),
      /--keyword-bundle-root or --artifacts-dir is required/,
    );
    await assert.rejects(access(output));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("standalone keyword research rejects malformed budget before output", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-cli-keywords-budget-"));
  const output = join(root, "keywords");
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        "dist/cli.js", "--ahrefs-keyword-research",
        "--input", "fixtures/keywords.txt",
        "--output", output,
        "--capabilities", "fixtures/capability-registry.json",
        "--max-api-units", "0",
      ], { cwd: process.cwd() }),
      /--max-api-units must be a positive integer/,
    );
    await assert.rejects(access(output));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("standalone client delivery rejects conflicting rank snapshot inputs before reading evidence", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "dist/cli.js", "--client-delivery",
      "--agency-report-json", "/operator-only/agency-report.json",
      "--artifacts-dir", "/operator-only/artifacts",
      "--output", "/operator-only/output",
      "--rank-monitoring", "/operator-only/rank.json",
      "--rank-monitoring-root", "/operator-only/rank-exports",
    ], { cwd: process.cwd() }),
    /--rank-monitoring and --rank-monitoring-root are mutually exclusive/,
  );
});

test("agency-run resolves a sibling rank root and reaches delivery without provider IO", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-cli-agency-rank-root-"));
  const artifacts = join(root, "artifacts");
  const output = join(artifacts, "agency-run");
  const report = join(root, "reports", "agency-report");
  const delivery = join(root, "delivery", "client-delivery");
    const rankRoot = join(artifacts, "rank-exports");
  try {
    await mkdir(artifacts, { recursive: true });
    await mkdir(join(root, "reports"), { recursive: true });
    await mkdir(join(root, "delivery"), { recursive: true });
    await mkdir(rankRoot, { recursive: true });
    await writeFile(join(root, "registry.json"), JSON.stringify({ clients: [{ client_id: "bodymove", display_name: "Bodymove", properties: [{ property_id: "https://bodymove.pl/", provider: "google-search-console", canonical_property: true }] }] }));
    await writeFile(join(root, "capabilities.json"), JSON.stringify({ capabilities: [] }));
    await writeFile(join(root, "source-registry.json"), JSON.stringify({ sources: [{ source_id: "serprobot.bodymove", client_id: "bodymove", provider: "serprobot", target: "123", status: "ready", reason: null }] }));
    const rankInput = join(root, "rank.json");
    await writeFile(rankInput, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: "2026-08-03T00:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, source_config: { project_id: "123", search_engine: "google.pl", location: null, device: null }, rows: [] }));
    await writeRankMonitoringBundle(rankInput, join(rankRoot, "latest"));

    const { stdout } = await execFileAsync(process.execPath, [
      "dist/cli.js", "--agency-run",
      "--registry", join(root, "registry.json"),
      "--capabilities", join(root, "capabilities.json"),
      "--source-registry", join(root, "source-registry.json"),
      "--artifacts-dir", artifacts,
      "--output", output,
      "--agency-report-output", report,
      "--delivery-output", delivery,
      "--rank-monitoring-root", rankRoot,
    ], { cwd: process.cwd() });
    const result = JSON.parse(stdout) as { delivery?: string; report_status?: string };
    assert.equal(result.report_status, "partial");
    assert.equal(result.delivery, delivery);
    await access(join(delivery, "bodymove", "bodymove-seo-report.html"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
