import type { RoomboardBoardEventInput } from "./roomboardRealtime";

/**
 * Events sent before the room channel finished joining are buffered locally
 * and flushed in order once the join succeeds, so early board edits are not
 * lost. The buffer is bounded: once it is full, further pre-join events are
 * dropped instead of growing without limit on a slow connection.
 */
export const maxPendingRoomEvents = 50;

export type PendingRoomEventQueue = {
  clear: () => void;
  drain: (send: (event: RoomboardBoardEventInput) => void) => void;
  enqueue: (event: RoomboardBoardEventInput) => void;
  size: () => number;
};

export function createPendingRoomEventQueue(
  capacity: number = maxPendingRoomEvents,
): PendingRoomEventQueue {
  const events: RoomboardBoardEventInput[] = [];

  return {
    clear() {
      events.length = 0;
    },
    drain(send) {
      while (events.length > 0) {
        send(events.shift()!);
      }
    },
    enqueue(event) {
      if (events.length < capacity) {
        events.push(event);
      }
    },
    size() {
      return events.length;
    },
  };
}
