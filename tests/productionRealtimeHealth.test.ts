import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertRealtimeLaunchChecks,
  normalizeBaseUrl,
  normalizeRealtimeEndpoint,
  resolveRealtimeEndpoint,
} from "../scripts/production-realtime-health.mjs";

describe("production realtime health helpers", () => {
  it("normalizes app and Phoenix health endpoints", () => {
    assert.equal(normalizeBaseUrl("https://www.roomboard.online/?utm=ignored#top"), "https://www.roomboard.online");
    assert.equal(
      normalizeRealtimeEndpoint("https://roomboard-realtime.onrender.com/"),
      "https://roomboard-realtime.onrender.com",
    );
  });

  it("rejects local or placeholder realtime endpoints for production", () => {
    assert.throws(() => normalizeRealtimeEndpoint("http://localhost:4001"), /https/);
    assert.throws(
      () => normalizeRealtimeEndpoint("https://your-phoenix-service.example.com"),
      /not a hosted Phoenix endpoint/,
    );
  });

  it("prefers an explicit endpoint override when provided", () => {
    const endpoint = resolveRealtimeEndpoint(
      { realtimeEndpoint: "https://stale-realtime.onrender.com" },
      "https://fresh-realtime.onrender.com",
    );

    assert.equal(endpoint, "https://fresh-realtime.onrender.com");
  });

  it("requires all realtime launch checks to be green", () => {
    assert.doesNotThrow(() =>
      assertRealtimeLaunchChecks({
        launch: {
          checks: [
            { key: "realtime_signed_tokens", ok: true },
            { key: "realtime_endpoint", ok: true },
            { key: "server_realtime_fallback", ok: true },
          ],
        },
      }),
    );

    assert.throws(
      () =>
        assertRealtimeLaunchChecks({
          launch: {
            checks: [
              { key: "realtime_signed_tokens", ok: true },
              { key: "realtime_endpoint", ok: false },
              { key: "server_realtime_fallback", ok: true },
            ],
          },
        }),
      /Realtime launch checks are not green/,
    );
  });
});
