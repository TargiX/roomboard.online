import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPresenceStream,
  listPresence,
  publishPresence,
  removePresence,
  type PresenceSnapshot,
} from "../lib/presence.ts";
import { PRESENCE_TTL_MS } from "../lib/presenceTtl.ts";

/**
 * Presence state is module-global, so every test publishes into its own room.
 * This keeps tests independent of each other's snapshots and of TTL pruning
 * side effects (listPresence drops stale snapshots as it lists).
 */
let roomCounter = 0;

function freshRoom() {
  roomCounter += 1;
  return `presence-test-room-${roomCounter}`;
}

function snapshot(overrides: Partial<PresenceSnapshot> = {}): PresenceSnapshot {
  return {
    id: "u1",
    name: "Ada",
    color: "#facc5c",
    focus: "canvas",
    x: 0,
    y: 0,
    updatedAt: 0,
    ...overrides,
  };
}

/** Read the next SSE frame from a stream and split it into event/data parts. */
async function readFrame(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<{ event: string; data: unknown } | null> {
  const chunk = await reader.read();

  if (chunk.done) {
    return null;
  }

  const text = new TextDecoder().decode(chunk.value);
  const eventMatch = text.match(/^event: (.+)\ndata: (.+)\n\n$/s);

  if (!eventMatch) {
    throw new Error(`Unexpected SSE frame: ${JSON.stringify(text)}`);
  }

  return { event: eventMatch[1], data: JSON.parse(eventMatch[2]) };
}

/**
 * Tear a presence stream down through its reader.
 *
 * The reader holds the stream lock for the whole test (we need it to assert
 * frames), so the stream itself can no longer be cancelled —
 * `stream.cancel()` on a locked stream throws ERR_INVALID_STATE.
 * `reader.cancel()` still reaches the source's cancel() callback, which drops
 * the subscriber and clears the 5s keep-alive interval; without it the test
 * runner would stay alive waiting on the timer.
 */
async function closeReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  await reader.cancel();
}

/**
 * Pin Date.now() for the duration of a synchronous test body.
 *
 * listPresence() evicts snapshots whose age is >= PRESENCE_TTL_MS, and
 * publishPresence() re-prunes through listPresence() on every publish. In the
 * exact-TTL boundary test the "fresh" snapshot is only 1 ms inside the
 * cutoff, so a single millisecond of clock advance between publish and
 * assert would evict it and flake the suite. Freezing the clock removes that
 * race without mocking the module under test.
 */
function withFrozenClock<T>(frozenNow: number, run: () => T): T {
  const realNow = Date.now;
  Date.now = () => frozenNow;
  try {
    return run();
  } finally {
    Date.now = realNow;
  }
}

/**
 * Run a stream test body with guaranteed reader cleanup.
 *
 * The keep-alive interval armed by createPresenceStream() is only cleared by
 * the stream's cancel() callback. If a read or assertion inside the body
 * throws, the happy-path closeReader() calls are skipped, the referenced
 * interval keeps running, and the node --test process can hang waiting on
 * it. Cancelling every reader in a finally block tears the streams down
 * either way (reader.cancel() is idempotent for already-cancelled readers).
 */
async function withReaders(
  readers: ReadableStreamDefaultReader<Uint8Array>[],
  run: () => Promise<void>,
) {
  try {
    await run();
  } finally {
    await Promise.all(readers.map((reader) => reader.cancel()));
  }
}

describe("listPresence", () => {
  it("lists snapshots newest-first", () => {
    // Timestamps must be real-clock fresh: listPresence prunes entries older
    // than PRESENCE_TTL_MS as a side effect of listing.
    const room = freshRoom();
    const now = Date.now();
    publishPresence(snapshot({ id: "old", updatedAt: now - 1_000 }), room);
    publishPresence(snapshot({ id: "new", updatedAt: now }), room);

    const listed = listPresence(room).map((entry) => entry.id);

    assert.deepEqual(listed, ["new", "old"]);
  });

  it("evicts snapshots older than the presence TTL", () => {
    const room = freshRoom();
    publishPresence(
      snapshot({ id: "stale", updatedAt: Date.now() - 60_000 }),
      room,
    );

    assert.equal(listPresence(room).length, 0);
  });

  it("treats a snapshot exactly TTL old as stale, matching pruneStalePresence", () => {
    // pruneStalePresence keeps strictly-less-than TTL; listPresence must apply
    // the same boundary so a snapshot cannot flicker between the canvas prune
    // timer and the server-side list. The clock stays frozen for the whole
    // test: publishPresence() re-prunes via listPresence(), so even 1 ms of
    // drift would otherwise evict "fresh" before the assertion runs.
    const room = freshRoom();
    const now = Date.now();
    withFrozenClock(now, () => {
      publishPresence(
        snapshot({ id: "edge", updatedAt: now - PRESENCE_TTL_MS }),
        room,
      );
      publishPresence(
        snapshot({ id: "fresh", updatedAt: now - PRESENCE_TTL_MS + 1 }),
        room,
      );

      assert.deepEqual(
        listPresence(room).map((entry) => entry.id),
        ["fresh"],
      );
    });
  });

  it("keeps rooms isolated from each other", () => {
    const roomA = freshRoom();
    const roomB = freshRoom();
    publishPresence(snapshot({ id: "only-b", updatedAt: Date.now() }), roomB);

    assert.equal(listPresence(roomA).length, 0);
    assert.deepEqual(
      listPresence(roomB).map((entry) => entry.id),
      ["only-b"],
    );
  });

  it("replaces a snapshot when the same participant publishes again", () => {
    const room = freshRoom();
    publishPresence(
      snapshot({ id: "u1", name: "Ada", updatedAt: Date.now() }),
      room,
    );
    publishPresence(
      snapshot({ id: "u1", name: "Ada Renamed", updatedAt: Date.now() }),
      room,
    );

    const listed = listPresence(room);

    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, "Ada Renamed");
  });
});

describe("removePresence", () => {
  it("drops the participant and stops listing them", () => {
    const room = freshRoom();
    publishPresence(snapshot({ id: "bye", updatedAt: Date.now() }), room);
    removePresence("bye", room);

    assert.equal(listPresence(room).length, 0);
  });
});

describe("createPresenceStream", () => {
  it("sends the current presence list on subscribe, excluding stale entries", async () => {
    const room = freshRoom();
    publishPresence(
      snapshot({ id: "stale", updatedAt: Date.now() - 60_000 }),
      room,
    );
    publishPresence(snapshot({ id: "seeded", updatedAt: Date.now() }), room);

    const reader = createPresenceStream(room).getReader();
    await withReaders([reader], async () => {
      const frame = await readFrame(reader);

      assert.ok(frame);
      assert.equal(frame.event, "presence");
      assert.deepEqual(
        (frame.data as PresenceSnapshot[]).map((entry) => entry.id),
        ["seeded"],
      );
    });
  });

  it("broadcasts presence updates to every live subscriber", async () => {
    const room = freshRoom();
    const firstReader = createPresenceStream(room).getReader();
    const secondReader = createPresenceStream(room).getReader();

    await withReaders([firstReader, secondReader], async () => {
      // Drain each subscriber's initial frame before publishing.
      await readFrame(firstReader);
      await readFrame(secondReader);

      publishPresence(snapshot({ id: "live", updatedAt: Date.now() }), room);

      const firstFrame = await readFrame(firstReader);
      const secondFrame = await readFrame(secondReader);

      for (const frame of [firstFrame, secondFrame]) {
        assert.ok(frame);
        assert.equal(frame.event, "presence");
        assert.deepEqual(
          (frame.data as PresenceSnapshot[]).map((entry) => entry.id),
          ["live"],
        );
      }
    });
  });

  it("stops delivering broadcasts to a subscriber after cancel", async () => {
    const room = freshRoom();

    const cancelledReader = createPresenceStream(room).getReader();
    const survivorReader = createPresenceStream(room).getReader();

    await withReaders([cancelledReader, survivorReader], async () => {
      await readFrame(cancelledReader); // drain the initial presence frame
      await closeReader(cancelledReader);
      await readFrame(survivorReader); // drain the initial presence frame

      publishPresence(
        snapshot({ id: "after-cancel", updatedAt: Date.now() }),
        room,
      );

      // The cancelled subscriber must not receive the broadcast…
      const drained = await cancelledReader.read();
      assert.equal(drained.done, true);

      // …while the still-live subscriber does.
      const survivorFrame = await readFrame(survivorReader);

      assert.ok(survivorFrame);
      assert.deepEqual(
        (survivorFrame.data as PresenceSnapshot[]).map((entry) => entry.id),
        ["after-cancel"],
      );
    });
  });
});
