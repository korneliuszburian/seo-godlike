import { ClientRegistry, ExternalProvider, SourceRegistry } from "./domain.js";

export function validateSourceRegistry(registry: SourceRegistry, clients?: ClientRegistry): void {
  if (!registry || !Array.isArray(registry.sources)) throw new Error("invalid source registry");
  const seen = new Set<string>();
  for (const source of registry.sources) {
    if (!source.source_id || seen.has(source.source_id)) throw new Error(`duplicate or empty source_id '${source.source_id}'`);
    if (source.provider !== ("localo" satisfies ExternalProvider) && source.provider !== ("google-analytics" satisfies ExternalProvider)) throw new Error(`unsupported external provider '${source.provider}'`);
    if (!source.client_id) throw new Error(`source '${source.source_id}' must declare client_id`);
    if (source.status === "ready" && !source.target) throw new Error(`ready source '${source.source_id}' must declare target`);
    if (clients && !clients.clients.some((client) => client.client_id === source.client_id)) throw new Error(`source '${source.source_id}' references unknown client '${source.client_id}'`);
    seen.add(source.source_id);
  }
}
