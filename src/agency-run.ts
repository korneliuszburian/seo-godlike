export interface AgencyTask {
  id: string;
  status: "ready" | "blocked";
  reason?: string | null;
  run?: () => Promise<void>;
}

export interface AgencyRunResult {
  status: "ready" | "partial" | "blocked";
  completed: string[];
  blocked: Array<{ id: string; reason: string }>;
  failed: Array<{ id: string; error: string }>;
  trace: AgencyTraceEvent[];
}

export interface AgencyTraceEvent {
  event: "task_blocked" | "task_succeeded" | "task_failed";
  task_id: string;
  occurred_at: string;
  detail: string;
}

export interface AgencyRunRecord {
  schema_version: "1";
  run_id: string;
  started_at: string;
  finished_at: string;
  policy_mode: "read_only";
  approval_boundary: "no_external_write_operations";
  retention_mode: "operator_managed";
  deletion_authority: "operator_only";
  result: AgencyRunResult;
}

export function assertAgencyReadOnlyPolicy(record: Pick<AgencyRunRecord, "policy_mode" | "approval_boundary" | "retention_mode" | "deletion_authority">): void {
  if (record.policy_mode !== "read_only") throw new Error("agency policy must be read_only");
  if (record.approval_boundary !== "no_external_write_operations") throw new Error("agency approval boundary forbids external writes");
  if (record.retention_mode !== "operator_managed") throw new Error("agency retention must remain operator_managed");
  if (record.deletion_authority !== "operator_only") throw new Error("agency deletion authority must remain operator_only");
}

export async function executeAgencyTasks(tasks: AgencyTask[]): Promise<AgencyRunResult> {
  const completed: string[] = [];
  const blocked: Array<{ id: string; reason: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];
  const trace: AgencyTraceEvent[] = [];
  for (const task of tasks) {
    if (task.status === "blocked") {
      const reason = task.reason ?? "task is blocked";
      blocked.push({ id: task.id, reason });
      trace.push({ event: "task_blocked", task_id: task.id, occurred_at: new Date().toISOString(), detail: reason });
      continue;
    }
    if (!task.run) {
      const error = "ready task has no executor";
      failed.push({ id: task.id, error });
      trace.push({ event: "task_failed", task_id: task.id, occurred_at: new Date().toISOString(), detail: error });
      continue;
    }
    try {
      await task.run();
      completed.push(task.id);
      trace.push({ event: "task_succeeded", task_id: task.id, occurred_at: new Date().toISOString(), detail: "completed" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ id: task.id, error: message });
      trace.push({ event: "task_failed", task_id: task.id, occurred_at: new Date().toISOString(), detail: message });
    }
  }
  return { status: completed.length === 0 ? "blocked" : blocked.length > 0 || failed.length > 0 ? "partial" : "ready", completed, blocked, failed, trace };
}

export async function writeAgencyRunRecord(outputDir: string, record: AgencyRunRecord): Promise<void> {
  assertAgencyReadOnlyPolicy(record);
  await writeFile(join(outputDir, "agency-run.json"), canonicalJson(record), { encoding: "utf8", flag: "wx" });
}
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson } from "./serialize.js";
