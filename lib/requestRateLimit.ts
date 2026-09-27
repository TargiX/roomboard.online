import { getSupabaseAdminClient } from "./supabaseAdmin.ts";

type Bucket = {
  count: number;
  resetAt: number;
};

const globalForRateLimit = globalThis as unknown as {
  roomboardRateLimitBuckets?: Map<string, Bucket>;
};

function buckets() {
  if (!globalForRateLimit.roomboardRateLimitBuckets) {
    globalForRateLimit.roomboardRateLimitBuckets = new Map();
  }

  return globalForRateLimit.roomboardRateLimitBuckets;
}

export function getRequestClientKey(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "local"
  );
}

export type RateLimitCheckResult = {
  allowed: boolean;
  retryAfter: number;
  /**
   * Which limiter produced this decision. `memory` means the decision came
   * from the per-instance in-process bucket: either Supabase isn't
   * configured (local dev, tests) or the distributed RPC failed and we
   * failed open. Per-instance limits on serverless reset on every cold
   * start, so a persistent `memory` mode in production is a deployment
   * problem worth alerting on (see ROADMAP.md "Remaining debt" #3).
   */
  mode: "distributed" | "memory";
};

function checkRateLimitResult(key: string, limit: number, windowMs: number): RateLimitCheckResult {
  const now = Date.now();
  const store = buckets();
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0, mode: "memory" };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      mode: "memory",
    };
  }

  bucket.count += 1;
  return { allowed: true, retryAfter: 0, mode: "memory" };
}

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  return checkRateLimitResult(key, limit, windowMs);
}

/**
 * Distributed variant backed by the `roomboard_rate_limit_hit` Postgres
 * function (see supabase/roomboard-schema.sql). The in-memory limiter above is
 * per-instance, which on serverless means per-lambda — an attacker gets a
 * fresh budget on every cold start. When Supabase isn't configured (local dev
 * without env, tests) this falls back to the in-memory bucket so behavior is
 * unchanged. On RPC failure it fails open to the local bucket: a rate-limit
 * outage should degrade protection, not take the API down.
 */
export async function checkRateLimitDistributed(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitCheckResult> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return checkRateLimitResult(key, limit, windowMs);
  }

  try {
    const { data, error } = await supabase.rpc("roomboard_rate_limit_hit", {
      p_bucket: key,
      p_window_ms: windowMs,
    });

    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row || typeof row.count !== "number") {
      return checkRateLimitResult(key, limit, windowMs);
    }

    if (row.count > limit) {
      const resetAt = row.reset_at ? new Date(row.reset_at).getTime() : Date.now() + windowMs;
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
        mode: "distributed",
      };
    }

    return { allowed: true, retryAfter: 0, mode: "distributed" };
  } catch {
    return checkRateLimitResult(key, limit, windowMs);
  }
}

/**
 * Response header naming the limiter that produced a rate-limit decision.
 * Attach it to any route built on `checkRateLimitDistributed` so the
 * silent fail-open path (ROADMAP.md "Remaining debt" #3) becomes visible
 * in devtools, readiness checks, and logs instead of only in source.
 */
export function rateLimitModeHeader(result: RateLimitCheckResult): Record<string, string> {
  return { "Roomboard-Rate-Limit-Mode": result.mode };
}
