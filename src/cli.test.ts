import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { writeAhrefsKeywordResearch } from "./ahrefs-keywords.js";

const execFileAsync = promisify(execFile);

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
    const { writeFile } = await import("node:fs/promises");
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
    const { writeFile } = await import("node:fs/promises");
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
