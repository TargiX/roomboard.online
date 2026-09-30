import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRoomAgentBroadcastPayload,
  broadcastRoomAgentEvent,
  getRoomAgentBroadcastBaseUrl,
  signRoomAgentBroadcastBody,
} from "../lib/roomAgentBroadcast.ts";

describe("internal broadcast contract", () => {
  it("signs bodies with unpadded base64url HMAC-SHA256 (sidecar parity vector)", () => {
    // Fixed vector: keeps the Node signer and the Elixir verifier
    // (:crypto.mac + Base.url_encode64(padding: false)) in lockstep.
    assert.equal(
      signRoomAgentBroadcastBody('{"a":1}', "roomboard-test-secret"),
      "KugArgZraQ0-zzDJrdVsyDWmkay12FM55M09My8HROU",
    );
  });

  it("stamps roomId and sentAt onto the event", () => {
    const before = Date.now();
    const payload = buildRoomAgentBroadcastPayload("launch-review", { type: "room:message", message: { id: "m1" } });
    assert.equal(payload.roomId, "launch-review");
    assert.equal(payload.event.roomId, "launch-review");
    assert.equal(payload.event.type, "room:message");
    assert.ok(payload.event.sentAt >= before);
  });

  it("prefers the internal override and strips trailing slashes", () => {
    const previousInternal = process.env.ROOMBOARD_REALTIME_INTERNAL_URL;
    const previousPublic = process.env.NEXT_PUBLIC_ROOMBOARD_REALTIME_URL;

    try {
      process.env.ROOMBOARD_REALTIME_INTERNAL_URL = "https://sidecar.example.com//";
      process.env.NEXT_PUBLIC_ROOMBOARD_REALTIME_URL = "http://localhost:4001";
      assert.equal(getRoomAgentBroadcastBaseUrl(), "https://sidecar.example.com");

      delete process.env.ROOMBOARD_REALTIME_INTERNAL_URL;
      assert.equal(getRoomAgentBroadcastBaseUrl(), "http://localhost:4001");

      delete process.env.NEXT_PUBLIC_ROOMBOARD_REALTIME_URL;
      assert.equal(getRoomAgentBroadcastBaseUrl(), "");
    } finally {
      if (previousInternal !== undefined) process.env.ROOMBOARD_REALTIME_INTERNAL_URL = previousInternal;
      if (previousPublic !== undefined) process.env.NEXT_PUBLIC_ROOMBOARD_REALTIME_URL = previousPublic;
    }
  });
});

describe("broadcast retry", () => {
  const withEnv = async (run: () => Promise<void>) => {
    const previousInternal = process.env.ROOMBOARD_REALTIME_INTERNAL_URL;
    const previousSecret = process.env.ROOMBOARD_REALTIME_SECRET;
    const previousFetch = globalThis.fetch;

    try {
      process.env.ROOMBOARD_REALTIME_INTERNAL_URL = "https://sidecar.example.com";
      process.env.ROOMBOARD_REALTIME_SECRET = "roomboard-test-secret";
      await run();
    } finally {
      globalThis.fetch = previousFetch;
      if (previousInternal === undefined) delete process.env.ROOMBOARD_REALTIME_INTERNAL_URL;
      else process.env.ROOMBOARD_REALTIME_INTERNAL_URL = previousInternal;
      if (previousSecret === undefined) delete process.env.ROOMBOARD_REALTIME_SECRET;
      else process.env.ROOMBOARD_REALTIME_SECRET = previousSecret;
    }
  };

  it("retries once when the first attempt fails and then delivers", async () => {
    await withEnv(async () => {
      const calls: number[] = [];
      globalThis.fetch = (async () => {
        calls.push(1);
        return { ok: calls.length > 1 } as Response;
      }) as typeof fetch;

      const delivered = await broadcastRoomAgentEvent("room-1", { type: "room:message", message: { id: "m1" } });

      assert.equal(delivered, true);
      assert.equal(calls.length, 2);
    });
  });

  it("gives up after the retry without throwing", async () => {
    await withEnv(async () => {
      const calls: number[] = [];
      globalThis.fetch = (async () => {
        calls.push(1);
        return { ok: false } as Response;
      }) as typeof fetch;

      const delivered = await broadcastRoomAgentEvent("room-1", { type: "room:message", message: { id: "m1" } });

      assert.equal(delivered, false);
      assert.equal(calls.length, 2);
    });
  });
});
