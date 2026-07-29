import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ScopePlan, SourceRegistry } from "./domain.js";
import { writeAgencyReport } from "./agency-report.js";

test("agency report preserves unavailable sources instead of inventing metrics", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-godlike-agency-report-test-"));
  const scope: ScopePlan = {
    schema_version: "1",
    generated_at: "2026-07-29T00:00:00.000Z",
    status: "partial",
    entries: [{ client_id: "bodymove", client_display_name: "Bodymove", property_id: "properties/123", provider: "google-analytics", status: "unavailable", reason: "no live capability", metrics: [] }],
  };
  const output = join(root, "report");
  const sources: SourceRegistry = { sources: [{ source_id: "localo.bodymove", client_id: "bodymove", provider: "localo", target: "bodymove.pl", status: "unavailable", reason: "managed profile unavailable" }] };
  const summary = await writeAgencyReport(root, output, scope, "2026-07-29T00:00:00.000Z", sources);
  assert.equal(summary.report_status, "blocked");
  assert.deepEqual(summary.blocked_sources.map((source) => source.reason), ["no live capability", "managed profile unavailable"]);
  assert.equal(summary.source_status.at(-1)?.provider, "localo");
  assert.match(await readFile(join(output, "agency-report.md"), "utf8"), /unavailable/);
  assert.match(await readFile(join(output, "agency-report.html"), "utf8"), /no live capability/);
  await rm(root, { recursive: true, force: true });
});
