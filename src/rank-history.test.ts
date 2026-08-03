import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeRankHistoryDashboard } from "./rank-history.js";
import { writeRankMonitoringBundle } from "./rank-monitoring.js";

test("rank history compares shared keywords across verified non-overlapping snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-history-"));
  try {
    const input = async (path: string, start: string, end: string, position: number) => {
      await writeFile(path, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: `${end}T12:00:00.000Z`, date_range: { start, end }, source_config: { project_id: "123", search_engine: "google.pl", location: "Warszawa", device: "desktop" }, rows: [{ keyword: "rehabilitacja", position, previous_position: null, search_engine: "google.pl", location: "Warszawa", url: "https://bodymove.pl/" }] }));
    };
    await mkdir(join(root, "old"));
    await mkdir(join(root, "new"));
    const oldInput = join(root, "old-input.json");
    const newInput = join(root, "new-input.json");
    await input(oldInput, "2026-06-01", "2026-06-30", 9);
    await input(newInput, "2026-07-01", "2026-07-31", 7);
    await writeRankMonitoringBundle(oldInput, join(root, "old", "bundle"));
    await writeRankMonitoringBundle(newInput, join(root, "new", "bundle"));
    const summary = await writeRankHistoryDashboard(root, join(root, "dashboard"));
    assert.equal(summary.snapshot_count, 2);
    assert.deepEqual(summary.comparisons.map((entry) => [entry.keyword, entry.previous_position, entry.current_position, entry.position_delta]), [["rehabilitacja", 9, 7, -2]]);
    assert.match(await readFile(join(root, "dashboard", "rank-history.md"), "utf8"), /Historia monitoringu fraz/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
