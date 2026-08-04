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
  operator_requirements: AgencyOperatorRequirement[];
  blockers: string[];
}

export interface AgencyOperatorRequirement {
  requirement_id: string;
  client_id: string | null;
  provider: string | null;
  target: string | null;
  status: "needs_operator_input";
  next_action: string;
}

function unavailableSourceAction(provider: string, reason: string | null): string {
  switch (provider) {
    case "google-analytics":
      return "Podaj numeryczne ID właściwości GA4 w formacie properties/<id> i potwierdź dostęp analytics.readonly.";
    case "localo":
      return "Potwierdź zarządzany profil Body Move w Localo oraz dostarcz bezpieczny dostęp read-only/MCP.";
    case "serprobot":
      return "Dostarcz eksport CSV/XLSX historii pozycji albo potwierdzony read-only endpoint API wraz z ID projektów.";
    case "semstorm":
      return "Potwierdź, czy źródłem jest Semstorm, i dostarcz eksport widoczności albo zatwierdzony dostęp API read-only.";
    default:
      return reason ?? "Dostarcz jawne, zweryfikowane źródło evidence read-only.";
  }
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
      .map((source) => `${source.client_id}:${source.provider}: --rank-monitoring, --rank-monitoring-root or --serprobot-api was not supplied`),
    ...sourceRegistry.sources
      .filter((source) => source.status === "ready" && source.provider !== "serprobot" && source.provider !== "google-analytics")
      .map((source) => `${source.client_id}:${source.provider}: no agency-run executor is available for this external source`),
    ...sourceRegistry.sources
      .filter((source) => source.status === "ready" && source.provider === "google-analytics" && !scopeEntries.some((entry) => entry.status === "ready" && entry.client_id === source.client_id && entry.provider === "google-analytics" && entry.property_id === source.target))
      .map((source) => `${source.client_id}:${source.provider}:${source.target ?? "unregistered"}: no matching ready GA4 scope entry is registered`),
  ];
  if (!inputs.oauth_client_supplied && scopeEntries.some((entry) => entry.status === "ready" && (entry.provider === "google-search-console" || entry.provider === "google-analytics"))) {
    blockers.push("Google sources are in scope but --oauth-client was not supplied; credential contents were not inspected");
  }
  if (scopeEntries.length === 0) blockers.push("no registered scope entries are available");
  const operatorRequirements: AgencyOperatorRequirement[] = [];
  const requirementKeys = new Set<string>();
  const addRequirement = (requirement: AgencyOperatorRequirement): void => {
    if (requirementKeys.has(requirement.requirement_id)) return;
    requirementKeys.add(requirement.requirement_id);
    operatorRequirements.push(requirement);
  };
  for (const entry of unavailableScope) {
    addRequirement({ requirement_id: `scope:${entry.client_id}:${entry.provider}:${entry.property_id}`, client_id: entry.client_id, provider: entry.provider, target: entry.property_id, status: "needs_operator_input", next_action: entry.reason ?? "Potwierdź właściwość i capability read-only dla tego klienta." });
  }
  for (const source of unavailableSources) {
    addRequirement({ requirement_id: `source:${source.source_id}`, client_id: source.client_id, provider: source.provider, target: source.target, status: "needs_operator_input", next_action: unavailableSourceAction(source.provider, source.reason) });
  }
  for (const source of sourceRegistry.sources.filter((item) => item.status === "ready")) {
    if (source.provider === "serprobot" && !inputs.rank_monitoring_supplied) {
      addRequirement({ requirement_id: `input:${source.source_id}:rank-monitoring`, client_id: source.client_id, provider: source.provider, target: source.target, status: "needs_operator_input", next_action: "Dostarcz --rank-monitoring, --rank-monitoring-root albo jawnie potwierdzony endpoint API." });
    }
    if (source.provider !== "serprobot" && source.provider !== "google-analytics") {
      addRequirement({ requirement_id: `executor:${source.source_id}`, client_id: source.client_id, provider: source.provider, target: source.target, status: "needs_operator_input", next_action: "Dostarcz manifest-bound export tego źródła albo zatwierdź osobny executor read-only." });
    }
    if (source.provider === "google-analytics" && !scopeEntries.some((entry) => entry.status === "ready" && entry.client_id === source.client_id && entry.provider === "google-analytics" && entry.property_id === source.target)) {
      addRequirement({ requirement_id: `scope-match:${source.source_id}`, client_id: source.client_id, provider: source.provider, target: source.target, status: "needs_operator_input", next_action: "Zarejestruj tę samą numeryczną właściwość GA4 w scope klienta." });
    }
  }
  if (!inputs.oauth_client_supplied && scopeEntries.some((entry) => entry.status === "ready" && (entry.provider === "google-search-console" || entry.provider === "google-analytics"))) {
    addRequirement({ requirement_id: "input:google:oauth-client", client_id: null, provider: "google", target: null, status: "needs_operator_input", next_action: "Dostarcz referencję do bezpiecznego OAuth client/token posture; readiness nie odczytuje sekretu." });
  }
  if (!inputs.client_content_supplied) {
    for (const clientId of [...new Set(scopeEntries.map((entry) => entry.client_id).concat(sourceRegistry.sources.map((source) => source.client_id)))].sort()) {
      addRequirement({ requirement_id: `input:${clientId}:client-content`, client_id: clientId, provider: null, target: null, status: "needs_operator_input", next_action: "Dostarcz operator-managed rejestr działań SEO, kontakt i słownik pojęć dla raportu klientowego." });
    }
  }
  if (scopeEntries.length === 0) {
    addRequirement({ requirement_id: "scope:registry", client_id: null, provider: null, target: null, status: "needs_operator_input", next_action: "Dodaj co najmniej jedną jawnie autoryzowaną właściwość klienta." });
  }
  operatorRequirements.sort((left, right) => left.requirement_id.localeCompare(right.requirement_id));
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
    operator_requirements: operatorRequirements,
    blockers,
  };
}
