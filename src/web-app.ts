import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile, readdir, realpath } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
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
  label: string;
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

interface VerifiedDelivery {
  manifest: DeliveryManifest;
  files: Map<string, Buffer>;
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
  const hostname = unitLabel(id);
  const label = hostname.split(".")[0] ?? hostname;
  const characters = label.replace(/[^a-z0-9]/gi, "");
  return (characters.slice(0, 2) || "--").toUpperCase();
}

function unitLabel(id: string): string {
  const label = id.replace(/^domain-/, "").replace(/^www\./, "");
  return label.replace(/^([a-z])/, (character) => character.toUpperCase());
}

function dashboardUnits(units: DeliveryUnit[]): DashboardUnit[] {
  return units.map((unit, index) => ({
    ...unit,
    initials: unitInitials(unit.id),
    label: unitLabel(unit.id),
    viewPath: `__dashboard/unit/${index}`,
  }));
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
  const navigation = units.map((unit, index) => `<a class="workspace-switcher__item" href="/${unit.viewPath}" target="report" aria-label="${escapeHtml(unit.label)}" data-dashboard-client="${escapeHtml(unit.label)}"${index === 0 ? ' aria-current="page"' : ""}><span aria-hidden="true">${escapeHtml(unit.initials)}</span><span class="visually-hidden">${escapeHtml(unit.label)}</span></a>`).join("");
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(firstUnit.label)} — SEO intelligence</title>
<style>
:root{color-scheme:light;--color-canvas:#edf1f0;--color-island:rgba(250,252,251,.94);--color-island-border:rgba(8,37,38,.13);--color-control:#eaf1ef;--color-ink:#173638;--color-ink-muted:#607577;--color-accent:#61e6bd;--color-focus:#092f30;--space-3xs:.1875rem;--space-2xs:.375rem;--space-xs:.625rem;--control-size:clamp(2.375rem,5vw,2.75rem);--dock-height:5.25rem;--radius-pill:999px;--shadow-island:0 1.25rem 3.75rem rgba(7,27,29,.22),0 .25rem .75rem rgba(7,27,29,.12);--transition-fast:160ms cubic-bezier(.2,.8,.2,1)}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--color-canvas);font:500 14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{display:grid;grid-template-rows:minmax(0,1fr) var(--dock-height)}
.report-frame{display:block;width:100%;height:100%;border:0;background:#fff;transition:opacity var(--transition-fast)}
.report-frame[data-state=loading]{opacity:.72}
.reel{display:flex;align-items:center;gap:var(--space-3xs);max-width:calc(100vw - 1rem);overflow-x:auto;overscroll-behavior-inline:contain;scroll-snap-type:inline proximity;scrollbar-width:none}.reel::-webkit-scrollbar{display:none}
.workspace-switcher{position:fixed;z-index:2;left:50%;bottom:clamp(.625rem,2vw,1.25rem);transform:translateX(-50%);padding:var(--space-2xs);border:1px solid var(--color-island-border);border-radius:var(--radius-pill);background:var(--color-island);box-shadow:var(--shadow-island);backdrop-filter:blur(1rem) saturate(1.2)}
.workspace-switcher__item{position:relative;display:grid;flex:0 0 var(--control-size);width:var(--control-size);height:var(--control-size);place-items:center;scroll-snap-align:center;border-radius:50%;background:var(--color-control);color:var(--color-ink-muted);font-size:.72rem;font-weight:800;letter-spacing:.03em;text-decoration:none;transition:background var(--transition-fast),color var(--transition-fast),box-shadow var(--transition-fast),transform var(--transition-fast)}
.workspace-switcher__item:hover{background:rgba(17,69,68,.08);color:var(--color-ink);transform:translateY(-1px)}
.workspace-switcher__item:focus-visible{outline:.1875rem solid var(--color-focus);outline-offset:var(--space-3xs)}
.workspace-switcher__item[aria-current=page]{background:var(--color-accent);box-shadow:inset 0 0 0 .125rem rgba(255,255,255,.72),0 .25rem .75rem rgba(25,157,124,.2);color:#063b37;transform:scale(1.04)}
.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
@media(prefers-reduced-motion:reduce){.workspace-switcher__item,.report-frame{transition:none}}
</style></head><body><iframe class="report-frame" name="report" src="/${firstUnit.viewPath}" title="Raport SEO — ${escapeHtml(firstUnit.label)}"></iframe><nav class="workspace-switcher reel" aria-label="Przełącz klienta" data-dashboard-island="true">${navigation}</nav>
<script>
const nav=document.querySelector('.workspace-switcher'),frame=document.querySelector('.report-frame');
const links=[...nav.querySelectorAll('[data-dashboard-client]')];
function activate(link){for(const item of links)item.removeAttribute('aria-current');link.setAttribute('aria-current','page');const label=link.getAttribute('data-dashboard-client');frame.title='Raport SEO — '+label;document.title=label+' — SEO intelligence';frame.dataset.state='loading'}
for(const link of links)link.addEventListener('click',()=>activate(link));
nav.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const current=Math.max(0,links.indexOf(document.activeElement));const next=event.key==='Home'?0:event.key==='End'?links.length-1:(current+(event.key==='ArrowRight'?1:-1)+links.length)%links.length;links[next].focus()});
frame.addEventListener('load',()=>{delete frame.dataset.state});
</script></body></html>`;
}

function embeddedReport(value: Buffer): Buffer {
  const style = '<style data-dashboard-embed="true">.client-switcher,.dashboard-nav{display:none!important}</style>';
  const html = value.toString("utf8");
  return Buffer.from(html.includes("</head>") ? html.replace("</head>", `${style}</head>`) : `${style}${html}`, "utf8");
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readVerifiedDelivery(deliveryDir: string): Promise<VerifiedDelivery> {
  const manifestPath = await resolveExistingInside(deliveryDir, "manifest.json", "delivery manifest");
  let value: unknown;
  try { value = JSON.parse(await readFile(manifestPath, "utf8")) as unknown; }
  catch (error) { throw new Error(`invalid delivery manifest: ${manifestPath}`, { cause: error }); }
  const manifest = parseManifest(value);
  if (manifest.schema_version !== "1") throw new Error(`unsupported delivery manifest version '${manifest.schema_version}'`);
  const files = new Map<string, Buffer>();
  for (const [name, entry] of Object.entries(manifest.files)) {
    const path = await resolveExistingInside(deliveryDir, name, `delivery manifest file '${name}'`);
    const bytes = await readFile(path);
    if (bytes.byteLength !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`delivery manifest file '${name}' does not match the manifest`);
    files.set(name, bytes);
  }
  for (const unit of manifest.units) {
    if (!files.has(unit.html)) throw new Error(`delivery unit '${unit.id}' html is absent from the manifest files`);
  }
  return { manifest, files };
}

export async function resolveLatestDashboardDelivery(rootDir: string): Promise<string> {
  const root = await realpath(resolve(rootDir));
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => (entry.isDirectory() || entry.isSymbolicLink()) && /^client-delivery-\d{8}T\d{6}$/.test(entry.name))
    .sort((left, right) => left.name === right.name ? 0 : left.name > right.name ? -1 : 1);
  for (const entry of entries) {
    const candidate = join(root, entry.name);
    const manifestPath = await resolveExistingInside(root, `${entry.name}/manifest.json`, `client delivery candidate '${entry.name}' manifest`);
    let value: unknown;
    try { value = JSON.parse(await readFile(manifestPath, "utf8")) as unknown; }
    catch (error) { throw new Error(`invalid client delivery candidate manifest: ${manifestPath}`, { cause: error }); }
    if (!isRecord(value) || typeof value.source !== "string") throw new Error(`invalid client delivery candidate manifest: ${manifestPath}`);
    if (value.source !== "agency-report.json") continue;
    await readVerifiedDelivery(candidate);
    return candidate;
  }
  throw new Error("no verified client delivery found in delivery root");
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
  if (host !== "127.0.0.1") throw new Error("dashboard host must be the loopback address 127.0.0.1");
  const port = options.port ?? 4173;
  const deliveryDir = options.deliveryDir;
  const { manifest, files: verifiedFiles } = await readVerifiedDelivery(deliveryDir);
  const verifiedDashboardViews = new Map<string, Buffer>();
  for (const [index, unit] of manifest.units.entries()) {
    verifiedDashboardViews.set(`__dashboard/unit/${index}`, embeddedReport(verifiedFiles.get(unit.html)!));
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
    const verified = verifiedFiles.get(relativePath);
    if (verified) {
      response.writeHead(200, { "content-type": contentType(relativePath), "cache-control": "no-store" });
      response.end(verified);
      return;
    }
    text(response, 404, "Not found", "text/plain; charset=utf-8");
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
