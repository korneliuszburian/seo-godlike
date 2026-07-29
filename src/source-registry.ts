import { ExternalProvider, SourceRegistry } from "./domain.js";

export function validateSourceRegistry(registry: SourceRegistry): void {
  if (!registry || !Array.isArray(registry.sources)) throw new Error("invalid source registry");
  const seen = new Set<string>();
  for (const source of registry.sources) {
    if (!source.source_id || seen.has(source.source_id)) throw new Error(`duplicate or empty source_id '${source.source_id}'`);
    if (source.provider !== ("localo" satisfies ExternalProvider)) throw new Error(`unsupported external provider '${source.provider}'`);
    if (!source.client_id || !source.target) throw new Error(`source '${source.source_id}' must declare client_id and target`);
    seen.add(source.source_id);
  }
}
