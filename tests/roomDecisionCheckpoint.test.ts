import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRoomDecisionCheckpoint } from "../lib/roomDecisionCheckpoint.ts";

function makeRoom({
  itemCount = 0,
  statusCounts = {},
}: {
  itemCount?: number;
  statusCounts?: Partial<{
    approved: number;
    changes_requested: number;
    open: number;
    reviewing: number;
  }>;
}) {
  return {
    itemCount,
    statusCounts: {
      approved: 0,
      changes_requested: 0,
      open: 0,
      reviewing: 0,
      ...statusCounts,
    },
  };
}

describe("getRoomDecisionCheckpoint", () => {
  it("gives an empty room a concrete first decision action", () => {
    assert.deepEqual(getRoomDecisionCheckpoint(makeRoom({})), {
      detail: "Add the first decision card",
      label: "First checkpoint",
      tone: "empty",
    });
  });

  it("prioritizes changes before undecided and review work", () => {
    assert.deepEqual(
      getRoomDecisionCheckpoint(
        makeRoom({
          itemCount: 5,
          statusCounts: { changes_requested: 1, open: 2, reviewing: 1 },
        }),
      ),
      {
        detail: "1 card needs changes",
        label: "Needs changes",
        tone: "needs_changes",
      },
    );
  });

  it("makes outstanding decisions visible before a room is ready", () => {
    assert.deepEqual(
      getRoomDecisionCheckpoint(
        makeRoom({
          itemCount: 3,
          statusCounts: { approved: 1, open: 2 },
        }),
      ),
      {
        detail: "2 cards need a call",
        label: "Decision checkpoint",
        tone: "needs_decision",
      },
    );
  });

  it("marks fully approved rooms as ready", () => {
    assert.deepEqual(
      getRoomDecisionCheckpoint(
        makeRoom({
          itemCount: 3,
          statusCounts: { approved: 3 },
        }),
      ),
      {
        detail: "3/3 cards approved",
        label: "Decision ready",
        tone: "ready",
      },
    );
  });
});
