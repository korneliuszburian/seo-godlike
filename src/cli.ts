import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preflightOAuth, validateOAuthClientReference } from "./auth-preflight.js";
import { calculateDateRanges, GSC_ANALYTICS_DIMENSIONS } from "./analytics.js";
import { GscAnalyticsRequest } from "./domain.js";
import { runGscAnalytics } from "./gsc-analytics.js";
import { runFixtureAnalysis } from "./pipeline.js";
import { AnalysisRequest, CapabilityRegistry, ClientRegistry } from "./domain.js";
import { getGoogleAccessToken, listSearchConsoleSites, querySearchAnalytics } from "./google.js";
import { addProperty, resolveRegisteredProperty } from "./registry.js";
import { findPreviousBundleLinks, writeHistoryDashboard } from "./report-history.js";
import { buildAnalyticsRunId } from "./run-id.js";
import { buildDailyAnalyticsCron } from "./schedule.js";
import { runSequentialBatch } from "./batch.js";

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

async function main(): Promise<void> {
  if (process.argv.includes("--schedule")) {
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
  if (process.argv.includes("--add-property")) {
    const canonicalValue = optionalArgument("--canonical-property") ?? "true";
    if (canonicalValue !== "true" && canonicalValue !== "false") throw new Error("--canonical-property must be true or false");
    const registry = await addProperty({
      registryPath: argument("--registry"),
      clientId: argument("--client-id"),
      propertyId: argument("--property-id"),
      provider: "google-search-console",
      canonicalProperty: canonicalValue === "true",
      aliases: repeatedArguments("--alias"),
    });
    process.stdout.write(`${JSON.stringify(registry, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--preflight")) {
    const result = await preflightOAuth({
      oauthClientPath: argument("--oauth-client"),
      propertyId: argument("--property-id"),
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
