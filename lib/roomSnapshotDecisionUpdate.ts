import type { RoomItemStatus } from "./canvasRoom";

type DecisionUpdateItem = {
  id: string;
  status: RoomItemStatus;
  title: string;
  updatedAt: number;
};

type RoomSnapshotDecisionUpdateInput = {
  items: DecisionUpdateItem[];
  roomName: string;
  snapshotUrl: string;
};

const statusMeta: Record<RoomItemStatus, { label: string; priority: number }> = {
  changes_requested: { label: "Needs changes", priority: 0 },
  reviewing: { label: "In review", priority: 1 },
  open: { label: "Needs a call", priority: 2 },
  approved: { label: "Approved", priority: 3 },
};

function itemTitle(item: DecisionUpdateItem) {
  return item.title.trim() || "Untitled card";
}

export function buildRoomSnapshotDecisionUpdate({ items, roomName, snapshotUrl }: RoomSnapshotDecisionUpdateInput) {
  const unresolved = items
    .filter((item) => item.status !== "approved")
    .sort((a, b) => statusMeta[a.status].priority - statusMeta[b.status].priority || b.updatedAt - a.updatedAt)
    .slice(0, 3);
  const approvedCount = items.filter((item) => item.status === "approved").length;
  const revisionCount = items.filter((item) => item.status === "changes_requested").length;
  const pendingCount = items.filter((item) => item.status === "open" || item.status === "reviewing").length;
  const headline =
    revisionCount > 0
      ? `${revisionCount} ${revisionCount === 1 ? "card needs" : "cards need"} revisions before the decision is final.`
      : pendingCount > 0
        ? `${pendingCount} ${pendingCount === 1 ? "card still needs" : "cards still need"} a decision.`
        : items.length > 0
          ? "Every card has a decision. This room is ready to share."
          : "This board is ready for its first decision.";

  const lines = [`Decision update — ${roomName}`, headline];

  if (unresolved.length > 0) {
    lines.push("", "Next up:");
    lines.push(...unresolved.map((item) => `- ${statusMeta[item.status].label}: ${itemTitle(item)}`));
  } else if (items.length > 0) {
    lines.push("", `Decision status: ${approvedCount}/${items.length} cards approved.`);
  }

  lines.push("", `Read-only snapshot: ${snapshotUrl}`);
  return lines.join("\n");
}
