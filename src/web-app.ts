import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { ClientDeliveryResult } from "./client-delivery.js";
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

type DeliveryUnit = ClientDeliveryResult["units"][number];

interface ManifestFile {
  sha256: string;
  bytes: number;
}

interface DashboardUnit extends DeliveryUnit {
  initials: string;
  viewPath: string;
}

interface DeliveryManifest {
  schema_version: string;
  source: string;
  execution?: Record<string, unknown>;
  files: Record<string, ManifestFile>;
  units: DeliveryUnit[];
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseUnit(value: unknown): DeliveryUnit {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || (value.kind !== "client" && value.kind !== "domain")
    || typeof value.html !== "string"
    || (value.pdf !== null && typeof value.pdf !== "string")
    || typeof value.email !== "string") {
    throw new Error("invalid delivery unit");
  }
  return {
    id: value.id,
    kind: value.kind,
    html: value.html,
    pdf: value.pdf,
    email: value.email,
  };
}

function parseManifestFiles(value: Record<string, unknown>): Record<string, ManifestFile> {
  return Object.fromEntries(Object.entries(value).map(([path, file]) => {
    if (!isRecord(file)
      || typeof file.sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(file.sha256)
      || !Number.isSafeInteger(file.bytes)
      || (file.bytes as number) < 0) {
      throw new Error(`invalid delivery manifest file '${path}'`);
    }
    return [path, { sha256: file.sha256, bytes: file.bytes as number }];
  }));
}

function parseManifest(value: unknown): DeliveryManifest {
  if (!isRecord(value) || typeof value.schema_version !== "string" || typeof value.source !== "string" || !isRecord(value.files) || !Array.isArray(value.units)) {
    throw new Error("invalid delivery manifest");
  }
  const units = value.units.map(parseUnit);
  if (units.length === 0 || new Set(units.map((unit) => unit.id)).size !== units.length) throw new Error("invalid delivery units");
  if (value.execution !== undefined && !isRecord(value.execution)) throw new Error("invalid delivery execution");
  return {
    ...value,
    schema_version: value.schema_version,
    source: value.source,
    execution: value.execution,
    files: parseManifestFiles(value.files),
    units,
  };
}

function unitInitials(id: string): string {
  const hostname = id.replace(/^domain-/, "").replace(/^www\./, "");
  const label = hostname.split(".")[0] ?? hostname;
  const characters = label.replace(/[^a-z0-9]/gi, "");
  return (characters.slice(0, 2) || "--").toUpperCase();
}

function dashboardUnits(units: DeliveryUnit[]): DashboardUnit[] {
  return units.map((unit, index) => ({ ...unit, initials: unitInitials(unit.id), viewPath: `__dashboard/unit/${index}` }));
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
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

function dashboardShell(units: DashboardUnit[]): string {
  const firstUnit = units[0];
  if (!firstUnit) throw new Error("dashboard requires at least one unit");
  const navigation = units.map((unit, index) => `<a class="workspace-switcher__item" href="/${unit.viewPath}" target="report" aria-label="${escapeHtml(unit.id)}" title="${escapeHtml(unit.id)}"${index === 0 ? ' aria-current="page"' : ""}>${escapeHtml(unit.initials)}</a>`).join("");
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SEO Godlike — dashboard</title>
<style>
:root{color-scheme:dark;--color-canvas:#071b1d;--color-accent:#65e6c0;--color-island:#f6fbfa;--color-ink:#123436;--space-xs:.375rem;--space-s:.625rem;--control-size:clamp(2.25rem,6vw,2.625rem);--radius-pill:999px;--shadow-island:0 12px 36px #0008;--transition-fast:160ms ease}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--color-canvas);font:14px/1.5 system-ui,sans-serif}
.report-frame{display:block;width:100%;height:100%;border:0;background:#fff}
.reel{display:flex;align-items:center;gap:var(--space-xs);max-width:calc(100vw - 1.5rem);overflow-x:auto;scrollbar-width:none}.reel::-webkit-scrollbar{display:none}
.workspace-switcher{position:fixed;z-index:2;left:50%;bottom:clamp(.625rem,2vw,1.125rem);transform:translateX(-50%);padding:var(--space-xs) var(--space-s);border-radius:var(--radius-pill);background:var(--color-island);box-shadow:var(--shadow-island)}
.workspace-switcher__item{display:grid;flex:0 0 var(--control-size);width:var(--control-size);height:var(--control-size);place-items:center;border-radius:50%;color:var(--color-ink);font-weight:750;text-decoration:none;transition:background var(--transition-fast),color var(--transition-fast),box-shadow var(--transition-fast),transform var(--transition-fast)}
.workspace-switcher__item:hover{transform:translateY(-1px)}.workspace-switcher__item:focus-visible{outline:3px solid var(--color-ink);outline-offset:2px}.workspace-switcher__item[aria-current=page]{background:var(--color-accent);box-shadow:inset 0 0 0 2px #fff;color:#063b37}
@media(prefers-reduced-motion:reduce){.workspace-switcher__item{transition:none}}
</style></head><body><nav class="workspace-switcher reel" aria-label="Przełącz klienta lub domenę">${navigation}</nav><iframe class="report-frame" name="report" src="/${firstUnit.viewPath}" title="Raport SEO — ${escapeHtml(firstUnit.id)}"></iframe>
<script>
const nav=document.querySelector('.workspace-switcher'),frame=document.querySelector('.report-frame');
for(const link of nav.children)link.addEventListener('click',()=>{for(const item of nav.children)item.removeAttribute('aria-current');link.setAttribute('aria-current','page');frame.title='Raport SEO — '+link.getAttribute('aria-label')});
</script></body></html>`;
}

function embeddedReport(value: Buffer): Buffer {
  const style = '<style data-dashboard-embed="true">.client-switcher{display:none!important}</style>';
  const html = value.toString("utf8");
  return Buffer.from(html.includes("</head>") ? html.replace("</head>", `${style}</head>`) : `${style}${html}`, "utf8");
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

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
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
  const verifiedUnitHtml = new Map<string, Buffer>();
  const verifiedDashboardViews = new Map<string, Buffer>();
  for (const [index, unit] of manifest.units.entries()) {
    const entry = manifest.files[unit.html];
    if (!entry) throw new Error(`delivery unit '${unit.id}' html is absent from the manifest files`);
    const path = await resolveExistingInside(deliveryDir, unit.html, `delivery unit '${unit.id}' html`);
    const bytes = await readFile(path);
    if (bytes.byteLength !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`delivery unit '${unit.id}' html does not match the manifest`);
    verifiedUnitHtml.set(unit.html, bytes);
    verifiedDashboardViews.set(`__dashboard/unit/${index}`, embeddedReport(bytes));
  }
  const units = dashboardUnits(manifest.units);
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
      text(response, 200, dashboardShell(units), "text/html; charset=utf-8");
      return;
    }
    const relativePath = path === "/" ? "index.html" : path.slice(1);
    const dashboardView = verifiedDashboardViews.get(relativePath);
    if (dashboardView) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(dashboardView);
      return;
    }
    const verified = verifiedUnitHtml.get(relativePath);
    if (verified) {
      response.writeHead(200, { "content-type": contentType(relativePath), "cache-control": "no-store" });
      response.end(verified);
      return;
    }
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
