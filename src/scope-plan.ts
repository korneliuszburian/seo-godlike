import { CapabilityRegistry, ClientRegistry, MetricDefinition, MetricId, Provider, ScopePlan, ScopePlanEntry } from "./domain.js";
import { validateClientRegistry } from "./registry.js";

const METRIC_CATALOG: Record<Provider, MetricDefinition[]> = {
  "google-search-console": [
    { metric_id: "gsc.clicks", provider: "google-search-console", operation: "search_analytics.query", label: "Search clicks", unit: "count", dimensions: ["query", "page", "country", "device"], read_only: true },
    { metric_id: "gsc.impressions", provider: "google-search-console", operation: "search_analytics.query", label: "Search impressions", unit: "count", dimensions: ["query", "page", "country", "device"], read_only: true },
    { metric_id: "gsc.ctr", provider: "google-search-console", operation: "search_analytics.query", label: "Search CTR", unit: "ratio", dimensions: ["query", "page", "country", "device"], read_only: true },
    { metric_id: "gsc.position", provider: "google-search-console", operation: "search_analytics.query", label: "Average search position", unit: "position", dimensions: ["query", "page", "country", "device"], read_only: true },
  ],
  "google-analytics": [
    { metric_id: "ga4.sessions", provider: "google-analytics", operation: "properties.runReport", label: "Sessions", unit: "count", dimensions: ["date"], read_only: true },
  ],
  ahrefs: [
    { metric_id: "ahrefs.org_traffic", provider: "ahrefs", operation: "site-explorer.metrics", label: "Estimated organic traffic", unit: "count", dimensions: [], read_only: true },
    { metric_id: "ahrefs.org_keywords", provider: "ahrefs", operation: "site-explorer.metrics", label: "Organic keywords", unit: "count", dimensions: [], read_only: true },
    { metric_id: "ahrefs.org_keywords_top_3", provider: "ahrefs", operation: "site-explorer.metrics", label: "Organic keywords in top 3", unit: "count", dimensions: [], read_only: true },
    { metric_id: "ahrefs.top_pages", provider: "ahrefs", operation: "site-explorer.profile", label: "Top organic pages", unit: "count", dimensions: ["url"], read_only: true },
    { metric_id: "ahrefs.org_keywords_detail", provider: "ahrefs", operation: "site-explorer.profile", label: "Organic keyword opportunities", unit: "count", dimensions: ["keyword", "country", "position"], read_only: true },
    { metric_id: "ahrefs.org_competitors", provider: "ahrefs", operation: "site-explorer.profile", label: "Organic competitors", unit: "count", dimensions: ["competitor_domain"], read_only: true },
  ],
};

export function metricCatalog(provider?: Provider): MetricDefinition[] {
  const definitions = provider ? METRIC_CATALOG[provider] : Object.values(METRIC_CATALOG).flat();
  return definitions.map((definition) => ({ ...definition, dimensions: [...definition.dimensions] }));
}

function supportedMetrics(provider: Provider, operation: string): MetricDefinition[] {
  return metricCatalog(provider).filter((definition) => definition.operation === operation);
}

export function validateCapabilityRegistry(capabilities: CapabilityRegistry): void {
  if (!capabilities || !Array.isArray(capabilities.capabilities)) throw new Error("invalid capability registry");
  const seen = new Set<string>();
  for (const capability of capabilities.capabilities) {
    if (!capability.capability_id || seen.has(capability.capability_id)) throw new Error(`duplicate or empty capability_id '${capability.capability_id}'`);
    seen.add(capability.capability_id);
    const catalog = supportedMetrics(capability.provider, capability.operation_id);
    if (capability.metric_ids?.some((metricId) => !catalog.some((definition) => definition.metric_id === metricId))) {
      throw new Error(`capability '${capability.capability_id}' declares a metric outside its provider operation`);
    }
    if (capability.dimensions?.some((dimension) => dimension.trim().length === 0)) throw new Error(`capability '${capability.capability_id}' declares an empty dimension`);
  }
}

function planEntry(clientId: string, displayName: string, propertyId: string, provider: Provider, capabilities: CapabilityRegistry): ScopePlanEntry {
  const capability = capabilities.capabilities.find((item) => item.provider === provider && supportedMetrics(provider, item.operation_id).length > 0);
  if (!capability) return { client_id: clientId, client_display_name: displayName, property_id: propertyId, provider, status: "unavailable", reason: `no read-only capability registered for provider '${provider}'`, metrics: [] };
  const catalogMetrics = supportedMetrics(provider, capability.operation_id);
  const metrics = capability.metric_ids
    ? catalogMetrics.filter((definition) => capability.metric_ids?.includes(definition.metric_id)).map((definition) => ({ ...definition, dimensions: capability.dimensions ?? definition.dimensions }))
    : catalogMetrics;
  if (metrics.length === 0) return { client_id: clientId, client_display_name: displayName, property_id: propertyId, provider, status: "unsupported", reason: `capability operation '${capability.operation_id}' has no catalog metrics`, metrics: [] };
  return { client_id: clientId, client_display_name: displayName, property_id: propertyId, provider, status: "ready", reason: null, metrics };
}

export function buildScopePlan(registry: ClientRegistry, capabilities: CapabilityRegistry, generatedAt = new Date().toISOString()): ScopePlan {
  validateClientRegistry(registry);
  validateCapabilityRegistry(capabilities);
  const entries = registry.clients.flatMap((client) => client.properties.map((property) => planEntry(client.client_id, client.display_name ?? client.client_id, property.property_id, property.provider, capabilities)));
  return { schema_version: "1", generated_at: generatedAt, status: entries.length === 0 ? "empty" : entries.every((entry) => entry.status === "ready") ? "ready" : "partial", entries };
}
