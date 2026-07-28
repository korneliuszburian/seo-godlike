function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export interface ScheduleOptions {
  workingDirectory: string;
  oauthClientPath: string;
  clientId: string;
  propertyId: string;
  registryPath: string;
  capabilitiesPath: string;
  artifactsDir: string;
}

export function buildDailyAnalyticsCron(options: ScheduleOptions): string {
  if (!/^[A-Za-z0-9._-]+$/.test(options.clientId)) throw new Error("clientId must be a shell-safe path segment");
  const output = `${shellQuote(options.artifactsDir)}/${options.clientId}-analytics-pipeline-$(date +\\%Y\\%m\\%d)`;
  const command = [
    "node", "dist/cli.js", "--analytics",
    "--client-id", shellQuote(options.clientId),
    "--property-id", shellQuote(options.propertyId),
    "--registry", shellQuote(options.registryPath),
    "--capabilities", shellQuote(options.capabilitiesPath),
    "--oauth-client", shellQuote(options.oauthClientPath),
    "--artifacts-dir", shellQuote(options.artifactsDir),
    "--output", output,
  ].join(" ");
  return `17 3 * * * cd ${shellQuote(options.workingDirectory)} && ${command}`;
}
