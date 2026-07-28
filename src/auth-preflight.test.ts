import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GOOGLE_GSC_READ_ONLY_SCOPE, GOOGLE_REFRESH_TOKEN_STORE, preflightOAuth } from "./auth-preflight.js";

async function fixturePath(contents = "not parsed by preflight"): Promise<{ directory: string; path: string }> {
  const directory = await mkdtemp(join(tmpdir(), "seo-godlike-preflight-"));
  const path = join(directory, "oauth-client.json");
  await writeFile(path, contents, { mode: 0o600 });
  return { directory, path };
}

test("preflight reports a safe consent boundary without reading client JSON", async () => {
  const fixture = await fixturePath("this is intentionally not JSON");
  const result = await preflightOAuth({
    oauthClientPath: fixture.path,
    propertyId: "sc-domain:bodymove.pl",
    repositoryRoot: process.cwd(),
  });
  assert.equal(result.status, "READY_FOR_OPERATOR_CONSENT");
  assert.equal(result.scope, GOOGLE_GSC_READ_ONLY_SCOPE);
  assert.equal(result.token_store, GOOGLE_REFRESH_TOKEN_STORE);
  assert.equal(result.oauth_client.content_read, false);
  assert.equal(result.network_requested, false);
  assert.equal(result.consent_started, false);
  await rm(fixture.directory, { recursive: true, force: true });
});

test("preflight fails closed for an unsafe token store", async () => {
  const fixture = await fixturePath();
  await assert.rejects(
    preflightOAuth({
      oauthClientPath: fixture.path,
      propertyId: "sc-domain:bodymove.pl",
      tokenStore: "/tmp/refresh-token.txt",
      repositoryRoot: process.cwd(),
    }),
    /BLOCKED_AUTHORIZATION: unsupported token store/,
  );
  await rm(fixture.directory, { recursive: true, force: true });
});

test("preflight fails closed for a client file exposed to other users", async () => {
  const fixture = await fixturePath();
  await chmod(fixture.path, 0o644);
  await assert.rejects(
    preflightOAuth({
      oauthClientPath: fixture.path,
      propertyId: "sc-domain:bodymove.pl",
      repositoryRoot: process.cwd(),
    }),
    /BLOCKED_AUTHORIZATION: oauth client file must not be readable/,
  );
  await rm(fixture.directory, { recursive: true, force: true });
});

test("preflight fails closed for a client path inside the repository", async () => {
  const fixture = await fixturePath();
  await assert.rejects(
    preflightOAuth({
      oauthClientPath: fixture.path,
      propertyId: "sc-domain:bodymove.pl",
      repositoryRoot: fixture.directory,
    }),
    /BLOCKED_AUTHORIZATION: oauth client JSON must be outside the repository/,
  );
  await rm(fixture.directory, { recursive: true, force: true });
});

test("preflight fails closed for an empty sc-domain property", async () => {
  const fixture = await fixturePath();
  await assert.rejects(
    preflightOAuth({
      oauthClientPath: fixture.path,
      propertyId: "sc-domain:",
      repositoryRoot: process.cwd(),
    }),
    /BLOCKED_AUTHORIZATION: property_id must include a domain/,
  );
  await rm(fixture.directory, { recursive: true, force: true });
});
