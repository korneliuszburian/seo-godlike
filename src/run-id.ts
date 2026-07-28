export interface AnalyticsRunIdentity {
  clientId: string;
  propertyId: string;
  provider: string;
  start: string;
  end: string;
}

function encodePart(value: string): string {
  return encodeURIComponent(value);
}

export function buildAnalyticsRunId(identity: AnalyticsRunIdentity): string {
  return [
    "analytics",
    identity.clientId,
    identity.propertyId,
    identity.provider,
    identity.start,
    identity.end,
  ].map(encodePart).join("_");
}
