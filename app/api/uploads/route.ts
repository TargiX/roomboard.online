import { NextResponse } from "next/server";
import { canEditRoom } from "@/lib/canvasRoom";
import { checkRateLimitDistributed, getRequestClientKey } from "@/lib/requestRateLimit";
import { uploadRoomImage } from "@/lib/roomboardUploads";

export const dynamic = "force-dynamic";

const IMAGE_UPLOAD_LIMIT_PER_HOUR = 120;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const roomId = formData.get("roomId");
  const inviteToken = formData.get("inviteToken");
  const ownerToken = formData.get("ownerToken");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required." }, { status: 400 });
  }

  if (typeof roomId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,96}$/.test(roomId)) {
    return NextResponse.json({ error: "Valid room id is required." }, { status: 400 });
  }

  if (
    !(await canEditRoom(roomId, {
      inviteToken: typeof inviteToken === "string" ? inviteToken : null,
      ownerToken: typeof ownerToken === "string" ? ownerToken : null,
    }))
  ) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 403 });
  }

  const rateLimit = await checkRateLimitDistributed(
    `uploads:${getRequestClientKey(request)}`,
    IMAGE_UPLOAD_LIMIT_PER_HOUR,
    60 * 60 * 1000,
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Try again later." },
      { headers: { "Retry-After": String(rateLimit.retryAfter) }, status: 429 },
    );
  }

  try {
    const uploaded = await uploadRoomImage(file, roomId);
    return NextResponse.json(uploaded);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image upload failed." },
      { status: 400 },
    );
  }
}
