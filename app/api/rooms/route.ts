import { NextResponse } from "next/server";
import {
  createRoom,
  listRooms,
  roomStarterTemplates,
  type RoomAccess,
  type RoomStarterTemplate,
  type RoomVisibility,
} from "@/lib/canvasRoom";
import { checkRateLimitDistributed, getRequestClientKey } from "@/lib/requestRateLimit";
import { readJsonBody } from "@/lib/requestJson";

export const dynamic = "force-dynamic";

const ROOM_CREATE_LIMIT_PER_HOUR = 60;

export async function GET(request: Request) {
  let inviteTokens: Record<string, string> | undefined;
  let ownerTokens: Record<string, string> | undefined;

  try {
    const header = request.headers.get("X-Owned-Rooms");
    if (header) ownerTokens = JSON.parse(header);
  } catch {}

  try {
    const header = request.headers.get("X-Invite-Rooms");
    if (header) inviteTokens = JSON.parse(header);
  } catch {}

  return NextResponse.json({ rooms: await listRooms({ inviteTokens, ownerTokens }) });
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimitDistributed(
    `rooms:create:${getRequestClientKey(request)}`,
    ROOM_CREATE_LIMIT_PER_HOUR,
    60 * 60 * 1000,
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many rooms created. Try again later." },
      { headers: { "Retry-After": String(rateLimit.retryAfter) }, status: 429 },
    );
  }

  const body = await readJsonBody<{
    name?: string;
    access?: RoomAccess;
    visibility?: RoomVisibility;
    seeded?: boolean;
    starterTemplate?: RoomStarterTemplate;
  }>(request);

  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const payload = body.value;

  const visibility: RoomVisibility = "private";
  const access: RoomAccess = "locked";
  const starterTemplate = roomStarterTemplates.includes(payload.starterTemplate as RoomStarterTemplate)
    ? payload.starterTemplate
    : payload.seeded === true
      ? "landing-review"
      : false;
  const created = await createRoom(payload.name ?? "Untitled room", visibility, starterTemplate, access);

  return NextResponse.json(created);
}
