import { isAbsolute, relative, resolve } from "node:path";
import { assertShellSafeSegment } from "./shell.js";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function assertNoParentTraversal(value: string, label: string): void {
  if (value.split(/[\\/]+/).includes("..")) throw new Error(`${label} must not contain parent traversal`);
}

function assertPathWithin(root: string, candidate: string, label: string): void {
  const relativePath = relative(resolve(root), resolve(candidate));
  if (relativePath === ".." || relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(relativePath)) {
    throw new Error(`${label} must be inside artifactsDir`);
  }
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
  const output = `${shellQuote(options.artifactsDir)}/${options.clientId}-analytics-pipeline-$(date +\\%Y\\%m\\%dT\\%H\\%M\\%S)`;
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
  historyDir?: string;
  rankHistoryDir?: string;
  clientContentPath?: string;
  clientContentBundlePath?: string;
  rankMonitoringPath?: string;
  rankMonitoringRoot?: string;
  keywordBundlePath?: string;
  keywordInputPath?: string;
  keywordBundleRoot?: string;
  keywordResearch?: boolean;
  allowEstimatedBudget?: boolean;
  keywordCountry?: string;
  ahrefsDate?: string;
  ahrefsCountry?: string;
  keywordMaxRequests?: string;
  keywordMaxApiUnits?: string;
  lockPath?: string;
}

export function buildMonthlyAgencyCron(options: AgencyScheduleOptions): string {
  if (options.rankMonitoringPath && options.rankMonitoringRoot) throw new Error("rank monitoring path and root are mutually exclusive");
  if (options.keywordResearch && !options.keywordInputPath) throw new Error("keyword research scheduling requires keywordInputPath");
  if (options.keywordResearch && options.keywordBundlePath) throw new Error("keyword research scheduling cannot combine with an existing keyword bundle");
  if (options.keywordResearch && !options.allowEstimatedBudget) throw new Error("keyword research scheduling requires allowEstimatedBudget");
  if (options.rankMonitoringRoot) assertPathWithin(options.artifactsDir, options.rankMonitoringRoot, "rankMonitoringRoot");
  if (options.historyDir) assertNoParentTraversal(options.historyDir, "historyDir");
  if (options.rankHistoryDir) assertNoParentTraversal(options.rankHistoryDir, "rankHistoryDir");
  const lockPath = options.lockPath ?? `${options.artifactsDir}/.agency-monthly.lock`;
  const stamp = '"$agency_run_stamp"';
  const output = `${shellQuote(options.artifactsDir)}/agency-run-${stamp}`;
  const report = `${shellQuote(options.reportDir)}/agency-report-${stamp}`;
  const delivery = `${shellQuote(options.deliveryDir)}/client-delivery-${stamp}`;
  const history = options.historyDir ? `${shellQuote(options.historyDir)}/history-${stamp}` : `${shellQuote(options.reportDir)}/history-${stamp}`;
  const rankHistory = options.rankHistoryDir ? `${shellQuote(options.rankHistoryDir)}/rank-history-${stamp}` : `${shellQuote(options.reportDir)}/rank-history-${stamp}`;
  const prepareRoots = `install -d -m 700 ${[...new Set([
    options.artifactsDir,
    options.reportDir,
    options.deliveryDir,
    ...(options.historyDir ? [options.historyDir] : []),
    ...(options.rankHistoryDir ? [options.rankHistoryDir] : []),
  ])].filter((path) => path !== "." && path !== "" && path !== "/").map(shellQuote).join(" ")}`;
  const pdfRendererPreflight = "test -n \"${XDG_RUNTIME_DIR:-}\" && test -x /usr/bin/systemd-run && test -x /usr/bin/bwrap && test -x /usr/bin/chromium && test -x /usr/bin/qpdf";
  const command = [
    "node", "dist/cli.js", "--agency-run",
    "--registry", shellQuote(options.registryPath), "--capabilities", shellQuote(options.capabilitiesPath),
    "--oauth-client", shellQuote(options.oauthClientPath), "--artifacts-dir", shellQuote(options.artifactsDir), "--output", output,
    "--run-id", '"agency-run-$agency_run_stamp"',
    "--agency-report-output", report, "--delivery-output", delivery, "--pdf",
    ...(options.ahrefsDate ? ["--ahrefs-date", shellQuote(options.ahrefsDate)] : []),
    ...(options.ahrefsCountry ? ["--ahrefs-country", shellQuote(options.ahrefsCountry)] : []),
    ...(options.sourceRegistryPath ? ["--source-registry", shellQuote(options.sourceRegistryPath)] : []),
    ...(options.clientContentPath ? ["--client-content", shellQuote(options.clientContentPath)] : []),
    ...(options.clientContentBundlePath ? ["--client-content-bundle", shellQuote(options.clientContentBundlePath)] : []),
    ...(options.rankMonitoringPath ? ["--rank-monitoring", shellQuote(options.rankMonitoringPath)] : []),
    ...(options.rankMonitoringRoot ? ["--rank-monitoring-root", shellQuote(options.rankMonitoringRoot)] : []),
    ...(options.keywordBundlePath ? ["--keyword-bundle", shellQuote(options.keywordBundlePath)] : []),
    ...(options.keywordInputPath ? ["--keyword-input", shellQuote(options.keywordInputPath)] : []),
    ...(options.keywordBundleRoot ? ["--keyword-bundle-root", shellQuote(options.keywordBundleRoot)] : []),
    ...(options.keywordResearch ? ["--keyword-research", "--keyword-research-output", `${output}/keyword-research`, ...(options.allowEstimatedBudget ? ["--allow-estimated-budget"] : [])] : []),
    ...(options.keywordCountry ? ["--keyword-country", shellQuote(options.keywordCountry)] : []),
    ...(options.keywordMaxRequests ? ["--keyword-max-requests", shellQuote(options.keywordMaxRequests)] : []),
    ...(options.keywordMaxApiUnits ? ["--keyword-max-api-units", shellQuote(options.keywordMaxApiUnits)] : []),
  ].join(" ");
  const historyCommand = `node dist/cli.js --report-history ${shellQuote(options.artifactsDir)} --output ${history}`;
  const rankHistoryCommand = `node dist/cli.js --rank-history ${shellQuote(options.artifactsDir)} --registry ${shellQuote(options.registryPath)} --output ${rankHistory}`;
  const pipeline = `agency_run_stamp=$(date +\\%Y\\%m\\%dT\\%H\\%M\\%S) && ${pdfRendererPreflight} && { ${command}; agency_run_exit=$?; ${historyCommand}; history_exit=$?; ${rankHistoryCommand}; rank_history_exit=$?; if [ "$agency_run_exit" -ne 0 ]; then exit "$agency_run_exit"; fi; if [ "$history_exit" -ne 0 ]; then exit "$history_exit"; fi; exit "$rank_history_exit"; }`;
  return `47 3 1 * * cd ${shellQuote(options.workingDirectory)} && ${prepareRoots} && flock -n ${shellQuote(lockPath)} sh -c ${shellQuote(pipeline)}`;
}
