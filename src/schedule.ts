import { assertShellSafeSegment } from "./shell.js";

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
  lockPath?: string;
}

export function buildDailyAnalyticsCron(options: ScheduleOptions): string {
  assertShellSafeSegment(options.clientId);
  const output = `${shellQuote(options.artifactsDir)}/${options.clientId}-analytics-pipeline-$(date +\\%Y\\%m\\%d)`;
  const lockPath = options.lockPath ?? `${options.artifactsDir}/.${options.clientId}-analytics.lock`;
  const command = [
    "flock", "-n", shellQuote(lockPath), "--", "node", "dist/cli.js", "--analytics",
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
