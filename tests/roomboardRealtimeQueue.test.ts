import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPendingRoomEventQueue, maxPendingRoomEvents } from "../lib/roomboardRealtimeQueue.ts";
import type { RoomboardBoardEventInput } from "../lib/roomboardRealtime.ts";

/** Build a minimal board event stub for queue tests. */
function boardEvent(itemId: string): RoomboardBoardEventInput {
  return { type: "item:created", item: { id: itemId } } as unknown as RoomboardBoardEventInput;
}

/** Read the item id of a board event stub. */
function eventId(event: RoomboardBoardEventInput): string {
  return (event as { item: { id: string } }).item.id;
}

describe("pending room event queue", () => {
  it("buffers pre-join events and flushes them in FIFO order", () => {
    const queue = createPendingRoomEventQueue();
    const sent: string[] = [];

    queue.enqueue(boardEvent("a"));
    queue.enqueue(boardEvent("b"));
    assert.equal(queue.size(), 2);

    queue.drain((event) => sent.push(eventId(event)));

    assert.deepEqual(sent, ["a", "b"]);
    assert.equal(queue.size(), 0);
  });

  it("drops events beyond the configured capacity", () => {
    const queue = createPendingRoomEventQueue(2);

    queue.enqueue(boardEvent("a"));
    queue.enqueue(boardEvent("b"));
    queue.enqueue(boardEvent("c"));

    const sent: string[] = [];
    queue.drain((event) => sent.push(eventId(event)));

    assert.deepEqual(sent, ["a", "b"]);
    assert.equal(queue.size(), 0);
  });

  it("keeps the default capacity bounded at the documented limit", () => {
    const queue = createPendingRoomEventQueue();

    for (let index = 0; index < maxPendingRoomEvents + 10; index += 1) {
      queue.enqueue(boardEvent(`item-${index}`));
    }

    assert.equal(queue.size(), maxPendingRoomEvents);
  });

  it("draining an empty queue is a no-op", () => {
    const queue = createPendingRoomEventQueue();
    let sends = 0;

    queue.drain(() => {
      sends += 1;
    });

    assert.equal(sends, 0);
    assert.equal(queue.size(), 0);
  });

  it("clear discards buffered events so they are never sent", () => {
    const queue = createPendingRoomEventQueue();

    queue.enqueue(boardEvent("a"));
    queue.enqueue(boardEvent("b"));
    queue.clear();

    let sends = 0;
    queue.drain(() => {
      sends += 1;
    });

    assert.equal(sends, 0);
    assert.equal(queue.size(), 0);
  });

  it("enqueue after drain buffers for the next flush", () => {
    const queue = createPendingRoomEventQueue();

    queue.enqueue(boardEvent("a"));
    queue.drain(() => {});
    queue.enqueue(boardEvent("b"));

    const sent: string[] = [];
    queue.drain((event) => sent.push(eventId(event)));

    assert.deepEqual(sent, ["b"]);
  });
});
