import assert from "node:assert/strict";
import test from "node:test";
import { ClientRegistry, SourceRegistry } from "./domain.js";
import { validateSourceRegistry } from "./source-registry.js";

const clients: ClientRegistry = { clients: [{ client_id: "bodymove", properties: [] }] };

test("source registry rejects an unknown tenant", () => {
  const registry: SourceRegistry = { sources: [{ source_id: "localo.unknown", client_id: "unknown", provider: "localo", target: "example.pl", status: "unavailable", reason: "not onboarded" }] };
  assert.throws(() => validateSourceRegistry(registry, clients), /unknown client 'unknown'/);
});

test("unavailable source may omit an unproven target", () => {
  const registry: SourceRegistry = { sources: [{ source_id: "ga4.bodymove", client_id: "bodymove", provider: "google-analytics", target: null, status: "unavailable", reason: "authorization not registered" }] };
  assert.doesNotThrow(() => validateSourceRegistry(registry, clients));
});

test("ready source must have a target", () => {
  const registry: SourceRegistry = { sources: [{ source_id: "localo.bodymove", client_id: "bodymove", provider: "localo", target: null, status: "ready", reason: null }] };
  assert.throws(() => validateSourceRegistry(registry, clients), /must declare target/);
});

test("ready external sources require provider-specific target syntax", () => {
  const registry: SourceRegistry = { sources: [{ source_id: "ga4.bodymove", client_id: "bodymove", provider: "google-analytics", target: "not-registered", status: "ready", reason: null }] };
  assert.throws(() => validateSourceRegistry(registry, clients), /numeric GA4 property target/);
});
