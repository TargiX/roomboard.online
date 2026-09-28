import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RoomCapacityError, RoomConflictError, RoomNotFoundError } from "../lib/canvasRoom.ts";
import { recapRouteErrorContract } from "../lib/recapRouteErrors.ts";

describe("recapRouteErrorContract", () => {
  it("passes a successful response straight through", async () => {
    const ok = new Response("{}", { status: 200 });

    assert.equal(await recapRouteErrorContract(async () => ok), ok);
  });

  it("turns a raced room disappearance into 404 rather than an unhandled 500", async () => {
    const response = await recapRouteErrorContract(async () => {
      throw new RoomNotFoundError("smoke-pending-recap-room-c21745e7");
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Room not found." });
  });

  it("turns an expected room capacity boundary into a stable 409", async () => {
    const response = await recapRouteErrorContract(async () => {
      throw new RoomCapacityError("items", 80);
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: "Room items limit of 80 reached.",
      kind: "items",
      limit: 80,
    });
  });

  it("turns a lost optimistic-concurrency race into a retryable 409", async () => {
    const response = await recapRouteErrorContract(async () => {
      throw new RoomConflictError("smoke-pending-recap-room-c21745e7");
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: "The room changed while saving. Refresh and try again.",
    });
  });

  it("still surfaces genuine faults so they stay visible in runtime logs", async () => {
    await assert.rejects(
      () =>
        recapRouteErrorContract(async () => {
          throw new Error("Supabase unreachable");
        }),
      /Supabase unreachable/,
    );
  });
});
