import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { register } from "node:module";
import type {
  RoomboardBoardEventInput,
  RoomboardRealtimeStatus,
} from "../lib/roomboardRealtime.ts";

// Register resolve hooks before importing the module under test so that
// "phoenix" resolves to the deterministic mock.
register("./realtimeResolveHooks.mjs", import.meta.url);

const { createRoomboardRealtimeSession } = await import("../lib/roomboardRealtime.ts");
const { createdSockets } = await import("./mocks/phoenixMock.ts");

function boardEvent(itemId: string): RoomboardBoardEventInput {
  return { type: "item:created", item: { id: itemId } } as unknown as RoomboardBoardEventInput;
}

type PushCall = { event: string; payload: Record<string, unknown> };

function pushId(push: PushCall): string {
  return (push.payload.item as { id: string }).id;
}

function roomEventPushes(channel: { pushes: PushCall[] }): PushCall[] {
  return channel.pushes.filter((push) => push.event === "room:event");
}

function createSession() {
  const statuses: RoomboardRealtimeStatus[] = [];
  const socketCountBefore = createdSockets.length;

  const session = createRoomboardRealtimeSession({
    endpoint: "https://realtime.example.com",
    onBoardEvent: () => {},
    onPresenceState: () => {},
    onPresenceUpdate: () => {},
    onStatusChange: (status) => {
      statuses.push(status);
    },
    roomId: "room-1",
    user: { id: "user-1", name: "Tester", color: "#00ff00" },
  });

  const socket = createdSockets[createdSockets.length - 1];
  assert.ok(socket, "session must create a phoenix socket");
  assert.equal(createdSockets.length, socketCountBefore + 1);

  const channel = socket.channels[0];
  assert.ok(channel, "session must create a room channel");

  return { session, socket, channel, statuses };
}

describe("roomboard realtime session", () => {
  it("buffers sends while connecting and delivers them exactly once in FIFO order after join", () => {
    const { session, channel, statuses } = createSession();

    assert.equal(channel.state, "joining");
    session.sendRoomEvent(boardEvent("a"));
    session.sendRoomEvent(boardEvent("b"));

    // Connecting path: events are buffered, never pushed to the channel.
    assert.deepEqual(roomEventPushes(channel), []);

    channel.simulateJoinOk();

    const delivered = roomEventPushes(channel);
    assert.deepEqual(delivered.map(pushId), ["a", "b"]);
    assert.equal(delivered.length, 2);
    const senderIds = new Set(delivered.map((push) => push.payload.clientId));
    assert.equal(senderIds.size, 1);

    // After join, new events go straight to the channel without re-sending buffered ones.
    session.sendRoomEvent(boardEvent("c"));
    assert.deepEqual(roomEventPushes(channel).map(pushId), ["a", "b", "c"]);

    assert.deepEqual(statuses, ["connecting", "connected"]);

    session.disconnect();
  });

  it("clears buffered events when the socket degrades before join completes", () => {
    const { session, socket, channel, statuses } = createSession();

    session.sendRoomEvent(boardEvent("a"));
    session.sendRoomEvent(boardEvent("b"));

    socket.triggerError();
    assert.ok(statuses.includes("degraded"));

    // Sends while degraded are dropped, not buffered and not pushed.
    session.sendRoomEvent(boardEvent("dropped"));
    assert.deepEqual(roomEventPushes(channel), []);

    // A late join ack must not resurrect degraded-era buffered events.
    channel.simulateJoinOk();
    assert.deepEqual(roomEventPushes(channel), []);

    session.disconnect();
  });

  it("clears buffered events and closes the channel on disconnect teardown", () => {
    const { session, socket, channel, statuses } = createSession();

    session.sendRoomEvent(boardEvent("a"));

    session.disconnect();

    assert.equal(socket.disconnectCalls, 1);
    assert.equal(channel.leaveCalls, 1);
    assert.deepEqual(statuses, ["connecting", "closed"]);

    // A late join ack after teardown must not deliver the buffered event.
    channel.simulateJoinOk();
    assert.deepEqual(roomEventPushes(channel), []);

    // Sends after disconnect are dropped.
    session.sendRoomEvent(boardEvent("late"));
    assert.deepEqual(roomEventPushes(channel), []);
  });

  it("degrades the session when the channel rejects the join", () => {
    const { session, channel, statuses } = createSession();

    session.sendRoomEvent(boardEvent("a"));
    channel.simulateJoinError();

    assert.ok(statuses.includes("degraded"));
    assert.deepEqual(roomEventPushes(channel), []);

    session.disconnect();
  });
});
