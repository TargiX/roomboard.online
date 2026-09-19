import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRealtimeSyncAnnouncement, getRealtimeSyncPresentation } from "../lib/realtimeSyncPresentation.ts";

describe("getRealtimeSyncAnnouncement", () => {
  it("announces recovery after an outage without announcing an initial healthy state", () => {
    const reconnecting = getRealtimeSyncPresentation({
      fallbackActive: false,
      hasRealtimeEndpoint: true,
      reconnecting: true,
      status: "degraded",
    });
    const connecting = getRealtimeSyncPresentation({
      fallbackActive: false,
      hasRealtimeEndpoint: true,
      reconnecting: false,
      status: "connecting",
    });
    const connected = getRealtimeSyncPresentation({
      fallbackActive: false,
      hasRealtimeEndpoint: true,
      reconnecting: false,
      status: "connected",
    });

    assert.deepEqual(getRealtimeSyncAnnouncement(connected, false), {
      hadOutage: false,
      message: "",
    });
    assert.deepEqual(getRealtimeSyncAnnouncement(reconnecting, false), {
      hadOutage: true,
      message: "Sync status: Reconnecting",
    });
    assert.deepEqual(getRealtimeSyncAnnouncement(connecting, true), {
      hadOutage: true,
      message: null,
    });
    assert.deepEqual(getRealtimeSyncAnnouncement(connected, true), {
      hadOutage: false,
      message: "Sync status: Live",
    });
  });
});

describe("getRealtimeSyncPresentation", () => {
  it("presents a connected Phoenix session as live", () => {
    assert.deepEqual(
      getRealtimeSyncPresentation({
        fallbackActive: false,
        hasRealtimeEndpoint: true,
        reconnecting: false,
        status: "connected",
      }),
      {
        detail: "Phoenix collaboration is connected.",
        label: "Live",
        status: "connected",
        tone: "positive",
        transport: "phoenix",
      },
    );
  });

  it("presents a Phoenix session that is still joining as connecting", () => {
    assert.deepEqual(
      getRealtimeSyncPresentation({
        fallbackActive: false,
        hasRealtimeEndpoint: true,
        reconnecting: false,
        status: "connecting",
      }),
      {
        detail: "Joining Phoenix collaboration.",
        label: "Connecting",
        status: "connecting",
        tone: "pending",
        transport: "phoenix",
      },
    );
  });

  it("names a scheduled Phoenix retry without exposing an unsafe manual action", () => {
    assert.deepEqual(
      getRealtimeSyncPresentation({
        fallbackActive: false,
        hasRealtimeEndpoint: true,
        reconnecting: true,
        status: "degraded",
      }),
      {
        detail: "Phoenix collaboration is unavailable. Roomboard is retrying the session.",
        label: "Reconnecting",
        status: "degraded",
        tone: "warning",
        transport: "phoenix",
      },
    );
  });

  it("does not promise recovery when Phoenix has no usable session token", () => {
    assert.deepEqual(
      getRealtimeSyncPresentation({
        fallbackActive: false,
        hasRealtimeEndpoint: true,
        reconnecting: false,
        status: "degraded",
      }),
      {
        detail: "Phoenix collaboration is offline. Edits are not shared live.",
        label: "Offline",
        status: "degraded",
        tone: "critical",
        transport: "phoenix",
      },
    );
  });

  it("names active local fallback without pretending Phoenix is connected", () => {
    assert.deepEqual(
      getRealtimeSyncPresentation({
        fallbackActive: true,
        hasRealtimeEndpoint: true,
        reconnecting: false,
        status: "degraded",
      }),
      {
        detail:
          "Local edits use Roomboard's SSE/BroadcastChannel fallback when available; Phoenix collaboration is not connected.",
        label: "Local fallback",
        status: "degraded",
        tone: "warning",
        transport: "fallback",
      },
    );
  });

  it("reports no transport as offline", () => {
    assert.deepEqual(
      getRealtimeSyncPresentation({
        fallbackActive: false,
        hasRealtimeEndpoint: false,
        reconnecting: false,
        status: "degraded",
      }),
      {
        detail: "No realtime transport is available. Edits are not shared live.",
        label: "Offline",
        status: "degraded",
        tone: "critical",
        transport: "none",
      },
    );
  });

  it("never uses the Live label outside a connected Phoenix session", () => {
    const statuses = ["connecting", "connected", "degraded", "closed"] as const;

    for (const reconnecting of [false, true]) {
      for (const hasRealtimeEndpoint of [false, true]) {
        for (const fallbackActive of [false, true]) {
          for (const status of statuses) {
            const presentation = getRealtimeSyncPresentation({
              fallbackActive,
              hasRealtimeEndpoint,
              reconnecting,
              status,
            });
            const isConnectedPhoenix = hasRealtimeEndpoint && !fallbackActive && status === "connected";

            assert.equal(
              presentation.label === "Live",
              isConnectedPhoenix,
              JSON.stringify({
                fallbackActive,
                hasRealtimeEndpoint,
                presentation,
                reconnecting,
                status,
              }),
            );
            assert.equal(
              presentation.transport,
              fallbackActive ? "fallback" : hasRealtimeEndpoint ? "phoenix" : "none",
            );
          }
        }
      }
    }
  });
});
