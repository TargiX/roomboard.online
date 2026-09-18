import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  createRoomboardRealtimeAccessToken,
  hasRoomboardRealtimeAccessSecret,
  verifyRoomboardRealtimeAccessToken,
} from "../lib/roomboardRealtimeAccess.ts";

const SECRET = "test-roomboard-realtime-secret";
const originalSecret = process.env.ROOMBOARD_REALTIME_SECRET;
const originalDateNow = Date.now;

function setSecret(value: string | undefined) {
  if (value === undefined) {
    delete process.env.ROOMBOARD_REALTIME_SECRET;
  } else {
    process.env.ROOMBOARD_REALTIME_SECRET = value;
  }
}

function setNow(now: number) {
  Date.now = () => now;
}

function decodePayload(encodedPayload: string) {
  return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
    exp: number;
    roomId: string;
    role: string;
    v: string;
  };
}

/** Sign exactly like the Phoenix sidecar: HMAC-SHA256 over the payload string bytes. */
function sidecarSign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

beforeEach(() => {
  setSecret(SECRET);
  setNow(1_000_000);
});

afterEach(() => {
  setSecret(originalSecret);
  Date.now = originalDateNow;
});

describe("roomboard realtime access tokens", () => {
  it("reports whether the realtime secret is configured", () => {
    assert.equal(hasRoomboardRealtimeAccessSecret(), true);
    setSecret(undefined);
    assert.equal(hasRoomboardRealtimeAccessSecret(), false);
  });

  it("creates no token without a secret", () => {
    setSecret(undefined);
    assert.equal(createRoomboardRealtimeAccessToken("room-1", "editor"), null);
    assert.equal(verifyRoomboardRealtimeAccessToken("anything.room", "room-1"), false);
  });

  it("creates a runtime-shaped payload.signature token carrying room, role, ttl, and version", () => {
    const token = createRoomboardRealtimeAccessToken("room-1", "editor");

    assert.ok(typeof token === "string" && token.length > 0);
    const [encodedPayload, signature, extra] = (token as string).split(".");

    assert.ok(encodedPayload.length > 0, "payload segment is non-empty");
    assert.ok(signature.length > 0, "signature segment is non-empty");
    assert.equal(extra, undefined, "token has exactly two dot-separated segments");

    const payload = decodePayload(encodedPayload);
    assert.equal(payload.v, "rb1");
    assert.equal(payload.roomId, "room-1");
    assert.equal(payload.role, "editor");
    assert.ok(Number.isInteger(payload.exp), "exp is an integer ms timestamp");
    assert.ok(payload.exp > 1_000_000, "exp is a future ms timestamp");
    assert.ok(payload.exp - 1_000_000 <= 10 * 60 * 1000, "ttl is at most 10 minutes");
    assert.ok(payload.exp > Date.now(), "token is not already expired at creation time");
  });

  it("uses the exact rb1 payload schema the Phoenix sidecar decodes", () => {
    const payload = decodePayload((createRoomboardRealtimeAccessToken("room-1", "viewer") as string).split(".")[0]);

    assert.deepEqual(Object.keys(payload).sort(), ["exp", "role", "roomId", "v"]);
    assert.equal(payload.v, "rb1");
  });

  it("signs the payload string bytes exactly like the Phoenix sidecar", () => {
    const token = createRoomboardRealtimeAccessToken("room-1", "editor");
    assert.ok(token);
    const [encodedPayload, signature] = token.split(".");

    assert.equal(signature, sidecarSign(encodedPayload, SECRET));
  });

  it("verifies a freshly created token for its own room", () => {
    const token = createRoomboardRealtimeAccessToken("room-1", "editor");

    assert.ok(token);
    assert.equal(verifyRoomboardRealtimeAccessToken(token, "room-1"), true);
    assert.equal(verifyRoomboardRealtimeAccessToken(token, "room-2"), false, "token is room-bound");
    assert.equal(verifyRoomboardRealtimeAccessToken(token, ""), false);
  });

  it("rejects tokens after exp passes", () => {
    setNow(1_000_000);
    const token = createRoomboardRealtimeAccessToken("room-1", "editor");
    assert.ok(token);

    setNow(1_000_000 + 10 * 60 * 1000); // exp boundary
    assert.equal(verifyRoomboardRealtimeAccessToken(token, "room-1"), false, "exp is exclusive");

    setNow(1_000_000 + 10 * 60 * 1000 - 1);
    assert.equal(verifyRoomboardRealtimeAccessToken(token, "room-1"), true, "still valid one ms before exp");
  });

  it("rejects a token signed with a different secret", () => {
    const token = createRoomboardRealtimeAccessToken("room-1", "editor");
    assert.ok(token);
    setSecret("rotated-secret");

    assert.equal(verifyRoomboardRealtimeAccessToken(token, "room-1"), false);
  });

  it("rejects malformed tokens without throwing", () => {
    const valid = createRoomboardRealtimeAccessToken("room-1", "editor");
    assert.ok(valid);
    const [validPayload] = valid.split(".");
    const cases: Array<[string, string]> = [
      ["", "room-1"], // empty
      ["not-a-token", "room-1"], // no dot
      ["payload", "room-1"], // one segment
      ["%%%.", "room-1"], // trailing separator only: empty signature rejected before decode
      [`${Buffer.from("not json").toString("base64url")}.${sidecarSign(Buffer.from("not json").toString("base64url"), SECRET)}`, "room-1"], // payload is not JSON (signature valid so parsing is reached)
      [`${Buffer.from('{"v":"rb1","roomId":"room-1","exp":2000000}').toString("base64url")}.`, "room-1"], // empty signature
      [".only-payload", "room-1"], // leading dot: empty payload
      [`correct-payload.wrong-suffix`, "room-1"], // signature does not match
      [`${valid}.extra`, "room-1"], // appended segment: parity contract = suffix belongs to the signature
      [`${valid}.`, "room-1"], // trailing segment separator only
    ];

    for (const [token, roomId] of cases) {
      assert.equal(verifyRoomboardRealtimeAccessToken(token, roomId), false, `case: ${token.slice(0, 16)}`);
    }
  });

  it("is length-safe when the presented signature is shorter or longer than expected", () => {
    const token = createRoomboardRealtimeAccessToken("room-1", "editor");
    assert.ok(token);
    const [encodedPayload] = token.split(".");
    const longSignature = "A".repeat(200);

    assert.equal(verifyRoomboardRealtimeAccessToken(`${encodedPayload}.${longSignature}`, "room-1"), false);
    assert.equal(verifyRoomboardRealtimeAccessToken(`${encodedPayload}.short`, "room-1"), false);
  });

  it("rejects payload field drift even with a valid signature", () => {
    const forgedPayload = Buffer.from(
      JSON.stringify({ exp: 2_000_000.5, roomId: "room-2", role: "editor", v: "rb1" }),
    ).toString("base64url");

    const forged = `${forgedPayload}.${sidecarSign(forgedPayload, SECRET)}`;
    assert.equal(verifyRoomboardRealtimeAccessToken(forged, "room-1"), false, "roomId mismatch rejected");
    // NOTE: fractional exp accepted by TS verify matches the sidecar contract (is_number, no
    // integer check) — only that the number is > now. Locked here as documented parity.
    assert.equal(verifyRoomboardRealtimeAccessToken(forged, "room-2"), true, "fractional exp accepted on both sides");
  });

  it("rejects wrong version and string exp values the sidecar would refuse", () => {
    for (const payload of [
      { exp: 2_000_000, roomId: "room-1", role: "editor", v: "rb0" },
      { exp: "2000000", roomId: "room-1", role: "editor", v: "rb1" },
      { exp: 0, roomId: "room-1", role: "editor", v: "rb1" },
      { roomId: "room-1", role: "editor", v: "rb1" }, // missing exp
      { exp: 2_000_000, roomId: "room-1", v: "rb1" }, // missing role
    ]) {
      const forgedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const forged = `${forgedPayload}.${sidecarSign(forgedPayload, SECRET)}`;
      assert.equal(verifyRoomboardRealtimeAccessToken(forged, "room-1"), false);
    }
  });

  it("always issues tokens over a plaintext JSON payload with no JWT header segment", () => {
    // Documented wire-format divergence from JWT: the sidecar decodes a single JSON
    // object (no base64 "header.payload" split, no "alg"/"typ" keys).
    const token = createRoomboardRealtimeAccessToken("room-1", "editor");
    assert.ok(token);
    const payloadText = Buffer.from(token.split(".")[0], "base64url").toString("utf8");
    const payload = JSON.parse(payloadText) as Record<string, unknown>;

    assert.equal("alg" in payload, false, "no JWT alg header");
    assert.equal("typ" in payload, false, "no JWT typ header");
    assert.equal(payloadText.trimStart()[0], "{", "payload is a plain JSON object");
  });
});
