import { NextResponse } from "next/server";
import { buildRoomRecap, getRoomSnapshot, getRoomSummary, type RoomCredentials } from "@/lib/canvasRoom";

export const dynamic = "force-dynamic";

type RoomRecapRouteProps = {
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

function toExportFilename(roomName: string) {
  const slug = roomName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `${slug || "roomboard"}-recap.md`;
}

export async function GET(request: Request, { params }: RoomRecapRouteProps) {
  const { roomId } = await params;
  const url = new URL(request.url);
  const room = await getRoomSummary(roomId);

  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const snapshot = await getRoomSnapshot(roomId, getRoomCredentials(request));

  if (!snapshot) {
    return NextResponse.json({ error: "Room is locked." }, { status: 403 });
  }

  const recap = buildRoomRecap(snapshot);
  const wantsMarkdown =
    url.searchParams.get("format") === "markdown" || (request.headers.get("accept") ?? "").includes("text/markdown");

  if (wantsMarkdown) {
    return new Response(recap.markdown, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${toExportFilename(recap.roomName)}"`,
        "Content-Type": "text/markdown; charset=utf-8",
      },
    });
  }

  return NextResponse.json({ recap });
}
