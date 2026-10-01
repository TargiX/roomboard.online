import { isRoomCapacityError, isRoomConflictError, isRoomNotFoundError } from "./canvasRoom.ts";

/**
 * The recap export was the one room route left outside the shared error
 * contract: pre-checks authorize the request, then a raced close/delete or a
 * lost optimistic-concurrency save could surface as an unhandled 500 instead
 * of the status the other room routes already return.
 *
 * Mirrors `withRoomNotFoundAs404` so every room route answers raced writes the
 * same way: raced disappearance → 404, expected capacity boundary → 409,
 * lost version race → retryable 409. Anything else still throws so genuine
 * faults stay visible in runtime logs.
 *
 * Returns a plain Response rather than NextResponse so this stays importable
 * from the test runner, which cannot resolve `next/server`.
 */
export async function recapRouteErrorContract(handler: () => Promise<Response>): Promise<Response> {
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
