import type { RoomSummary } from "./canvasRoom";
import { getRoomDecisionCheckpoint, type RoomDecisionCheckpointTone } from "./roomDecisionCheckpoint.ts";

type RoomDecisionMessageRoom = Pick<RoomSummary, "itemCount" | "name" | "statusCounts">;

export type RoomDecisionMessage = {
  message: string;
  tone: RoomDecisionCheckpointTone;
};

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function agree(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

export function buildRoomDecisionMessage(room: RoomDecisionMessageRoom, url: string): RoomDecisionMessage {
  const checkpoint = getRoomDecisionCheckpoint(room);
  const approved = Math.max(0, room.statusCounts.approved ?? 0);
  const changesRequested = Math.max(0, room.statusCounts.changes_requested ?? 0);
  const reviewing = Math.max(0, room.statusCounts.reviewing ?? 0);
  const open = Math.max(0, room.statusCounts.open ?? 0);
  const lines = [`Roomboard decision update: ${room.name}`, ""];

  switch (checkpoint.tone) {
    case "empty":
      lines.push("This room needs its first decision question or visual direction.", "Add the starting point here:");
      break;
    case "needs_changes":
      lines.push(
        `${pluralize(changesRequested, "card")} ${agree(changesRequested, "needs", "need")} changes before the decision can close.`,
      );
      if (open + reviewing > 0) {
        const pending = open + reviewing;
        lines.push(`${pluralize(pending, "card")} still ${agree(pending, "needs", "need")} a response.`);
      }
      lines.push("Please review the feedback and update the board:");
      break;
    case "needs_decision":
      lines.push(`${pluralize(open, "card")} ${agree(open, "needs", "need")} a decision.`);
      if (reviewing > 0)
        lines.push(`${pluralize(reviewing, "card")} ${agree(reviewing, "is", "are")} already in review.`);
      lines.push("Please make the call in the room:");
      break;
    case "reviewing":
      lines.push(
        `${pluralize(reviewing, "card")} ${agree(reviewing, "is", "are")} in review and ready for your response.`,
        "Open the board to close the decision:",
      );
      break;
    case "ready":
      lines.push(
        `Decision ready: ${Math.min(approved, Math.max(0, room.itemCount))}/${Math.max(0, room.itemCount)} cards approved.`,
        "The decision record is ready to share:",
      );
      break;
  }

  lines.push(url);
  return { message: lines.join("\n"), tone: checkpoint.tone };
}
