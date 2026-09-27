import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRoomAgentBroadcastPayload,
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
