import assert from "node:assert/strict";
import { test } from "node:test";
import { assertCanonicalIsoDateTime } from "./timestamps.js";

test("accepts canonical ISO timestamps and rejects legacy forms for new writes", () => {
  assert.doesNotThrow(() => assertCanonicalIsoDateTime("2026-07-28T08:00:00.000Z"));
  assert.throws(() => assertCanonicalIsoDateTime("2026-07-28"), /canonical ISO-8601/);
  assert.throws(() => assertCanonicalIsoDateTime("not-a-date"), /canonical ISO-8601/);
});
