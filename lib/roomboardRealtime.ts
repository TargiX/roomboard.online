import { Socket } from "phoenix";
import type { RoomComment, RoomConnection, RoomItem, RoomSummary } from "@/lib/canvasRoom";
import type { PresenceSnapshot } from "@/lib/presence";
import {
  normalizeEndpoint,
  presenceStateToSnapshots,
  type PresenceState,
} from "./realtimeHelpers";
import { createPendingRoomEventQueue } from "./roomboardRealtimeQueue";

const roomboardRealtimeJoinTimeoutMs = 45_000;

type RealtimeUser = {
  id: string;
  name: string;
  color: string;
};

export type RoomboardRealtimeStatus = "connecting" | "connected" | "degraded" | "closed";

export type RoomboardBoardEvent =
  | {
      type: "item:created" | "item:updated" | "item:moved";
      item: RoomItem;
    }
  | {
      type: "item:deleted";
      itemId: string;
    }
  | {
      type: "comment:created";
      comment: RoomComment;
      itemId: string;
    }
  | {
      type: "connection:created";
      connection: RoomConnection;
    }
  | {
      type: "connection:deleted";
      connectionId: string;
    }
  | {
      type: "room:updated";
      room: RoomSummary;
    }
  | {
      type: "room:closed";
      room?: RoomSummary;
    };

export type RoomboardBoardEventInput = RoomboardBoardEvent & {
  clientId?: string;
};

type RoomboardBoardEventPayload = RoomboardBoardEventInput & {
  roomId: string;
  senderId?: string;
  sentAt: number;
};

type RoomboardRealtimeOptions = {
  accessToken?: string | null;
  endpoint: string;
  onBoardEvent: (event: RoomboardBoardEventPayload) => void;
  onPresenceState: (presence: PresenceSnapshot[]) => void;
  onPresenceUpdate: (presence: PresenceSnapshot) => void;
  onStatusChange?: (status: RoomboardRealtimeStatus) => void;
  roomId: string;
  user: RealtimeUser;
};

export type RoomboardRealtimeSession = {
  disconnect: () => void;
  sendRoomEvent: (event: RoomboardBoardEventInput) => void;
  updatePresence: (presence: Pick<PresenceSnapshot, "focus" | "x" | "y">) => void;
};

/**
 * Create a realtime session for one room: it joins the room channel, tracks
 * cursor presence, buffers pre-join board events, and exposes the status and
 * send/close lifecycle used by the room UI.
 */
export function createRoomboardRealtimeSession({
  accessToken,
  endpoint,
  onBoardEvent,
  onPresenceState,
  onPresenceUpdate,
  onStatusChange,
  roomId,
  user,
}: RoomboardRealtimeOptions): RoomboardRealtimeSession {
  const sessionId = crypto.randomUUID();
  const socket = new Socket(normalizeEndpoint(endpoint), {
    params: {
      color: user.color,
      id: user.id,
      name: user.name,
    },
    timeout: roomboardRealtimeJoinTimeoutMs,
  });
  const channel = socket.channel(`room:${roomId}`, {
    accessToken,
    focus: "canvas",
    x: 0,
    y: 0,
  });
  const pendingRoomEvents = createPendingRoomEventQueue();
  let status: RoomboardRealtimeStatus = "connecting";
  let manuallyClosed = false;
  let joined = false;

  const setStatus = (nextStatus: RoomboardRealtimeStatus) => {
    if (status === nextStatus) {
      return;
    }

    status = nextStatus;
    onStatusChange?.(nextStatus);
  };

  const degrade = () => {
    if (status === "closed") {
      return;
    }

    joined = false;
    pendingRoomEvents.clear();
    setStatus("degraded");
  };

  socket.onError(() => {
    if (!manuallyClosed) {
      degrade();
    }
  });
  socket.onClose(() => {
    if (!manuallyClosed) {
      degrade();
    }
  });
  channel.onError(() => {
    if (!manuallyClosed) {
      degrade();
    }
  });
  channel.onClose(() => {
    if (!manuallyClosed) {
      degrade();
    }
  });

  channel.on("presence_state", (payload: PresenceState) => {
    onPresenceState(presenceStateToSnapshots(payload));
  });
  channel.on("presence:update", (payload: PresenceSnapshot) => {
    onPresenceUpdate(payload);
  });
  channel.on("room:event", (payload: RoomboardBoardEventPayload) => {
    if (payload.clientId === sessionId) return;
    onBoardEvent(payload);
  });

  socket.connect();
  onStatusChange?.(status);

  channel
    .join(roomboardRealtimeJoinTimeoutMs)
    .receive("ok", () => {
      if (status === "degraded" || status === "closed") {
        return;
      }

      joined = true;
      setStatus("connected");
      pendingRoomEvents.drain((event) => channel.push("room:event", event));
    })
    .receive("error", (response: unknown) => {
      console.warn("Phoenix room channel rejected join", response);
      degrade();
    })
    .receive("timeout", () => {
      console.warn("Phoenix room channel join timed out");
      degrade();
    });

  return {
    disconnect() {
      manuallyClosed = true;
      joined = false;
      pendingRoomEvents.clear();
      setStatus("closed");
      channel.leave();
      socket.disconnect();
    },
    sendRoomEvent(event) {
      const stamped = { ...event, clientId: sessionId };
      if (joined && channel.state === "joined") {
        channel.push("room:event", stamped);
      } else if (status === "connecting") {
        pendingRoomEvents.enqueue(stamped);
      }
    },
    updatePresence(presence) {
      if (status === "connected" && channel.state === "joined") {
        channel.push("presence:update", presence);
      }
    },
  };
}
