import { createHmac } from "node:crypto";
import { setTimeout as delayMs } from "node:timers/promises";

/**
 * Server-originated fanout for agent activity. In hosted mode the Phoenix
 * sidecar is the only long-lived process (Vercel functions must not hold
 * streams open), so Next hands the event to an HMAC-signed internal endpoint
 * on the sidecar, which broadcasts it into the room topic. Locally without
 * the sidecar this is a no-op: `mutateRoom` already republishes snapshots to
 * the SSE fallback clients.
 */

export const roomAgentBroadcastEventTypes = [
  "room:message",
  "comment:created",
  "item:created",
  "item:updated",
] as const;

export type RoomAgentBroadcastEvent = {
  type: (typeof roomAgentBroadcastEventTypes)[number];
  [key: string]: unknown;
};

const internalBroadcastPath = "/internal/room-event";
const broadcastTimeoutMs = 3_000;
const broadcastRetryDelayMs = 500;

export function getRoomAgentBroadcastBaseUrl(): string {
  const raw = process.env.ROOMBOARD_REALTIME_INTERNAL_URL ?? process.env.NEXT_PUBLIC_ROOMBOARD_REALTIME_URL ?? "";
  return raw.trim().replace(/\/+$/, "");
}

/** base64url (no padding) HMAC-SHA256 over the exact request bytes; the
 *  sidecar verifies with `Plug.Crypto.secure_compare` over the same encoding. */
export function signRoomAgentBroadcastBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function buildRoomAgentBroadcastPayload(roomId: string, event: RoomAgentBroadcastEvent) {
  return { roomId, event: { ...event, roomId, sentAt: Date.now() } };
}

export async function broadcastRoomAgentEvent(roomId: string, event: RoomAgentBroadcastEvent): Promise<boolean> {
  const base = getRoomAgentBroadcastBaseUrl();
  const secret = process.env.ROOMBOARD_REALTIME_SECRET?.trim() ?? "";

  if (!base || !secret) {
    return false;
  }

  const body = JSON.stringify(buildRoomAgentBroadcastPayload(roomId, event));

  // One retry: a sidecar restart (Render redeploy) or a transient network blip
  // would otherwise silently drop the live event, and production has no SSE
  // fallback to catch it — the message would only surface on the next snapshot
  // refresh. Observed once during the Render rollout window on 2026-09-26.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) {
      await delayMs(broadcastRetryDelayMs);
    }

    try {
      const response = await fetch(`${base}${internalBroadcastPath}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-roomboard-internal-signature": signRoomAgentBroadcastBody(body, secret),
        },
        body,
        signal: AbortSignal.timeout(broadcastTimeoutMs),
      });

      if (response.ok) {
        return true;
      }
    } catch {
      // Fall through to the retry; a missing or unhealthy sidecar must never
      // fail the agent call that triggered the broadcast.
    }
  }

  return false;
}
