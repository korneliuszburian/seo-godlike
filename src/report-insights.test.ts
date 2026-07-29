import assert from "node:assert/strict";
import test from "node:test";
import { composeReportInsights } from "./report-insights.js";

test("report insights derive bounded signals without inventing recommendations", () => {
  const insights = composeReportInsights([
    { client_id: "bodymove", provider: "google-search-console", analytics: { current: { top_queries: [{ key: "rehab", impressions: 200, ctr: 0.01, position: 8 }] } } },
    { client_id: "bodymove", provider: "ahrefs", analytics: { current: { organic_keyword_rows: [{ keyword: "rehab", best_position: 7, sum_traffic: 12 }] } } },
  ]);
  assert.deepEqual(insights.map((item) => item.kind), ["ahrefs_opportunity", "low_ctr", "striking_distance"]);
  assert.equal(insights.every((item) => !item.evidence.includes("recommend")), true);
});
