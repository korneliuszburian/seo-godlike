import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readRankMonitoringBundle, resolveLatestRankMonitoringBundle, resolveRankMonitoringRoot, writeRankMonitoringBundle } from "./rank-monitoring.js";
import { sha256 } from "./serialize.js";

test("rank monitoring bundle verifies identity and deterministic row order", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-"));
  try {
    const report = JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: "2026-08-03T00:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, source_config: { project_id: "123", search_engine: "google.pl", location: "Warszawa", device: "desktop" }, rows: [{ keyword: "zeta", position: 8, previous_position: 9, search_engine: "google.pl", location: "PL", url: null }, { keyword: "alpha", position: 3, previous_position: 4, search_engine: "google.pl", location: "PL", url: "https://bodymove.pl/" }] });
    await writeFile(join(root, "report.json"), report);
    await writeFile(join(root, "manifest.json"), JSON.stringify({ files: { "report.json": { sha256: sha256(report), bytes: Buffer.byteLength(report) } } }));
    const result = await readRankMonitoringBundle(root, ["bodymove"]);
    assert.deepEqual(result.snapshot.rows.map((row) => row.keyword), ["alpha", "zeta"]);
    assert.equal(result.snapshot.source_config?.project_id, "123");
    await assert.rejects(readRankMonitoringBundle(root, ["other"]), /identity mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rank monitoring rejects malformed SERPROBOT source configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-invalid-"));
  try {
    const input = join(root, "input.json");
    await writeFile(input, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: "2026-08-03T00:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, source_config: { project_id: "project", search_engine: "google.pl" }, rows: [] }));
    await assert.rejects(writeRankMonitoringBundle(input, join(root, "bundle")), /invalid SERPROBOT source configuration/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rank monitoring rejects an unparseable capture timestamp", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-date-"));
  try {
    const input = join(root, "input.json");
    await writeFile(input, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: "not-a-date", date_range: { start: "2026-07-01", end: "2026-07-31" }, rows: [] }));
    await assert.rejects(writeRankMonitoringBundle(input, join(root, "bundle")), /invalid rank monitoring snapshot metadata/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rank monitoring packer creates the manifest-bound input expected by delivery", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-pack-"));
  try {
    const input = join(root, "input.json");
    const output = join(root, "bundle");
    await writeFile(input, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: "2026-08-03T00:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, rows: [{ keyword: "zeta", position: 8, previous_position: 9, search_engine: "google.pl", location: "PL", url: null }] }));
    const result = await writeRankMonitoringBundle(input, output);
    assert.equal(result.snapshot.rows.length, 1);
    assert.equal((await readRankMonitoringBundle(output, ["bodymove"])).snapshot.rows[0]?.keyword, "zeta");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rank monitoring collection keeps multiple client snapshots in one manifest-bound bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-multi-"));
  try {
    const input = join(root, "input.json");
    const output = join(root, "bundle");
    const snapshot = (client_id: string, project_id: string, keyword: string) => ({ schema_version: "1", provider: "serprobot", client_id, captured_at: "2026-08-03T00:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, source_config: { project_id, search_engine: "google.pl", location: null, device: null }, rows: [{ keyword, position: 4, previous_position: null, search_engine: "google.pl", location: "PL", url: null }] });
    await writeFile(input, JSON.stringify({ schema_version: "1", provider: "serprobot", snapshots: [snapshot("zeta-client", "22", "zeta"), snapshot("bodymove", "11", "rehabilitacja")] }));
    const result = await writeRankMonitoringBundle(input, output);
    assert.deepEqual(result.snapshots.map((item) => item.client_id), ["bodymove", "zeta-client"]);
    const read = await readRankMonitoringBundle(output, ["bodymove", "zeta-client"]);
    assert.deepEqual(read.snapshots.map((item) => [item.client_id, item.source_config?.project_id]), [["bodymove", "11"], ["zeta-client", "22"]]);
    await assert.rejects(readRankMonitoringBundle(output, ["bodymove"]), /identity mismatch: zeta-client/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rank monitoring root selects the newest complete manifest-bound export", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-root-"));
  try {
    const snapshot = (capturedAt: string, client_id: string) => ({ schema_version: "1", provider: "serprobot", client_id, captured_at: capturedAt, date_range: { start: "2026-07-01", end: capturedAt.slice(0, 10) }, source_config: { project_id: "123", search_engine: "google.pl", location: null, device: null }, rows: [] });
    const oldInput = join(root, "old.json");
    const newInput = join(root, "new.json");
    await writeFile(oldInput, JSON.stringify({ schema_version: "1", provider: "serprobot", snapshots: [snapshot("2026-07-15T00:00:00.000Z", "bodymove")] }));
    await writeFile(newInput, JSON.stringify({ schema_version: "1", provider: "serprobot", snapshots: [snapshot("2026-08-03T00:00:00.000Z", "bodymove")] }));
    await mkdir(join(root, "exports"));
    await writeRankMonitoringBundle(oldInput, join(root, "exports", "old"));
    await writeRankMonitoringBundle(newInput, join(root, "exports", "new"));
    assert.equal(await resolveLatestRankMonitoringBundle(join(root, "exports"), ["bodymove"]), join(root, "exports", "new"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rank monitoring root skips a stale export with a foreign client", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-root-stale-"));
  try {
    const snapshot = (capturedAt: string, client_id: string) => ({ schema_version: "1", provider: "serprobot", client_id, captured_at: capturedAt, date_range: { start: "2026-07-01", end: capturedAt.slice(0, 10) }, source_config: { project_id: "123", search_engine: "google.pl", location: null, device: null }, rows: [] });
    const oldInput = join(root, "old.json");
    const newInput = join(root, "new.json");
    await writeFile(oldInput, JSON.stringify({ schema_version: "1", provider: "serprobot", snapshots: [snapshot("2026-07-15T00:00:00.000Z", "bodymove"), snapshot("2026-07-15T00:00:00.000Z", "retired-client")] }));
    await writeFile(newInput, JSON.stringify({ schema_version: "1", provider: "serprobot", snapshots: [snapshot("2026-08-03T00:00:00.000Z", "bodymove")] }));
    await mkdir(join(root, "exports"));
    await writeRankMonitoringBundle(oldInput, join(root, "exports", "old"));
    await writeRankMonitoringBundle(newInput, join(root, "exports", "new"));
    assert.equal(await resolveLatestRankMonitoringBundle(join(root, "exports"), ["bodymove"]), join(root, "exports", "new"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rank monitoring root ignores unrelated provider manifests", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-root-mixed-"));
  try {
    const input = join(root, "input.json");
    await writeFile(input, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: "2026-08-03T00:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, rows: [] }));
    await mkdir(join(root, "exports"));
    await writeRankMonitoringBundle(input, join(root, "exports", "rank"));
    await mkdir(join(root, "exports", "unrelated"));
    await writeFile(join(root, "exports", "unrelated", "manifest.json"), JSON.stringify({ schema_version: "1", files: {} }));
    assert.equal(await resolveLatestRankMonitoringBundle(join(root, "exports"), ["bodymove"]), join(root, "exports", "rank"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rank monitoring root fails instead of silently falling back after a matching export is tampered", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-root-tampered-"));
  try {
    const input = join(root, "input.json");
    await writeFile(input, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: "2026-08-03T00:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, source_config: { project_id: "123", search_engine: "google.pl", location: null, device: null }, rows: [] }));
    await mkdir(join(root, "exports"));
    await writeRankMonitoringBundle(input, join(root, "exports", "latest"));
    await writeFile(join(root, "exports", "latest", "report.json"), "tampered", "utf8");
    await assert.rejects(resolveLatestRankMonitoringBundle(join(root, "exports"), ["bodymove"]), /rank monitoring manifest hash mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rank monitoring root fails on an unparseable manifest instead of falling back", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-root-manifest-"));
  try {
    const input = join(root, "input.json");
    await writeFile(input, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: "2026-08-03T00:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, rows: [] }));
    await mkdir(join(root, "exports"));
    await writeRankMonitoringBundle(input, join(root, "exports", "valid"));
    await mkdir(join(root, "exports", "corrupt"));
    await writeFile(join(root, "exports", "corrupt", "manifest.json"), "{broken", "utf8");
    await assert.rejects(resolveLatestRankMonitoringBundle(join(root, "exports"), ["bodymove"]), /invalid rank monitoring manifest/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rank monitoring root is confined to the artifacts directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-root-confinement-"));
  try {
    const artifacts = join(root, "artifacts");
    const nested = join(artifacts, "rank");
    const outside = join(root, "outside");
    await mkdir(nested, { recursive: true });
    await mkdir(outside);
    assert.equal(await resolveRankMonitoringRoot(nested, artifacts), nested);
    await assert.rejects(resolveRankMonitoringRoot(outside, artifacts), /escapes artifacts directory/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
