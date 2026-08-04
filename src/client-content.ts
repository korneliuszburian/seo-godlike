import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { resolveExistingInside } from "./path-confinement.js";
import { canonicalJson, sha256 } from "./serialize.js";
import { csvHeaderIndex, parseCsvRows } from "./csv.js";

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
  const actionIds = new Set<string>();
  const actions = value.actions.map((item, index) => {
    if (!record(item)) throw new Error(`client content actions[${index}] must be an object`);
    const type = string(item.type, `actions[${index}].type`);
    const status = string(item.status, `actions[${index}].status`);
    if (!["sponsored_article", "forum_marketing", "nap_listing", "on_site", "other"].includes(type)) throw new Error(`client content actions[${index}].type is unsupported`);
    if (!["planned", "in_progress", "published", "paused", "cancelled"].includes(status)) throw new Error(`client content actions[${index}].status is unsupported`);
    const actionId = string(item.action_id, `actions[${index}].action_id`);
    const actionClientId = string(item.client_id, `actions[${index}].client_id`);
    if (actionClientId !== clientId) throw new Error(`client content actions[${index}] client_id mismatch: expected '${clientId}', received '${actionClientId}'`);
    if (actionIds.has(actionId)) throw new Error(`duplicate client content action_id: ${actionId}`);
    actionIds.add(actionId);
    return { action_id: actionId, client_id: actionClientId, period: period(item.period, `actions[${index}].period`), type: type as ClientActionType, status: status as ClientActionStatus, title: string(item.title, `actions[${index}].title`), target_url: nullableString(item.target_url, `actions[${index}].target_url`), published_at: nullableString(item.published_at, `actions[${index}].published_at`), notes: nullableString(item.notes, `actions[${index}].notes`) };
  }).sort((a, b) => a.period.start.localeCompare(b.period.start) || a.action_id.localeCompare(b.action_id));
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
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
    schema_version?: unknown;
    provider?: unknown;
    client_ids?: unknown;
    input_sha256?: unknown;
    import_mode?: unknown;
    files?: Record<string, { sha256?: unknown; bytes?: unknown }>;
  };
  if (manifest.schema_version !== "1" || manifest.provider !== "operator-managed-content" || !Array.isArray(manifest.client_ids) || manifest.client_ids.some((id) => typeof id !== "string") || typeof manifest.input_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.input_sha256) || !["normalized_json", "normalized_csv"].includes(manifest.import_mode as string) || !manifest.files || Object.keys(manifest.files).length === 0) throw new Error("invalid client content manifest");
  const files = new Map<string, Buffer>();
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (!name || name.startsWith("/") || name.includes("..") || name.includes("\\") || !entry || typeof entry.sha256 !== "string" || typeof entry.bytes !== "number") throw new Error(`unsafe client content manifest entry '${name}'`);
    const file = await resolveExistingInside(root, name, "client content manifest entry");
    const bytes = await readFile(file);
    if (bytes.byteLength !== entry.bytes || sha256(bytes.toString("utf8")) !== entry.sha256) throw new Error(`client content manifest hash mismatch: ${name}`);
    files.set(name, bytes);
  }
  const report = files.get("client-content.json") ?? files.get("report.json");
  if (!report) throw new Error("client content bundle must declare client-content.json or report.json");
  const contents = parseClientContentCollection(JSON.parse(report.toString("utf8")) as unknown);
  const manifestClientIds = [...manifest.client_ids].sort();
  const payloadClientIds = contents.map((content) => content.client_id).sort();
  if (JSON.stringify(manifestClientIds) !== JSON.stringify(payloadClientIds)) throw new Error("client content manifest client_ids do not match payload");
  for (const content of contents) if (!expectedClientIds.includes(content.client_id)) throw new Error(`client content identity mismatch: ${content.client_id}`);
  return { content: contents[0]!, contents, manifest_sha256: sha256(manifestBytes.toString("utf8")) };
}

/** Select the newest verified operator bundle without requiring monthly path edits. */
export async function resolveLatestClientContentBundle(rootDir: string, expectedClientIds: readonly string[]): Promise<string> {
  if (expectedClientIds.length === 0) throw new Error("client content root requires at least one expected client");
  const root = await realpath(resolve(rootDir));
  const insideRoot = (path: string): boolean => path === root || path.startsWith(`${root}${sep}`);
  const candidates: Array<{ path: string; periodEnd: string }> = [];
  const seen = new Set<string>();
  async function inspect(directory: string): Promise<void> {
    const realDirectory = await realpath(directory);
    if (!insideRoot(realDirectory) || seen.has(realDirectory)) return;
    seen.add(realDirectory);
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    const manifest = entries.find((entry) => entry.name === "manifest.json" && (entry.isFile() || entry.isSymbolicLink()));
    if (manifest) {
      const manifestPath = join(directory, manifest.name);
      const realManifest = await realpath(manifestPath).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      });
      if (realManifest && insideRoot(realManifest)) {
        const bundle = await readClientContentBundle(directory, expectedClientIds).catch((error: unknown) => {
          if (error instanceof Error && error.message.startsWith("client content identity mismatch:")) return null;
          throw error;
        });
        if (bundle) {
          const periodEnd = bundle.contents.flatMap((content) => content.actions.map((action) => action.period.end)).sort().at(-1) ?? "";
          candidates.push({ path: directory, periodEnd });
        }
      }
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "manifest.json") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await inspect(path);
      else if (entry.isSymbolicLink()) {
        const realPath = await realpath(path).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw error;
        });
        if (realPath && insideRoot(realPath) && (await stat(path)).isDirectory()) await inspect(path);
      }
    }
  }
  await inspect(root);
  candidates.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.path.localeCompare(a.path));
  if (!candidates[0]) throw new Error("no verified client content bundle found for expected clients");
  return candidates[0].path;
}

async function writeClientContentContents(contents: ClientContent[], outputDir: string, provenance: { input_sha256: string; import_mode: "normalized_json" | "normalized_csv" }): Promise<ClientContentBundle> {
  const report = canonicalJson(contents.length === 1 ? contents[0] : { schema_version: "1", clients: contents } satisfies ClientContentCollection);
  await mkdir(resolve(outputDir), { recursive: false, mode: 0o700 });
  const manifest = canonicalJson({ schema_version: "1", provider: "operator-managed-content", client_id: contents.length === 1 ? contents[0]?.client_id : "multi-client", client_ids: contents.map((content) => content.client_id), ...provenance, files: { "client-content.json": { sha256: sha256(report), bytes: Buffer.byteLength(report) } } });
  await writeFile(join(resolve(outputDir), "client-content.json"), report, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await writeFile(join(resolve(outputDir), "manifest.json"), manifest, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return { content: contents[0]!, contents, manifest_sha256: sha256(manifest) };
}

export async function writeClientContentBundle(inputPath: string, outputDir: string): Promise<ClientContentBundle> {
  const input = await readFile(resolve(inputPath));
  const contents = parseClientContentCollection(JSON.parse(input.toString("utf8")) as unknown);
  return writeClientContentContents(contents, outputDir, { input_sha256: sha256(input.toString("utf8")), import_mode: "normalized_json" });
}

function validDateOnly(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) throw new Error(`client content ${label} must be a valid YYYY-MM-DD date`);
  return value;
}

export async function writeClientContentCsvBundle(inputPath: string, outputDir: string, clientId: string): Promise<ClientContentBundle> {
  if (!clientId.trim()) throw new Error("client content client_id must be a non-empty string");
  const input = await readFile(resolve(inputPath));
  const rows = parseCsvRows(input.toString("utf8"), "client content CSV");
  const headers = csvHeaderIndex(rows, "client content CSV");
  const required = ["period_start", "period_end", "type", "status", "title"];
  for (const header of required) if (!headers.has(header)) throw new Error(`client content CSV is missing required column '${header}'`);
  if (rows.length < 2) throw new Error("client content CSV must contain at least one action row");
  const value = (row: string[], header: string): string => row[headers.get(header)!]?.trim() ?? "";
  const actions = rows.slice(1).map((row, index) => {
    const start = validDateOnly(value(row, "period_start"), `row ${index + 2} period_start`);
    const end = validDateOnly(value(row, "period_end"), `row ${index + 2} period_end`);
    if (start > end) throw new Error(`client content CSV row ${index + 2} period_start must not be after period_end`);
    const action = { action_id: value(row, "action_id"), client_id: clientId, period: { start, end }, type: value(row, "type"), status: value(row, "status"), title: value(row, "title"), target_url: value(row, "target_url") || null, published_at: value(row, "published_at") || null, notes: value(row, "notes") || null };
    if (!action.action_id) action.action_id = `csv-${sha256(canonicalJson(action)).slice(0, 16)}`;
    return action;
  });
  const content = parseClientContent({ schema_version: "1", client_id: clientId, actions, glossary: [], contact: null });
  return writeClientContentContents([content], outputDir, { input_sha256: sha256(input.toString("utf8")), import_mode: "normalized_csv" });
}
