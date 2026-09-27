import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  checkRateLimit,
  checkRateLimitDistributed,
  rateLimitModeHeader,
  getRequestClientKey,
} from "../lib/requestRateLimit.ts";

const originalDateNow = Date.now;

function setNow(now: number) {
  Date.now = () => now;
}

afterEach(() => {
  Date.now = originalDateNow;
});

describe("request rate limiting", () => {
  it("allows requests up to the configured limit and returns retry-after after that", () => {
    const key = `test:${crypto.randomUUID()}`;
    setNow(1_000);

    assert.deepEqual(checkRateLimit(key, 2, 10_000), { allowed: true, retryAfter: 0, mode: "memory" });
    assert.deepEqual(checkRateLimit(key, 2, 10_000), { allowed: true, retryAfter: 0, mode: "memory" });
    assert.deepEqual(checkRateLimit(key, 2, 10_000), {
      allowed: false,
      retryAfter: 10,
      mode: "memory",
    });
  });

  it("opens a new bucket after the window resets", () => {
    const key = `test:${crypto.randomUUID()}`;
    setNow(5_000);

    assert.equal(checkRateLimit(key, 1, 1_000).allowed, true);
    assert.equal(checkRateLimit(key, 1, 1_000).allowed, false);

    setNow(6_001);
    assert.deepEqual(checkRateLimit(key, 1, 1_000), { allowed: true, retryAfter: 0, mode: "memory" });
  });

  it("uses forwarded IP headers before falling back to local", () => {
    assert.equal(
      getRequestClientKey(
        new Request("https://roomboard.test", { headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" } }),
      ),
      "203.0.113.10",
    );
    assert.equal(
      getRequestClientKey(new Request("https://roomboard.test", { headers: { "x-real-ip": "198.51.100.2" } })),
      "198.51.100.2",
    );
    assert.equal(getRequestClientKey(new Request("https://roomboard.test")), "local");
  });

  it("tags memory limiter decisions and exposes them as a mode header", () => {
    const key = `test:${crypto.randomUUID()}`;
    setNow(2_000);

    assert.deepEqual(checkRateLimit(key, 1, 1_000), {
      allowed: true,
      retryAfter: 0,
      mode: "memory",
    });
    assert.deepEqual(rateLimitModeHeader({ allowed: false, retryAfter: 3, mode: "memory" }), {
      "Roomboard-Rate-Limit-Mode": "memory",
    });
  });

  it("distributed limiter falls back to memory mode when Supabase is not configured", async () => {
    // Isolate from ambient credentials: unset the admin client global and
    // the env vars getSupabaseAdminClient reads, so the test exercises the
    // documented fail-open path regardless of the developer/CI shell.
    const key = `test:${crypto.randomUUID()}`;
    setNow(3_000);

    const adminGlobal = globalThis as unknown as {
      roomboardAdminClient?: unknown;
    };
    const originalClient = adminGlobal.roomboardAdminClient;
    const envKeys = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
    const originalEnv: Record<string, string | undefined> = {};
    for (const envKey of envKeys) {
      originalEnv[envKey] = process.env[envKey];
      delete process.env[envKey];
    }
    adminGlobal.roomboardAdminClient = undefined;

    try {
      const result = await checkRateLimitDistributed(key, 1, 1_000);

      assert.deepEqual(result, { allowed: true, retryAfter: 0, mode: "memory" });

      setNow(3_100);
      const blocked = await checkRateLimitDistributed(key, 1, 1_000);
      assert.deepEqual(blocked, { allowed: false, retryAfter: 1, mode: "memory" });
    } finally {
      adminGlobal.roomboardAdminClient = originalClient;
      for (const envKey of envKeys) {
        if (originalEnv[envKey] === undefined) {
          delete process.env[envKey];
        } else {
          process.env[envKey] = originalEnv[envKey];
        }
      }
    }
  });

  it("distributed limiter reports distributed mode when the RPC answers", async () => {
    const key = `test:${crypto.randomUUID()}`;
    setNow(4_000);

    const { getSupabaseAdminClient } = await import("../lib/supabaseAdmin.ts");
    const realClient = getSupabaseAdminClient();
    const fakeClient = {
      rpc: async () => ({ data: [{ count: 5, reset_at: null }], error: null }),
    } as unknown as NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

    const adminGlobal = globalThis as unknown as {
      roomboardAdminClient?: typeof realClient;
    };
    const original = adminGlobal.roomboardAdminClient;
    adminGlobal.roomboardAdminClient = fakeClient;

    try {
      assert.deepEqual(await checkRateLimitDistributed(key, 4, 60_000), {
        allowed: false,
        retryAfter: 60,
        mode: "distributed",
      });
    } finally {
      adminGlobal.roomboardAdminClient = original;
    }
  });
});
