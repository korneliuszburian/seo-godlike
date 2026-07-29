import { Codex, Thread, ThreadOptions } from "@openai/codex-sdk";
import { ScopePlan, SourceRegistry } from "./domain.js";

export const CODEX_READ_ONLY_POLICY =
  "Use the local Codex authentication posture. Never use OPENAI_API_KEY or CODEX_API_KEY from the application environment.";

export interface CodexRuntimeOptions {
  workingDirectory: string;
  model?: string;
}

export interface CodexReadonlyRuntime {
  readonly threadOptions: ThreadOptions;
  startThread(): Thread;
  resumeThread(threadId: string): Thread;
}

function inheritedCodexEnvironment(): Record<string, string> {
  const allowed = [
    "HOME",
    "PATH",
    "TMPDIR",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
    "LANG",
    "LC_ALL",
    "TERM",
    "CI",
    "NO_COLOR",
  ];
  return Object.fromEntries(
    allowed
      .map((name) => [name, process.env[name]] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
  );
}

export function createCodexReadonlyRuntime(options: CodexRuntimeOptions): CodexReadonlyRuntime {
  const threadOptions: ThreadOptions = {
    workingDirectory: options.workingDirectory,
    sandboxMode: "read-only",
    approvalPolicy: "never",
    networkAccessEnabled: false,
    webSearchMode: "disabled",
    ...(options.model ? { model: options.model } : {}),
  };
  const codex = new Codex({ env: inheritedCodexEnvironment() });
  return {
    threadOptions,
    startThread: () => codex.startThread(threadOptions),
    resumeThread: (threadId) => codex.resumeThread(threadId, threadOptions),
  };
}

export function buildManagerPrompt(scope: ScopePlan, sourceRegistry: SourceRegistry = { sources: [] }): string {
  const sources = scope.entries.map((entry) => ({
    client_id: entry.client_id,
    provider: entry.provider,
    property_id: entry.property_id,
    status: entry.status,
    metric_ids: entry.metrics.map((metric) => metric.metric_id),
    reason: entry.reason,
  }));
  return [
    "You are the read-only manager for an agency SEO evidence run.",
    "Use only the supplied scope; do not invent providers, properties, metrics, permissions, or values.",
    "Do not modify files, call write operations, expose credentials, or claim a source without verified evidence.",
    "Return a concise execution checklist with ready, unavailable, and unsupported sources separated.",
    `Scope: ${JSON.stringify(sources)}`,
    `External sources: ${JSON.stringify(sourceRegistry.sources.map((source) => ({ source_id: source.source_id, client_id: source.client_id, provider: source.provider, target: source.target, status: source.status, reason: source.reason })))}`,
  ].join("\n");
}
