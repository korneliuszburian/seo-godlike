import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { compilePacket, renderPrompt, validatePacket, writePacket } from "./context-packet.mjs";

const ticket = `# Example packet task

Claim ID: claim_123

## Acceptance

- [ ] Compile a packet.
- [ ] Preserve bounded context.

## Owned paths

- scripts/context-packet.mjs

## Non-goals

- Creating GitHub Issues.

## Context

This is bounded operator-authored context.
`;

test("compiles a deterministic, hash-bound packet", () => {
  const first = compilePacket(ticket, { ticketPath: ".scratch/task.md", targetRepo: "owner/repo", baseRef: "master", createdAt: "2026-07-27T12:00:00.000Z" });
  const second = compilePacket(ticket, { ticketPath: ".scratch/task.md", targetRepo: "owner/repo", baseRef: "master", createdAt: "2026-07-27T12:00:00.000Z" });
  assert.deepEqual(first, second);
  assert.deepEqual(validatePacket(first), []);
  assert.equal(first.source.tracker, "krn-local-markdown");
  assert.equal(first.authority.merge, "human-host");
  const tampered = { ...first, task: { ...first.task, title: "tampered" } };
  assert.match(validatePacket(tampered).join("\n"), /does not match packet content/);
  assert.throws(() => renderPrompt(tampered), /invalid packet/);
  const prompt = renderPrompt(first);
  assert.match(prompt, /## Acceptance/);
  assert.match(prompt, /Preserve bounded context/);
  assert.match(prompt, /This is bounded operator-authored context/);
  assert.match(prompt, /human-host/);
  assert.doesNotMatch(prompt, /^!\S/m);
});

test("rejects executable lines and secret-like text", () => {
  assert.throws(() => compilePacket(ticket.replace("This is bounded operator-authored context.", "!echo unsafe"), { ticketPath: ".scratch/task.md", targetRepo: "owner/repo", baseRef: "master", createdAt: "2026-07-27T12:00:00.000Z" }), /bang command/);
  assert.throws(() => compilePacket(ticket.replace("This is bounded operator-authored context.", "OPENAI_API_KEY=secret"), { ticketPath: ".scratch/task.md", targetRepo: "owner/repo", baseRef: "master", createdAt: "2026-07-27T12:00:00.000Z" }), /secret-like/);
});

test("writes once and refuses overwrite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seo-packet-"));
  const output = join(directory, "packet.json");
  const packet = compilePacket(ticket, { ticketPath: ".scratch/task.md", targetRepo: "owner/repo", baseRef: "master", createdAt: "2026-07-27T12:00:00.000Z" });
  await writePacket(packet, output);
  assert.match(await readFile(output, "utf8"), /packet_version/);
  await assert.rejects(writePacket(packet, output), { code: "EEXIST" });
  await rm(directory, { recursive: true, force: true });
});
