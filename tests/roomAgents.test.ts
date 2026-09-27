import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGENT_TURN_BUDGET,
  MAX_ROOM_MESSAGE_BODY,
  MAX_ROOM_MESSAGE_MENTIONS,
  countTrailingAgentMessages,
  createRoomAgentToken,
  getAgentTurnBudgetState,
  hashRoomAgentToken,
  mergeRoomMessages,
  normalizeRoomMessage,
  normalizeRoomMessageMentions,
  parseRoomAgentToken,
  roomAgentTokenHashesMatch,
  toPublicRoomAgent,
  type RoomMessage,
} from "../lib/roomAgents.ts";

function message(authorKind: "agent" | "human", overrides: Partial<RoomMessage> = {}): RoomMessage {
  const id = overrides.id ?? crypto.randomUUID();
  return {
    id,
    authorId: authorKind === "agent" ? `agent:${id}` : id,
    authorName: authorKind === "agent" ? "Bot" : "Editor",
    authorKind,
    body: "hello",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("room agent tokens", () => {
  it("round-trips room ids containing underscores and dashes", () => {
    for (const roomId of ["launch_review", "my-room-2", "a1_b2-c3"]) {
      const parsed = parseRoomAgentToken(createRoomAgentToken(roomId));
      assert.ok(parsed);
      assert.equal(parsed.roomId, roomId);
    }
  });

  it("rejects malformed tokens instead of guessing a room", () => {
    assert.equal(parseRoomAgentToken("rbx_launch_abcdef0123456789abcdef0123456789"), null);
    assert.equal(parseRoomAgentToken("rba1_launch_NOTHEX"), null);
    assert.equal(parseRoomAgentToken(`rba1__${"a".repeat(48)}`), null);
    assert.equal(parseRoomAgentToken("rba1_no-secret"), null);
  });

  it("hashes deterministically and only compares well-formed hashes", () => {
    const token = createRoomAgentToken("room-a");
    assert.equal(hashRoomAgentToken(token), hashRoomAgentToken(token));
    assert.ok(roomAgentTokenHashesMatch(hashRoomAgentToken(token), hashRoomAgentToken(token)));
    assert.equal(
      roomAgentTokenHashesMatch(hashRoomAgentToken(token), hashRoomAgentToken(createRoomAgentToken("room-a"))),
      false,
    );
    assert.equal(roomAgentTokenHashesMatch("short", hashRoomAgentToken(token)), false);
  });
});

describe("agent turn budget", () => {
  it("counts consecutive agent messages from the transcript tail", () => {
    const transcript = [message("agent"), message("human"), message("agent"), message("agent")];
    assert.equal(countTrailingAgentMessages(transcript), 2);
    assert.equal(getAgentTurnBudgetState(transcript).remaining, AGENT_TURN_BUDGET - 2);
    assert.equal(getAgentTurnBudgetState(transcript).exhausted, false);
  });

  it("mutes at exactly the budget and unmutes when a human speaks", () => {
    const agents = Array.from({ length: AGENT_TURN_BUDGET }, () => message("agent"));
    assert.equal(getAgentTurnBudgetState(agents).exhausted, true);
    assert.equal(getAgentTurnBudgetState(agents).remaining, 0);
    assert.equal(getAgentTurnBudgetState([...agents, message("human")]).exhausted, false);
  });
});

describe("room message normalization", () => {
  it("drops empty bodies and caps long ones", () => {
    assert.equal(normalizeRoomMessage({ id: "m1", body: "   ", authorKind: "agent", createdAt: 1 }), null);
    const normalized = normalizeRoomMessage({
      id: "m2",
      authorId: "agent:x",
      authorName: "Bot",
      authorKind: "agent",
      body: "x".repeat(MAX_ROOM_MESSAGE_BODY + 500),
      createdAt: 2,
    });
    assert.ok(normalized);
    assert.equal(normalized.body.length, MAX_ROOM_MESSAGE_BODY);
  });

  it("defaults unknown authors by kind", () => {
    const agentMessage = normalizeRoomMessage({ id: "m3", body: "hi", authorKind: "agent", createdAt: 3 });
    const humanMessage = normalizeRoomMessage({ id: "m4", body: "hi", createdAt: 4 });
    assert.equal(agentMessage?.authorName, "Agent");
    assert.equal(humanMessage?.authorKind, "human");
    assert.equal(humanMessage?.authorName, "Editor");
  });

  it("filters mentions to known agents, dedupes, and caps", () => {
    const known = new Set(["a1", "a2"]);
    assert.deepEqual(normalizeRoomMessageMentions(["a1", "ghost", "a1", 42, null], known), ["a1"]);
    const many = Array.from({ length: 30 }, (_, index) => `agent-${index}`);
    assert.equal(normalizeRoomMessageMentions(many).length, MAX_ROOM_MESSAGE_MENTIONS);
  });
});

describe("transcript merge", () => {
  it("unions by id and sorts chronologically", () => {
    const current = [message("human", { id: "m1", createdAt: 100 }), message("agent", { id: "m2", createdAt: 300 })];
    const incoming = [message("human", { id: "m0", createdAt: 50 }), message("agent", { id: "m2", createdAt: 300 })];
    assert.deepEqual(
      mergeRoomMessages(current, incoming).map((entry) => entry.id),
      ["m0", "m1", "m2"],
    );
  });

  it("returns the current list untouched when nothing arrives", () => {
    const current = [message("human")];
    assert.equal(mergeRoomMessages(current, []), current);
  });

  it("trims from the front when over the cap", () => {
    const bulk = Array.from({ length: 10 }, (_, index) => message("agent", { id: `m${index}`, createdAt: index }));
    const merged = mergeRoomMessages(bulk, [message("agent", { id: "m10", createdAt: 10 })], 5);
    assert.deepEqual(
      merged.map((entry) => entry.id),
      ["m6", "m7", "m8", "m9", "m10"],
    );
  });
});

describe("public roster projection", () => {
  it("never leaks the token hash", () => {
    const projected = toPublicRoomAgent({
      id: "a1",
      name: "Hermes",
      color: "#7c8cff",
      tokenHash: hashRoomAgentToken(createRoomAgentToken("room-a")),
      createdAt: 1,
      lastSeenAt: 2,
    });
    assert.equal("tokenHash" in projected, false);
    assert.equal(projected.lastSeenAt, 2);
  });
});

