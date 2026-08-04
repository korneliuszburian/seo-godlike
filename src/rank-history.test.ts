import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeRankHistoryDashboard } from "./rank-history.js";
import { readRankHistory } from "./rank-history.js";
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
    const summary = await writeRankHistoryDashboard(root, join(root, "dashboard"), ["bodymove"]);
    assert.equal(summary.snapshot_count, 2);
    assert.deepEqual(summary.comparisons.map((entry) => [entry.keyword, entry.previous_position, entry.current_position, entry.position_delta]), [["rehabilitacja", 9, 7, -2]]);
    assert.equal(summary.comparisons[0]?.manifest_sha256, summary.snapshots.find((snapshot) => snapshot.date_range.start === "2026-07-01")?.manifest_sha256);
    assert.match(await readFile(join(root, "dashboard", "rank-history.md"), "utf8"), /Historia monitoringu fraz/);
    const manifest = JSON.parse(await readFile(join(root, "dashboard", "manifest.json"), "utf8")) as { provider: string; source_manifest_sha256: string[]; files: Record<string, { sha256: string; bytes: number }> };
    assert.equal(manifest.provider, "serprobot");
    assert.equal(manifest.source_manifest_sha256.length, 2);
    for (const name of ["rank-history.json", "rank-history.md", "rank-history.html"]) {
      const bytes = await readFile(join(root, "dashboard", name));
      assert.equal(manifest.files[name]?.bytes, bytes.byteLength);
      assert.equal(manifest.files[name]?.sha256, createHash("sha256").update(bytes).digest("hex"));
      assert.equal((await stat(join(root, "dashboard", name))).mode & 0o777, 0o600);
    }
    assert.equal((await readRankHistory(root, ["bodymove"])).length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rank history keeps search configuration separate for the same keyword", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-history-config-"));
  try {
    const input = async (path: string, start: string, end: string, desktop: number, mobile: number) => {
      await writeFile(path, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: `${end}T12:00:00.000Z`, date_range: { start, end }, source_config: { project_id: "123", search_engine: "google.pl", location: "Warszawa", device: "desktop" }, rows: [
        { keyword: "rehabilitacja", position: desktop, previous_position: null, search_engine: "google.pl", location: "Warszawa", url: "https://bodymove.pl/" },
        { keyword: "rehabilitacja", position: mobile, previous_position: null, search_engine: "google.pl", location: "Warszawa", url: "https://bodymove.pl/", device: "mobile" },
      ] }));
    };
    await mkdir(join(root, "old"));
    await mkdir(join(root, "new"));
    const oldInput = join(root, "old-input.json");
    const newInput = join(root, "new-input.json");
    await input(oldInput, "2026-06-01", "2026-06-30", 9, 12);
    await input(newInput, "2026-07-01", "2026-07-31", 7, 8);
    await writeRankMonitoringBundle(oldInput, join(root, "old", "bundle"));
    await writeRankMonitoringBundle(newInput, join(root, "new", "bundle"));
    const summary = await writeRankHistoryDashboard(root, join(root, "dashboard"), ["bodymove"]);
    assert.equal(summary.comparisons.length, 2);
    const desktop = summary.comparisons.find((entry) => entry.device === "desktop");
    const mobile = summary.comparisons.find((entry) => entry.device === "mobile");
    assert.equal(desktop?.position_delta, -2);
    assert.equal(mobile?.position_delta, -4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rank history does not compare adjacent snapshots from different SERPROBOT projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-history-project-"));
  try {
    const input = async (path: string, start: string, end: string, project_id: string, position: number) => {
      await writeFile(path, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: `${end}T12:00:00.000Z`, date_range: { start, end }, source_config: { project_id, search_engine: "google.pl", location: "Warszawa", device: "desktop" }, rows: [{ keyword: "rehabilitacja", position, previous_position: null, search_engine: "google.pl", location: "Warszawa", device: "desktop", url: null }] }));
    };
    const oldInput = join(root, "old-input.json");
    const newInput = join(root, "new-input.json");
    await input(oldInput, "2026-06-01", "2026-06-30", "123", 9);
    await input(newInput, "2026-07-01", "2026-07-31", "456", 7);
    await writeRankMonitoringBundle(oldInput, join(root, "old"));
    await writeRankMonitoringBundle(newInput, join(root, "new"));
    const summary = await writeRankHistoryDashboard(root, join(root, "dashboard"), ["bodymove"]);
    assert.equal(summary.comparisons.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rank history rejects a snapshot outside the registry client scope", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-history-scope-"));
  try {
    const input = join(root, "foreign.json");
    await writeFile(input, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "other-client", captured_at: "2026-07-31T12:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, source_config: { project_id: "123", search_engine: "google.pl", location: null, device: null }, rows: [] }));
    await mkdir(join(root, "foreign"));
    await writeRankMonitoringBundle(input, join(root, "foreign", "bundle"));
    await assert.rejects(writeRankHistoryDashboard(root, join(root, "dashboard"), ["bodymove"]), /rank monitoring client identity mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rank history does not compare across a missing period", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-history-gap-"));
  try {
    const input = async (path: string, start: string, end: string, position: number) => {
      await writeFile(path, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: `${end}T12:00:00.000Z`, date_range: { start, end }, source_config: { project_id: "123", search_engine: "google.pl", location: "Warszawa", device: "desktop" }, rows: [{ keyword: "rehabilitacja", position, previous_position: null, search_engine: "google.pl", location: "Warszawa", url: null }] }));
    };
    await mkdir(join(root, "old"));
    await mkdir(join(root, "new"));
    const oldInput = join(root, "old-input.json");
    const newInput = join(root, "new-input.json");
    await input(oldInput, "2026-06-01", "2026-06-28", 9);
    await input(newInput, "2026-07-01", "2026-07-28", 7);
    await writeRankMonitoringBundle(oldInput, join(root, "old", "bundle"));
    await writeRankMonitoringBundle(newInput, join(root, "new", "bundle"));
    const summary = await writeRankHistoryDashboard(root, join(root, "dashboard"), ["bodymove"]);
    assert.equal(summary.comparisons.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rank history follows an in-root bundle symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-history-symlink-"));
  try {
    const input = join(root, "input.json");
    await writeFile(input, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: "2026-07-31T12:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, source_config: { project_id: "123", search_engine: "google.pl", location: null, device: null }, rows: [] }));
    await mkdir(join(root, "exports"));
    await writeRankMonitoringBundle(input, join(root, "exports", "real"));
    await symlink(join(root, "exports", "real"), join(root, "exports", "alias"));
    const summary = await writeRankHistoryDashboard(root, join(root, "dashboard"), ["bodymove"]);
    assert.equal(summary.snapshot_count, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rank history rejects an escaping manifest symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-rank-history-escape-"));
  const outside = await mkdtemp(join(tmpdir(), "seo-godlike-rank-history-outside-"));
  try {
    const input = join(root, "input.json");
    await writeFile(input, JSON.stringify({ schema_version: "1", provider: "serprobot", client_id: "bodymove", captured_at: "2026-07-31T12:00:00.000Z", date_range: { start: "2026-07-01", end: "2026-07-31" }, source_config: { project_id: "123", search_engine: "google.pl", location: null, device: null }, rows: [] }));
    await mkdir(join(root, "exports", "bundle"), { recursive: true });
    await writeRankMonitoringBundle(input, join(outside, "foreign"));
    await symlink(join(outside, "foreign", "manifest.json"), join(root, "exports", "bundle", "manifest.json"));
    await assert.rejects(writeRankHistoryDashboard(root, join(root, "dashboard"), ["bodymove"]), /rank history symlink escapes artifacts root/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
