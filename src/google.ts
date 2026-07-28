import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { URL } from "node:url";
import { promisify } from "node:util";
import { GOOGLE_GSC_READ_ONLY_SCOPE } from "./auth-preflight.js";
import { SearchAnalyticsDimension } from "./domain.js";

const execFileAsync = promisify(execFile);
const keyringArgs = ["service", "seo-godlike", "account", "google-agency-refresh-token"];
export const GOOGLE_SEARCH_CONSOLE_API_VERSION = "v3";
export const GOOGLE_ANALYTICS_API_VERSION = "v1beta";

interface OAuthClientConfig {
  client_id: string;
  client_secret?: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

function clientConfig(value: unknown): OAuthClientConfig {
  const root = value as { installed?: OAuthClientConfig; web?: OAuthClientConfig };
  const config = root.installed ?? root.web;
  if (!config?.client_id) throw new Error("OAuth client JSON has no installed/web client_id");
  return config;
}

async function keyringLookup(): Promise<string | null> {
  try {
    const result = await execFileAsync("secret-tool", ["lookup", ...keyringArgs], { encoding: "utf8" });
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

async function keyringStore(secret: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("secret-tool", ["store", "--label=seo-godlike Google refresh token", ...keyringArgs], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`secret-tool store failed: ${stderr.trim()}`)));
    child.stdin.end(secret);
  });
}

function authorizationCode(config: OAuthClientConfig, scope: string): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    const state = randomBytes(24).toString("hex");
    let redirectUri = "";
    const server = createServer((request, response) => {
      const callbackUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (callbackUrl.pathname !== "/oauth/callback") {
        response.writeHead(404).end();
        return;
      }
      if (callbackUrl.searchParams.get("state") !== state) {
        response.writeHead(400).end("invalid oauth state");
        server.close();
        reject(new Error("OAuth state mismatch"));
        return;
      }
      const error = callbackUrl.searchParams.get("error");
      if (error) {
        response.writeHead(400).end("OAuth authorization was denied");
        server.close();
        reject(new Error(`OAuth authorization failed: ${error}`));
        return;
      }
      const code = callbackUrl.searchParams.get("code");
      if (!code) {
        response.writeHead(400).end("missing oauth code");
        server.close();
        reject(new Error("OAuth callback did not contain a code"));
        return;
      }
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("Consent received. You can close this tab.");
      server.close();
      resolve({ code, redirectUri });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("OAuth callback server did not bind"));
      redirectUri = `http://127.0.0.1:${address.port}/oauth/callback`;
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", config.client_id);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", scope);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("include_granted_scopes", "true");
      authUrl.searchParams.set("state", state);
      process.stderr.write(`Open this URL to grant read-only GSC access:\n${authUrl}\n`);
    });
    setTimeout(() => {
      server.close();
      reject(new Error("OAuth callback timed out after 5 minutes"));
    }, 5 * 60 * 1000).unref();
  });
}

async function exchange(config: OAuthClientConfig, code: string, redirectUri: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: config.client_id,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  if (config.client_secret) body.set("client_secret", config.client_secret);
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body, signal: AbortSignal.timeout(15_000) });
  const payload = await response.json() as TokenResponse & { error?: string };
  if (!response.ok || !payload.access_token) throw new Error(`OAuth token exchange failed: ${payload.error ?? response.status}`);
  return payload;
}

async function refresh(config: OAuthClientConfig, refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({ client_id: config.client_id, refresh_token: refreshToken, grant_type: "refresh_token" });
  if (config.client_secret) body.set("client_secret", config.client_secret);
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body, signal: AbortSignal.timeout(15_000) });
  const payload = await response.json() as TokenResponse & { error?: string };
  if (!response.ok || !payload.access_token) throw new Error(`OAuth refresh failed: ${payload.error ?? response.status}`);
  return payload;
}

export async function getGoogleAccessToken(clientJson: unknown, scope = GOOGLE_GSC_READ_ONLY_SCOPE): Promise<string> {
  const config = clientConfig(clientJson);
  let refreshToken = await keyringLookup();
  if (!refreshToken) {
    const authorization = await authorizationCode(config, scope);
    const token = await exchange(config, authorization.code, authorization.redirectUri);
    refreshToken = token.refresh_token ?? null;
    if (!refreshToken) throw new Error("OAuth response did not include a refresh token; revoke prior consent and retry");
    await keyringStore(refreshToken);
    return token.access_token as string;
  }
  return (await refresh(config, refreshToken)).access_token as string;
}

async function googleFetch(url: string, accessToken: string, serviceName: string, init?: RequestInit): Promise<unknown> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(15_000),
    });
    lastStatus = response.status;
    if (response.ok) return response.json();
    if (response.status < 500 && response.status !== 429) {
      throw new Error(`${serviceName} request failed: ${response.status} ${await response.text()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw new Error(`${serviceName} request failed after retries: ${lastStatus}`);
}

async function gscFetch(url: string, accessToken: string, init?: RequestInit): Promise<unknown> {
  return googleFetch(url, accessToken, "GSC", init);
}

async function googleAnalyticsFetch(url: string, accessToken: string, init?: RequestInit): Promise<unknown> {
  return googleFetch(url, accessToken, "GA4", init);
}

export async function querySearchAnalytics(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  dimensions: readonly SearchAnalyticsDimension[] = [],
): Promise<string> {
  const endpoint = `https://www.googleapis.com/webmasters/${GOOGLE_SEARCH_CONSOLE_API_VERSION}/sites/${encodeURIComponent(propertyId)}/searchAnalytics/query`;
  const payload = await gscFetch(endpoint, accessToken, {
    method: "POST",
    body: JSON.stringify({ startDate, endDate, dimensions, rowLimit: 25_000 }),
  });
  return `${JSON.stringify(payload)}\n`;
}

export async function listSearchConsoleSites(accessToken: string): Promise<string[]> {
  const payload = await gscFetch("https://www.googleapis.com/webmasters/v3/sites", accessToken) as {
    siteEntry?: Array<{ siteUrl?: string }>;
  };
  return (payload.siteEntry ?? []).flatMap((entry) => entry.siteUrl ? [entry.siteUrl] : []);
}

export async function queryGa4Report(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<string> {
  const endpoint = `https://analyticsdata.googleapis.com/${GOOGLE_ANALYTICS_API_VERSION}/${propertyId}:runReport`;
  const payload = await googleAnalyticsFetch(endpoint, accessToken, {
    method: "POST",
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
      limit: "10000",
      returnPropertyQuota: true,
    }),
  });
  return `${JSON.stringify(payload)}\n`;
}
