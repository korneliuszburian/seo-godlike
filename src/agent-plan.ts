import { ScopePlan, ScopePlanEntry, ScopeStatus } from "./domain.js";

export type AgentRole = "manager" | "gsc-specialist" | "ga4-specialist" | "ahrefs-specialist" | "localo-specialist" | "evidence-verifier" | "report-composer";
export type AgentTaskStatus = "planned" | "blocked";

export interface AgentTask {
  task_id: string;
  role: AgentRole;
  status: AgentTaskStatus;
  client_id: string;
  property_id: string | null;
  provider: ScopePlanEntry["provider"] | null;
  metric_ids: string[];
  depends_on: string[];
  reason: string | null;
  policy_mode: "read_only";
}

export interface AgentRunPlan {
  schema_version: "1";
  run_id: string;
  orchestration: "manager-specialist-handoffs";
  status: "ready" | "partial" | "blocked";
  tasks: AgentTask[];
}

function specialistRole(provider: ScopePlanEntry["provider"]): AgentRole {
  if (provider === "google-search-console") return "gsc-specialist";
  if (provider === "google-analytics") return "ga4-specialist";
  return "ahrefs-specialist";
}

function scopeTaskId(entry: ScopePlanEntry): string {
  return `scope:${entry.client_id}:${entry.provider}:${encodeURIComponent(entry.property_id)}`;
}

function taskForEntry(entry: ScopePlanEntry): AgentTask {
  const taskId = scopeTaskId(entry);
  return {
    task_id: taskId,
    role: entry.status === "ready" ? specialistRole(entry.provider) : "manager",
    status: entry.status === "ready" ? "planned" : "blocked",
    client_id: entry.client_id,
    property_id: entry.property_id,
    provider: entry.provider,
    metric_ids: entry.metrics.map((metric) => metric.metric_id),
    depends_on: [],
    reason: entry.reason,
    policy_mode: "read_only",
  };
}

export function buildAgentRunPlan(scope: ScopePlan, runId: string): AgentRunPlan {
  const scopeTasks = scope.entries.map(taskForEntry);
  const evidenceTaskId = "evidence:verify";
  const reportTaskId = "report:compose";
  const availableScopeTasks = scopeTasks.filter((task) => task.status === "planned").map((task) => task.task_id);
  const allScopeTasks = scopeTasks.map((task) => task.task_id);
  const tasks: AgentTask[] = [
    { task_id: "manager:plan", role: "manager", status: scope.status === "empty" ? "blocked" : "planned", client_id: "*", property_id: null, provider: null, metric_ids: [], depends_on: [], reason: scope.status === "empty" ? "scope plan has no registered properties" : null, policy_mode: "read_only" },
    ...scopeTasks.map((task) => ({ ...task, depends_on: ["manager:plan"] })),
    { task_id: evidenceTaskId, role: "evidence-verifier", status: availableScopeTasks.length > 0 ? "planned" : "blocked", client_id: "*", property_id: null, provider: null, metric_ids: [], depends_on: availableScopeTasks, reason: availableScopeTasks.length > 0 ? null : "no ready provider tasks produced evidence", policy_mode: "read_only" },
    { task_id: reportTaskId, role: "report-composer", status: allScopeTasks.length > 0 ? "planned" : "blocked", client_id: "*", property_id: null, provider: null, metric_ids: [], depends_on: [evidenceTaskId, ...scopeTasks.filter((task) => task.status === "blocked").map((task) => task.task_id)], reason: null, policy_mode: "read_only" },
  ];
  return { schema_version: "1", run_id: runId, orchestration: "manager-specialist-handoffs", status: scope.status === "empty" || availableScopeTasks.length === 0 ? "blocked" : scope.status === "ready" ? "ready" : "partial", tasks };
}
