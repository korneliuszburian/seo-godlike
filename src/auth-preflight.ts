import { lstat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { Provider } from "./domain.js";

export const GOOGLE_GSC_READ_ONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const GOOGLE_GA4_READ_ONLY_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
export const GOOGLE_REFRESH_TOKEN_STORE = "keyring:seo-godlike/google-agency-refresh-token";

export interface OAuthPreflightInput {
  oauthClientPath: string;
  propertyId: string;
  provider?: Provider;
  tokenStore?: string;
  repositoryRoot: string;
}

export interface OAuthPreflightResult {
  status: "READY_FOR_OPERATOR_CONSENT";
  oauth_client: {
    path: string;
    regular_file: true;
    mode: string;
    content_read: false;
  };
  token_store: typeof GOOGLE_REFRESH_TOKEN_STORE;
  scope: string;
  property_id: string;
  network_requested: false;
  consent_started: false;
}

async function validateOAuthClientFile(oauthClientPath: string, repositoryRoot: string): Promise<{ path: string; mode: string }> {
  const resolvedPath = resolve(oauthClientPath);
  const resolvedRepositoryRoot = resolve(repositoryRoot);
  const relativePath = relative(resolvedRepositoryRoot, resolvedPath);
  if (!isAbsolute(oauthClientPath)) fail("oauth client path must be absolute");
  if (relativePath === "" || (relativePath !== ".." && !relativePath.startsWith(`..${sep}`))) {
    fail("oauth client JSON must be outside the repository");
  }

  let metadata;
  try {
    metadata = await lstat(resolvedPath);
  } catch {
    fail("oauth client path does not exist or is not readable");
  }
  if (!metadata.isFile()) fail("oauth client path must point to a regular file");
  if (metadata.size === 0) fail("oauth client file must not be empty");
  if ((metadata.mode & 0o077) !== 0) fail("oauth client file must not be readable by group or other users");
  return { path: resolvedPath, mode: (metadata.mode & 0o777).toString(8).padStart(3, "0") };
}

export async function validateOAuthClientReference(oauthClientPath: string, repositoryRoot: string): Promise<void> {
  await validateOAuthClientFile(oauthClientPath, repositoryRoot);
}

function fail(message: string): never {
  throw new Error(`BLOCKED_AUTHORIZATION: ${message}`);
}

function validatePropertyId(propertyId: string, provider: Provider): void {
  if (!propertyId || /\s/.test(propertyId)) fail("property_id must be a non-empty identifier without whitespace");
  if (provider === "google-analytics") {
    if (!/^properties\/[1-9]\d*$/.test(propertyId)) fail("property_id must be a GA4 properties/<numeric-id> resource");
    return;
  }
  if (propertyId === "sc-domain:") fail("property_id must include a domain after sc-domain:");
  if (!(propertyId.startsWith("sc-domain:") || /^https?:\/\//.test(propertyId))) {
    fail("property_id must be a Search Console sc-domain or URL-prefix identifier");
  }
}

export async function preflightOAuth(input: OAuthPreflightInput): Promise<OAuthPreflightResult> {
  if (input.tokenStore && input.tokenStore !== GOOGLE_REFRESH_TOKEN_STORE) {
    fail(`unsupported token store; use ${GOOGLE_REFRESH_TOKEN_STORE}`);
  }
  const provider = input.provider ?? "google-search-console";
  const scope = provider === "google-analytics" ? GOOGLE_GA4_READ_ONLY_SCOPE : GOOGLE_GSC_READ_ONLY_SCOPE;
  validatePropertyId(input.propertyId, provider);
  const oauthClient = await validateOAuthClientFile(input.oauthClientPath, input.repositoryRoot);

  return {
    status: "READY_FOR_OPERATOR_CONSENT",
    oauth_client: { path: oauthClient.path, regular_file: true, mode: oauthClient.mode, content_read: false },
    token_store: GOOGLE_REFRESH_TOKEN_STORE,
    scope,
    property_id: input.propertyId,
    network_requested: false,
    consent_started: false,
  };
}
