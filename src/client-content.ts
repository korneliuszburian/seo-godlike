import { readFile } from "node:fs/promises";

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
