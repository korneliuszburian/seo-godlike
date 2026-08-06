import { PolicyError } from "./domain.js";

export interface AhrefsCollectionPolicy {
  provider: "ahrefs";
  collection: "enabled" | "disabled";
  reason: string | null;
}

export const AHREFS_COLLECTION_POLICY: Readonly<AhrefsCollectionPolicy> = Object.freeze({
  provider: "ahrefs",
  collection: "disabled",
  reason: "Ahrefs collection is globally disabled by budget policy; existing verified evidence remains readable",
});

export function ahrefsCollectionBlockReason(
  policy: Readonly<AhrefsCollectionPolicy> = AHREFS_COLLECTION_POLICY,
): string | null {
  return policy.collection === "disabled"
    ? policy.reason ?? "Ahrefs collection is globally disabled by budget policy"
    : null;
}

export function assertAhrefsCollectionEnabled(
  policy: Readonly<AhrefsCollectionPolicy> = AHREFS_COLLECTION_POLICY,
): void {
  const reason = ahrefsCollectionBlockReason(policy);
  if (reason !== null) throw new PolicyError("policy", `policy: ${reason}`);
}
