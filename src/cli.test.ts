import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

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
