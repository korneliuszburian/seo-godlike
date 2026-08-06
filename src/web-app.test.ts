import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveLatestDashboardDelivery, serveDashboard } from "./web-app.js";

function fileEntry(value: string): { sha256: string; bytes: number } {
  return {
    sha256: createHash("sha256").update(value).digest("hex"),
    bytes: Buffer.byteLength(value),
  };
}

async function writeRecurringDelivery(root: string, name: string, source = "agency-report.json"): Promise<string> {
  const delivery = join(root, name);
  const reportHtml = `<html><head></head><body>${name}</body></html>`;
  await mkdir(join(delivery, "bodymove"), { recursive: true });
  await writeFile(join(delivery, "bodymove", "report.html"), reportHtml);
  await writeFile(join(delivery, "manifest.json"), JSON.stringify({
    schema_version: "1",
    source,
    execution: { provider_calls: 0 },
    files: { "bodymove/report.html": fileEntry(reportHtml) },
    units: [{ id: "bodymove", kind: "client", html: "bodymove/report.html", pdf: null, email: "bodymove/report.eml" }],
  }));
  return delivery;
}

test("dashboard serves the manifest-bound delivery package read-only", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-dashboard-"));
  const delivery = join(root, "delivery");
  await writeFile(join(root, "outside.txt"), "secret outside asset");
  await mkdir(join(delivery, "bodymove"), { recursive: true });
  const indexHtml = "<html>dashboard</html>";
  const reportHtml = '<html><head></head><body><nav class="client-switcher">legacy navigation</nav><p>client</p></body></html>';
  await writeFile(join(delivery, "index.html"), indexHtml);
  await writeFile(join(delivery, "bodymove", "report.html"), reportHtml);
  await writeFile(join(delivery, "manifest.json"), JSON.stringify({
    schema_version: "1",
    source: "client-delivery",
    execution: { provider_calls: 0 },
    files: { "index.html": fileEntry(indexHtml), "bodymove/report.html": fileEntry(reportHtml) },
    units: [{ id: "bodymove", kind: "client", html: "bodymove/report.html", pdf: null, email: "bodymove/report.eml" }],
  }));
  const app = await serveDashboard({ deliveryDir: delivery, port: 0 });
  try {
    const health = await fetch(`${app.url}healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok", read_only: true, provider_calls: 0 });

    const units = await fetch(`${app.url}api/units`);
    assert.equal(units.status, 200);
    assert.deepEqual(await units.json(), { units: [{ id: "bodymove", kind: "client", html: "bodymove/report.html", pdf: null, email: "bodymove/report.eml" }] });

    const index = await fetch(app.url);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /SEO intelligence/);

    const report = await fetch(`${app.url}bodymove/report.html`);
    assert.equal(report.status, 200);
    assert.match(await report.text(), /client/);

    const application = await fetch(`${app.url}app`);
    assert.equal(application.status, 200);
    const applicationHtml = await application.text();
    assert.match(applicationHtml, /target="report"/);
    assert.match(applicationHtml, />BO<\/span>/);
    assert.match(applicationHtml, /href="\/__dashboard\/unit\/0"/);
    assert.equal(applicationHtml.match(/data-dashboard-island="true"/g)?.length, 1);
    assert.match(applicationHtml, /Bodymove — SEO intelligence/);
    assert.doesNotMatch(applicationHtml, /fetch\('\/api\/units'\)/);
    assert.doesNotMatch(applicationHtml, /contentDocument/);

    const embedded = await fetch(`${app.url}__dashboard/unit/0`);
    assert.equal(embedded.status, 200);
    assert.match(await embedded.text(), /\.client-switcher,\.dashboard-nav\{display:none!important\}/);

    const traversal = await fetch(`${app.url}../outside.txt`);
    assert.notEqual(traversal.status, 200);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("dashboard refuses an invalid delivery manifest before binding", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-dashboard-invalid-"));
  await writeFile(join(root, "manifest.json"), JSON.stringify({ schema_version: "1", source: "bad" }));
  await assert.rejects(() => serveDashboard({ deliveryDir: root, port: 0 }), /invalid delivery manifest/);
  await rm(root, { recursive: true, force: true });
});

test("dashboard refuses a non-loopback bind before reading client evidence", async () => {
  await assert.rejects(
    serveDashboard({ deliveryDir: "/operator-only/client-delivery", host: "0.0.0.0" }),
    /dashboard host must be the loopback address 127\.0\.0\.1/,
  );
});

test("dashboard rejects a delivery unit path outside the delivery root", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-dashboard-traversal-"));
  await writeFile(join(root, "manifest.json"), JSON.stringify({
    schema_version: "1",
    source: "client-delivery",
    execution: { provider_calls: 0 },
    files: { "../outside/report.html": fileEntry("outside") },
    units: [{ id: "bodymove", kind: "client", html: "../outside/report.html", pdf: null, email: "bodymove/report.eml" }],
  }));
  await assert.rejects(
    () => serveDashboard({ deliveryDir: root, port: 0 }),
    /delivery manifest file '\.\.\/outside\/report\.html' escapes its root/,
  );
  await rm(root, { recursive: true, force: true });
});

test("dashboard rejects a unit HTML file missing from or tampering with the manifest ledger", async (context) => {
  const reportHtml = "<html>client</html>";
  const validEntry = fileEntry(reportHtml);
  const cases = [
    { name: "missing ledger entry", files: {}, expected: /html is absent from the manifest files/ },
    { name: "hash mismatch", files: { "bodymove/report.html": { ...validEntry, sha256: "0".repeat(64) } }, expected: /delivery manifest file 'bodymove\/report\.html' does not match the manifest/ },
    { name: "byte-count mismatch", files: { "bodymove/report.html": { ...validEntry, bytes: validEntry.bytes + 1 } }, expected: /delivery manifest file 'bodymove\/report\.html' does not match the manifest/ },
  ];
  for (const scenario of cases) {
    await context.test(scenario.name, async () => {
      const root = await mkdtemp(join(tmpdir(), "seo-godlike-dashboard-ledger-"));
      await mkdir(join(root, "bodymove"), { recursive: true });
      await writeFile(join(root, "bodymove", "report.html"), reportHtml);
      await writeFile(join(root, "manifest.json"), JSON.stringify({
        schema_version: "1",
        source: "client-delivery",
        execution: { provider_calls: 0 },
        files: scenario.files,
        units: [{ id: "bodymove", kind: "client", html: "bodymove/report.html", pdf: null, email: "bodymove/report.eml" }],
      }));
      await assert.rejects(() => serveDashboard({ deliveryDir: root, port: 0 }), scenario.expected);
      await rm(root, { recursive: true, force: true });
    });
  }
});

test("dashboard rejects a delivery unit HTML symlink escaping the delivery root", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-dashboard-symlink-"));
  const delivery = join(root, "delivery");
  const outside = join(root, "outside.html");
  const reportHtml = "<html>outside</html>";
  await mkdir(join(delivery, "bodymove"), { recursive: true });
  await writeFile(outside, reportHtml);
  await symlink(outside, join(delivery, "bodymove", "report.html"));
  await writeFile(join(delivery, "manifest.json"), JSON.stringify({
    schema_version: "1",
    source: "client-delivery",
    execution: { provider_calls: 0 },
    files: { "bodymove/report.html": fileEntry(reportHtml) },
    units: [{ id: "bodymove", kind: "client", html: "bodymove/report.html", pdf: null, email: "bodymove/report.eml" }],
  }));
  await assert.rejects(
    () => serveDashboard({ deliveryDir: delivery, port: 0 }),
    /delivery manifest file 'bodymove\/report\.html' escapes its root through a symlink/,
  );
  await rm(root, { recursive: true, force: true });
});

test("dashboard delivery root selects the newest verified recurring package and skips unrelated output", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-dashboard-latest-"));
  try {
    const expected = await writeRecurringDelivery(root, "client-delivery-20260804T030000");
    await writeRecurringDelivery(root, "client-delivery-20260805T030000", "manual-preview");
    await mkdir(join(root, "client-delivery-preview"));
    assert.equal(await resolveLatestDashboardDelivery(root), expected);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("dashboard delivery root fails closed on a tampered newest recurring package", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-dashboard-latest-tampered-"));
  try {
    await writeRecurringDelivery(root, "client-delivery-20260803T030000");
    const newest = await writeRecurringDelivery(root, "client-delivery-20260804T030000");
    await writeFile(join(newest, "bodymove", "report.html"), "tampered after manifest");
    await assert.rejects(
      () => resolveLatestDashboardDelivery(root),
      /delivery manifest file 'bodymove\/report\.html' does not match the manifest/,
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("dashboard delivery root rejects a recurring package symlink escaping the root", async () => {
  const parent = await mkdtemp(join(tmpdir(), "seo-godlike-dashboard-latest-symlink-"));
  const root = join(parent, "root");
  try {
    await mkdir(root);
    const outside = await writeRecurringDelivery(parent, "outside-delivery");
    await symlink(outside, join(root, "client-delivery-20260804T030000"));
    await assert.rejects(
      () => resolveLatestDashboardDelivery(root),
      /client delivery candidate 'client-delivery-20260804T030000' manifest escapes its root through a symlink/,
    );
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("dashboard escapes an untrusted delivery unit identity in the shell", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-dashboard-escape-"));
  const reportHtml = "<html>client</html>";
  await mkdir(join(root, "unit"), { recursive: true });
  await writeFile(join(root, "unit", "report.html"), reportHtml);
  await writeFile(join(root, "manifest.json"), JSON.stringify({
    schema_version: "1",
    source: "client-delivery",
    execution: { provider_calls: 0 },
    files: { "unit/report.html": fileEntry(reportHtml) },
    units: [{ id: '"><img src=x onerror="alert(1)">', kind: "domain", html: "unit/report.html", pdf: null, email: "unit/report.eml" }],
  }));
  const app = await serveDashboard({ deliveryDir: root, port: 0 });
  try {
    const shell = await (await fetch(app.url)).text();
    assert.doesNotMatch(shell, /<img src=x/);
    assert.match(shell, /&quot;&gt;&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
