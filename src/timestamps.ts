export function assertCanonicalIsoDateTime(value: string, field = "captured_at"): void {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new Error(`${field} must be canonical ISO-8601 with milliseconds and Z timezone`);
  }
}
