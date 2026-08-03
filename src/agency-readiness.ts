import { ScopePlan, SourceRegistry } from "./domain.js";

export interface AgencyReadinessInputs {
  oauth_client_supplied: boolean;
  keyword_input_supplied: boolean;
  rank_monitoring_supplied: boolean;
  client_content_supplied: boolean;
}

export interface AgencyReadiness {
  schema_version: "1";
  generated_at: string;
  status: "ready" | "partial" | "blocked";
  policy_mode: "read_only";
  credential_posture: "not_inspected";
  scope: {
    status: ScopePlan["status"];
    total_entries: number;
    ready_entries: number;
    unavailable_entries: number;
    entries: Array<{
      client_id: string;
      property_id: string;
      provider: string;
      status: string;
      reason: string | null;
    }>;
  };
  sources: Array<{
    source_id: string;
    client_id: string;
    provider: string;
    target: string | null;
    status: "ready" | "unavailable";
    reason: string | null;
  }>;
  inputs: AgencyReadinessInputs;
  blockers: string[];
}

export function buildAgencyReadiness(
  scope: ScopePlan,
  sourceRegistry: SourceRegistry,
  inputs: AgencyReadinessInputs,
  generatedAt = new Date().toISOString(),
): AgencyReadiness {
  const scopeEntries = scope.entries.map((entry) => ({
    client_id: entry.client_id,
    property_id: entry.property_id,
    provider: entry.provider,
    status: entry.status,
    reason: entry.reason,
  }));
  const unavailableScope = scopeEntries.filter((entry) => entry.status !== "ready");
  const unavailableSources = sourceRegistry.sources.filter((source) => source.status !== "ready");
  const blockers = [
    ...unavailableScope.map((entry) => `${entry.client_id}:${entry.provider}:${entry.property_id}: ${entry.reason ?? "scope entry unavailable"}`),
    ...unavailableSources.map((source) => `${source.client_id}:${source.provider}: ${source.reason ?? "source unavailable"}`),
    ...sourceRegistry.sources
      .filter((source) => source.status === "ready" && source.provider === "serprobot" && !inputs.rank_monitoring_supplied)
      .map((source) => `${source.client_id}:${source.provider}: --rank-monitoring or --rank-monitoring-root was not supplied`),
    ...sourceRegistry.sources
      .filter((source) => source.status === "ready" && source.provider !== "serprobot")
      .map((source) => `${source.client_id}:${source.provider}: no agency-run executor is available for this external source`),
  ];
  if (!inputs.oauth_client_supplied && scopeEntries.some((entry) => entry.status === "ready" && (entry.provider === "google-search-console" || entry.provider === "google-analytics"))) {
    blockers.push("Google sources are in scope but --oauth-client was not supplied; credential contents were not inspected");
  }
  if (scopeEntries.length === 0) blockers.push("no registered scope entries are available");
  const status = scopeEntries.length === 0 || scopeEntries.every((entry) => entry.status !== "ready")
    ? "blocked"
    : blockers.length > 0
      ? "partial"
      : "ready";
  return {
    schema_version: "1",
    generated_at: generatedAt,
    status,
    policy_mode: "read_only",
    credential_posture: "not_inspected",
    scope: {
      status: scope.status,
      total_entries: scopeEntries.length,
      ready_entries: scopeEntries.length - unavailableScope.length,
      unavailable_entries: unavailableScope.length,
      entries: scopeEntries,
    },
    sources: sourceRegistry.sources.map((source) => ({
      source_id: source.source_id,
      client_id: source.client_id,
      provider: source.provider,
      target: source.target,
      status: source.status,
      reason: source.reason,
    })),
    inputs: { ...inputs },
    blockers,
  };
}
