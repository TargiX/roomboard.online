import type { RoomSummary } from "./canvasRoom";

export type RoomDecisionCheckpointTone = "empty" | "needs_changes" | "needs_decision" | "reviewing" | "ready";

export type RoomDecisionCheckpoint = {
  detail: string;
  label: string;
  tone: RoomDecisionCheckpointTone;
};

export function getRoomDecisionCheckpoint(
  room: Pick<RoomSummary, "itemCount" | "statusCounts"> & { agentBackedCount?: number },
): RoomDecisionCheckpoint {
  const total = Math.max(0, room.itemCount);
  const approved = Math.max(0, room.statusCounts.approved ?? 0);
  const changesRequested = Math.max(0, room.statusCounts.changes_requested ?? 0);
  const reviewing = Math.max(0, room.statusCounts.reviewing ?? 0);
  const open = Math.max(0, room.statusCounts.open ?? 0);
  // Agent backing is context for the human decision, never a gate: the
  // checkpoint tone still follows card statuses only.
  const agentSuffix = room.agentBackedCount ? ` · ${room.agentBackedCount} backed by agents` : "";

  if (total === 0) {
    return {
      detail: "Add the first decision card",
      label: "First checkpoint",
      tone: "empty",
    };
  }

  if (changesRequested > 0) {
    return {
      detail: `${changesRequested} ${changesRequested === 1 ? "card needs" : "cards need"} changes${agentSuffix}`,
      label: "Needs changes",
      tone: "needs_changes",
    };
  }

  if (open > 0) {
    return {
      detail: `${open} ${open === 1 ? "card needs" : "cards need"} a call${agentSuffix}`,
      label: "Decision checkpoint",
      tone: "needs_decision",
    };
  }

  if (reviewing > 0) {
    return {
      detail: `${reviewing} ${reviewing === 1 ? "card is" : "cards are"} in review${agentSuffix}`,
      label: "Decision checkpoint",
      tone: "reviewing",
    };
  }

  return {
    detail: `${Math.min(approved, total)}/${total} cards approved${agentSuffix}`,
    label: "Decision ready",
    tone: "ready",
  };
}
