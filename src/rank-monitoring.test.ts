import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readRankMonitoringBundle, writeRankMonitoringBundle } from "./rank-monitoring.js";
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
