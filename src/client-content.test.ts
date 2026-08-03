import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256 } from "./serialize.js";
import test from "node:test";
import { parseClientContent, readClientContentBundle, writeClientContentBundle } from "./client-content.js";

test("client content is deterministic, client-scoped, and sorted", () => {
  const content = parseClientContent({ schema_version: "1", client_id: "bodymove", actions: [
    { action_id: "b", client_id: "bodymove", period: { start: "2026-07-20", end: "2026-07-20" }, type: "nap_listing", status: "published", title: "Wizytówki NAP", target_url: null, published_at: "2026-07-20", notes: null },
    { action_id: "a", client_id: "bodymove", period: { start: "2026-07-01", end: "2026-07-01" }, type: "sponsored_article", status: "in_progress", title: "Artykuł sponsorowany", target_url: "https://bodymove.pl/", published_at: null, notes: null },
    { action_id: "other", client_id: "other-client", period: { start: "2026-07-01", end: "2026-07-01" }, type: "other", status: "planned", title: "Nie powinno trafić do Bodymove", target_url: null, published_at: null, notes: null },
  ], glossary: [{ term: "CTR", explanation: "Współczynnik klikalności" }, { term: "GSC", explanation: "Google Search Console" }], contact: { name: "Maciek", email: null, phone: null } });
  assert.deepEqual(content.actions.map((item) => item.action_id), ["a", "b"]);
  assert.deepEqual(content.glossary.map((item) => item.term), ["CTR", "GSC"]);
});

test("client content rejects unsupported action type", () => {
  assert.throws(() => parseClientContent({ schema_version: "1", client_id: "bodymove", actions: [{ action_id: "x", client_id: "bodymove", period: { start: "2026-07-01", end: "2026-07-01" }, type: "invented", status: "planned", title: "x" }], glossary: [], contact: null }), /type is unsupported/);
});

test("client content bundle verifies bytes and client identity before delivery", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-client-content-"));
  try {
    const content = JSON.stringify({ schema_version: "1", client_id: "bodymove", actions: [], glossary: [], contact: null });
    await writeFile(join(root, "client-content.json"), content);
    const manifest = JSON.stringify({ files: { "client-content.json": { sha256: sha256(content), bytes: Buffer.byteLength(content) } } });
    await writeFile(join(root, "manifest.json"), manifest);
    const result = await readClientContentBundle(root, ["bodymove"]);
    assert.equal(result.content.client_id, "bodymove");
    assert.equal(result.manifest_sha256, sha256(manifest));
    await assert.rejects(readClientContentBundle(root, ["other"]), /identity mismatch/);
    await writeFile(join(root, "client-content.json"), `${content} `);
    await assert.rejects(readClientContentBundle(root, ["bodymove"]), /manifest hash mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("client content packer writes a deterministic operator bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-content-pack-"));
  try {
    const input = join(root, "input.json");
    const output = join(root, "bundle");
    await writeFile(input, JSON.stringify({ schema_version: "1", client_id: "bodymove", actions: [], glossary: [{ term: "CTR", explanation: "Współczynnik" }], contact: null }));
    const result = await writeClientContentBundle(input, output);
    assert.equal(result.content.client_id, "bodymove");
    assert.equal((await readClientContentBundle(output, ["bodymove"])).content.glossary[0]?.term, "CTR");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
