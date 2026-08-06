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

function dashboardShell(): string {
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SEO Godlike — dashboard</title>
<style>
:root{color-scheme:dark;--bg:#071b1d;--muted:#91a8aa;--accent:#65e6c0;--island:#f6fbfa;--ink:#123436}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--bg);font:14px/1.5 system-ui,sans-serif}
iframe{display:block;width:100%;height:100%;border:0;background:#fff}
#units{position:fixed;z-index:2;left:50%;bottom:18px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:7px 9px;border-radius:999px;background:var(--island);box-shadow:0 12px 36px #0008;max-width:calc(100vw - 24px);overflow-x:auto}
button{flex:0 0 42px;width:42px;height:42px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--ink);font-weight:750;cursor:pointer}button:hover,button[aria-current=true]{background:var(--accent);box-shadow:inset 0 0 0 2px #fff;color:#063b37}button small{display:none}
@media(max-width:520px){#units{bottom:10px;padding:5px 7px;gap:3px}button{flex-basis:36px;width:36px;height:36px;font-size:12px}}
</style></head><body><nav id="units" aria-label="Przełącz klienta lub domenę"></nav><iframe id="report" title="Raport SEO" hidden></iframe>
<script>
const nav=document.querySelector('#units'),frame=document.querySelector('#report');
frame.addEventListener('load',()=>{try{frame.contentDocument?.querySelector('.client-switcher')?.remove()}catch{}});
function initials(id){return id.replace(/^domain-/,'').split(/[.\-]/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()}
async function load(){const response=await fetch('/api/units');if(!response.ok)throw new Error('Błąd danych');const data=await response.json();for(const unit of data.units){const button=document.createElement('button');button.type='button';button.title=unit.id;button.setAttribute('aria-label',unit.id);button.textContent=initials(unit.id);button.addEventListener('click',()=>{for(const item of nav.children)item.removeAttribute('aria-current');button.setAttribute('aria-current','true');frame.src='/'+unit.html;frame.hidden=false});nav.append(button)}if(nav.firstElementChild)nav.firstElementChild.click()}
load();
</script></body></html>`;
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
    if (path === "/" || path === "/app") {
      text(response, 200, dashboardShell(), "text/html; charset=utf-8");
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
