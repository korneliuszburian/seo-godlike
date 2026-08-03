import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readRankMonitoringBundle } from "./rank-monitoring.js";
import { sha256 } from "./serialize.js";

test("rank monitoring bundle verifies identity and deterministic row order", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-"));
  try {
    const report = JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: "2026-08-03T00:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, rows: [{ keyword: "zeta", position: 8, previous_position: 9, search_engine: "google.pl", location: "PL", url: null }, { keyword: "alpha", position: 3, previous_position: 4, search_engine: "google.pl", location: "PL", url: "https://bodymove.pl/" }] });
    await writeFile(join(root, "report.json"), report);
    await writeFile(join(root, "manifest.json"), JSON.stringify({ files: { "report.json": { sha256: sha256(report), bytes: Buffer.byteLength(report) } } }));
    const result = await readRankMonitoringBundle(root, ["bodymove"]);
    assert.deepEqual(result.snapshot.rows.map((row) => row.keyword), ["alpha", "zeta"]);
    await assert.rejects(readRankMonitoringBundle(root, ["other"]), /identity mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
