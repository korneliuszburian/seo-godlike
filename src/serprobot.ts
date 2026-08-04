import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { RankMonitoringBundle, RankMonitoringSnapshot, writeRankMonitoringApiBundle } from "./rank-monitoring.js";

const execFileAsync = promisify(execFile);
export const SERPROBOT_API_KEY_REF = "keyring:seo-godlike/serprobot-api-key";
export const SERPROBOT_API_ENDPOINT = "https://www.serprobot.com/api/v1/api.php";

export interface SerprobotApiRequest {
  client_id: string;
  project_id: string;
  captured_at: string;
  date_range: { start: string; end: string };
  search_engine: string;
  location: string | null;
  device: string | null;
  endpoint?: string;
}

export interface SerprobotApiResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type SerprobotFetcher = (url: URL) => Promise<SerprobotApiResponse>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`SERPROBOT response field '${label}' must be a non-empty string`);
  return value.trim();
}

function positionField(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`SERPROBOT response field '${label}' must be a positive integer or null`);
  return parsed;
}

function rowUrl(value: Record<string, unknown>): string | null {
  for (const key of ["url", "latest_found_serp", "ranking_url"]) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  }
  return null;
}

/**
 * Parses the documented SERPROBOT project response shape without treating
 * missing historical data as zero. The provider response is retained by the
 * caller as raw evidence; this function only creates the canonical snapshot.
 */
export function parseSerprobotProjectResponse(raw: unknown, request: SerprobotApiRequest): RankMonitoringSnapshot {
  if (!record(raw) || !Array.isArray(raw.keywords)) throw new Error("SERPROBOT project response must contain a keywords array");
  const rows = raw.keywords.map((item, index) => {
    if (!record(item)) throw new Error(`SERPROBOT keyword row ${index} is invalid`);
    const keyword = stringField(item.keyword, `keywords[${index}].keyword`);
    const position = positionField(item.current_position ?? item.position, `keywords[${index}].current_position`);
    // The project response may contain a provider-specific daily history, but
    // its index is not the same thing as the previous reporting period. The
    // recurring pipeline derives period comparisons from separate snapshots.
    return { keyword, position, previous_position: null, search_engine: request.search_engine, location: request.location, device: request.device, url: rowUrl(item) };
  }).sort((left, right) => left.keyword.localeCompare(right.keyword) || (left.position ?? Infinity) - (right.position ?? Infinity));
  return {
    schema_version: "1",
    provider: "serprobot",
    client_id: request.client_id,
    captured_at: request.captured_at,
    date_range: request.date_range,
    source_config: { project_id: request.project_id, search_engine: request.search_engine, location: request.location, device: request.device },
    rows,
  };
}

export async function getSerprobotApiKey(): Promise<string> {
  try {
    const result = await execFileAsync("secret-tool", ["lookup", "service", "seo-godlike", "account", "serprobot-api-key"], { encoding: "utf8" });
    if (result.stdout.trim()) return result.stdout.trim();
  } catch { /* fail closed below */ }
  throw new Error(`missing secret reference '${SERPROBOT_API_KEY_REF}'`);
}

export async function querySerprobotProject(apiKey: string, request: SerprobotApiRequest, fetcher: SerprobotFetcher = async (url) => fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) })): Promise<{ snapshot: RankMonitoringSnapshot; raw: string }> {
  if (!apiKey.trim()) throw new Error("SERPROBOT API key is empty");
  if (!/^[1-9]\d*$/.test(request.project_id)) throw new Error("SERPROBOT project_id must be numeric");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.date_range.start) || !/^\d{4}-\d{2}-\d{2}$/.test(request.date_range.end) || request.date_range.start > request.date_range.end) throw new Error("SERPROBOT date range must be valid and ordered");
  const url = new URL(request.endpoint ?? SERPROBOT_API_ENDPOINT);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("action", "project");
  url.searchParams.set("project_id", request.project_id);
  url.searchParams.set("start", request.date_range.start);
  url.searchParams.set("end", request.date_range.end);
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`SERPROBOT request failed: ${response.status}`);
  const rawValue = await response.json();
  const raw = `${JSON.stringify(rawValue)}\n`;
  return { snapshot: parseSerprobotProjectResponse(rawValue, request), raw };
}

export async function writeSerprobotApiBundle(apiKey: string, requests: SerprobotApiRequest[], outputDir: string, fetcher?: SerprobotFetcher): Promise<RankMonitoringBundle> {
  const results = [];
  for (const request of requests) results.push(await querySerprobotProject(apiKey, request, fetcher));
  return writeRankMonitoringApiBundle(results.map((result) => result.snapshot), results.map((result) => result.raw), outputDir);
}
