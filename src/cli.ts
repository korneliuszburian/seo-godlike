import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { preflightOAuth, validateOAuthClientReference } from "./auth-preflight.js";
import { calculateDateRanges, GSC_ANALYTICS_DIMENSIONS } from "./analytics.js";
import { GscAnalyticsRequest } from "./domain.js";
import { runGscAnalytics } from "./gsc-analytics.js";
import { runFixtureAnalysis } from "./pipeline.js";
import { AnalysisRequest, CapabilityRegistry, ClientRegistry } from "./domain.js";
import { getGoogleAccessToken, listSearchConsoleSites, querySearchAnalytics } from "./google.js";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (index < 0 || !value) throw new Error(`missing ${name}`);
  return value;
}

async function main(): Promise<void> {
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
  if (process.argv.includes("--analytics")) {
    const oauthClientPath = argument("--oauth-client");
    const propertyId = argument("--property-id");
    const clientId = argument("--client-id");
    const registry = JSON.parse(await readFile(resolve(argument("--registry")), "utf8")) as ClientRegistry;
    const capabilities = JSON.parse(await readFile(resolve(argument("--capabilities")), "utf8")) as CapabilityRegistry;
    await preflightOAuth({ oauthClientPath, propertyId, repositoryRoot: process.cwd() });
    const ranges = calculateDateRanges();
    const capturedAt = new Date().toISOString();
    const clientJson = JSON.parse(await readFile(resolve(oauthClientPath), "utf8"));
    const accessToken = await getGoogleAccessToken(clientJson);
    const [currentRawText, previousRawText] = await Promise.all([
      querySearchAnalytics(accessToken, propertyId, ranges.current.start, ranges.current.end, GSC_ANALYTICS_DIMENSIONS),
      querySearchAnalytics(accessToken, propertyId, ranges.previous.start, ranges.previous.end, GSC_ANALYTICS_DIMENSIONS),
    ]);
    const request: GscAnalyticsRequest = {
      schema_version: "1",
      run_id: `analytics_${clientId}_${ranges.current.start}_${ranges.current.end}`,
      client_id: clientId,
      property_id: propertyId,
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
    const result = await runGscAnalytics(
      request,
      registry,
      capabilities,
      currentRawText,
      previousRawText,
      resolve(argument("--output")),
    );
    process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
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
