import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RoomItem } from "../lib/canvasRoom.ts";
import {
  getActiveRoomAgents,
  getRoundPendingAgentIds,
  getRoomReviewRoundState,
  progressRoomReviewRounds,
  type RoomReviewRound,
  type RoomReviewRoundPhase,
} from "../lib/roomRounds.ts";

const startedAt = 1000;

function agent(id: string, overrides: { isArbiter?: boolean; muted?: boolean } = {}) {
  return { id, name: `Agent-${id}`, ...overrides };
}

function item(overrides: Partial<RoomItem> = {}): RoomItem {
  return {
    id: "item-1",
    type: "note",
    status: "open",
    title: "Card",
    body: "",
    author: "Owner",
    color: "#facc5c",
    x: 0,
    y: 0,
    width: 200,
    height: 150,
    createdAt: 1,
    updatedAt: 1,
    comments: [],
    ...overrides,
  };
}

function round(phase: RoomReviewRoundPhase, itemId = "item-1"): RoomReviewRound {
  return { id: "round-1", itemId, phase, startedAt };
}

describe("review round progression", () => {
  it("treats arbiters and muted agents as observers", () => {
    const agents = [agent("a1"), agent("a2", { isArbiter: true }), agent("a3", { muted: true })];
    assert.deepEqual(
      getActiveRoomAgents(agents).map((entry) => entry.id),
      ["a1"],
    );
  });

  it("waits for every active worker comment before moving to vote", () => {
    const agents = [agent("a1"), agent("a2"), agent("a3", { isArbiter: true }), agent("a4", { muted: true })];
    assert.deepEqual(getRoundPendingAgentIds(round("critique"), item(), agents), ["a1", "a2"]);

    const oneComment = item({
      comments: [{ id: "c1", author: "Agent-a1", body: "looks fine", color: "#7c8cff", createdAt: startedAt + 1 }],
    });
    assert.equal(progressRoomReviewRounds([round("critique")], [oneComment], agents)[0].phase, "critique");

    const bothComments = item({
      comments: [
        { id: "c1", author: "Agent-a1", body: "a", color: "#7c8cff", createdAt: startedAt + 1 },
        { id: "c2", author: "Agent-a2", body: "b", color: "#7c8cff", createdAt: startedAt + 2 },
      ],
    });
    assert.equal(progressRoomReviewRounds([round("critique")], [bothComments], agents)[0].phase, "vote");
  });

  it("ignores comments posted before the round started", () => {
    const stale = item({
      comments: [{ id: "c0", author: "Agent-a1", body: "old", color: "#7c8cff", createdAt: startedAt - 5 }],
    });
    assert.deepEqual(getRoundPendingAgentIds(round("critique"), stale, [agent("a1")]), ["a1"]);
  });

  it("closes the vote phase once every active worker signaled", () => {
    const agents = [agent("a1"), agent("a2")];
    const voted = item({
      decisionSignals: [
        { voterId: "agent:a1", voter: "Agent-a1", color: "#7c8cff", createdAt: 5 },
        { voterId: "agent:a2", voter: "Agent-a2", color: "#7c8cff", createdAt: 6 },
      ],
    });
    const closed = progressRoomReviewRounds([round("vote")], [voted], agents);
    assert.equal(closed[0].phase, "closed");
    assert.ok(closed[0].closedAt);
  });

  it("closes rounds whose card disappeared", () => {
    const closed = progressRoomReviewRounds([round("critique", "ghost")], [item()], [agent("a1")]);
    assert.equal(closed[0].phase, "closed");
  });

  it("exposes pending ids and names for UI and MCP", () => {
    const state = getRoomReviewRoundState([round("critique")], [item()], [agent("a1"), agent("a2")], "item-1");
    assert.deepEqual(state?.pendingAgentIds, ["a1", "a2"]);
    assert.deepEqual(state?.pendingAgentNames, ["Agent-a1", "Agent-a2"]);
    assert.equal(getRoomReviewRoundState([round("closed")], [item()], [agent("a1")], "item-1"), null);
  });
});
