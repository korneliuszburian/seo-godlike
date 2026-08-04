import { ClientRegistry } from "./domain.js";

export interface PropertyMappingCandidate {
  candidate_id: string;
  discovered_property_id: string;
  normalized_host: string | null;
  client_id: string | null;
  client_display_name: string | null;
  canonical_property_id: string | null;
  aliases: string[];
  ahrefs_target: string | null;
  ahrefs_country: string | null;
  status: "needs_operator_mapping";
}

export interface PropertyMappingTemplate {
  schema_version: "1";
  provider: "google-search-console";
  source: "operator-confirmed-discovery";
  generated_at: string;
  ownership_inferred: false;
  candidates: PropertyMappingCandidate[];
}

function normalizeHost(propertyId: string): string | null {
  if (propertyId.startsWith("sc-domain:")) {
    const host = propertyId.slice("sc-domain:".length).toLowerCase().replace(/\.+$/, "");
    return host || null;
  }
  try {
    const url = new URL(propertyId);
    return url.hostname.toLowerCase().replace(/\.+$/, "") || null;
  } catch {
    return null;
  }
}

export function buildPropertyMappingTemplate(
  discoveredPropertyIds: readonly string[],
  generatedAt = new Date().toISOString(),
): PropertyMappingTemplate {
  const unique = [...new Set(discoveredPropertyIds)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (unique.some((propertyId) => !propertyId || /\s/.test(propertyId))) throw new Error("discovery property ids must be non-empty strings without whitespace");
  return {
    schema_version: "1",
    provider: "google-search-console",
    source: "operator-confirmed-discovery",
    generated_at: generatedAt,
    ownership_inferred: false,
    candidates: unique.map((propertyId, index) => ({
      candidate_id: `gsc-${String(index + 1).padStart(3, "0")}`,
      discovered_property_id: propertyId,
      normalized_host: normalizeHost(propertyId),
      client_id: null,
      client_display_name: null,
      canonical_property_id: null,
      aliases: [],
      ahrefs_target: null,
      ahrefs_country: null,
      status: "needs_operator_mapping",
    })),
  };
}

export function materializePropertyMapping(template: PropertyMappingTemplate): ClientRegistry["clients"] {
  if (template.schema_version !== "1" || template.provider !== "google-search-console" || template.ownership_inferred !== false || !Array.isArray(template.candidates) || template.candidates.length === 0) {
    throw new Error("property mapping template schema is invalid");
  }
  const clients = new Map<string, { client_id: string; display_name?: string; properties: ClientRegistry["clients"][number]["properties"] }>();
  for (const candidate of template.candidates) {
    if (!candidate || typeof candidate !== "object" || typeof candidate.candidate_id !== "string" || typeof candidate.discovered_property_id !== "string" || typeof candidate.client_id !== "string" || !candidate.client_id || typeof candidate.canonical_property_id !== "string" || !candidate.canonical_property_id || !Array.isArray(candidate.aliases) || candidate.aliases.some((alias) => typeof alias !== "string")) {
      throw new Error("property mapping candidate requires confirmed client_id, canonical_property_id and aliases");
    }
    if (candidate.client_display_name !== null && typeof candidate.client_display_name !== "string") throw new Error(`property mapping candidate '${candidate.candidate_id}' has invalid client_display_name`);
    if (candidate.ahrefs_target !== null && (typeof candidate.ahrefs_target !== "string" || !candidate.ahrefs_target || typeof candidate.ahrefs_country !== "string" || !/^[a-z]{2}$/.test(candidate.ahrefs_country))) throw new Error(`property mapping candidate '${candidate.candidate_id}' requires a valid Ahrefs target and country`);
    const client = clients.get(candidate.client_id) ?? { client_id: candidate.client_id, properties: [] };
    if (candidate.client_display_name !== null) {
      if (client.display_name !== undefined && client.display_name !== candidate.client_display_name) throw new Error(`property mapping has conflicting display names for client '${candidate.client_id}'`);
      client.display_name = candidate.client_display_name;
    }
    const aliases = [...new Set([candidate.discovered_property_id, ...candidate.aliases].filter((alias) => alias !== candidate.canonical_property_id))];
    const existingGsc = client.properties.find((property) => property.provider === "google-search-console" && property.property_id === candidate.canonical_property_id);
    if (existingGsc) existingGsc.aliases = [...new Set([...(existingGsc.aliases ?? []), ...aliases])].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    else client.properties.push({ property_id: candidate.canonical_property_id, provider: "google-search-console", canonical_property: true, ...(aliases.length ? { aliases: aliases.sort((left, right) => left < right ? -1 : left > right ? 1 : 0) } : {}) });
    if (candidate.ahrefs_target !== null) {
      const existingAhrefs = client.properties.find((property) => property.provider === "ahrefs" && property.property_id === candidate.ahrefs_target);
      if (existingAhrefs && existingAhrefs.country !== candidate.ahrefs_country) throw new Error(`property mapping has conflicting Ahrefs countries for '${candidate.ahrefs_target}'`);
      if (!existingAhrefs) client.properties.push({ property_id: candidate.ahrefs_target, provider: "ahrefs", canonical_property: true, country: candidate.ahrefs_country! });
    }
    clients.set(candidate.client_id, client);
  }
  return [...clients.values()].sort((left, right) => left.client_id < right.client_id ? -1 : left.client_id > right.client_id ? 1 : 0).map((client) => ({ ...client, properties: client.properties.sort((left, right) => left.provider.localeCompare(right.provider) || (left.property_id < right.property_id ? -1 : left.property_id > right.property_id ? 1 : 0)) }));
}
