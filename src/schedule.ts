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
    "flock", "-n", shellQuote(lockPath), "node", "dist/cli.js", "--analytics",
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

export interface AgencyScheduleOptions {
  workingDirectory: string;
  oauthClientPath: string;
  registryPath: string;
  capabilitiesPath: string;
  sourceRegistryPath?: string;
  artifactsDir: string;
  reportDir: string;
  deliveryDir: string;
  clientContentPath?: string;
  clientContentBundlePath?: string;
  rankMonitoringPath?: string;
  keywordBundlePath?: string;
  keywordInputPath?: string;
  keywordBundleRoot?: string;
  lockPath?: string;
}

export function buildMonthlyAgencyCron(options: AgencyScheduleOptions): string {
  const lockPath = options.lockPath ?? `${options.artifactsDir}/.agency-monthly.lock`;
  const stamp = "$(date +\\%Y\\%m)";
  const output = `${shellQuote(options.artifactsDir)}/agency-run-${stamp}`;
  const report = `${shellQuote(options.reportDir)}/agency-report-${stamp}`;
  const delivery = `${shellQuote(options.deliveryDir)}/client-delivery-${stamp}`;
  const command = [
    "flock", "-n", shellQuote(lockPath), "node", "dist/cli.js", "--agency-run",
    "--registry", shellQuote(options.registryPath), "--capabilities", shellQuote(options.capabilitiesPath),
    "--oauth-client", shellQuote(options.oauthClientPath), "--artifacts-dir", shellQuote(options.artifactsDir), "--output", output,
    "--agency-report-output", report, "--delivery-output", delivery, "--pdf",
    ...(options.sourceRegistryPath ? ["--source-registry", shellQuote(options.sourceRegistryPath)] : []),
    ...(options.clientContentPath ? ["--client-content", shellQuote(options.clientContentPath)] : []),
    ...(options.clientContentBundlePath ? ["--client-content-bundle", shellQuote(options.clientContentBundlePath)] : []),
    ...(options.rankMonitoringPath ? ["--rank-monitoring", shellQuote(options.rankMonitoringPath)] : []),
    ...(options.keywordBundlePath ? ["--keyword-bundle", shellQuote(options.keywordBundlePath)] : []),
    ...(options.keywordInputPath ? ["--keyword-input", shellQuote(options.keywordInputPath)] : []),
    ...(options.keywordBundleRoot ? ["--keyword-bundle-root", shellQuote(options.keywordBundleRoot)] : []),
  ].join(" ");
  return `17 3 1 * * cd ${shellQuote(options.workingDirectory)} && ${command}`;
}
