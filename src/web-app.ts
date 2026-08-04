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
:root{color-scheme:dark;--bg:#071b1d;--panel:#0e292c;--muted:#92abad;--accent:#65e6c0;--line:#244447}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:#f4fbfa;font:15px/1.5 system-ui,sans-serif;min-height:100vh}
header{display:flex;align-items:center;justify-content:space-between;padding:22px 28px;border-bottom:1px solid var(--line)}
h1{font-size:20px;margin:0}main{display:grid;grid-template-columns:260px 1fr;min-height:calc(100vh - 76px)}
nav{padding:20px;border-right:1px solid var(--line)}button{display:block;width:100%;text-align:left;background:transparent;color:var(--muted);border:1px solid transparent;border-radius:12px;padding:13px;margin-bottom:8px;cursor:pointer}
button:hover,button[aria-current=true]{background:var(--panel);border-color:var(--accent);color:#fff}small{display:block;color:var(--muted);margin-top:3px}section{padding:22px;min-width:0}.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px;margin-bottom:18px}iframe{width:100%;height:calc(100vh - 160px);border:1px solid var(--line);border-radius:18px;background:#fff}#status{color:var(--muted)}
@media(max-width:720px){main{grid-template-columns:1fr}nav{border-right:0;border-bottom:1px solid var(--line);display:flex;gap:8px;overflow:auto;padding:12px}nav button{min-width:190px;margin:0}section{padding:12px}iframe{height:75vh}}
</style></head><body><header><h1>SEO Godlike</h1><span id="status">Ładowanie danych…</span></header><main><nav id="units" aria-label="Klienci i domeny"></nav><section><div class="card"><strong id="title">Wybierz klienta lub domenę</strong><small>Raport jest oparty na już zweryfikowanych danych. Dashboard działa tylko w trybie odczytu.</small></div><iframe id="report" title="Raport SEO" hidden></iframe></section></main>
<script>
const nav=document.querySelector('#units'), frame=document.querySelector('#report'), title=document.querySelector('#title'), status=document.querySelector('#status');
async function load(){const response=await fetch('/api/units');if(!response.ok)throw new Error('Nie udało się pobrać jednostek');const data=await response.json();status.textContent=data.units.length+' jednostek · tylko odczyt';for(const unit of data.units){const button=document.createElement('button');button.type='button';button.dataset.html=unit.html;button.innerHTML=(unit.kind==='client'?'Klient':'Domena')+'<small>'+unit.id+'</small>';button.addEventListener('click',()=>{for(const item of nav.children)item.removeAttribute('aria-current');button.setAttribute('aria-current','true');title.textContent=unit.id;frame.src='/'+unit.html;frame.hidden=false});nav.append(button)}if(nav.firstElementChild)nav.firstElementChild.click()}
load().catch(error=>{status.textContent=error.message});
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
