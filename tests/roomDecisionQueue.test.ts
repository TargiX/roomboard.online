import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRoomDecisionQueue } from "../lib/roomDecisionQueue.ts";

function room(id: string, updatedAt: number, statusCounts: Record<string, number>, itemCount = 1) {
  return {
    id,
    itemCount,
    name: `Room ${id}`,
    statusCounts: { approved: 0, changes_requested: 0, open: 0, reviewing: 0, ...statusCounts },
    updatedAt,
  };
}

describe("getRoomDecisionQueue", () => {
  it("shows only owner rooms and puts revisions ahead of other follow-up", () => {
    const queue = getRoomDecisionQueue(
      [
        room("ready", 1, { approved: 1 }),
        room("open", 20, { open: 1 }),
        room("changes", 10, { changes_requested: 1 }),
        room("joined", 100, { changes_requested: 1 }),
      ],
      ["ready", "open", "changes"],
    );

    assert.equal(queue.ownedCount, 3);
    assert.equal(queue.readyCount, 1);
    assert.deepEqual(
      queue.attention.map((entry) => [entry.room.id, entry.action, entry.checkpoint.tone]),
      [
        ["changes", "Review revisions", "needs_changes"],
        ["open", "Make a call", "needs_decision"],
      ],
    );
  });

  it("keeps an empty owner room actionable instead of treating it as ready", () => {
    const queue = getRoomDecisionQueue([room("empty", 1, {}, 0)], ["empty"]);
    assert.deepEqual(
      queue.attention.map((entry) => [entry.action, entry.checkpoint.detail]),
      [["Set the decision", "Add the first decision card"]],
    );
    assert.equal(queue.readyCount, 0);
  });
});
