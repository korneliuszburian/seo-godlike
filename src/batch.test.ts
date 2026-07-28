import assert from "node:assert/strict";
import { test } from "node:test";
import { runSequentialBatch } from "./batch.js";

test("sequential batch continues after one property failure", async () => {
  const visited: string[] = [];
  const result = await runSequentialBatch([
    { id: "bodymove", run: async () => { visited.push("bodymove"); } },
    { id: "blocked", run: async () => { visited.push("blocked"); throw new Error("scope denied"); } },
    { id: "other-property", run: async () => { visited.push("other-property"); } },
  ]);
  assert.deepEqual(visited, ["bodymove", "blocked", "other-property"]);
  assert.deepEqual(result.completed, ["bodymove", "other-property"]);
  assert.deepEqual(result.failed, [{ id: "blocked", error: "scope denied" }]);
});
