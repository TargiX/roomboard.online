import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { checkRateLimit, getRequestClientKey } from "../lib/requestRateLimit.ts";

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

    assert.deepEqual(checkRateLimit(key, 2, 10_000), { allowed: true, retryAfter: 0 });
    assert.deepEqual(checkRateLimit(key, 2, 10_000), { allowed: true, retryAfter: 0 });
    assert.deepEqual(checkRateLimit(key, 2, 10_000), { allowed: false, retryAfter: 10 });
  });

  it("opens a new bucket after the window resets", () => {
    const key = `test:${crypto.randomUUID()}`;
    setNow(5_000);

    assert.equal(checkRateLimit(key, 1, 1_000).allowed, true);
    assert.equal(checkRateLimit(key, 1, 1_000).allowed, false);

    setNow(6_001);
    assert.deepEqual(checkRateLimit(key, 1, 1_000), { allowed: true, retryAfter: 0 });
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
});
