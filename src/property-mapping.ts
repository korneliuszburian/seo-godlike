export interface PropertyMappingCandidate {
  candidate_id: string;
  discovered_property_id: string;
  normalized_host: string | null;
  client_id: null;
  canonical_property_id: null;
  aliases: string[];
  ahrefs_target: null;
  ahrefs_country: null;
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
      canonical_property_id: null,
      aliases: [],
      ahrefs_target: null,
      ahrefs_country: null,
      status: "needs_operator_mapping",
    })),
  };
}
