import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { resolveExistingInside } from "./path-confinement.js";

export interface DashboardServerOptions {
  deliveryDir: string;
  host?: string;
  port?: number;
}

export interface DashboardServerHandle {
  server: Server;
  url: string;
  close(): Promise<void>;
}

interface DeliveryManifest {
  schema_version: string;
  source: string;
  execution?: Record<string, unknown>;
  files: Record<string, unknown>;
  units: unknown[];
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseManifest(value: unknown): DeliveryManifest {
  if (!isRecord(value) || typeof value.schema_version !== "string" || typeof value.source !== "string" || !isRecord(value.files) || !Array.isArray(value.units)) {
    throw new Error("invalid delivery manifest");
  }
  return value as DeliveryManifest;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(body);
}

function text(response: ServerResponse, status: number, body: string, contentType: string): void {
  response.writeHead(status, { "content-type": contentType, "cache-control": "no-store" });
  response.end(body);
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".pdf": return "application/pdf";
    case ".eml": return "message/rfc822";
    default: return "application/octet-stream";
  }
}

async function serveFile(response: ServerResponse, deliveryDir: string, relativePath: string): Promise<void> {
  try {
    const path = await resolveExistingInside(deliveryDir, relativePath, "dashboard asset");
    const body = await readFile(path);
    response.writeHead(200, { "content-type": contentType(path), "cache-control": "no-store" });
    response.end(body);
  } catch {
    text(response, 404, "Not found", "text/plain; charset=utf-8");
  }
}

function requestPath(request: IncomingMessage): string | undefined {
  if (!request.url) return undefined;
  try {
    return new URL(request.url, "http://localhost").pathname;
  } catch {
    return undefined;
  }
}

export async function serveDashboard(options: DashboardServerOptions): Promise<DashboardServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4173;
  const deliveryDir = options.deliveryDir;
  const manifestPath = await resolveExistingInside(deliveryDir, "manifest.json", "delivery manifest");
  const manifest = parseManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
  const server = createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      json(response, 405, { error: "read-only dashboard accepts GET only" });
      return;
    }
    const path = requestPath(request);
    if (!path) {
      json(response, 400, { error: "invalid request path" });
      return;
    }
    if (path === "/healthz") {
      json(response, 200, { status: "ok", read_only: true, provider_calls: manifest.execution?.provider_calls ?? 0 });
      return;
    }
    if (path === "/api/manifest") {
      json(response, 200, { schema_version: manifest.schema_version, source: manifest.source, execution: manifest.execution ?? {}, file_count: Object.keys(manifest.files).length, unit_count: manifest.units.length });
      return;
    }
    if (path === "/api/units") {
      json(response, 200, { units: manifest.units });
      return;
    }
    const relativePath = path === "/" ? "index.html" : path.slice(1);
    await serveFile(response, deliveryDir, relativePath);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("dashboard server did not expose a TCP address");
  const url = `http://${host}:${address.port}/`;
  return {
    server,
    url,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
