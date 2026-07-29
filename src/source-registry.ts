import { ClientRegistry, ExternalProvider, SourceRegistry } from "./domain.js";

const SUPPORTED_EXTERNAL_PROVIDERS = new Set<ExternalProvider>(["localo", "google-analytics"]);

export function validateSourceRegistry(registry: SourceRegistry, clients: ClientRegistry): void {
  if (!registry || !Array.isArray(registry.sources)) throw new Error("invalid source registry");
  const seen = new Set<string>();
  for (const source of registry.sources) {
    if (!source.source_id || seen.has(source.source_id)) throw new Error(`duplicate or empty source_id '${source.source_id}'`);
    if (!SUPPORTED_EXTERNAL_PROVIDERS.has(source.provider)) throw new Error(`unsupported external provider '${source.provider}'`);
    if (!source.client_id) throw new Error(`source '${source.source_id}' must declare client_id`);
    if (source.status === "ready" && !source.target) throw new Error(`ready source '${source.source_id}' must declare target`);
    if (source.status === "ready" && source.provider === "google-analytics" && !/^properties\/[1-9]\d*$/.test(source.target ?? "")) throw new Error(`ready source '${source.source_id}' must declare a numeric GA4 property target`);
    if (source.status === "ready" && source.provider === "localo" && !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(source.target ?? "")) throw new Error(`ready source '${source.source_id}' must declare a domain target`);
    if (!clients.clients.some((client) => client.client_id === source.client_id)) throw new Error(`source '${source.source_id}' references unknown client '${source.client_id}'`);
    seen.add(source.source_id);
  }
}
