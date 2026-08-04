import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ClientRegistry, ExternalProvider, SourceRegistry } from "./domain.js";
import { canonicalJson } from "./serialize.js";
import { assertShellSafeSegment } from "./shell.js";

const SUPPORTED_EXTERNAL_PROVIDERS = new Set<ExternalProvider>(["localo", "google-analytics", "serprobot", "semstorm"]);

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
    if (source.status === "ready" && source.provider === "serprobot" && !/^[1-9]\d*$/.test(source.target ?? "")) throw new Error(`ready source '${source.source_id}' must declare a numeric SERPROBOT project target`);
    if (!clients.clients.some((client) => client.client_id === source.client_id)) throw new Error(`source '${source.source_id}' references unknown client '${source.client_id}'`);
    seen.add(source.source_id);
  }
}

export interface AddSourceInput {
  registryPath: string;
  source_id: string;
  client_id: string;
  provider: ExternalProvider;
  target: string | null;
  status: "ready" | "unavailable";
  reason: string | null;
  search_engine?: string;
  location?: string | null;
  device?: string | null;
}

export interface AddSourceRecord {
  source_id: string;
  client_id: string;
  provider: ExternalProvider;
  target: string | null;
  status: "ready" | "unavailable";
  reason: string | null;
  search_engine?: string;
  location?: string | null;
  device?: string | null;
}

export interface AddSourcesInput {
  registryPath: string;
  sources: AddSourceRecord[];
}

async function writeSourceRegistry(path: string, next: SourceRegistry): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, canonicalJson(next), { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function addSources(input: AddSourcesInput, clients: ClientRegistry): Promise<SourceRegistry> {
  if (input.sources.length === 0) throw new Error("source batch must contain at least one source");
  for (const source of input.sources) {
    assertShellSafeSegment(source.client_id);
    assertShellSafeSegment(source.source_id);
  }
  const path = resolve(input.registryPath);
  const parsed = JSON.parse(await readFile(path, "utf8")) as SourceRegistry;
  validateSourceRegistry(parsed, clients);
  const existing = new Set(parsed.sources.map((source) => source.source_id));
  const incoming = new Set<string>();
  for (const source of input.sources) {
    if (existing.has(source.source_id) || incoming.has(source.source_id)) throw new Error(`duplicate source_id '${source.source_id}'`);
    incoming.add(source.source_id);
  }
  const next: SourceRegistry = {
    sources: [...parsed.sources, ...input.sources.map((source) => ({
      source_id: source.source_id,
      client_id: source.client_id,
      provider: source.provider,
      target: source.target,
      status: source.status,
      reason: source.reason,
      ...(source.search_engine ? { search_engine: source.search_engine } : {}),
      ...(source.location !== undefined ? { location: source.location } : {}),
      ...(source.device !== undefined ? { device: source.device } : {}),
    }))],
  };
  validateSourceRegistry(next, clients);
  await writeSourceRegistry(path, next);
  return next;
}

export async function addSource(input: AddSourceInput, clients: ClientRegistry): Promise<SourceRegistry> {
  const { registryPath, ...source } = input;
  return addSources({ registryPath, sources: [source] }, clients);
}
