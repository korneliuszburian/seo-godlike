#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKET_VERSION = "1";

function canonicalJson(value) {
  const stable = (item) => {
    if (Array.isArray(item)) return item.map(stable);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, stable(nested)]));
    }
    return item;
  };
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function metadata(text, name) {
  return text.match(new RegExp(`^${name}:\\s*(.+)$`, "mi"))?.[1]?.trim() || null;
}

function section(text, name) {
  const heading = new RegExp(`^##\\s+${name}\\s*$`, "mi");
  const match = heading.exec(text);
  if (!match) return "";
  const rest = text.slice(match.index + match[0].length).replace(/^\r?\n/, "");
  const nextHeading = rest.search(/^##\s+/mi);
  return (nextHeading >= 0 ? rest.slice(0, nextHeading) : rest).trim();
}

function listSection(text, name) {
  return section(text, name).split("\n")
    .map((line) => line.trim().replace(/^-\s*(?:\[[ xX]\]|)\s*/, "").replace(/^`|`$/g, ""))
    .filter(Boolean);
}

function title(text) {
  return text.match(/^#\s+(.+)$/m)?.[1]?.trim() || null;
}

function safeText(value, label) {
  if (/^!\S/m.test(value)) throw new Error(`${label} contains an executable bang command`);
  if (/(?:OPENAI_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|BEGIN (?:RSA|OPENSSH|PRIVATE) KEY|ghp_[A-Za-z0-9]+)/.test(value)) {
    throw new Error(`${label} contains secret-like text`);
  }
}

export function validatePacket(packet) {
  const errors = [];
  const required = (path, value) => { if (value === undefined || value === null || value === "") errors.push(`${path} is required`); };
  required("packet_version", packet.packet_version);
  required("packet_id", packet.packet_id);
  required("content_sha256", packet.content_sha256);
  required("created_at", packet.created_at);
  if (packet.packet_version !== PACKET_VERSION) errors.push("packet_version must be 1");
  if (!/^krn_[a-f0-9]{64}$/.test(packet.packet_id || "")) errors.push("packet_id must be a sha256-derived krn id");
  if (!/^[a-f0-9]{64}$/.test(packet.content_sha256 || "")) errors.push("content_sha256 must be sha256");
  if (packet.packet_id && packet.content_sha256 && packetHashes(packet).packetId !== packet.packet_id) errors.push("packet_id does not match packet content");
  if (packet.packet_id && packet.content_sha256 && packetHashes(packet).contentSha !== packet.content_sha256) errors.push("content_sha256 does not match packet content");
  required("source.tracker", packet.source?.tracker);
  required("source.ticket_path", packet.source?.ticket_path);
  required("source.ticket_id", packet.source?.ticket_id);
  required("source.claim_id", packet.source?.claim_id);
  required("target.repo", packet.target?.repo);
  required("target.base_ref", packet.target?.base_ref);
  required("task.title", packet.task?.title);
  if (!Array.isArray(packet.task?.acceptance) || packet.task.acceptance.length === 0) errors.push("task.acceptance must be non-empty");
  if (!Array.isArray(packet.task?.owned_paths) || packet.task.owned_paths.length === 0) errors.push("task.owned_paths must be non-empty");
  if (!Array.isArray(packet.task?.non_goals) || packet.task.non_goals.length === 0) errors.push("task.non_goals must be non-empty");
  required("task.context_md", packet.task?.context_md);
  required("authority.commit", packet.authority?.commit);
  required("authority.push_pr", packet.authority?.push_pr);
  required("authority.merge", packet.authority?.merge);
  required("authority.krn_state", packet.authority?.krn_state);
  if (!/^(0|1|N)$/.test(packet.proof_expectations?.budget || "")) errors.push("proof_expectations.budget must be 0, 1, or N");
  for (const [label, value] of [
    ["task.context_md", packet.task?.context_md],
    ["task.title", packet.task?.title],
    ...((packet.task?.acceptance || []).map((item, i) => [`task.acceptance[${i}]`, item])),
    ...((packet.task?.owned_paths || []).map((item, i) => [`task.owned_paths[${i}]`, item])),
    ...((packet.task?.non_goals || []).map((item, i) => [`task.non_goals[${i}]`, item])),
  ]) {
    if (typeof value === "string") { try { safeText(value, label); } catch (error) { errors.push(error.message); } }
  }
  return errors;
}

function packetHashes(packet) {
  const withoutHashes = { ...packet, packet_id: null, content_sha256: null };
  const identity = sha256(canonicalJson(withoutHashes));
  const withIdentity = { ...packet, packet_id: `krn_${identity}`, content_sha256: null };
  return { packetId: `krn_${identity}`, contentSha: sha256(canonicalJson(withIdentity)) };
}

export function compilePacket(ticketText, { ticketPath, targetRepo, baseRef, createdAt }) {
  const ticketTitle = title(ticketText);
  const ticketId = basename(ticketPath).replace(/\.md$/i, "");
  const claimId = metadata(ticketText, "Claim ID")?.replace(/^`|`$/g, "");
  const acceptance = listSection(ticketText, "Acceptance");
  const ownedPaths = listSection(ticketText, "Owned paths");
  const nonGoals = listSection(ticketText, "Non-goals");
  const context = section(ticketText, "Context");
  if (!ticketTitle || !claimId || !acceptance.length || !ownedPaths.length || !nonGoals.length || !context) {
    throw new Error("ticket requires title, Claim ID, Acceptance, Owned paths, Non-goals, and Context");
  }
  const packet = {
    packet_version: PACKET_VERSION,
    packet_id: null,
    content_sha256: null,
    created_at: createdAt,
    source: {
      tracker: "krn-local-markdown",
      ticket_path: relative(process.cwd(), resolve(ticketPath)) || basename(ticketPath),
      ticket_id: ticketId,
      claim_id: claimId,
    },
    target: { repo: targetRepo, base_ref: baseRef },
    task: {
      title: ticketTitle,
      acceptance,
      owned_paths: ownedPaths,
      non_goals: nonGoals,
      context_md: `Ticket: ${ticketTitle}\n\n${context}`,
    },
    authority: {
      commit: "sandcastle-runner",
      push_pr: "sandcastle-action",
      merge: "human-host",
      krn_state: "krn-delivery-loop",
    },
    proof_expectations: { budget: "1", commands_hint: [] },
  };
  const hashes = packetHashes(packet);
  const result = { ...packet, packet_id: hashes.packetId, content_sha256: hashes.contentSha };
  const errors = validatePacket(result);
  if (errors.length) throw new Error(`invalid packet: ${errors.join("; ")}`);
  return result;
}

export async function writePacket(packet, outputPath) {
  const errors = validatePacket(packet);
  if (errors.length) throw new Error(`invalid packet: ${errors.join("; ")}`);
  await writeFile(outputPath, canonicalJson(packet), { encoding: "utf8", flag: "wx" });
}

export function renderPrompt(packet) {
  const errors = validatePacket(packet);
  if (errors.length) throw new Error(`invalid packet: ${errors.join("; ")}`);
  const bulletList = (items) => items.map((item) => `- ${item}`).join("\n");
  return [
    `# KRN context packet ${packet.packet_id}`,
    "",
    `Packet content hash: ${packet.content_sha256}`,
    `Target: ${packet.target.repo} @ ${packet.target.base_ref}`,
    "",
    `## Task: ${packet.task.title}`,
    "",
    packet.task.context_md,
    "",
    "## Acceptance",
    "",
    bulletList(packet.task.acceptance),
    "",
    "## Owned paths",
    "",
    bulletList(packet.task.owned_paths),
    "",
    "## Non-goals",
    "",
    bulletList(packet.task.non_goals),
    "",
    "## Proof expectations",
    "",
    `Budget: ${packet.proof_expectations.budget}`,
    ...packet.proof_expectations.commands_hint.map((command) => `- ${command}`),
    "",
    "## Authority",
    "",
    `- Commit: ${packet.authority.commit}`,
    `- Push/PR: ${packet.authority.push_pr}`,
    `- Merge: ${packet.authority.merge}`,
    `- KRN state: ${packet.authority.krn_state}`,
    "",
  ].join("\n");
}

export async function writePrompt(packet, outputPath) {
  await writeFile(outputPath, renderPrompt(packet), { encoding: "utf8", flag: "wx" });
}

function argument(argv, name, required = true) {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : null;
  if (required && !value) throw new Error(`missing ${name}`);
  return value;
}

async function main(argv) {
  const ticketPath = argument(argv, "--ticket");
  const output = argument(argv, "--output");
  const packet = compilePacket(await readFile(resolve(ticketPath), "utf8"), {
    ticketPath,
    targetRepo: argument(argv, "--target-repo"),
    baseRef: argument(argv, "--base-ref"),
    createdAt: argument(argv, "--created-at", false) || new Date().toISOString(),
  });
  await writePacket(packet, resolve(output));
  const promptOutput = argument(argv, "--prompt-output", false);
  if (promptOutput) await writePrompt(packet, resolve(promptOutput));
  process.stdout.write(`${JSON.stringify({ packet_id: packet.packet_id, output: resolve(output), prompt_output: promptOutput ? resolve(promptOutput) : null })}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
