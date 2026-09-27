import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Agent-rooms primitives: identity tokens for bring-your-own agents, the room
 * transcript message shape, turn-budget accounting, and the deterministic
 * layer-1 text sanitizer. Everything here is pure so it can be unit-tested
 * without a room store; persistence lives in `lib/canvasRoom.ts` and the MCP
 * surface in `app/api/mcp/route.ts`.
 */

export type RoomMessageAuthorKind = "human" | "agent";

export type RoomMessage = {
  id: string;
  /** `agent:<agentId>` for agents, the local user id for humans. */
  authorId: string;
  authorName: string;
  authorKind: RoomMessageAuthorKind;
  body: string;
  /** Agent ids this message addresses; used for wake semantics in the UI. */
  mentions?: string[];
  createdAt: number;
};

export type RoomAgent = {
  id: string;
  name: string;
  color: string;
  /** sha256 hex of the full agent token; the token itself is shown once. */
  tokenHash: string;
  createdAt: number;
  /** Soft presence: last authenticated MCP call, throttled. */
  lastSeenAt?: number;
};

/** Roster projection safe for snapshots — never includes the token hash. */
export type RoomAgentPublic = Omit<RoomAgent, "tokenHash">;

/** Arbiter/owner flags on transcript messages; enforced by owner policy. */
export type RoomMessageFlag = {
  id: string;
  messageId: string;
  flaggerId: string;
  reason: string;
  createdAt: number;
};

export const roomAgentTokenPrefix = "rba1";
export const MAX_ROOM_MESSAGE_BODY = 1200;
export const MAX_ROOM_MESSAGE_MENTIONS = 8;
export const AGENT_TURN_BUDGET = 10;
export const MAX_ROOM_TRANSCRIPT = 240;
export const roomAgentPalette = [
  "#7c8cff",
  "#4ec9a8",
  "#f2a65e",
  "#d98cff",
  "#5cc8f2",
  "#e879a6",
  "#b8c46b",
  "#f27272",
] as const;

const ROOM_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,96}$/;
// Secrets are hex so the last underscore in a token is always the separator,
// even when the room id itself contains underscores.
const AGENT_TOKEN_SECRET_PATTERN = /^[0-9a-f]{32,128}$/;
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function normalizeRoomAgentColor(color: unknown, fallback: string): string {
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim().toLowerCase() : fallback;
}

export function getRoomAgentColor(index: number): string {
  return roomAgentPalette[Math.max(0, index) % roomAgentPalette.length];
}

export function toPublicRoomAgent(agent: RoomAgent): RoomAgentPublic {
  return {
    id: agent.id,
    name: agent.name,
    color: agent.color,
    createdAt: agent.createdAt,
    ...(agent.lastSeenAt ? { lastSeenAt: agent.lastSeenAt } : {}),
  };
}

export function createRoomAgentSecret(): string {
  return randomBytes(24).toString("hex");
}

export function createRoomAgentToken(roomId: string, secret: string = createRoomAgentSecret()): string {
  return `${roomAgentTokenPrefix}_${roomId}_${secret}`;
}

export function parseRoomAgentToken(token: string): { roomId: string; secret: string } | null {
  const prefix = `${roomAgentTokenPrefix}_`;

  if (!token.startsWith(prefix)) {
    return null;
  }

  const rest = token.slice(prefix.length);
  const separatorIndex = rest.lastIndexOf("_");

  if (separatorIndex <= 0) {
    return null;
  }

  const roomId = rest.slice(0, separatorIndex);
  const secret = rest.slice(separatorIndex + 1);

  if (!ROOM_ID_PATTERN.test(roomId) || !AGENT_TOKEN_SECRET_PATTERN.test(secret)) {
    return null;
  }

  return { roomId, secret };
}

export function hashRoomAgentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function roomAgentTokenHashesMatch(candidateHash: string, storedHash: string): boolean {
  if (!TOKEN_HASH_PATTERN.test(candidateHash) || !TOKEN_HASH_PATTERN.test(storedHash)) {
    return false;
  }

  const candidate = Buffer.from(candidateHash, "utf8");
  const stored = Buffer.from(storedHash, "utf8");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

export function normalizeRoomMessageBody(body: unknown): string {
  return typeof body === "string" ? body.trim().slice(0, MAX_ROOM_MESSAGE_BODY) : "";
}

export function normalizeRoomMessageMentions(mentions: unknown, knownAgentIds?: Set<string>): string[] {
  if (!Array.isArray(mentions)) {
    return [];
  }

  const seen = new Set<string>();

  for (const mention of mentions) {
    if (typeof mention !== "string") {
      continue;
    }

    const id = mention.trim().slice(0, 96);

    if (!id || seen.has(id)) {
      continue;
    }

    if (knownAgentIds && !knownAgentIds.has(id)) {
      continue;
    }

    seen.add(id);
  }

  return Array.from(seen).slice(0, MAX_ROOM_MESSAGE_MENTIONS);
}

export function normalizeRoomMessage(value: unknown): RoomMessage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<RoomMessage> & Record<string, unknown>;

  if (typeof candidate.id !== "string" || !candidate.id) {
    return null;
  }

  const authorKind: RoomMessageAuthorKind = candidate.authorKind === "agent" ? "agent" : "human";
  const body = normalizeRoomMessageBody(candidate.body);

  if (!body) {
    return null;
  }

  return {
    id: candidate.id,
    authorId: typeof candidate.authorId === "string" ? candidate.authorId.slice(0, 96) : "unknown",
    authorName:
      typeof candidate.authorName === "string" && candidate.authorName.trim()
        ? candidate.authorName.trim().slice(0, 24)
        : authorKind === "agent"
          ? "Agent"
          : "Editor",
    authorKind,
    body,
    ...(Array.isArray(candidate.mentions) ? { mentions: normalizeRoomMessageMentions(candidate.mentions) } : {}),
    createdAt:
      typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt) ? candidate.createdAt : 0,
  };
}

export function normalizeRoomAgent(value: unknown): RoomAgent | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<RoomAgent> & Record<string, unknown>;

  if (typeof candidate.id !== "string" || !candidate.id) {
    return null;
  }

  if (typeof candidate.tokenHash !== "string" || !TOKEN_HASH_PATTERN.test(candidate.tokenHash)) {
    return null;
  }

  return {
    id: candidate.id.slice(0, 96),
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim().slice(0, 24) : "Agent",
    color: normalizeRoomAgentColor(candidate.color, getRoomAgentColor(0)),
    tokenHash: candidate.tokenHash,
    createdAt:
      typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt) ? candidate.createdAt : 0,
    ...(typeof candidate.lastSeenAt === "number" && Number.isFinite(candidate.lastSeenAt)
      ? { lastSeenAt: candidate.lastSeenAt }
      : {}),
  };
}

export function normalizeRoomMessageFlag(value: unknown): RoomMessageFlag | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<RoomMessageFlag> & Record<string, unknown>;

  if (typeof candidate.id !== "string" || !candidate.id || typeof candidate.messageId !== "string") {
    return null;
  }

  return {
    id: candidate.id.slice(0, 96),
    messageId: candidate.messageId.slice(0, 96),
    flaggerId: typeof candidate.flaggerId === "string" ? candidate.flaggerId.slice(0, 96) : "unknown",
    reason: typeof candidate.reason === "string" ? candidate.reason.trim().slice(0, 320) : "",
    createdAt:
      typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt) ? candidate.createdAt : 0,
  };
}

/** Consecutive agent messages at the tail of the transcript. */
export function countTrailingAgentMessages(messages: RoomMessage[]): number {
  let count = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].authorKind !== "agent") {
      break;
    }

    count += 1;
  }

  return count;
}

export function getAgentTurnBudgetState(messages: RoomMessage[]): { exhausted: boolean; remaining: number } {
  const used = countTrailingAgentMessages(messages);
  return { exhausted: used >= AGENT_TURN_BUDGET, remaining: Math.max(0, AGENT_TURN_BUDGET - used) };
}

/**
 * Union two transcript lists by id, chronological, trimmed to the cap.
 * Snapshot refreshes and live events race; merging instead of replacing
 * keeps a message that arrived live from being rolled back by an older
 * snapshot fetch.
 */
export function mergeRoomMessages(
  current: RoomMessage[],
  incoming: RoomMessage[],
  cap = MAX_ROOM_TRANSCRIPT,
): RoomMessage[] {
  if (incoming.length === 0) {
    return current;
  }

  const byId = new Map<string, RoomMessage>();

  for (const message of current) {
    byId.set(message.id, message);
  }

  for (const message of incoming) {
    if (!byId.has(message.id)) {
      byId.set(message.id, message);
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-cap);
}
