import assert from "node:assert/strict";
import test from "node:test";
import { parseClientContent } from "./client-content.js";

test("client content is deterministic, client-scoped, and sorted", () => {
  const content = parseClientContent({ schema_version: "1", client_id: "bodymove", actions: [
    { action_id: "b", client_id: "bodymove", period: { start: "2026-07-20", end: "2026-07-20" }, type: "nap_listing", status: "published", title: "Wizytówki NAP", target_url: null, published_at: "2026-07-20", notes: null },
    { action_id: "a", client_id: "bodymove", period: { start: "2026-07-01", end: "2026-07-01" }, type: "sponsored_article", status: "in_progress", title: "Artykuł sponsorowany", target_url: "https://bodymove.pl/", published_at: null, notes: null },
    { action_id: "other", client_id: "other-client", period: { start: "2026-07-01", end: "2026-07-01" }, type: "other", status: "planned", title: "Nie powinno trafić do Bodymove", target_url: null, published_at: null, notes: null },
  ], glossary: [{ term: "CTR", explanation: "Współczynnik klikalności" }, { term: "GSC", explanation: "Google Search Console" }], contact: { name: "Maciek", email: null, phone: null } });
  assert.deepEqual(content.actions.map((item) => item.action_id), ["a", "b"]);
  assert.deepEqual(content.glossary.map((item) => item.term), ["CTR", "GSC"]);
});

test("client content rejects unsupported action type", () => {
  assert.throws(() => parseClientContent({ schema_version: "1", client_id: "bodymove", actions: [{ action_id: "x", client_id: "bodymove", period: { start: "2026-07-01", end: "2026-07-01" }, type: "invented", status: "planned", title: "x" }], glossary: [], contact: null }), /type is unsupported/);
});
