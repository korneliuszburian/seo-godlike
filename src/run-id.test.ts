import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAnalyticsRunId } from "./run-id.js";

test("analytics run identity includes encoded client, canonical property, provider, and range", () => {
  assert.equal(
    buildAnalyticsRunId({
      clientId: "bodymove",
      propertyId: "sc-domain:bodymove.pl",
      provider: "google-search-console",
      start: "2026-06-28",
      end: "2026-07-25",
    }),
    "analytics_bodymove_sc-domain%3Abodymove.pl_google-search-console_2026-06-28_2026-07-25",
  );
});

test("analytics run identity distinguishes canonical properties", () => {
  const common = { clientId: "bodymove", provider: "google-search-console", start: "2026-06-28", end: "2026-07-25" };
  assert.notEqual(
    buildAnalyticsRunId({ ...common, propertyId: "sc-domain:bodymove.pl" }),
    buildAnalyticsRunId({ ...common, propertyId: "sc-domain:other-property.pl" }),
  );
});
