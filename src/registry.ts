import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ClientRegistry, PolicyError, Provider } from "./domain.js";
import { canonicalJson } from "./serialize.js";

export interface RegisteredProperty {
  property_id: string;
  provider: Provider;
  canonical_property?: boolean;
  aliases?: string[];
}

export interface ResolvedProperty {
  property: RegisteredProperty;
  canonical_property_id: string;
}

function propertyFormat(propertyId: string): boolean {
  if (!propertyId || /\s/.test(propertyId)) return false;
  if (propertyId.startsWith("sc-domain:")) return propertyId.length > "sc-domain:".length;
  try {
    const url = new URL(propertyId);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function propertyEntries(registry: ClientRegistry, clientId: string): RegisteredProperty[] {
  const client = registry.clients.find((item) => item.client_id === clientId);
  if (!client) throw new PolicyError("scope", `scope: client '${clientId}' is not registered`);
  return client.properties;
}

export function validateClientRegistry(registry: ClientRegistry): void {
  if (!registry || !Array.isArray(registry.clients)) throw new PolicyError("schema", "schema: invalid client registry");
  for (const client of registry.clients) {
    if (!client.client_id || !Array.isArray(client.properties)) throw new PolicyError("schema", "schema: invalid client registry entry");
    const seen = new Set<string>();
    for (const property of client.properties) {
      if (!propertyFormat(property.property_id)) throw new PolicyError("schema", `schema: invalid property_id '${property.property_id}'`);
      if (property.canonical_property === false && (property.aliases?.length ?? 0) > 0) {
        throw new PolicyError("schema", `schema: aliases require canonical property '${property.property_id}'`);
      }
      const ids = [property.property_id, ...(property.aliases ?? [])];
      for (const id of ids) {
        if (!propertyFormat(id)) throw new PolicyError("schema", `schema: invalid property alias '${id}'`);
        if (seen.has(id)) throw new PolicyError("scope", `scope: duplicate property '${id}' for client '${client.client_id}'`);
        seen.add(id);
      }
    }
  }
}

export function resolveRegisteredProperty(
  registry: ClientRegistry,
  clientId: string,
  propertyId: string,
  provider: Provider,
): ResolvedProperty {
  const properties = propertyEntries(registry, clientId).filter((item) => item.provider === provider);
  const matches = properties.filter((item) => item.property_id === propertyId || item.aliases?.includes(propertyId));
  if (matches.length !== 1) {
    throw new PolicyError("scope", `scope: property '${propertyId}' is not registered for client '${clientId}'`);
  }
  const property = matches[0];
  return { property, canonical_property_id: property.property_id };
}

export interface AddPropertyInput {
  registryPath: string;
  clientId: string;
  propertyId: string;
  provider: Provider;
  canonicalProperty: boolean;
  aliases: string[];
}

export async function addProperty(input: AddPropertyInput): Promise<ClientRegistry> {
  if (!propertyFormat(input.propertyId)) throw new PolicyError("schema", `schema: invalid property_id '${input.propertyId}'`);
  if (!input.canonicalProperty && input.aliases.length > 0) {
    throw new PolicyError("schema", "schema: aliases require --canonical-property true");
  }
  for (const alias of input.aliases) {
    if (!propertyFormat(alias)) throw new PolicyError("schema", `schema: invalid property alias '${alias}'`);
  }
  const path = resolve(input.registryPath);
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  const registry = parsed as ClientRegistry;
  validateClientRegistry(registry);
  const client = registry.clients.find((item) => item.client_id === input.clientId);
  if (!client) throw new PolicyError("scope", `scope: client '${input.clientId}' is not registered`);
  const existingIds = new Set(client.properties.flatMap((property) => [property.property_id, ...(property.aliases ?? [])]));
  for (const id of [input.propertyId, ...input.aliases]) {
    if (existingIds.has(id)) throw new PolicyError("scope", `scope: duplicate property '${id}' for client '${input.clientId}'`);
  }
  client.properties.push({
    property_id: input.propertyId,
    provider: input.provider,
    canonical_property: input.canonicalProperty,
    ...(input.aliases.length > 0 ? { aliases: input.aliases } : {}),
  });
  validateClientRegistry(registry);
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, canonicalJson(registry), { encoding: "utf8", flag: "wx", mode: 0o644 });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return registry;
}
