import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ClientRegistry, PolicyError, Provider } from "./domain.js";
import { canonicalJson } from "./serialize.js";
import { assertShellSafeSegment } from "./shell.js";

export interface RegisteredProperty {
  property_id: string;
  provider: Provider;
  canonical_property?: boolean;
  aliases?: string[];
  country?: string;
}

export interface ResolvedProperty {
  property: RegisteredProperty;
  canonical_property_id: string;
}

function propertyFormat(propertyId: string, provider: Provider): boolean {
  if (!propertyId || /\s/.test(propertyId)) return false;
  if (provider === "google-analytics") return /^properties\/[1-9]\d*$/.test(propertyId);
  if (provider === "ahrefs") return /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(propertyId);
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
      if (!propertyFormat(property.property_id, property.provider)) throw new PolicyError("schema", `schema: invalid property_id '${property.property_id}'`);
      if (property.country !== undefined && (property.provider !== "ahrefs" || !/^[a-z]{2}$/.test(property.country))) throw new PolicyError("schema", `schema: invalid Ahrefs country '${property.country}'`);
      if (property.canonical_property === false && (property.aliases?.length ?? 0) > 0) {
        throw new PolicyError("schema", `schema: aliases require canonical property '${property.property_id}'`);
      }
      const ids = [property.property_id, ...(property.aliases ?? [])];
      for (const id of ids) {
        if (!propertyFormat(id, property.provider)) throw new PolicyError("schema", `schema: invalid property alias '${id}'`);
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
  assertShellSafeSegment(input.clientId);
  if (!propertyFormat(input.propertyId, input.provider)) throw new PolicyError("schema", `schema: invalid property_id '${input.propertyId}'`);
  if (!input.canonicalProperty && input.aliases.length > 0) {
    throw new PolicyError("schema", "schema: aliases require --canonical-property true");
  }
  for (const alias of input.aliases) {
    if (!propertyFormat(alias, input.provider)) throw new PolicyError("schema", `schema: invalid property alias '${alias}'`);
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

export interface AddPropertiesInput {
  registryPath: string;
  clients: ClientRegistry["clients"];
}

export async function addProperties(input: AddPropertiesInput): Promise<ClientRegistry> {
  if (!Array.isArray(input.clients) || input.clients.length === 0) throw new PolicyError("schema", "schema: batch must contain at least one client");
  const path = resolve(input.registryPath);
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  const registry = parsed as ClientRegistry;
  validateClientRegistry(registry);
  const incomingIds = new Set<string>();
  for (const incoming of input.clients) {
    assertShellSafeSegment(incoming.client_id);
    if (incomingIds.has(incoming.client_id)) throw new PolicyError("scope", `scope: duplicate client '${incoming.client_id}' in batch`);
    incomingIds.add(incoming.client_id);
    if (!Array.isArray(incoming.properties) || incoming.properties.length === 0) throw new PolicyError("schema", `schema: client '${incoming.client_id}' must contain properties`);
    for (const property of incoming.properties) {
      if (!propertyFormat(property.property_id, property.provider)) throw new PolicyError("schema", `schema: invalid property_id '${property.property_id}'`);
    }
  }
  const merged = structuredClone(registry) as ClientRegistry;
  for (const incoming of input.clients) {
    const existing = merged.clients.find((client) => client.client_id === incoming.client_id);
    if (existing) existing.properties.push(...incoming.properties);
    else merged.clients.push(incoming);
  }
  validateClientRegistry(merged);
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, canonicalJson(merged), { encoding: "utf8", flag: "wx", mode: 0o644 });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return merged;
}
