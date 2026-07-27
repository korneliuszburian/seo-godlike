import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
  if (process.argv.includes("--discover")) {
    const clientJson = JSON.parse(await readFile(resolve(argument("--oauth-client")), "utf8"));
    const sites = await listSearchConsoleSites(await getGoogleAccessToken(clientJson));
    process.stdout.write(`${JSON.stringify({ provider: "google-search-console", sites }, null, 2)}\n`);
    return;
  }
  const request = JSON.parse(await readFile(resolve(argument("--request")), "utf8")) as AnalysisRequest;
  const registry = JSON.parse(await readFile(resolve(argument("--registry")), "utf8")) as ClientRegistry;
  const capabilities = JSON.parse(await readFile(resolve(argument("--capabilities")), "utf8")) as CapabilityRegistry;
  const raw = process.argv.includes("--oauth-client")
    ? await querySearchAnalytics(
        await getGoogleAccessToken(JSON.parse(await readFile(resolve(argument("--oauth-client")), "utf8"))),
        request.property_id,
        request.date_range.start,
        request.date_range.end,
      )
    : await readFile(resolve(argument("--raw")), "utf8");
  const result = await runFixtureAnalysis(request, registry, capabilities, raw, resolve(argument("--output")));
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
