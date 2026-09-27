import type { RoomItem } from "./canvasRoom.ts";
import type { RoomAgent } from "./roomAgents.ts";

/**
 * Per-card review rounds: a server-orchestrated ritual that turns the
 * mention-driven free chat into a bounded critique→vote cycle on one card.
 * All progression logic is pure so it can run inside any room mutation and
 * be unit-tested without a store. Agent inputs are structural picks so both
 * the full roster and the public snapshot projection can drive it.
 */

export type RoomReviewRoundPhase = "critique" | "vote" | "closed";

export type RoomReviewRound = {
  id: string;
  itemId: string;
  phase: RoomReviewRoundPhase;
  startedAt: number;
  closedAt?: number;
};

export type RoomReviewRoundAgent = Pick<RoomAgent, "id" | "name" | "isArbiter" | "muted">;

/** Workers participate in rounds; arbiters observe, muted agents wait. */
export function getActiveRoomAgents(agents: RoomReviewRoundAgent[]): RoomReviewRoundAgent[] {
  return agents.filter((agent) => !agent.isArbiter && !agent.muted);
}

/**
 * Agent ids still owed for the round's current phase. Critique waits for a
 * comment authored by the agent (comments store display names, and agent
 * names are unique per room); vote waits for a decision signal.
 */
export function getRoundPendingAgentIds(
  round: RoomReviewRound,
  item: RoomItem,
  agents: RoomReviewRoundAgent[],
): string[] {
  const active = getActiveRoomAgents(agents);

  if (round.phase === "critique") {
    const commentedNames = new Set(
      item.comments.filter((comment) => comment.createdAt >= round.startedAt).map((comment) => comment.author),
    );
    return active.filter((agent) => !commentedNames.has(agent.name)).map((agent) => agent.id);
  }

  if (round.phase === "vote") {
    const voterIds = new Set((item.decisionSignals ?? []).map((signal) => signal.voterId));
    return active.filter((agent) => !voterIds.has(`agent:${agent.id}`)).map((agent) => agent.id);
  }

  return [];
}

/**
 * Advance every open round whose phase obligations are met: critique→vote
 * once all active workers commented, vote→closed once all voted. Rounds
 * whose card disappeared close instead of dangling forever.
 */
export function progressRoomReviewRounds(
  rounds: RoomReviewRound[],
  items: RoomItem[],
  agents: RoomReviewRoundAgent[],
): RoomReviewRound[] {
  return rounds.map((round) => {
    if (round.phase === "closed") {
      return round;
    }

    const item = items.find((candidate) => candidate.id === round.itemId);

    if (!item) {
      return { ...round, phase: "closed" as const, closedAt: Date.now() };
    }

    const pending = getRoundPendingAgentIds(round, item, agents);

    if (round.phase === "critique" && pending.length === 0) {
      return { ...round, phase: "vote" as const };
    }

    if (round.phase === "vote" && pending.length === 0) {
      return { ...round, phase: "closed" as const, closedAt: Date.now() };
    }

    return round;
  });
}

export function getOpenRoomReviewRound(rounds: RoomReviewRound[], itemId: string): RoomReviewRound | null {
  return rounds.find((round) => round.itemId === itemId && round.phase !== "closed") ?? null;
}

/** UI/MCP-facing projection: phase plus the wait list in ids and names. */
export function getRoomReviewRoundState(
  rounds: RoomReviewRound[],
  items: RoomItem[],
  agents: RoomReviewRoundAgent[],
  itemId: string,
): {
  pendingAgentIds: string[];
  pendingAgentNames: string[];
  phase: RoomReviewRoundPhase;
  roundId: string;
} | null {
  const round = getOpenRoomReviewRound(rounds, itemId);

  if (!round) {
    return null;
  }

  const item = items.find((candidate) => candidate.id === itemId);

  if (!item) {
    return null;
  }

  const pendingIds = getRoundPendingAgentIds(round, item, agents);
  const nameById = new Map(agents.map((agent) => [agent.id, agent.name]));

  return {
    roundId: round.id,
    phase: round.phase,
    pendingAgentIds: pendingIds,
    pendingAgentNames: pendingIds.map((id) => nameById.get(id) ?? id),
  };
}
