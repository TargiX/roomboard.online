import type { RoomSummary } from "./canvasRoom";
import { getRoomDecisionCheckpoint, type RoomDecisionCheckpoint } from "./roomDecisionCheckpoint.ts";

export type RoomDecisionQueueEntry = {
  action: string;
  checkpoint: RoomDecisionCheckpoint;
  room: Pick<RoomSummary, "id" | "name" | "updatedAt">;
};

export type RoomDecisionQueue = {
  attention: RoomDecisionQueueEntry[];
  ownedCount: number;
  readyCount: number;
};

const attentionPriority: Record<Exclude<RoomDecisionCheckpoint["tone"], "ready">, number> = {
  needs_changes: 0,
  needs_decision: 1,
  reviewing: 2,
  empty: 3,
};

function actionForCheckpoint(checkpoint: RoomDecisionCheckpoint) {
  switch (checkpoint.tone) {
    case "needs_changes":
      return "Review revisions";
    case "needs_decision":
      return "Make a call";
    case "reviewing":
      return "Finish review";
    case "empty":
      return "Set the decision";
    case "ready":
      return "Share recap";
  }
}

function getAttentionPriority(tone: RoomDecisionCheckpoint["tone"]) {
  return tone === "ready" ? Number.MAX_SAFE_INTEGER : attentionPriority[tone];
}

export function getRoomDecisionQueue(
  rooms: Array<Pick<RoomSummary, "id" | "itemCount" | "name" | "statusCounts" | "updatedAt">>,
  ownedRoomIds: Iterable<string>,
): RoomDecisionQueue {
  const ownedIds = new Set(ownedRoomIds);
  const ownedRooms = rooms.filter((room) => ownedIds.has(room.id));
  const attention = ownedRooms
    .map((room) => ({ checkpoint: getRoomDecisionCheckpoint(room), room }))
    .filter((entry) => entry.checkpoint.tone !== "ready")
    .sort(
      (a, b) =>
        getAttentionPriority(a.checkpoint.tone) - getAttentionPriority(b.checkpoint.tone) ||
        b.room.updatedAt - a.room.updatedAt,
    )
    .map(({ checkpoint, room }) => ({
      action: actionForCheckpoint(checkpoint),
      checkpoint,
      room: { id: room.id, name: room.name, updatedAt: room.updatedAt },
    }));

  return { attention, ownedCount: ownedRooms.length, readyCount: ownedRooms.length - attention.length };
}
