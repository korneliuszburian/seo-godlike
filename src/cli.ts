import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { GOOGLE_GA4_READ_ONLY_SCOPE, preflightOAuth, validateOAuthClientReference } from "./auth-preflight.js";
import { calculateDateRanges, GSC_ANALYTICS_DIMENSIONS } from "./analytics.js";
import { AhrefsAnalyticsRequest, Ga4AnalyticsRequest, GscAnalyticsRequest, Provider } from "./domain.js";
import { AHREFS_METRICS_OPERATION, getAhrefsApiKey, queryAhrefsMetrics, queryAhrefsProfile, runAhrefsAnalytics, runAhrefsProfile } from "./ahrefs.js";
import { runGscAnalytics } from "./gsc-analytics.js";
import { runGa4Analytics } from "./ga4-analytics.js";
import { runFixtureAnalysis } from "./pipeline.js";
import { AnalysisRequest, CapabilityRegistry, ClientRegistry, SourceRegistry } from "./domain.js";
import { getGoogleAccessToken, listSearchConsoleSites, queryGa4Report, querySearchAnalytics } from "./google.js";
import { addProperties, addProperty, resolveRegisteredProperty } from "./registry.js";
import { findPreviousBundleLinks, writeHistoryDashboard } from "./report-history.js";
import { writeReportPackage } from "./report-package.js";
import { discoverLocaloMcp, LOCALO_MCP_URL } from "./localo-mcp.js";
import { buildAnalyticsRunId } from "./run-id.js";
import { buildDailyAnalyticsCron, buildMonthlyAgencyCron } from "./schedule.js";
import { runSequentialBatch } from "./batch.js";
import { buildScopePlan } from "./scope-plan.js";
import { buildAgentRunPlan } from "./agent-plan.js";
import { buildAgencyReadiness } from "./agency-readiness.js";
import { buildExternalSourceTasks, executeAgencyTasks, writeAgencyRunRecord } from "./agency-run.js";
import { writeAgencyReport } from "./agency-report.js";
import { writeAhrefsKeywordResearch } from "./ahrefs-keywords.js";
import { writeClientDelivery } from "./client-delivery.js";
import { validateSourceRegistry } from "./source-registry.js";
import { buildManagerPrompt, createCodexReadonlyRuntime } from "./codex-runtime.js";
import { writeClientContentBundle } from "./client-content.js";
import { rankMonitoringClientIds, resolveLatestRankMonitoringBundle, resolveRankMonitoringRoot, writeRankMonitoringBundle } from "./rank-monitoring.js";
import { writeRankHistoryDashboard } from "./rank-history.js";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (index < 0 || !value) throw new Error(`missing ${name}`);
  return value;
}

function optionalArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`missing ${name}`);
  return value;
}

function optionalPositiveIntegerArgument(name: string): number | undefined {
  const raw = optionalArgument(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function hasArgument(name: string): boolean {
  return process.argv.includes(name);
}

function repeatedArguments(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name) {
      const value = process.argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`missing ${name}`);
      values.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
    }
  }
  return values;
}

interface AnalyticsOptions {
  oauthClientPath: string;
  propertyId: string;
  clientId: string;
  registry: ClientRegistry;
  capabilities: CapabilityRegistry;
  outputDir: string;
  artifactsDir?: string;
}

async function runSingleAnalytics(options: AnalyticsOptions): Promise<void> {
  const canonicalPropertyId = resolveRegisteredProperty(options.registry, options.clientId, options.propertyId, "google-search-console").canonical_property_id;
  await preflightOAuth({ oauthClientPath: options.oauthClientPath, propertyId: canonicalPropertyId, repositoryRoot: process.cwd() });
  const ranges = calculateDateRanges();
  const capturedAt = new Date().toISOString();
  const clientJson = JSON.parse(await readFile(resolve(options.oauthClientPath), "utf8"));
  const accessToken = await getGoogleAccessToken(clientJson);
  const previousBundleRefs = options.artifactsDir ? await findPreviousBundleLinks(resolve(options.artifactsDir), options.outputDir) : [];
  const [currentRawText, previousRawText] = await Promise.all([
    querySearchAnalytics(accessToken, canonicalPropertyId, ranges.current.start, ranges.current.end, GSC_ANALYTICS_DIMENSIONS),
    querySearchAnalytics(accessToken, canonicalPropertyId, ranges.previous.start, ranges.previous.end, GSC_ANALYTICS_DIMENSIONS),
  ]);
  const request: GscAnalyticsRequest = {
    schema_version: "1",
    run_id: buildAnalyticsRunId({ clientId: options.clientId, propertyId: canonicalPropertyId, provider: "google-search-console", start: ranges.current.start, end: ranges.current.end }),
    client_id: options.clientId,
    property_id: canonicalPropertyId,
    provider: "google-search-console",
    operation: "search_analytics.query",
    metric: "clicks",
    date_range: ranges.current,
    comparison_date_range: ranges.previous,
    dimensions: GSC_ANALYTICS_DIMENSIONS,
    row_limit: 25_000,
    credential_ref: "keyring:seo-godlike/google-agency-refresh-token",
    policy_mode: "read_only",
    captured_at: capturedAt,
  };
  await runGscAnalytics(request, options.registry, options.capabilities, currentRawText, previousRawText, options.outputDir, previousBundleRefs);
}

interface Ga4Options {
  oauthClientPath?: string;
  rawPath?: string;
  propertyId: string;
  clientId: string;
  registry: ClientRegistry;
  capabilities: CapabilityRegistry;
  outputDir: string;
}

async function runSingleGa4Analytics(options: Ga4Options): Promise<void> {
  const canonicalPropertyId = resolveRegisteredProperty(options.registry, options.clientId, options.propertyId, "google-analytics").canonical_property_id;
  const ranges = calculateDateRanges();
  const capturedAt = new Date().toISOString();
  const rawText = options.rawPath
    ? await readFile(resolve(options.rawPath), "utf8")
    : await (async () => {
        const oauthClientPath = options.oauthClientPath;
        if (!oauthClientPath) throw new Error("missing --oauth-client or --raw");
        await preflightOAuth({ oauthClientPath, propertyId: canonicalPropertyId, provider: "google-analytics", repositoryRoot: process.cwd() });
        const clientJson = JSON.parse(await readFile(resolve(oauthClientPath), "utf8")) as unknown;
        return queryGa4Report(await getGoogleAccessToken(clientJson, GOOGLE_GA4_READ_ONLY_SCOPE), canonicalPropertyId, ranges.current.start, ranges.current.end);
      })();
  const request: Ga4AnalyticsRequest = {
    schema_version: "1",
    run_id: buildAnalyticsRunId({ clientId: options.clientId, propertyId: canonicalPropertyId, provider: "google-analytics", start: ranges.current.start, end: ranges.current.end }),
    client_id: options.clientId,
    property_id: canonicalPropertyId,
    provider: "google-analytics",
    operation: "properties.runReport",
    metric: "sessions",
    date_range: ranges.current,
    dimensions: ["date"],
    row_limit: 10_000,
    credential_ref: "keyring:seo-godlike/google-agency-refresh-token",
    policy_mode: "read_only",
    captured_at: capturedAt,
  };
  await runGa4Analytics(request, options.registry, options.capabilities, rawText, options.outputDir);
}

interface AhrefsOptions {
  clientId: string;
  propertyId: string;
  date: string;
  country?: string;
  registry: ClientRegistry;
  capabilities: CapabilityRegistry;
  outputDir: string;
}

async function runSingleAhrefsAnalytics(options: AhrefsOptions): Promise<void> {
  const resolvedProperty = resolveRegisteredProperty(options.registry, options.clientId, options.propertyId, "ahrefs");
  const canonicalPropertyId = resolvedProperty.canonical_property_id;
  const country = options.country ?? resolvedProperty.property.country ?? "pl";
  const apiKey = await getAhrefsApiKey();
  const profileCapability = options.capabilities.capabilities.find((item) => item.provider === "ahrefs" && item.operation_id === "site-explorer.profile");
  if (profileCapability) {
    const comparisonDate = new Date(`${options.date}T00:00:00Z`);
    comparisonDate.setUTCDate(comparisonDate.getUTCDate() - 28);
    const comparison = comparisonDate.toISOString().slice(0, 10);
    const rawResponses = await queryAhrefsProfile(apiKey, canonicalPropertyId, options.date, comparison, country);
    const request = {
      schema_version: "1",
      run_id: buildAnalyticsRunId({ clientId: options.clientId, propertyId: canonicalPropertyId, provider: "ahrefs", start: options.date, end: options.date }),
      client_id: options.clientId,
      property_id: canonicalPropertyId,
      provider: "ahrefs" as const,
      operation: "site-explorer.profile" as const,
      metric: "org_traffic" as const,
      date_range: { start: options.date, end: options.date },
      comparison_date_range: { start: comparison, end: comparison },
      country,
      limits: { top_pages: 100 as const, organic_keywords: 500 as const, organic_competitors: 20 as const },
      credential_ref: "keyring:seo-godlike/ahrefs-api-key",
      policy_mode: "read_only" as const,
      captured_at: new Date().toISOString(),
    };
    await runAhrefsProfile(request, options.registry, options.capabilities, rawResponses, options.outputDir);
    return;
  }
  const rawText = await queryAhrefsMetrics(apiKey, canonicalPropertyId, options.date);
  const request: AhrefsAnalyticsRequest = {
    schema_version: "1",
    run_id: buildAnalyticsRunId({ clientId: options.clientId, propertyId: canonicalPropertyId, provider: "ahrefs", start: options.date, end: options.date }),
    client_id: options.clientId,
    property_id: canonicalPropertyId,
    provider: "ahrefs",
    operation: AHREFS_METRICS_OPERATION,
    metric: "org_traffic",
    date_range: { start: options.date, end: options.date },
    credential_ref: "keyring:seo-godlike/ahrefs-api-key",
    policy_mode: "read_only",
    captured_at: new Date().toISOString(),
  };
  await runAhrefsAnalytics(request, options.registry, options.capabilities, rawText, options.outputDir);
}

async function main(): Promise<void> {
  if (process.argv.includes("--pack-client-content")) {
    const result = await writeClientContentBundle(argument("--input"), argument("--output"));
    process.stdout.write(`${JSON.stringify({ client_id: result.content.client_id, client_ids: result.contents.map((content) => content.client_id), manifest_sha256: result.manifest_sha256, output: resolve(argument("--output")) }, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--pack-rank-monitoring")) {
    const result = await writeRankMonitoringBundle(argument("--input"), argument("--output"));
    process.stdout.write(`${JSON.stringify({ client_id: result.snapshot.client_id, client_ids: result.snapshots.map((snapshot) => snapshot.client_id), rows: result.snapshot.rows.length, rows_by_client: Object.fromEntries(result.snapshots.map((snapshot) => [snapshot.client_id, snapshot.rows.length])), manifest_sha256: result.manifest_sha256, output: resolve(argument("--output")) }, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--codex-manager")) {
    const registry = JSON.parse(await readFile(resolve(argument("--registry")), "utf8")) as ClientRegistry;
    const capabilities = JSON.parse(await readFile(resolve(argument("--capabilities")), "utf8")) as CapabilityRegistry;
    const sourceRegistryPath = optionalArgument("--source-registry");
    const sourceRegistry = sourceRegistryPath ? JSON.parse(await readFile(resolve(sourceRegistryPath), "utf8")) as SourceRegistry : { sources: [] };
    validateSourceRegistry(sourceRegistry, registry);
    const scope = buildScopePlan(registry, capabilities);
    const runtime = createCodexReadonlyRuntime({ workingDirectory: process.cwd() });
    const threadId = optionalArgument("--codex-thread-id");
    const thread = threadId ? runtime.resumeThread(threadId) : runtime.startThread();
    const result = await thread.run(buildManagerPrompt(scope, sourceRegistry));
    process.stdout.write(`${JSON.stringify({ policy_mode: "read_only", approval_boundary: "no_external_write_operations", thread_id: thread.id, scope_status: scope.status, response: result.finalResponse }, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--agency-report")) {
    const registry = JSON.parse(await readFile(resolve(argument("--registry")), "utf8")) as ClientRegistry;
    const capabilities = JSON.parse(await readFile(resolve(argument("--capabilities")), "utf8")) as CapabilityRegistry;
    const sourceRegistryPath = optionalArgument("--source-registry");
    const sourceRegistry = sourceRegistryPath ? JSON.parse(await readFile(resolve(sourceRegistryPath), "utf8")) as SourceRegistry : { sources: [] };
    validateSourceRegistry(sourceRegistry, registry);
    const scope = buildScopePlan(registry, capabilities);
    const rankMonitoringPath = optionalArgument("--rank-monitoring");
    const rankMonitoringRoot = optionalArgument("--rank-monitoring-root");
    if (rankMonitoringPath && rankMonitoringRoot) throw new Error("--rank-monitoring and --rank-monitoring-root are mutually exclusive");
    const resolvedRankMonitoringPath = rankMonitoringRoot
      ? await resolveLatestRankMonitoringBundle(await resolveRankMonitoringRoot(rankMonitoringRoot, argument("--artifacts-dir")), rankMonitoringClientIds(sourceRegistry.sources))
      : rankMonitoringPath;
    const summary = await writeAgencyReport(argument("--artifacts-dir"), argument("--output"), scope, new Date().toISOString(), sourceRegistry, optionalArgument("--keyword-bundle"), optionalArgument("--keyword-input"), resolvedRankMonitoringPath, optionalArgument("--keyword-bundle-root"));
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--agency-readiness")) {
    const registry = JSON.parse(await readFile(resolve(argument("--registry")), "utf8")) as ClientRegistry;
    const capabilities = JSON.parse(await readFile(resolve(argument("--capabilities")), "utf8")) as CapabilityRegistry;
    const sourceRegistryPath = optionalArgument("--source-registry");
    const sourceRegistry = sourceRegistryPath ? JSON.parse(await readFile(resolve(sourceRegistryPath), "utf8")) as SourceRegistry : { sources: [] };
    validateSourceRegistry(sourceRegistry, registry);
    const readinessGeneratedAt = new Date().toISOString();
    const readiness = buildAgencyReadiness(buildScopePlan(registry, capabilities, readinessGeneratedAt), sourceRegistry, {
      oauth_client_supplied: hasArgument("--oauth-client"),
      keyword_input_supplied: hasArgument("--keyword-input"),
      rank_monitoring_supplied: hasArgument("--rank-monitoring") || hasArgument("--rank-monitoring-root"),
      client_content_supplied: hasArgument("--client-content") || hasArgument("--client-content-bundle"),
    }, readinessGeneratedAt);
    process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--client-delivery")) {
    const rankMonitoringPath = optionalArgument("--rank-monitoring");
    const rankMonitoringRoot = optionalArgument("--rank-monitoring-root");
    if (rankMonitoringPath && rankMonitoringRoot) throw new Error("--rank-monitoring and --rank-monitoring-root are mutually exclusive");
    const result = await writeClientDelivery({
      agencyReportPath: argument("--agency-report-json"),
      artifactsDir: argument("--artifacts-dir"),
      outputDir: argument("--output"),
      renderPdf: process.argv.includes("--pdf"),
      clientContentPath: optionalArgument("--client-content"),
      clientContentBundlePath: optionalArgument("--client-content-bundle"),
      rankMonitoringPath,
      rankMonitoringRoot,
      keywordBundleRoot: optionalArgument("--keyword-bundle-root"),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--agency-run")) {
    const registry = JSON.parse(await readFile(resolve(argument("--registry")), "utf8")) as ClientRegistry;
    const capabilities = JSON.parse(await readFile(resolve(argument("--capabilities")), "utf8")) as CapabilityRegistry;
    const sourceRegistryPath = optionalArgument("--source-registry");
    const sourceRegistry = sourceRegistryPath ? JSON.parse(await readFile(resolve(sourceRegistryPath), "utf8")) as SourceRegistry : { sources: [] };
    validateSourceRegistry(sourceRegistry, registry);
    const outputRoot = resolve(argument("--output"));
    const oauthClientPath = optionalArgument("--oauth-client");
    const artifactsDir = optionalArgument("--artifacts-dir");
    const ahrefsDate = optionalArgument("--ahrefs-date") ?? new Date().toISOString().slice(0, 10);
    const ahrefsCountry = optionalArgument("--ahrefs-country");
    const runId = optionalArgument("--run-id") ?? `agency-run-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
    const startedAt = new Date().toISOString();
    const scope = buildScopePlan(registry, capabilities);
    const ranges = calculateDateRanges();
    const rankMonitoringPath = optionalArgument("--rank-monitoring");
    const rankMonitoringRoot = optionalArgument("--rank-monitoring-root");
    if (rankMonitoringPath && rankMonitoringRoot) throw new Error("--rank-monitoring and --rank-monitoring-root are mutually exclusive");
    if (rankMonitoringRoot && !artifactsDir) throw new Error("--rank-monitoring-root requires --artifacts-dir");
    const resolvedRankMonitoringPath = rankMonitoringRoot
      ? await resolveLatestRankMonitoringBundle(await resolveRankMonitoringRoot(rankMonitoringRoot, artifactsDir!), rankMonitoringClientIds(sourceRegistry.sources))
      : rankMonitoringPath;
    const keywordInputPath = optionalArgument("--keyword-input");
    const existingKeywordBundlePath = optionalArgument("--keyword-bundle");
    const keywordResearchOutputPath = optionalArgument("--keyword-research-output") ?? (process.argv.includes("--keyword-research") ? join(outputRoot, "keyword-research") : undefined);
    if (keywordResearchOutputPath && !keywordInputPath) throw new Error("--keyword-research-output requires --keyword-input");
    const keywordMaxRequests = optionalPositiveIntegerArgument("--keyword-max-requests");
    const keywordMaxApiUnits = optionalPositiveIntegerArgument("--keyword-max-api-units");
    const keywordResearchTaskId = keywordResearchOutputPath ? `ahrefs:keywords-explorer:${keywordResearchOutputPath}` : null;
    await mkdir(outputRoot, { recursive: false, mode: 0o700 });
    const propertyTasks = scope.entries.map((entry) => {
      const id = `${entry.client_id}:${entry.provider}:${entry.property_id}`;
      if (entry.status !== "ready") return { id, status: "blocked" as const, reason: entry.reason };
      const outputDir = join(outputRoot, buildAnalyticsRunId({ clientId: entry.client_id, propertyId: entry.property_id, provider: entry.provider, start: entry.provider === "ahrefs" ? ahrefsDate : ranges.current.start, end: entry.provider === "ahrefs" ? ahrefsDate : ranges.current.end }));
      if (entry.provider === "google-search-console") return { id, status: "ready" as const, run: async () => { if (!oauthClientPath) throw new Error("missing --oauth-client for Google Search Console"); await runSingleAnalytics({ oauthClientPath, propertyId: entry.property_id, clientId: entry.client_id, registry, capabilities, outputDir, artifactsDir }); } };
      if (entry.provider === "google-analytics") return { id, status: "ready" as const, run: async () => { if (!oauthClientPath) throw new Error("missing --oauth-client for Google Analytics"); await runSingleGa4Analytics({ oauthClientPath, propertyId: entry.property_id, clientId: entry.client_id, registry, capabilities, outputDir }); } };
      return { id, status: "ready" as const, run: async () => runSingleAhrefsAnalytics({ clientId: entry.client_id, propertyId: entry.property_id, date: ahrefsDate, country: ahrefsCountry, registry, capabilities, outputDir }) };
    });
    const sourceTasks = buildExternalSourceTasks(sourceRegistry, resolvedRankMonitoringPath);
    const keywordTasks = keywordResearchOutputPath && keywordInputPath ? [{
      id: keywordResearchTaskId as string,
      status: "ready" as const,
      run: async () => {
        await writeAhrefsKeywordResearch({
          inputPath: keywordInputPath,
          outputDir: keywordResearchOutputPath,
          capabilities,
          country: optionalArgument("--keyword-country"),
          maxRequests: keywordMaxRequests,
          maxApiUnits: keywordMaxApiUnits,
          allowEstimatedBudget: process.argv.includes("--allow-estimated-budget"),
        });
      },
    }] : [];
    const result = await executeAgencyTasks([...propertyTasks, ...sourceTasks, ...keywordTasks]);
    const finishedAt = new Date().toISOString();
    await writeAgencyRunRecord(outputRoot, { schema_version: "1", run_id: runId, started_at: startedAt, finished_at: finishedAt, policy_mode: "read_only", approval_boundary: "no_external_write_operations", retention_mode: "operator_managed", deletion_authority: "operator_only", result });
    const agencyReportOutput = optionalArgument("--agency-report-output");
    const deliveryOutput = optionalArgument("--delivery-output");
    if (deliveryOutput && !agencyReportOutput) throw new Error("--delivery-output requires --agency-report-output");
    const clientContentPath = optionalArgument("--client-content");
    const clientContentBundlePath = optionalArgument("--client-content-bundle");
    let generatedReport: string | undefined;
    let generatedDelivery: string | undefined;
    if (agencyReportOutput) {
      const keywordBundlePath = keywordResearchTaskId && result.completed.includes(keywordResearchTaskId) ? keywordResearchOutputPath : existingKeywordBundlePath;
      const keywordBundleRoot = keywordResearchTaskId && result.completed.includes(keywordResearchTaskId) ? outputRoot : optionalArgument("--keyword-bundle-root");
      const summary = await writeAgencyReport(outputRoot, resolve(agencyReportOutput), scope, finishedAt, sourceRegistry, keywordBundlePath, keywordInputPath, resolvedRankMonitoringPath, keywordBundleRoot);
      generatedReport = resolve(agencyReportOutput);
      if (deliveryOutput) {
        await writeClientDelivery({ agencyReportPath: join(resolve(agencyReportOutput), "agency-report.json"), artifactsDir: outputRoot, outputDir: resolve(deliveryOutput), renderPdf: process.argv.includes("--pdf"), clientContentPath, clientContentBundlePath, rankMonitoringPath: resolvedRankMonitoringPath, keywordBundleRoot, agencyRunRecordPath: join(outputRoot, "agency-run.json") });
        generatedDelivery = resolve(deliveryOutput);
      }
      process.stdout.write(`${JSON.stringify({ scope_status: scope.status, agency_report: generatedReport, delivery: generatedDelivery, report_status: summary.report_status, ...result }, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify({ scope_status: scope.status, ...result }, null, 2)}\n`);
    }
    if (result.failed.length > 0) process.exitCode = 1;
    return;
  }
  if (process.argv.includes("--agent-plan")) {
    const registry = JSON.parse(await readFile(resolve(argument("--registry")), "utf8")) as ClientRegistry;
    const capabilities = JSON.parse(await readFile(resolve(argument("--capabilities")), "utf8")) as CapabilityRegistry;
    const scope = buildScopePlan(registry, capabilities);
    const runId = optionalArgument("--run-id") ?? `agent-run-${scope.generated_at.replace(/[^0-9]/g, "").slice(0, 14)}`;
    process.stdout.write(`${JSON.stringify(buildAgentRunPlan(scope, runId), null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--scope-plan")) {
    const registry = JSON.parse(await readFile(resolve(argument("--registry")), "utf8")) as ClientRegistry;
    const capabilities = JSON.parse(await readFile(resolve(argument("--capabilities")), "utf8")) as CapabilityRegistry;
    process.stdout.write(`${JSON.stringify(buildScopePlan(registry, capabilities), null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--schedule")) {
    if (process.argv.includes("--agency-schedule")) {
      if (hasArgument("--rank-monitoring") && hasArgument("--rank-monitoring-root")) throw new Error("--rank-monitoring and --rank-monitoring-root are mutually exclusive");
      process.stdout.write(`${buildMonthlyAgencyCron({
        workingDirectory: process.cwd(),
        oauthClientPath: argument("--oauth-client"),
        registryPath: optionalArgument("--registry") ?? "fixtures/client-registry.json",
        capabilitiesPath: optionalArgument("--capabilities") ?? "fixtures/capability-registry.json",
        sourceRegistryPath: optionalArgument("--source-registry"),
        artifactsDir: optionalArgument("--artifacts-dir") ?? "artifacts/analysis",
        reportDir: optionalArgument("--agency-report-root") ?? "artifacts/reports",
        deliveryDir: optionalArgument("--delivery-root") ?? "artifacts/delivery",
        historyDir: optionalArgument("--history-root"),
        rankHistoryDir: optionalArgument("--rank-history-root"),
        clientContentPath: optionalArgument("--client-content"),
        clientContentBundlePath: optionalArgument("--client-content-bundle"),
        rankMonitoringPath: optionalArgument("--rank-monitoring"),
        rankMonitoringRoot: optionalArgument("--rank-monitoring-root"),
        keywordBundlePath: optionalArgument("--keyword-bundle"),
        keywordInputPath: optionalArgument("--keyword-input"),
        keywordBundleRoot: optionalArgument("--keyword-bundle-root"),
        keywordResearch: process.argv.includes("--keyword-research"),
        allowEstimatedBudget: process.argv.includes("--allow-estimated-budget"),
        keywordCountry: optionalArgument("--keyword-country"),
        ahrefsDate: optionalArgument("--ahrefs-date"),
        ahrefsCountry: optionalArgument("--ahrefs-country"),
        keywordMaxRequests: optionalArgument("--keyword-max-requests"),
        keywordMaxApiUnits: optionalArgument("--keyword-max-api-units"),
        lockPath: optionalArgument("--lock-file"),
      })}\n`);
      return;
    }
    if (!["--client-id", "--property-id", "--registry", "--capabilities"].every(hasArgument)) {
      process.stderr.write("warning: using default schedule values; pass explicit flags for production use\n");
    }
    process.stdout.write(`${buildDailyAnalyticsCron({
      workingDirectory: process.cwd(),
      oauthClientPath: optionalArgument("--oauth-client") ?? "/absolute/path/outside/repository/oauth-client.json",
      clientId: optionalArgument("--client-id") ?? "bodymove",
      propertyId: optionalArgument("--property-id") ?? "sc-domain:bodymove.pl",
      registryPath: optionalArgument("--registry") ?? "fixtures/client-registry.json",
      capabilitiesPath: optionalArgument("--capabilities") ?? "fixtures/capability-registry.json",
      artifactsDir: optionalArgument("--artifacts-dir") ?? "artifacts/analysis",
      lockPath: optionalArgument("--lock-file"),
    })}\n`);
    return;
  }
  if (process.argv.includes("--report-history")) {
    const artifactsDir = argument("--report-history");
    const outputDir = resolve(argument("--output"));
    const summary = await writeHistoryDashboard(resolve(artifactsDir), outputDir);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--rank-history")) {
    const registry = JSON.parse(await readFile(resolve(argument("--registry")), "utf8")) as ClientRegistry;
    const summary = await writeRankHistoryDashboard(argument("--rank-history"), argument("--output"), registry.clients.map((client) => client.client_id));
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--report-package")) {
    const summary = await writeReportPackage(resolve(argument("--report-package")), resolve(argument("--output")));
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--ahrefs-analytics")) {
    const registry = JSON.parse(await readFile(resolve(argument("--registry")), "utf8")) as ClientRegistry;
    const capabilities = JSON.parse(await readFile(resolve(argument("--capabilities")), "utf8")) as CapabilityRegistry;
    const clientId = argument("--client-id");
    const propertyId = argument("--property-id");
    const date = optionalArgument("--ahrefs-date") ?? new Date().toISOString().slice(0, 10);
    const canonicalPropertyId = resolveRegisteredProperty(registry, clientId, propertyId, "ahrefs").canonical_property_id;
    const rawPath = optionalArgument("--raw");
    const rawText = rawPath
      ? await readFile(resolve(rawPath), "utf8")
      : await queryAhrefsMetrics(await getAhrefsApiKey(), canonicalPropertyId, date);
    const request: AhrefsAnalyticsRequest = {
      schema_version: "1",
      run_id: buildAnalyticsRunId({ clientId, propertyId: canonicalPropertyId, provider: "ahrefs", start: date, end: date }),
      client_id: clientId,
      property_id: canonicalPropertyId,
      provider: "ahrefs",
      operation: AHREFS_METRICS_OPERATION,
      metric: "org_traffic",
      date_range: { start: date, end: date },
      credential_ref: "keyring:seo-godlike/ahrefs-api-key",
      policy_mode: "read_only",
      captured_at: new Date().toISOString(),
    };
    await runAhrefsAnalytics(request, registry, capabilities, rawText, resolve(argument("--output")));
    process.stdout.write(JSON.stringify({ provider: "ahrefs", property_id: canonicalPropertyId, output: resolve(argument("--output")) }, null, 2) + "\n");
    return;
  }
  if (process.argv.includes("--ahrefs-keyword-research")) {
    const maxRequests = optionalPositiveIntegerArgument("--max-requests");
    const maxApiUnits = optionalPositiveIntegerArgument("--max-api-units");
    const report = await writeAhrefsKeywordResearch({
      inputPath: argument("--input"),
      outputDir: argument("--output"),
      capabilities: JSON.parse(await readFile(resolve(argument("--capabilities")), "utf8")) as CapabilityRegistry,
      country: optionalArgument("--country"),
      maxRequests,
      maxApiUnits,
      allowEstimatedBudget: process.argv.includes("--allow-estimated-budget"),
    });
    process.stdout.write(`${JSON.stringify({ provider: report.provider, operation: report.operation, groups: report.groups.length, output: resolve(argument("--output")) }, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--localo-discover")) {
    const result = await discoverLocaloMcp(optionalArgument("--localo-url") ?? LOCALO_MCP_URL);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--add-properties")) {
    const registry = JSON.parse(await readFile(resolve(argument("--add-properties")), "utf8")) as { clients: ClientRegistry["clients"] };
    const result = await addProperties({ registryPath: argument("--registry"), clients: registry.clients });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--add-property")) {
    const canonicalValue = optionalArgument("--canonical-property") ?? "true";
    if (canonicalValue !== "true" && canonicalValue !== "false") throw new Error("--canonical-property must be true or false");
    const providerValue = optionalArgument("--provider") ?? "google-search-console";
    if (providerValue !== "google-search-console" && providerValue !== "google-analytics" && providerValue !== "ahrefs") throw new Error("unsupported provider '" + providerValue + "'");
    const registry = await addProperty({
      registryPath: argument("--registry"),
      clientId: argument("--client-id"),
      propertyId: argument("--property-id"),
      provider: providerValue as Provider,
      canonicalProperty: canonicalValue === "true",
      aliases: repeatedArguments("--alias"),
    });
    process.stdout.write(`${JSON.stringify(registry, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--preflight")) {
    const providerValue = optionalArgument("--provider") ?? "google-search-console";
    if (providerValue !== "google-search-console" && providerValue !== "google-analytics") throw new Error("unsupported provider '" + providerValue + "'");
    const result = await preflightOAuth({
      oauthClientPath: argument("--oauth-client"),
      propertyId: argument("--property-id"),
      provider: providerValue as Provider,
      tokenStore: process.argv.includes("--token-store") ? argument("--token-store") : undefined,
      repositoryRoot: process.cwd(),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--discover")) {
    const oauthClientPath = argument("--oauth-client");
    await validateOAuthClientReference(oauthClientPath, process.cwd());
    const clientJson = JSON.parse(await readFile(resolve(oauthClientPath), "utf8"));
    const sites = await listSearchConsoleSites(await getGoogleAccessToken(clientJson));
    process.stdout.write(`${JSON.stringify({ provider: "google-search-console", sites }, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--analytics-batch")) {
    const oauthClientPath = argument("--oauth-client");
    const clientId = argument("--client-id");
    const registry = JSON.parse(await readFile(resolve(argument("--registry")), "utf8")) as ClientRegistry;
    const capabilities = JSON.parse(await readFile(resolve(argument("--capabilities")), "utf8")) as CapabilityRegistry;
    const propertyIds = repeatedArguments("--property-id");
    if (propertyIds.length === 0) throw new Error("missing --property-id");
    if (new Set(propertyIds).size !== propertyIds.length) throw new Error("duplicate --property-id in analytics batch");
    const outputRoot = resolve(argument("--output"));
    const artifactsDir = optionalArgument("--artifacts-dir");
    const ranges = calculateDateRanges();
    await mkdir(outputRoot, { recursive: false });
    const result = await runSequentialBatch(propertyIds.map((propertyId) => ({
      id: propertyId,
      run: async () => {
        const canonicalPropertyId = resolveRegisteredProperty(registry, clientId, propertyId, "google-search-console").canonical_property_id;
        const outputDir = join(outputRoot, buildAnalyticsRunId({ clientId, propertyId: canonicalPropertyId, provider: "google-search-console", start: ranges.current.start, end: ranges.current.end }));
        await runSingleAnalytics({ oauthClientPath, propertyId, clientId, registry, capabilities, outputDir, artifactsDir });
      },
    })));
    process.stdout.write(`${JSON.stringify({ client_id: clientId, properties_requested: propertyIds, ...result }, null, 2)}\n`);
    if (result.failed.length > 0) process.exitCode = 1;
    return;
  }
  if (process.argv.includes("--ga4-analytics")) {
    const rawPath = optionalArgument("--raw");
    const oauthClientPath = optionalArgument("--oauth-client");
    if (!rawPath && !oauthClientPath) throw new Error("missing --oauth-client or --raw");
    const clientId = argument("--client-id");
    const propertyId = argument("--property-id");
    const registry = JSON.parse(await readFile(resolve(argument("--registry")), "utf8")) as ClientRegistry;
    const capabilities = JSON.parse(await readFile(resolve(argument("--capabilities")), "utf8")) as CapabilityRegistry;
    await runSingleGa4Analytics({ oauthClientPath, rawPath, propertyId, clientId, registry, capabilities, outputDir: resolve(argument("--output")) });
    return;
  }
  if (process.argv.includes("--analytics")) {
    const oauthClientPath = argument("--oauth-client");
    const propertyId = argument("--property-id");
    const clientId = argument("--client-id");
    const registry = JSON.parse(await readFile(resolve(argument("--registry")), "utf8")) as ClientRegistry;
    const capabilities = JSON.parse(await readFile(resolve(argument("--capabilities")), "utf8")) as CapabilityRegistry;
    const outputDir = resolve(argument("--output"));
    const artifactsDir = optionalArgument("--artifacts-dir");
    await runSingleAnalytics({ oauthClientPath, propertyId, clientId, registry, capabilities, outputDir, artifactsDir });
    return;
  }
  const request = JSON.parse(await readFile(resolve(argument("--request")), "utf8")) as AnalysisRequest;
  const registry = JSON.parse(await readFile(resolve(argument("--registry")), "utf8")) as ClientRegistry;
  const capabilities = JSON.parse(await readFile(resolve(argument("--capabilities")), "utf8")) as CapabilityRegistry;
  const raw = process.argv.includes("--oauth-client")
    ? await (async () => {
        const oauthClientPath = argument("--oauth-client");
        await preflightOAuth({ oauthClientPath, propertyId: request.property_id, repositoryRoot: process.cwd() });
        return querySearchAnalytics(
          await getGoogleAccessToken(JSON.parse(await readFile(resolve(oauthClientPath), "utf8"))),
          request.property_id,
          request.date_range.start,
          request.date_range.end,
        );
      })()
    : await readFile(resolve(argument("--raw")), "utf8");
  const result = await runFixtureAnalysis(request, registry, capabilities, raw, resolve(argument("--output")));
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
