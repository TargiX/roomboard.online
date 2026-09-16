import { DEFAULT_ROOM_ID } from "./canvasRoom.ts";
import { PRESENCE_TTL_MS } from "./presenceTtl.ts";

export type PresenceSnapshot = {
  id: string;
  name: string;
  color: string;
  focus: string;
  x: number;
  y: number;
  updatedAt: number;
};

type PresenceClient = {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

const encoder = new TextEncoder();
const clientsByRoom = new Map<string, Set<PresenceClient>>();
const snapshotsByRoom = new Map<string, Map<string, PresenceSnapshot>>();

function encode(event: string, payload: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function getClients(roomId: string) {
  if (!clientsByRoom.has(roomId)) {
    clientsByRoom.set(roomId, new Set());
  }

  return clientsByRoom.get(roomId)!;
}

function getSnapshots(roomId: string) {
  if (!snapshotsByRoom.has(roomId)) {
    snapshotsByRoom.set(roomId, new Map());
  }

  return snapshotsByRoom.get(roomId)!;
}

export function listPresence(roomId = DEFAULT_ROOM_ID) {
  const now = Date.now();
  const snapshots = getSnapshots(roomId);

  for (const [id, snapshot] of snapshots) {
    if (now - snapshot.updatedAt >= PRESENCE_TTL_MS) {
      snapshots.delete(id);
    }
  }

  return Array.from(snapshots.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function publishPresence(snapshot: PresenceSnapshot, roomId = DEFAULT_ROOM_ID) {
  const snapshots = getSnapshots(roomId);
  const clients = getClients(roomId);
  snapshots.set(snapshot.id, snapshot);
  const message = encode("presence", listPresence(roomId));

  for (const client of clients) {
    try {
      client.controller.enqueue(message);
    } catch {
      clients.delete(client);
    }
  }
}

export function removePresence(id: string, roomId = DEFAULT_ROOM_ID) {
  const snapshots = getSnapshots(roomId);
  const clients = getClients(roomId);
  snapshots.delete(id);
  const message = encode("presence", listPresence(roomId));

  for (const client of clients) {
    try {
      client.controller.enqueue(message);
    } catch {
      clients.delete(client);
    }
  }
}

export function createPresenceStream(roomId = DEFAULT_ROOM_ID) {
  const clients = getClients(roomId);
  const id = crypto.randomUUID();
  let interval: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const client = { id, controller };
      clients.add(client);
      controller.enqueue(encode("presence", listPresence(roomId)));
      interval = setInterval(() => {
        controller.enqueue(encode("ping", { now: Date.now() }));
      }, 5000);
    },
    cancel() {
      clearInterval(interval);

      for (const client of clients) {
        if (client.id === id) {
          clients.delete(client);
        }
      }
    },
  });

  return stream;
}
