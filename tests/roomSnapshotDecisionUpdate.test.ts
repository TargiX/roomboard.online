import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRoomSnapshotDecisionUpdate } from "../lib/roomSnapshotDecisionUpdate.ts";

const snapshotUrl = "https://www.roomboard.online/rooms/design-review/snapshot";

describe("buildRoomSnapshotDecisionUpdate", () => {
  it("creates a compact public handoff that prioritizes revisions before unresolved decisions", () => {
    const update = buildRoomSnapshotDecisionUpdate({
      roomName: "Homepage review",
      snapshotUrl,
      items: [
        { id: "open", status: "open", title: "Choose headline", updatedAt: 30 },
        { id: "revision", status: "changes_requested", title: "Tighten hero crop", updatedAt: 10 },
        { id: "review", status: "reviewing", title: "Check mobile hierarchy", updatedAt: 20 },
        { id: "approved", status: "approved", title: "Set visual direction", updatedAt: 40 },
      ],
    });

    assert.equal(
      update,
      [
        "Decision update — Homepage review",
        "1 card needs revisions before the decision is final.",
        "",
        "Next up:",
        "- Needs changes: Tighten hero crop",
        "- In review: Check mobile hierarchy",
        "- Needs a call: Choose headline",
        "",
        `Read-only snapshot: ${snapshotUrl}`,
      ].join("\n"),
    );
  });

  it("marks a fully approved room as ready without inventing next steps", () => {
    const update = buildRoomSnapshotDecisionUpdate({
      roomName: "Launch review",
      snapshotUrl,
      items: [{ id: "approved", status: "approved", title: "Ship it", updatedAt: 1 }],
    });

    assert.match(update, /Every card has a decision\. This room is ready to share\./);
    assert.match(update, /Decision status: 1\/1 cards approved\./);
    assert.doesNotMatch(update, /Next up:/);
  });
});
