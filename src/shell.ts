export function assertShellSafeSegment(value: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error("value must be a shell-safe path segment");
}
