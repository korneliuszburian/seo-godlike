import { realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";

export function resolveInside(root: string, child: string, label: string): string {
  if (!child || child.startsWith("/") || child.includes("\\")) throw new Error(`${label} must be a relative path`);
  const resolvedRoot = resolve(root);
  const resolvedChild = resolve(resolvedRoot, child);
  if (resolvedChild !== resolvedRoot && !resolvedChild.startsWith(`${resolvedRoot}${sep}`)) throw new Error(`${label} escapes its root`);
  return resolvedChild;
}

export async function resolveExistingInside(root: string, child: string, label: string): Promise<string> {
  const lexical = resolveInside(root, child, label);
  const [realRoot, realChild] = await Promise.all([realpath(resolve(root)), realpath(lexical)]);
  if (realChild !== realRoot && !realChild.startsWith(`${realRoot}${sep}`)) throw new Error(`${label} escapes its root through a symlink`);
  return realChild;
}
