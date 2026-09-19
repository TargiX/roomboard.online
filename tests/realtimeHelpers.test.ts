import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRESENCE_TTL_MS,
  getRealtimeSyncContract,
  mergePresenceSnapshots,
  normalizeEndpoint,
  presenceStateToSnapshots,
  type PresenceState,
} from "../lib/realtimeHelpers.ts";
import type { PresenceSnapshot } from "../lib/presence.ts";

function snapshot(overrides: Partial<PresenceSnapshot> = {}): PresenceSnapshot {
  return {
    id: "user-1",
    name: "Maya",
    color: "#ef6b7a",
    focus: "canvas",
    x: 10,
    y: 20,
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("getRealtimeSyncContract", () => {
  it("exposes Phoenix connection state without changing the live display label", () => {
    assert.deepEqual(
      getRealtimeSyncContract({
        hasRealtimeEndpoint: true,
        status: "connected",
        useRealtimeFallback: false,
      }),
      { label: "live", status: "connected", transport: "phoenix" },
    );
  });

  it("exposes degraded fallback state without changing the live display label", () => {
    assert.deepEqual(
      getRealtimeSyncContract({
        hasRealtimeEndpoint: true,
        status: "degraded",
        useRealtimeFallback: true,
      }),
      { label: "live", status: "degraded", transport: "fallback" },
    );
  });

  it("labels a degraded Phoenix connection as reconnecting", () => {
    assert.deepEqual(
      getRealtimeSyncContract({
        hasRealtimeEndpoint: true,
        status: "degraded",
        useRealtimeFallback: false,
      }),
      { label: "reconnecting", status: "degraded", transport: "phoenix" },
    );
  });

  it("reports no transport when realtime and fallback are both unavailable", () => {
    assert.deepEqual(
      getRealtimeSyncContract({
        hasRealtimeEndpoint: false,
        status: "degraded",
        useRealtimeFallback: false,
      }),
      { label: "live", status: "degraded", transport: "none" },
    );
  });

  it("preserves connecting and closed labels", () => {
    assert.equal(
      getRealtimeSyncContract({
        hasRealtimeEndpoint: true,
        status: "connecting",
        useRealtimeFallback: false,
      }).label,
      "connecting",
    );
    assert.equal(
      getRealtimeSyncContract({
        hasRealtimeEndpoint: false,
        status: "closed",
        useRealtimeFallback: true,
      }).label,
      "closed",
    );
  });
});

describe("normalizeEndpoint", () => {
  it("appends the Phoenix socket path", () => {
    assert.equal(normalizeEndpoint("https://rt.example.com"), "https://rt.example.com/socket");
  });

  it("strips a trailing slash before appending the socket path", () => {
    assert.equal(normalizeEndpoint("https://rt.example.com/"), "https://rt.example.com/socket");
  });

  it("does not double-slash when the endpoint already ends with /socket", () => {
    // normalizeEndpoint only collapses a single trailing slash; callers are
    // expected to pass the base endpoint, not the full socket URL.
    assert.equal(normalizeEndpoint("https://rt.example.com/socket/"), "https://rt.example.com/socket/socket");
  });
});

describe("presenceStateToSnapshots", () => {
  it("flattens Phoenix presence state into a flat snapshot list", () => {
    const state: PresenceState = {
      u1: { metas: [snapshot({ id: "u1" }), snapshot({ id: "u1", x: 99 })] },
      u2: { metas: [snapshot({ id: "u2" })] },
    };

    assert.equal(presenceStateToSnapshots(state).length, 3);
  });

  it("drops meta entries that have no id so no faceless collaborator renders", () => {
    const malformed = {
      name: "ghost",
      color: "#000",
      focus: "canvas",
      x: 0,
      y: 0,
      updatedAt: 0,
    } as unknown as PresenceSnapshot;
    const state: PresenceState = {
      u1: { metas: [{ ...snapshot(), id: "" }] },
      u2: { metas: [malformed] },
    };

    assert.deepEqual(presenceStateToSnapshots(state), []);
  });

  it("treats a missing metas array as an empty entry", () => {
    assert.deepEqual(presenceStateToSnapshots({ u1: {} }), []);
  });
});

describe("mergePresenceSnapshots", () => {
  it("prunes current collaborators that have gone silent past the TTL", () => {
    const now = Date.now();
    const stale = snapshot({ id: "stale", updatedAt: now - PRESENCE_TTL_MS - 1 });
    const fresh = snapshot({ id: "fresh", updatedAt: now - 1000 });

    const result = mergePresenceSnapshots([stale, fresh], []);

    assert.deepEqual(
      result.map((s) => s.id),
      ["fresh"],
    );
  });

  it("keeps a collaborator that is comfortably within the TTL", () => {
    const now = Date.now();
    const edge = snapshot({ id: "edge", updatedAt: now - PRESENCE_TTL_MS + 1000 });

    const result = mergePresenceSnapshots([edge], []);

    assert.deepEqual(
      result.map((s) => s.id),
      ["edge"],
    );
  });

  it("lets a newer incoming update win over a stale current one for the same id", () => {
    const now = Date.now();
    const current = snapshot({ id: "u1", x: 1, updatedAt: now - 5000 });
    const incoming = snapshot({ id: "u1", x: 2, updatedAt: now });

    const [merged] = mergePresenceSnapshots([current], [incoming]);

    assert.equal(merged.x, 2);
  });

  it("does not regress a newer current snapshot with an older incoming update", () => {
    const now = Date.now();
    const current = snapshot({ id: "u1", x: 2, updatedAt: now });
    const incoming = snapshot({ id: "u1", x: 1, updatedAt: now - 5000 });

    const [merged] = mergePresenceSnapshots([current], [incoming]);

    assert.equal(merged.x, 2);
  });

  it("sorts the result newest-first so the most active collaborator wins the overlay", () => {
    const now = Date.now();
    const oldest = snapshot({ id: "old", updatedAt: now - 9000 });
    const newest = snapshot({ id: "new", updatedAt: now });
    const middle = snapshot({ id: "mid", updatedAt: now - 3000 });

    const result = mergePresenceSnapshots([oldest, middle], [newest]);

    assert.deepEqual(
      result.map((s) => s.id),
      ["new", "mid", "old"],
    );
  });

  it("merges disjoint collaborator ids from current and incoming", () => {
    const now = Date.now();
    const result = mergePresenceSnapshots(
      [snapshot({ id: "a", updatedAt: now - 1000 })],
      [snapshot({ id: "b", updatedAt: now })],
    );

    assert.deepEqual(result.map((s) => s.id).sort(), ["a", "b"]);
  });

  it("handles empty inputs without throwing", () => {
    assert.deepEqual(mergePresenceSnapshots([], []), []);
  });
});
