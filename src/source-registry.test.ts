import assert from "node:assert/strict";
import test from "node:test";
import { ClientRegistry, SourceRegistry } from "./domain.js";
import { validateSourceRegistry } from "./source-registry.js";
import { addSource, addSources } from "./source-registry.js";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const clients: ClientRegistry = { clients: [{ client_id: "bodymove", properties: [] }] };

test("source registry rejects an unknown tenant", () => {
  const registry: SourceRegistry = { sources: [{ source_id: "localo.unknown", client_id: "unknown", provider: "localo", target: "example.pl", status: "unavailable", reason: "not onboarded" }] };
  assert.throws(() => validateSourceRegistry(registry, clients), /unknown client 'unknown'/);
});

test("unavailable source may omit an unproven target", () => {
  const registry: SourceRegistry = { sources: [{ source_id: "ga4.bodymove", client_id: "bodymove", provider: "google-analytics", target: null, status: "unavailable", reason: "authorization not registered" }] };
  assert.doesNotThrow(() => validateSourceRegistry(registry, clients));
});

test("unavailable rank and visibility sources are valid explicit registry entries", () => {
  const clients: ClientRegistry = { clients: [{ client_id: "bodymove", properties: [] }] };
  const registry: SourceRegistry = { sources: [
    { source_id: "serprobot.bodymove", client_id: "bodymove", provider: "serprobot", target: null, status: "unavailable", reason: "rank snapshot not imported" },
    { source_id: "semstorm.bodymove", client_id: "bodymove", provider: "semstorm", target: null, status: "unavailable", reason: "visibility export not imported" },
  ] };
  assert.doesNotThrow(() => validateSourceRegistry(registry, clients));
});

test("ready source must have a target", () => {
  const registry: SourceRegistry = { sources: [{ source_id: "localo.bodymove", client_id: "bodymove", provider: "localo", target: null, status: "ready", reason: null }] };
  assert.throws(() => validateSourceRegistry(registry, clients), /must declare target/);
});

test("ready external sources require provider-specific target syntax", () => {
  const registry: SourceRegistry = { sources: [{ source_id: "ga4.bodymove", client_id: "bodymove", provider: "google-analytics", target: "not-registered", status: "ready", reason: null }] };
  assert.throws(() => validateSourceRegistry(registry, clients), /numeric GA4 property target/);
});

test("ready SERPROBOT source requires a numeric project id", () => {
  const registry: SourceRegistry = { sources: [{ source_id: "serprobot.bodymove", client_id: "bodymove", provider: "serprobot", target: "project-bodymove", status: "ready", reason: null }] };
  assert.throws(() => validateSourceRegistry(registry, clients), /numeric SERPROBOT project target/);
  assert.doesNotThrow(() => validateSourceRegistry({ sources: [{ ...registry.sources[0], target: "12345" }] }, clients));
});

test("source onboarding writes a validated source atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-source-registry-"));
  try {
    const path = join(root, "sources.json");
    const initial: SourceRegistry = { sources: [] };
    await writeFile(path, JSON.stringify(initial), "utf8");
    const result = await addSource({ registryPath: path, source_id: "serprobot.bodymove", client_id: "bodymove", provider: "serprobot", target: "123", status: "ready", reason: null, search_engine: "google.pl", location: "Warszawa", device: "desktop" }, clients);
    assert.equal(result.sources[0]?.target, "123");
    assert.equal((JSON.parse(await readFile(path, "utf8")) as SourceRegistry).sources.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("source onboarding rejects duplicates without mutating the registry", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-source-registry-"));
  try {
    const path = join(root, "sources.json");
    const initial: SourceRegistry = { sources: [{ source_id: "serprobot.bodymove", client_id: "bodymove", provider: "serprobot", target: null, status: "unavailable", reason: "pending" }] };
    const original = JSON.stringify(initial);
    await writeFile(path, original, "utf8");
    await assert.rejects(addSource({ registryPath: path, source_id: "serprobot.bodymove", client_id: "bodymove", provider: "serprobot", target: "123", status: "ready", reason: null }, clients), /duplicate source_id/);
    assert.equal(await readFile(path, "utf8"), original);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("source batch onboarding is atomic when one entry is invalid", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-source-registry-batch-"));
  try {
    const path = join(root, "sources.json");
    const initial: SourceRegistry = { sources: [] };
    const original = JSON.stringify(initial);
    await writeFile(path, original, "utf8");
    await assert.rejects(addSources({ registryPath: path, sources: [
      { source_id: "ga4.bodymove", client_id: "bodymove", provider: "google-analytics", target: "properties/123", status: "ready", reason: null },
      { source_id: "serprobot.bodymove", client_id: "bodymove", provider: "serprobot", target: "not-numeric", status: "ready", reason: null },
    ] }, clients), /numeric SERPROBOT project target/);
    assert.equal(await readFile(path, "utf8"), original);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("source batch onboarding commits all valid sources in canonical order", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-source-registry-batch-"));
  try {
    const path = join(root, "sources.json");
    await writeFile(path, JSON.stringify({ sources: [] }), "utf8");
    const result = await addSources({ registryPath: path, sources: [
      { source_id: "ga4.bodymove", client_id: "bodymove", provider: "google-analytics", target: "properties/123", status: "ready", reason: null },
      { source_id: "serprobot.bodymove", client_id: "bodymove", provider: "serprobot", target: "456", status: "ready", reason: null, search_engine: "google.pl", location: "Warszawa", device: "desktop" },
    ] }, clients);
    assert.deepEqual(result.sources.map((source) => source.source_id), ["ga4.bodymove", "serprobot.bodymove"]);
    assert.equal((JSON.parse(await readFile(path, "utf8")) as SourceRegistry).sources.length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});
