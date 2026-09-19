import { isRoomCapacityError, isRoomConflictError, isRoomNotFoundError } from "./canvasRoom.ts";

/**
 * Room routes authorize against a snapshot and then mutate, so a room can be
 * closed or deleted in between — from another tab, or by the owner mid-request.
 * That raced the mutation into an unhandled throw and a 500; the honest answer
 * is the same 404 the pre-check would have produced a moment earlier.
 *
 * Expected room-capacity failures are also translated into a stable 409 so a
 * busy collaborative room cannot turn a bounded product rule into a 500.
 * Anything else still surfaces as a 500 so genuine faults stay visible in
 * runtime logs.
 *
 * Returns a plain Response rather than NextResponse so this stays importable
 * from the test runner, which cannot resolve `next/server`.
 */
export async function withRoomNotFoundAs404(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (isRoomNotFoundError(error)) {
      return Response.json({ error: "Room not found." }, { status: 404 });
    }

    if (isRoomCapacityError(error)) {
      return Response.json({ error: error.message, kind: error.kind, limit: error.limit }, { status: 409 });
    }

    if (isRoomConflictError(error)) {
      return Response.json({ error: "The room changed while saving. Refresh and try again." }, { status: 409 });
    }

    throw error;
  }
}
