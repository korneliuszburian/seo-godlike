import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const LOCALO_MCP_URL = "https://api.localo.com/api/mcp";
export const LOCALO_TOKEN_REF = "keyring:seo-godlike/localo-mcp-token";

interface JsonRpcResult {
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

export interface LocaloToolDescriptor {
  name: string;
  description?: string;
  input_schema?: unknown;
}

export interface LocaloDiscoveryResult {
  provider: "localo";
  transport: "streamable-http";
  endpoint: string;
  auth: "keyring-bearer";
  protocol_version: string;
  server_info: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  tools: LocaloToolDescriptor[];
}

async function getLocaloToken(): Promise<string> {
  try {
    const result = await execFileAsync("secret-tool", ["lookup", "service", "seo-godlike", "account", "localo-mcp-token"], { encoding: "utf8" });
    if (result.stdout.trim()) return result.stdout.trim();
  } catch { /* fail closed below */ }
  throw new Error(`missing secret reference '${LOCALO_TOKEN_REF}'`);
}

function parseJsonRpc(text: string): JsonRpcResult {
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  const payload = dataLine ? dataLine.slice("data: ".length) : text;
  const parsed = JSON.parse(payload) as JsonRpcResult;
  if (parsed.error) throw new Error(`Localo MCP error ${parsed.error.code ?? "unknown"}: ${parsed.error.message ?? "unknown"}`);
  return parsed;
}

async function rpc(url: string, token: string, id: number, method: string, params: Record<string, unknown>): Promise<JsonRpcResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Localo MCP request failed: ${response.status}`);
  return parseJsonRpc(await response.text());
}

function tools(value: unknown): LocaloToolDescriptor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || typeof (item as { name?: unknown }).name !== "string") return [];
    const tool = item as { name: string; description?: unknown; inputSchema?: unknown };
    return [{ name: tool.name, ...(typeof tool.description === "string" ? { description: tool.description } : {}), ...(tool.inputSchema !== undefined ? { input_schema: tool.inputSchema } : {}) }];
  });
}

export async function discoverLocaloMcp(url = LOCALO_MCP_URL, token?: string): Promise<LocaloDiscoveryResult> {
  const bearer = token ?? await getLocaloToken();
  const initialized = await rpc(url, bearer, 1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "seo-godlike", version: "1" } });
  const initializedResult = initialized.result ?? {};
  const listed = await rpc(url, bearer, 2, "tools/list", {});
  const listedResult = listed.result ?? {};
  return {
    provider: "localo",
    transport: "streamable-http",
    endpoint: url,
    auth: "keyring-bearer",
    protocol_version: typeof initializedResult.protocolVersion === "string" ? initializedResult.protocolVersion : "unknown",
    server_info: typeof initializedResult.serverInfo === "object" && initializedResult.serverInfo !== null ? initializedResult.serverInfo as Record<string, unknown> : {},
    capabilities: typeof initializedResult.capabilities === "object" && initializedResult.capabilities !== null ? initializedResult.capabilities as Record<string, unknown> : {},
    tools: tools(listedResult.tools),
  };
}
