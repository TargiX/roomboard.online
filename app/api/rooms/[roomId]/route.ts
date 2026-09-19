import { NextResponse } from "next/server";
import {
  addRoomComment,
  beginRoomPermanentDeletion,
  canPermanentlyDeleteRoom,
  toggleRoomItemDecisionSignal,
  canAccessRoom,
  canEditRoom,
  closeRoom,
  createRoomConnection,
  createRoomItem,
  createRoomStream,
  deleteRoomPermanently,
  deleteRoomConnection,
  deleteRoomItem,
  duplicateRoomItem,
  getRoomSummary,
  getRoomSnapshot,
  isRoomItemStyleVariant,
  isRoomOwner,
  reverseRoomConnection,
  roomItemStatuses,
  setRoomAccess,
  setRoomInviteExpiry,
  setRoomSnapshotPublic,
  setRoomVisibility,
  updateRoomItem,
  type RoomAccess,
  type RoomConnectionSide,
  type RoomCredentials,
  type RoomItemStatus,
  type RoomItemType,
  type RoomVisibility,
} from "@/lib/canvasRoom";
import { createRoomboardRealtimeAccessToken } from "@/lib/roomboardRealtimeAccess";
import { deleteRoomUploads } from "@/lib/roomboardUploads";
import {
  isServerRealtimeFallbackAllowed,
  serverRealtimeFallbackStreamDisabledInit,
} from "@/lib/serverRealtimeFallback";
import { checkRateLimitDistributed, getRequestClientKey } from "@/lib/requestRateLimit";
import { readJsonBody } from "@/lib/requestJson";
import { withRoomNotFoundAs404 } from "@/lib/roomRouteErrors";

export const dynamic = "force-dynamic";

const ROOM_CONTROL_LIMIT_PER_HOUR = 120;
const ROOM_MUTATION_LIMIT_PER_HOUR = 360;
const ROOM_PATCH_LIMIT_PER_HOUR = 1200;

type RoomRouteProps = {
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

function isRoomItemStatus(value: unknown): value is RoomItemStatus {
  return typeof value === "string" && roomItemStatuses.includes(value as RoomItemStatus);
}

async function checkRoomWriteRateLimit(request: Request, roomId: string, kind: string, limit: number) {
  const rateLimit = await checkRateLimitDistributed(
    `rooms:${kind}:${roomId}:${getRequestClientKey(request)}`,
    limit,
    60 * 60 * 1000,
  );

  if (rateLimit.allowed) {
    return null;
  }

  return NextResponse.json(
    { error: "Too many room updates. Try again later." },
    { headers: { "Retry-After": String(rateLimit.retryAfter) }, status: 429 },
  );
}

export async function GET(request: Request, { params }: RoomRouteProps) {
  const { roomId } = await params;
  const accepts = request.headers.get("accept") ?? "";

  if (accepts.includes("text/event-stream") && !isServerRealtimeFallbackAllowed()) {
    return new Response(null, serverRealtimeFallbackStreamDisabledInit);
  }

  const credentials = getRoomCredentials(request);
  const room = await getRoomSummary(roomId);

  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const snapshot = await getRoomSnapshot(roomId, credentials);

  if (!snapshot || !(await canAccessRoom(roomId, credentials))) {
    return NextResponse.json({ error: "Room is locked." }, { status: 403 });
  }

  if (!accepts.includes("text/event-stream")) {
    return NextResponse.json({
      ...snapshot,
      realtimeToken: createRoomboardRealtimeAccessToken(roomId, snapshot.permissions.role),
    });
  }

  return new Response(createRoomStream(roomId, credentials), {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}

export async function POST(request: Request, props: RoomRouteProps) {
  return withRoomNotFoundAs404(() => handlePost(request, props));
}

async function handlePost(request: Request, { params }: RoomRouteProps) {
  const { roomId } = await params;
  const credentials = getRoomCredentials(request);
  const room = await getRoomSummary(roomId);

  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  if (!(await canEditRoom(roomId, credentials))) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 403 });
  }

  const limited = await checkRoomWriteRateLimit(request, roomId, "mutation", ROOM_MUTATION_LIMIT_PER_HOUR);
  if (limited) return limited;

  const body = await readJsonBody<{
    action?:
      | "comment"
      | "decision-signal"
      | "item"
      | "connection"
      | "reverse-connection"
      | "delete-connection"
      | "delete-item"
      | "duplicate-item";
    itemId?: string;
    type?: RoomItemType;
    title?: string;
    body?: string;
    imageUrl?: string;
    author?: string;
    voterId?: string;
    color?: string;
    status?: RoomItemStatus;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    from?: string;
    fromSide?: RoomConnectionSide;
    to?: string;
    toSide?: RoomConnectionSide;
    connectionId?: string;
    id?: string;
  }>(request);

  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const payload = body.value;

  if (payload.action === "comment") {
    if (!payload.itemId || !payload.body || payload.body.trim().length < 1) {
      return NextResponse.json({ error: "Comment body is required." }, { status: 400 });
    }

    const comment = await addRoomComment(
      {
        itemId: payload.itemId,
        author: payload.author ?? "Visitor",
        body: payload.body,
        color: payload.color ?? "#48a7ff",
      },
      roomId,
    );

    if (!comment) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    return NextResponse.json({ comment });
  }

  if (payload.action === "decision-signal") {
    if (!payload.itemId || !payload.voterId?.trim()) {
      return NextResponse.json({ error: "Item ID and voter identity are required." }, { status: 400 });
    }
    const item = await toggleRoomItemDecisionSignal(
      {
        itemId: payload.itemId,
        voterId: payload.voterId,
        voter: payload.author ?? "Visitor",
        color: payload.color ?? "#48a7ff",
      },
      roomId,
    );
    if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
    return NextResponse.json({ item });
  }

  if (payload.action === "connection") {
    if (!payload.from || !payload.to) {
      return NextResponse.json({ error: "from and to IDs are required." }, { status: 400 });
    }

    const connection = await createRoomConnection(payload.from, payload.to, payload.color, roomId, payload.author, {
      fromSide: payload.fromSide,
      toSide: payload.toSide,
    });
    return NextResponse.json({ connection });
  }

  if (payload.action === "reverse-connection") {
    if (!payload.connectionId) {
      return NextResponse.json({ error: "connectionId is required." }, { status: 400 });
    }

    const connection = await reverseRoomConnection(payload.connectionId, roomId, payload.author);

    if (!connection) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }

    return NextResponse.json({ connection });
  }

  if (payload.action === "delete-connection") {
    if (!payload.connectionId) {
      return NextResponse.json({ error: "connectionId is required." }, { status: 400 });
    }

    const deleted = await deleteRoomConnection(payload.connectionId, roomId, payload.author);
    return NextResponse.json({ ok: deleted });
  }

  if (payload.action === "delete-item") {
    const itemId = payload.id || payload.itemId;
    if (!itemId) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }

    const deleted = await deleteRoomItem(itemId, roomId, payload.author);
    return NextResponse.json({ ok: deleted });
  }

  if (payload.action === "duplicate-item") {
    const itemId = payload.id || payload.itemId;
    if (!itemId) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }

    const item = await duplicateRoomItem(itemId, roomId, payload.author);

    if (!item) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    return NextResponse.json({ item });
  }

  if (!payload.type || !["image", "note"].includes(payload.type)) {
    return NextResponse.json({ error: "Item type is required." }, { status: 400 });
  }

  if (payload.status !== undefined && !isRoomItemStatus(payload.status)) {
    return NextResponse.json({ error: "Valid item status is required." }, { status: 400 });
  }

  const item = await createRoomItem(
    {
      type: payload.type,
      status: payload.status,
      title: payload.title ?? (payload.type === "image" ? "Image" : "Note"),
      body: payload.body,
      imageUrl: payload.imageUrl,
      author: payload.author ?? "Visitor",
      color: payload.color ?? "#48a7ff",
      x: payload.x,
      y: payload.y,
      width: payload.width,
      height: payload.height,
      actor: payload.author,
    },
    roomId,
  );

  return NextResponse.json({ item });
}

export async function PATCH(request: Request, props: RoomRouteProps) {
  return withRoomNotFoundAs404(() => handlePatch(request, props));
}

async function handlePatch(request: Request, { params }: RoomRouteProps) {
  const { roomId } = await params;
  const credentials = getRoomCredentials(request);
  const room = await getRoomSummary(roomId);

  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const body = await readJsonBody<{
    action?: "access" | "invite-expiry" | "snapshot" | "visibility";
    access?: RoomAccess;
    isSnapshotPublic?: unknown;
    visibility?: RoomVisibility;
    inviteExpiresAt?: number | null;
    id?: string;
    title?: string;
    body?: string;
    imageUrl?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    color?: string;
    status?: RoomItemStatus;
    styleVariant?: unknown;
    author?: string;
  }>(request);

  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const payload = body.value;

  if (payload.action === "access") {
    if (!payload.access || !["link", "locked"].includes(payload.access)) {
      return NextResponse.json({ error: "Valid access mode is required." }, { status: 400 });
    }

    if (!(await isRoomOwner(roomId, credentials))) {
      return NextResponse.json({ error: "Only the room creator can change access." }, { status: 403 });
    }

    const limited = await checkRoomWriteRateLimit(request, roomId, "control", ROOM_CONTROL_LIMIT_PER_HOUR);
    if (limited) return limited;

    return NextResponse.json({ room: await setRoomAccess(roomId, payload.access, credentials) });
  }

  if (payload.action === "visibility") {
    if (payload.visibility !== "private") {
      return NextResponse.json({ error: "Rooms stay private by default." }, { status: 400 });
    }

    if (!(await isRoomOwner(roomId, credentials))) {
      return NextResponse.json({ error: "Only the room creator can change visibility." }, { status: 403 });
    }

    const limited = await checkRoomWriteRateLimit(request, roomId, "control", ROOM_CONTROL_LIMIT_PER_HOUR);
    if (limited) return limited;

    return NextResponse.json({
      room: await setRoomVisibility(roomId, payload.visibility as RoomVisibility, credentials),
    });
  }

  if (payload.action === "snapshot") {
    if (typeof payload.isSnapshotPublic !== "boolean") {
      return NextResponse.json(
        { error: "Snapshot publishing must be explicitly enabled or disabled." },
        { status: 400 },
      );
    }

    if (!(await isRoomOwner(roomId, credentials))) {
      return NextResponse.json({ error: "Only the room creator can share a public snapshot." }, { status: 403 });
    }

    const limited = await checkRoomWriteRateLimit(request, roomId, "control", ROOM_CONTROL_LIMIT_PER_HOUR);
    if (limited) return limited;

    return NextResponse.json({ room: await setRoomSnapshotPublic(roomId, payload.isSnapshotPublic, credentials) });
  }

  if (payload.action === "invite-expiry") {
    if (payload.inviteExpiresAt !== null && typeof payload.inviteExpiresAt !== "number") {
      return NextResponse.json({ error: "Invite expiry must be an epoch-ms timestamp or null." }, { status: 400 });
    }

    if (!(await isRoomOwner(roomId, credentials))) {
      return NextResponse.json({ error: "Only the room creator can change invite expiry." }, { status: 403 });
    }

    const limited = await checkRoomWriteRateLimit(request, roomId, "control", ROOM_CONTROL_LIMIT_PER_HOUR);
    if (limited) return limited;

    return NextResponse.json({ room: await setRoomInviteExpiry(roomId, payload.inviteExpiresAt ?? null, credentials) });
  }

  if (!(await canEditRoom(roomId, credentials))) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 403 });
  }

  if (!payload.id) {
    return NextResponse.json({ error: "Item id is required." }, { status: 400 });
  }

  if (payload.status !== undefined && !isRoomItemStatus(payload.status)) {
    return NextResponse.json({ error: "Valid item status is required." }, { status: 400 });
  }

  if (payload.styleVariant !== undefined && !isRoomItemStyleVariant(payload.styleVariant)) {
    return NextResponse.json({ error: "Valid item style is required." }, { status: 400 });
  }

  const limited = await checkRoomWriteRateLimit(request, roomId, "patch", ROOM_PATCH_LIMIT_PER_HOUR);
  if (limited) return limited;

  const item = await updateRoomItem(
    {
      id: payload.id,
      status: payload.status,
      title: payload.title,
      body: payload.body,
      imageUrl: payload.imageUrl,
      x: payload.x,
      y: payload.y,
      width: payload.width,
      height: payload.height,
      color: payload.color,
      styleVariant: payload.styleVariant,
      actor: payload.author,
    },
    roomId,
  );

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function DELETE(request: Request, props: RoomRouteProps) {
  return withRoomNotFoundAs404(() => handleDelete(request, props));
}

async function handleDelete(request: Request, { params }: RoomRouteProps) {
  const { roomId } = await params;
  const credentials = getRoomCredentials(request);
  const permanent = new URL(request.url).searchParams.get("permanent") === "true";

  if (permanent) {
    if (!(await canPermanentlyDeleteRoom(roomId, credentials))) {
      return NextResponse.json({ error: "Only the room creator can permanently delete it." }, { status: 403 });
    }

    const limited = await checkRoomWriteRateLimit(request, roomId, "control", ROOM_CONTROL_LIMIT_PER_HOUR);
    if (limited) return limited;

    const deletionStarted = await beginRoomPermanentDeletion(roomId, credentials);
    if (!deletionStarted) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    const uploads = await deleteRoomUploads(roomId);
    const deleted = await deleteRoomPermanently(roomId, credentials);

    if (!deleted) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, uploadsDeleted: uploads.deleted });
  }

  if (!(await getRoomSummary(roomId))) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  if (!(await isRoomOwner(roomId, credentials))) {
    return NextResponse.json({ error: "Only the room creator can close it." }, { status: 403 });
  }

  const limited = await checkRoomWriteRateLimit(request, roomId, "control", ROOM_CONTROL_LIMIT_PER_HOUR);
  if (limited) return limited;

  const room = await closeRoom(roomId, credentials);

  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  return NextResponse.json({ room });
}
