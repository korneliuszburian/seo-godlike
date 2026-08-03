import assert from "node:assert/strict";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256 } from "./serialize.js";
import test from "node:test";
import { parseClientContent, readClientContentBundle, writeClientContentBundle } from "./client-content.js";

test("client content is deterministic and sorted", () => {
  const content = parseClientContent({ schema_version: "1", client_id: "bodymove", actions: [
    { action_id: "b", client_id: "bodymove", period: { start: "2026-07-20", end: "2026-07-20" }, type: "nap_listing", status: "published", title: "Wizytówki NAP", target_url: null, published_at: "2026-07-20", notes: null },
    { action_id: "a", client_id: "bodymove", period: { start: "2026-07-01", end: "2026-07-01" }, type: "sponsored_article", status: "in_progress", title: "Artykuł sponsorowany", target_url: "https://bodymove.pl/", published_at: null, notes: null },
  ], glossary: [{ term: "CTR", explanation: "Współczynnik klikalności" }, { term: "GSC", explanation: "Google Search Console" }], contact: { name: "Maciek", email: null, phone: null } });
  assert.deepEqual(content.actions.map((item) => item.action_id), ["a", "b"]);
  assert.deepEqual(content.glossary.map((item) => item.term), ["CTR", "GSC"]);
});

test("client content fails closed on a foreign action identity", () => {
  assert.throws(() => parseClientContent({ schema_version: "1", client_id: "bodymove", actions: [
    { action_id: "foreign", client_id: "other-client", period: { start: "2026-07-01", end: "2026-07-31" }, type: "other", status: "planned", title: "Obcy wpis", target_url: null, published_at: null, notes: null },
  ], glossary: [], contact: null }), /client_id mismatch/);
});

test("client content rejects duplicate action identities", () => {
  const action = { action_id: "same", client_id: "bodymove", period: { start: "2026-07-01", end: "2026-07-31" }, type: "other", status: "planned", title: "Wpis", target_url: null, published_at: null, notes: null };
  assert.throws(() => parseClientContent({ schema_version: "1", client_id: "bodymove", actions: [action, action], glossary: [], contact: null }), /duplicate client content action_id/);
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

test("client content bundle rejects a manifest file symlink escaping the bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-client-content-symlink-"));
  try {
    const content = JSON.stringify({ schema_version: "1", client_id: "bodymove", actions: [], glossary: [], contact: null });
    const outside = join(root, "outside.json");
    const bundle = join(root, "bundle");
    await mkdir(bundle);
    await writeFile(outside, content);
    await symlink(outside, join(bundle, "client-content.json"));
    await writeFile(join(bundle, "manifest.json"), JSON.stringify({ files: { "client-content.json": { sha256: sha256(content), bytes: Buffer.byteLength(content) } } }));
    await assert.rejects(readClientContentBundle(bundle, ["bodymove"]), /escapes its root through a symlink/);
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

test("client content bundle preserves multiple client action registers", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-multi-client-content-"));
  try {
    const input = join(root, "input.json");
    const output = join(root, "bundle");
    await writeFile(input, JSON.stringify({ schema_version: "1", clients: [
      { schema_version: "1", client_id: "zeta", actions: [{ action_id: "z", client_id: "zeta", period: { start: "2026-07-01", end: "2026-07-31" }, type: "nap_listing", status: "published", title: "Zeta NAP", target_url: null, published_at: null, notes: null }], glossary: [], contact: null },
      { schema_version: "1", client_id: "alpha", actions: [{ action_id: "a", client_id: "alpha", period: { start: "2026-07-01", end: "2026-07-31" }, type: "sponsored_article", status: "planned", title: "Alpha article", target_url: null, published_at: null, notes: null }], glossary: [], contact: null },
    ] }));
    const packed = await writeClientContentBundle(input, output);
    assert.deepEqual(packed.contents.map((content) => content.client_id), ["alpha", "zeta"]);
    const read = await readClientContentBundle(output, ["alpha", "zeta"]);
    assert.deepEqual(read.contents.map((content) => content.client_id), ["alpha", "zeta"]);
    assert.equal(read.contents.find((content) => content.client_id === "zeta")?.actions[0]?.title, "Zeta NAP");
    await assert.rejects(readClientContentBundle(output, ["alpha"]), /identity mismatch: zeta/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
