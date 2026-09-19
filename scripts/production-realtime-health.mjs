import { pathToFileURL } from "node:url";

const defaultBaseUrl = "https://www.roomboard.online";
const defaultTimeoutMs = 60_000;
const requiredLaunchCheckKeys = ["realtime_signed_tokens", "realtime_endpoint", "server_realtime_fallback"];

export function normalizeBaseUrl(value = defaultBaseUrl) {
  const raw = String(value || defaultBaseUrl).trim();
  const url = new URL(raw);
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

export function normalizeRealtimeEndpoint(value) {
  if (!value || typeof value !== "string") {
    throw new Error(
      "Production realtime endpoint is missing. Set NEXT_PUBLIC_ROOMBOARD_REALTIME_URL or PRODUCTION_REALTIME_ENDPOINT.",
    );
  }

  const url = new URL(value);
  url.hash = "";
  url.search = "";
  const origin = url.toString().replace(/\/$/, "");

  if (url.protocol !== "https:") {
    throw new Error(`Production realtime endpoint must use https, got ${origin}`);
  }

  for (const blocked of ["localhost", "127.0.0.1", "example.", "your-"]) {
    if (origin.includes(blocked)) {
      throw new Error(`Production realtime endpoint is not a hosted Phoenix endpoint: ${origin}`);
    }
  }

  return origin;
}

export function resolveRealtimeEndpoint(health, overrideEndpoint) {
  if (overrideEndpoint) {
    return normalizeRealtimeEndpoint(overrideEndpoint);
  }

  return normalizeRealtimeEndpoint(health?.realtimeEndpoint);
}

export function assertRealtimeLaunchChecks(health) {
  const checks = Array.isArray(health?.launch?.checks) ? health.launch.checks : [];
  if (checks.length === 0) {
    throw new Error(`Next health payload is missing launch.checks: ${JSON.stringify(health)}`);
  }

  const failed = requiredLaunchCheckKeys
    .map((key) => checks.find((check) => check?.key === key))
    .filter((check) => !check || check.ok !== true);

  if (failed.length > 0) {
    throw new Error(`Realtime launch checks are not green: ${JSON.stringify(failed)}`);
  }
}

async function fetchJson(url, label, timeoutMs) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed for ${url} within ${timeoutMs}ms: ${reason}`);
  }

  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    throw new Error(`${label} returned ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }

  return body;
}

export async function runProductionRealtimeHealth({ baseUrl, realtimeEndpoint, timeoutMs = defaultTimeoutMs } = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl ?? process.env.PRODUCTION_REALTIME_BASE_URL ?? defaultBaseUrl);
  const health = await fetchJson(`${normalizedBaseUrl}/api/health`, "Next production health", timeoutMs);

  if (health?.ok !== true) {
    throw new Error(`Next production health did not report ok=true: ${JSON.stringify(health)}`);
  }

  assertRealtimeLaunchChecks(health);

  const endpoint = resolveRealtimeEndpoint(health, realtimeEndpoint ?? process.env.PRODUCTION_REALTIME_ENDPOINT);
  const phoenixHealth = await fetchJson(`${endpoint}/health`, "Phoenix production health", timeoutMs);

  if (phoenixHealth?.ok !== true || phoenixHealth?.service !== "roomboard_realtime") {
    throw new Error(`Phoenix health returned an unexpected payload: ${JSON.stringify(phoenixHealth)}`);
  }

  return {
    baseUrl: normalizedBaseUrl,
    endpoint,
    phoenixHealth,
  };
}

async function main() {
  const result = await runProductionRealtimeHealth();
  console.log(
    `Production realtime health passed: ${result.baseUrl} points at ${result.endpoint}, and /health reports roomboard_realtime.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
