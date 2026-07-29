import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";
import { buildAgentRunPlan } from "./agent-plan.js";
import { ScopePlan } from "./domain.js";

const execFileAsync = promisify(execFile);

const scope: ScopePlan = {
  schema_version: "1",
  generated_at: "2026-07-29T00:00:00.000Z",
  status: "partial",
  entries: [
    { client_id: "bodymove", client_display_name: "Bodymove", property_id: "sc-domain:bodymove.pl", provider: "google-search-console", status: "ready", reason: null, metrics: [{ metric_id: "gsc.clicks", provider: "google-search-console", operation: "search_analytics.query", label: "Search clicks", unit: "count", dimensions: [], read_only: true }] },
    { client_id: "bodymove", client_display_name: "Bodymove", property_id: "properties/123456789", provider: "google-analytics", status: "unavailable", reason: "no read-only capability registered", metrics: [] },
  ],
};

test("manager plan creates specialist, verifier, composer and blocker tasks", () => {
  const plan = buildAgentRunPlan(scope, "run-1");
  assert.equal(plan.status, "partial");
  assert.deepEqual(plan.tasks.map((task) => task.task_id), [
    "manager:plan",
    "scope:bodymove:google-search-console:sc-domain%3Abodymove.pl",
    "scope:bodymove:google-analytics:properties%2F123456789",
    "evidence:verify",
    "report:compose",
  ]);
  assert.equal(plan.tasks[1].role, "gsc-specialist");
  assert.equal(plan.tasks[2].status, "blocked");
  assert.deepEqual(plan.tasks[3].depends_on, ["scope:bodymove:google-search-console:sc-domain%3Abodymove.pl"]);
  assert.deepEqual(plan.tasks[4].depends_on, ["evidence:verify", "scope:bodymove:google-analytics:properties%2F123456789"]);
});

test("agent plan CLI emits the manager handoff contract", async () => {
  const result = await execFileAsync(process.execPath, ["dist/cli.js", "--agent-plan", "--registry", "fixtures/client-registry.json", "--capabilities", "fixtures/capability-registry.json", "--run-id", "cli-run"], { cwd: process.cwd() });
  const plan = JSON.parse(result.stdout) as ReturnType<typeof buildAgentRunPlan>;
  assert.equal(plan.run_id, "cli-run");
  assert.equal(plan.orchestration, "manager-specialist-handoffs");
  assert.equal(plan.tasks.at(-1)?.task_id, "report:compose");
});
