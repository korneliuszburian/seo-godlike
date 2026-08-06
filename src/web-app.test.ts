import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { serveDashboard } from "./web-app.js";

test("dashboard serves the manifest-bound delivery package read-only", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-dashboard-"));
  const delivery = join(root, "delivery");
  await writeFile(join(root, "outside.txt"), "secret outside asset");
  await mkdir(join(delivery, "bodymove"), { recursive: true });
  await writeFile(join(delivery, "index.html"), "<html>dashboard</html>");
  await writeFile(join(delivery, "bodymove", "report.html"), "<html>client</html>");
  await writeFile(join(delivery, "manifest.json"), JSON.stringify({
    schema_version: "1",
    source: "client-delivery",
    execution: { provider_calls: 0 },
    files: { "index.html": { bytes: 23, sha256: "test" } },
    units: [{ id: "bodymove", kind: "client", html: "bodymove/report.html" }],
  }));
  const app = await serveDashboard({ deliveryDir: delivery, port: 0 });
  try {
    const health = await fetch(`${app.url}healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok", read_only: true, provider_calls: 0 });

    const units = await fetch(`${app.url}api/units`);
    assert.equal(units.status, 200);
    assert.deepEqual(await units.json(), { units: [{ id: "bodymove", kind: "client", html: "bodymove/report.html" }] });

    const index = await fetch(app.url);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /SEO Godlike/);

    const report = await fetch(`${app.url}bodymove/report.html`);
    assert.equal(report.status, 200);
    assert.match(await report.text(), /client/);

    const application = await fetch(`${app.url}app`);
    assert.equal(application.status, 200);
    const applicationHtml = await application.text();
    assert.match(applicationHtml, /fetch\('\/api\/units'\)/);
    assert.match(applicationHtml, /contentDocument\?\.querySelector\('\.client-switcher'\)/);

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
