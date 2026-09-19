import { NextResponse } from "next/server";
import { canAccessRoom, type RoomCredentials } from "@/lib/canvasRoom";
import { createPresenceStream, publishPresence, removePresence, type PresenceSnapshot } from "@/lib/presence";
import { readJsonBody } from "@/lib/requestJson";
import { checkRateLimitDistributed, getRequestClientKey } from "@/lib/requestRateLimit";
import {
  isServerRealtimeFallbackAllowed,
  serverRealtimeFallbackDisabledBody,
  serverRealtimeFallbackDisabledInit,
  serverRealtimeFallbackStreamDisabledInit,
} from "@/lib/serverRealtimeFallback";

export const dynamic = "force-dynamic";

const PRESENCE_FALLBACK_LIMIT_PER_HOUR = 24_000;

type PresenceRouteProps = {
  params: Promise<{
    roomId: string;
  }>;
};

function getRoomCredentials(request: Request): RoomCredentials {
  const url = new URL(request.url);
  return {
    inviteToken:
      request.headers.get("x-room-invite-token") ??
      url.searchParams.get("inviteToken") ??
      url.searchParams.get("invite"),
    ownerToken: request.headers.get("x-room-owner-token") ?? url.searchParams.get("ownerToken"),
  };
}

export async function GET(request: Request, { params }: PresenceRouteProps) {
  const { roomId } = await params;

  if (!(await canAccessRoom(roomId, getRoomCredentials(request)))) {
    return NextResponse.json({ error: "Room is locked." }, { status: 403 });
  }

  if (!isServerRealtimeFallbackAllowed()) {
    return new Response(null, serverRealtimeFallbackStreamDisabledInit);
  }

  return new Response(createPresenceStream(roomId), {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}

export async function POST(request: Request, { params }: PresenceRouteProps) {
  const { roomId } = await params;

  if (!(await canAccessRoom(roomId, getRoomCredentials(request)))) {
    return NextResponse.json({ error: "Room is locked." }, { status: 403 });
  }

  if (!isServerRealtimeFallbackAllowed()) {
    return NextResponse.json(serverRealtimeFallbackDisabledBody, serverRealtimeFallbackDisabledInit);
  }

  const body = await readJsonBody<PresenceSnapshot>(request);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const payload = body.value;

  if (!payload.id || !payload.name || !payload.color || !payload.focus) {
    return NextResponse.json({ error: "Invalid presence payload" }, { status: 400 });
  }

  const rateLimit = await checkRateLimitDistributed(
    `presence:${roomId}:${getRequestClientKey(request)}`,
    PRESENCE_FALLBACK_LIMIT_PER_HOUR,
    60 * 60 * 1000,
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many presence updates. Try again later." },
      { headers: { "Retry-After": String(rateLimit.retryAfter) }, status: 429 },
    );
  }

  publishPresence(
    {
      id: payload.id,
      name: payload.name.slice(0, 24),
      color: payload.color,
      focus: payload.focus,
      x: Number.isFinite(payload.x) ? payload.x : 0,
      y: Number.isFinite(payload.y) ? payload.y : 0,
      updatedAt: Date.now(),
    },
    roomId,
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: PresenceRouteProps) {
  const { roomId } = await params;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!(await canAccessRoom(roomId, getRoomCredentials(request)))) {
    return NextResponse.json({ error: "Room is locked." }, { status: 403 });
  }

  if (!isServerRealtimeFallbackAllowed()) {
    return NextResponse.json(serverRealtimeFallbackDisabledBody, serverRealtimeFallbackDisabledInit);
  }

  if (id) {
    removePresence(id, roomId);
  }

  return NextResponse.json({ ok: true });
}
