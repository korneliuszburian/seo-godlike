import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { canonicalJson, sha256 } from "./serialize.js";

export type ClientActionType = "sponsored_article" | "forum_marketing" | "nap_listing" | "on_site" | "other";
export type ClientActionStatus = "planned" | "in_progress" | "published" | "paused" | "cancelled";

export interface ClientAction {
  action_id: string;
  client_id: string;
  period: { start: string; end: string };
  type: ClientActionType;
  status: ClientActionStatus;
  title: string;
  target_url: string | null;
  published_at: string | null;
  notes: string | null;
}
export interface GlossaryEntry { term: string; explanation: string; }
export interface ClientContact { name: string; email: string | null; phone: string | null; }
export interface ClientContent { schema_version: "1"; client_id: string; actions: ClientAction[]; glossary: GlossaryEntry[]; contact: ClientContact | null; }
export interface ClientContentCollection { schema_version: "1"; clients: ClientContent[]; }
export interface ClientContentBundle { content: ClientContent; contents: ClientContent[]; manifest_sha256: string; }

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function string(value: unknown, label: string): string { if (typeof value !== "string" || value.trim() === "") throw new Error(`client content ${label} must be a non-empty string`); return value; }
function nullableString(value: unknown, label: string): string | null { if (value === null || value === undefined) return null; return string(value, label); }
function period(value: unknown, label: string): { start: string; end: string } { if (!record(value)) throw new Error(`client content ${label} must be an object`); return { start: string(value.start, `${label}.start`), end: string(value.end, `${label}.end`) }; }

export function parseClientContent(value: unknown): ClientContent {
  if (!record(value) || value.schema_version !== "1") throw new Error("client content schema_version must be '1'");
  const clientId = string(value.client_id, "client_id");
  if (!Array.isArray(value.actions) || !Array.isArray(value.glossary)) throw new Error("client content actions and glossary must be arrays");
  const actions = value.actions.map((item, index) => {
    if (!record(item)) throw new Error(`client content actions[${index}] must be an object`);
    const type = string(item.type, `actions[${index}].type`);
    const status = string(item.status, `actions[${index}].status`);
    if (!["sponsored_article", "forum_marketing", "nap_listing", "on_site", "other"].includes(type)) throw new Error(`client content actions[${index}].type is unsupported`);
    if (!["planned", "in_progress", "published", "paused", "cancelled"].includes(status)) throw new Error(`client content actions[${index}].status is unsupported`);
    return { action_id: string(item.action_id, `actions[${index}].action_id`), client_id: string(item.client_id, `actions[${index}].client_id`), period: period(item.period, `actions[${index}].period`), type: type as ClientActionType, status: status as ClientActionStatus, title: string(item.title, `actions[${index}].title`), target_url: nullableString(item.target_url, `actions[${index}].target_url`), published_at: nullableString(item.published_at, `actions[${index}].published_at`), notes: nullableString(item.notes, `actions[${index}].notes`) };
  }).filter((item) => item.client_id === clientId).sort((a, b) => a.period.start.localeCompare(b.period.start) || a.action_id.localeCompare(b.action_id));
  const glossary = value.glossary.map((item, index) => { if (!record(item)) throw new Error(`client content glossary[${index}] must be an object`); return { term: string(item.term, `glossary[${index}].term`), explanation: string(item.explanation, `glossary[${index}].explanation`) }; }).sort((a, b) => a.term.localeCompare(b.term));
  let contact: ClientContact | null = null;
  if (value.contact !== null && value.contact !== undefined) { if (!record(value.contact)) throw new Error("client content contact must be an object or null"); contact = { name: string(value.contact.name, "contact.name"), email: nullableString(value.contact.email, "contact.email"), phone: nullableString(value.contact.phone, "contact.phone") }; }
  return { schema_version: "1", client_id: clientId, actions, glossary, contact };
}
export async function readClientContent(path: string): Promise<ClientContent> { return parseClientContent(JSON.parse(await readFile(path, "utf8")) as unknown); }

export function parseClientContentCollection(value: unknown): ClientContent[] {
  if (record(value) && Array.isArray(value.clients)) {
    const contents = value.clients.map((item, index) => {
      try { return parseClientContent(item); }
      catch (error) { throw new Error(`client content clients[${index}] invalid: ${error instanceof Error ? error.message : String(error)}`); }
    });
    if (contents.length === 0) throw new Error("client content collection must contain at least one client");
    const ids = new Set<string>();
    for (const content of contents) {
      if (ids.has(content.client_id)) throw new Error(`duplicate client content identity: ${content.client_id}`);
      ids.add(content.client_id);
    }
    return contents.sort((a, b) => a.client_id.localeCompare(b.client_id));
  }
  return [parseClientContent(value)];
}

/**
 * Read operator-managed content only after the adjacent manifest has verified
 * every declared byte. The direct JSON reader remains for local compatibility;
 * production delivery should pass a bundle directory through this seam.
 */
export async function readClientContentBundle(bundleDir: string, expectedClientIds: readonly string[]): Promise<ClientContentBundle> {
  const root = resolve(bundleDir);
  const manifestBytes = await readFile(join(root, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as { files?: Record<string, { sha256?: unknown; bytes?: unknown }> };
  if (!manifest.files || Object.keys(manifest.files).length === 0) throw new Error("invalid client content manifest");
  const files = new Map<string, Buffer>();
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (!name || name.startsWith("/") || name.includes("..") || name.includes("\\") || !entry || typeof entry.sha256 !== "string" || typeof entry.bytes !== "number") throw new Error(`unsafe client content manifest entry '${name}'`);
    const file = resolve(root, name);
    if (file !== root && !file.startsWith(`${root}${sep}`)) throw new Error(`client content manifest entry escapes bundle: ${name}`);
    const bytes = await readFile(file);
    if (bytes.byteLength !== entry.bytes || sha256(bytes.toString("utf8")) !== entry.sha256) throw new Error(`client content manifest hash mismatch: ${name}`);
    files.set(name, bytes);
  }
  const report = files.get("client-content.json") ?? files.get("report.json");
  if (!report) throw new Error("client content bundle must declare client-content.json or report.json");
  const contents = parseClientContentCollection(JSON.parse(report.toString("utf8")) as unknown);
  for (const content of contents) if (!expectedClientIds.includes(content.client_id)) throw new Error(`client content identity mismatch: ${content.client_id}`);
  return { content: contents[0]!, contents, manifest_sha256: sha256(manifestBytes.toString("utf8")) };
}

export async function writeClientContentBundle(inputPath: string, outputDir: string): Promise<ClientContentBundle> {
  const contents = parseClientContentCollection(JSON.parse(await readFile(resolve(inputPath), "utf8")) as unknown);
  const report = canonicalJson(contents.length === 1 ? contents[0] : { schema_version: "1", clients: contents } satisfies ClientContentCollection);
  await mkdir(resolve(outputDir), { recursive: false, mode: 0o700 });
  const manifest = canonicalJson({ schema_version: "1", provider: "operator-managed-content", client_id: contents.length === 1 ? contents[0]?.client_id : "multi-client", client_ids: contents.map((content) => content.client_id), files: { "client-content.json": { sha256: sha256(report), bytes: Buffer.byteLength(report) } } });
  await writeFile(join(resolve(outputDir), "client-content.json"), report, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await writeFile(join(resolve(outputDir), "manifest.json"), manifest, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return { content: contents[0]!, contents, manifest_sha256: sha256(manifest) };
}
