import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertAgencyReadOnlyPolicy, executeAgencyTasks, writeAgencyRunRecord } from "./agency-run.js";

test("agency executor continues after one provider failure and preserves blockers", async () => {
  const completed: string[] = [];
  const result = await executeAgencyTasks([
    { id: "gsc:bodymove", status: "ready", run: async () => { completed.push("gsc"); } },
    { id: "ahrefs:bodymove", status: "ready", run: async () => { throw new Error("401 Unauthorized"); } },
    { id: "localo:bodymove", status: "blocked", reason: "managed profile unavailable" },
    { id: "ga4:bodymove", status: "ready", run: async () => { completed.push("ga4"); } },
  ]);
  assert.deepEqual(completed, ["gsc", "ga4"]);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.blocked, [{ id: "localo:bodymove", reason: "managed profile unavailable" }]);
  assert.deepEqual(result.failed, [{ id: "ahrefs:bodymove", error: "401 Unauthorized" }]);
  assert.deepEqual(result.trace.map((event) => [event.event, event.task_id, event.detail]), [
    ["task_succeeded", "gsc:bodymove", "completed"],
    ["task_failed", "ahrefs:bodymove", "401 Unauthorized"],
    ["task_blocked", "localo:bodymove", "managed profile unavailable"],
    ["task_succeeded", "ga4:bodymove", "completed"],
  ]);
});

test("agency run record persists the read-only approval boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-agency-run-test-"));
  const result = await executeAgencyTasks([]);
  await writeAgencyRunRecord(root, { schema_version: "1", run_id: "run-1", started_at: "2026-07-29T00:00:00.000Z", finished_at: "2026-07-29T00:00:01.000Z", policy_mode: "read_only", approval_boundary: "no_external_write_operations", retention_mode: "operator_managed", deletion_authority: "operator_only", result });
  const record = JSON.parse(await readFile(join(root, "agency-run.json"), "utf8"));
  assert.equal(record.approval_boundary, "no_external_write_operations");
  assert.equal(record.retention_mode, "operator_managed");
  assert.equal(record.deletion_authority, "operator_only");
  assert.throws(() => assertAgencyReadOnlyPolicy({ policy_mode: "write" as "read_only", approval_boundary: "no_external_write_operations", retention_mode: "operator_managed", deletion_authority: "operator_only" }), /read_only/);
  await rm(root, { recursive: true, force: true });
});

test("agency executor preserves identity across multiple clients and properties", async () => {
  const result = await executeAgencyTasks([
    { id: "bodymove:google-search-console:sc-domain:bodymove.pl", status: "ready", run: async () => {} },
    { id: "bodymove:ahrefs:bodymove.pl", status: "ready", run: async () => {} },
    { id: "acme:google-search-console:sc-domain:acme.example", status: "ready", run: async () => {} },
  ]);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.completed, [
    "bodymove:google-search-console:sc-domain:bodymove.pl",
    "bodymove:ahrefs:bodymove.pl",
    "acme:google-search-console:sc-domain:acme.example",
  ]);
});
