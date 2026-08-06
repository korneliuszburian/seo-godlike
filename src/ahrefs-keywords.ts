import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { canonicalJson, sha256 } from "./serialize.js";
import { getAhrefsApiKey } from "./ahrefs.js";
import { CapabilityRegistry, PolicyError } from "./domain.js";
import { AhrefsCollectionPolicy, assertAhrefsCollectionEnabled } from "./provider-collection-policy.js";

export const AHREFS_KEYWORDS_OVERVIEW_URL = "https://api.ahrefs.com/v3/keywords-explorer/overview";
export const AHREFS_KEYWORDS_SELECT = "keyword,volume,volume_monthly,global_volume,clicks,cpc,cps,difficulty,traffic_potential,parent_topic,parent_volume,intents,serp_features,serp_last_update";
export const DEFAULT_KEYWORD_COUNTRY = "pl";
export const MAX_PHRASES_PER_REQUEST = 100;
export const DEFAULT_MAX_REQUESTS = 10;
export const MIN_UNITS_PER_REQUEST = 50;
export const DEFAULT_MAX_API_UNITS = 500;

export interface PhraseGroup {
  host: string;
  phrases: string[];
}

export interface PhraseInput {
  groups: PhraseGroup[];
  notes: string[];
}

export interface KeywordResearchOptions {
  inputPath: string;
  outputDir: string;
  country?: string;
  maxRequests?: number;
  maxApiUnits?: number;
  allowEstimatedBudget?: boolean;
  capabilities: CapabilityRegistry;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  collectionPolicy?: Readonly<AhrefsCollectionPolicy>;
}

interface AhrefsKeywordResponse {
  keywords: Array<Record<string, unknown>>;
}

export interface KeywordResearchReport {
  schema_version: "1";
  provider: "ahrefs";
  operation: "keywords-explorer.overview";
  source_label: "Estimated — Ahrefs Keywords Explorer";
  country: string;
  input_sha256: string;
  input_groups: PhraseGroup[];
  notes: string[];
  groups: Array<{ host: string; phrases: string[]; rows: Array<Record<string, unknown>> }>;
}

export function assertAhrefsKeywordCapability(capabilities: CapabilityRegistry): void {
  const capability = capabilities.capabilities.find((item) => item.provider === "ahrefs" && item.operation_id === "keywords-explorer.overview");
  if (!capability || capability.read_write !== "read" || capability.api_version !== "v3" || !capability.metric_ids?.includes("ahrefs.keyword_metrics")) {
    throw new PolicyError("schema", `schema: unsupported Ahrefs Keywords Explorer capability '${capability?.api_version ?? "missing"}'`);
  }
}

export function parsePhraseInput(text: string): PhraseInput {
  let current: PhraseGroup | undefined;
  const groups: PhraseGroup[] = [];
  const notes: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^https?:\/\//i.test(line)) {
      const url = new URL(line);
      current = { host: url.hostname.toLowerCase(), phrases: [] };
      groups.push(current);
      continue;
    }
    if (/^#\s*note\s*:/i.test(line)) {
      const note = line.replace(/^#\s*note\s*:\s*/i, "");
      if (!note) continue;
      notes.push(current ? `${current.host}: ${note}` : note);
      continue;
    }
    if (!current) throw new Error(`phrase input must declare a URL before phrases or use '# note:': ${line}`);
    current.phrases.push(line);
  }
  for (const group of groups) {
    group.phrases = [...new Set(group.phrases.map((phrase) => phrase.toLocaleLowerCase("pl-PL")))];
  }
  return { groups, notes };
}

function assertCountry(country: string): void {
  if (!/^[a-z]{2}$/.test(country)) throw new Error(`invalid Ahrefs keyword country '${country}'`);
}

function assertRequestBudget(groups: PhraseGroup[], maxRequests: number, maxApiUnits: number): PhraseGroup[] {
  const active = groups.filter((group) => group.phrases.length > 0);
  if (active.some((group) => group.phrases.length > MAX_PHRASES_PER_REQUEST)) {
    throw new Error(`phrase group exceeds ${MAX_PHRASES_PER_REQUEST} phrases per request`);
  }
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || active.length > maxRequests) {
    throw new Error(`keyword request budget exceeded: ${active.length} requests > ${maxRequests}`);
  }
  const estimatedUnits = active.length * MIN_UNITS_PER_REQUEST;
  if (!Number.isInteger(maxApiUnits) || maxApiUnits < MIN_UNITS_PER_REQUEST || estimatedUnits > maxApiUnits) {
    throw new Error(`keyword API unit budget exceeded: estimated ${estimatedUnits} units > ${maxApiUnits}`);
  }
  return active;
}

export async function queryAhrefsKeywordOverview(
  apiKey: string,
  phrases: string[],
  country = DEFAULT_KEYWORD_COUNTRY,
  fetchImpl: typeof fetch = fetch,
  collectionPolicy?: Readonly<AhrefsCollectionPolicy>,
): Promise<string> {
  assertCountry(country);
  if (phrases.length === 0 || phrases.length > MAX_PHRASES_PER_REQUEST) throw new Error(`invalid phrase count: ${phrases.length}`);
  if (phrases.some((phrase) => phrase.includes(","))) throw new Error("phrases must not contain commas");
  assertAhrefsCollectionEnabled(collectionPolicy);
  const url = new URL(AHREFS_KEYWORDS_OVERVIEW_URL);
  url.searchParams.set("country", country);
  url.searchParams.set("keywords", phrases.join(","));
  url.searchParams.set("select", AHREFS_KEYWORDS_SELECT);
  url.searchParams.set("output", "json");
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Ahrefs keywords overview request failed: ${response.status}`);
  const rawText = await response.text();
  const parsed = JSON.parse(rawText) as unknown;
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { keywords?: unknown }).keywords)) throw new Error("invalid Ahrefs keywords overview response");
  return rawText;
}

function markdownCell(value: unknown): string {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

async function writeExclusive(path: string, content: string): Promise<void> {
  await writeFile(path, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

export async function writeAhrefsKeywordResearch(options: KeywordResearchOptions): Promise<KeywordResearchReport> {
  assertAhrefsCollectionEnabled(options.collectionPolicy);
  assertAhrefsKeywordCapability(options.capabilities);
  const inputText = await readFile(resolve(options.inputPath), "utf8");
  const input = parsePhraseInput(inputText);
  const country = options.country ?? DEFAULT_KEYWORD_COUNTRY;
  assertCountry(country);
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const maxApiUnits = options.maxApiUnits ?? DEFAULT_MAX_API_UNITS;
  const groups = assertRequestBudget(input.groups, maxRequests, maxApiUnits);
  if (!options.allowEstimatedBudget) {
    throw new Error("Ahrefs keyword research requires explicit --allow-estimated-budget because provider unit cost depends on returned rows and selected fields");
  }
  const apiKey = options.apiKey ?? await getAhrefsApiKey(options.collectionPolicy);
  const fetchImpl = options.fetchImpl ?? fetch;
  const results: KeywordResearchReport["groups"] = [];
  const rawResponses: Array<{ host: string; phrases: string[]; content: string }> = [];
  for (const group of groups) {
    const raw = await queryAhrefsKeywordOverview(apiKey, group.phrases, country, fetchImpl, options.collectionPolicy);
    const parsed = JSON.parse(raw) as AhrefsKeywordResponse;
    results.push({ host: group.host, phrases: group.phrases, rows: parsed.keywords });
    rawResponses.push({ host: group.host, phrases: group.phrases, content: raw });
  }
  results.sort((left, right) => left.host.localeCompare(right.host));
  for (const group of results) group.rows.sort((left, right) => String(left.keyword ?? "").localeCompare(String(right.keyword ?? "")));
  const report: KeywordResearchReport = { schema_version: "1", provider: "ahrefs", operation: "keywords-explorer.overview", source_label: "Estimated — Ahrefs Keywords Explorer", country, input_sha256: sha256(inputText), input_groups: input.groups, notes: input.notes, groups: results };
  const request = { schema_version: "1", provider: "ahrefs", operation: "keywords-explorer.overview", country, max_requests: maxRequests, max_api_units: maxApiUnits, estimated_api_units: groups.length * MIN_UNITS_PER_REQUEST, budget_basis: "minimum_request_cost_only; actual_cost_depends_on_returned_rows_and_selected_fields", estimated_budget_explicitly_accepted: true, groups: groups.map((group) => ({ host: group.host, phrases: group.phrases })), credential_ref: "keyring:seo-godlike/ahrefs-api-key", policy_mode: "read_only" as const };
  const markdown = ["# Ahrefs keyword research", "", `- Source: ${report.source_label}`, `- Country: ${country}`, `- Groups: ${results.length}`, "- Values are estimates; no GSC metrics are included.", "", ...results.flatMap((group) => [
    `## ${group.host}`, "", `- Phrases: ${group.phrases.length}`, `- Returned rows: ${group.rows.length}`, "", "| Phrase | Volume | Clicks | CPC | Difficulty | Traffic potential |", "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...group.rows.map((row) => `| ${markdownCell(row.keyword)} | ${markdownCell(row.volume)} | ${markdownCell(row.clicks)} | ${markdownCell(row.cpc)} | ${markdownCell(row.difficulty)} | ${markdownCell(row.traffic_potential)} |`), "",
  ]), "## Notes", "", ...report.notes.map((note) => `- ${markdownCell(note)}`), ""].join("\n");
  const rawFiles = Object.fromEntries(rawResponses.map((response, index) => [`raw-response.${String(index + 1).padStart(3, "0")}.${response.host}.json`, response.content]));
  const files: Record<string, string> = { "request.json": canonicalJson(request), ...rawFiles, "report.json": canonicalJson(report), "report.md": markdown };
  const outputDir = resolve(options.outputDir);
  await mkdir(outputDir, { recursive: false, mode: 0o700 });
  for (const [name, content] of Object.entries(files)) await writeExclusive(join(outputDir, name), content);
  await writeExclusive(join(outputDir, "manifest.json"), canonicalJson({ schema_version: "1", provider: "ahrefs", operation: "keywords-explorer.overview", files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { sha256: sha256(content), bytes: Buffer.byteLength(content) }])) }));
  return report;
}
