"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PresenceSnapshot } from "@/lib/presence";
import { PRESENCE_TTL_MS, pruneStalePresence } from "@/lib/presenceTtl";
import { mergePresenceSnapshots } from "@/lib/realtimeHelpers";
import type { RoomboardRealtimeSession, RoomboardRealtimeStatus } from "@/lib/roomboardRealtime";
import { createLocalId } from "@/lib/roomTokens";

type PresenceUser = {
  color: string;
  name: string;
  profileComplete?: boolean;
};

type PresenceFocus = {
  id: string;
  title: string;
} | null;

type PresenceScene = {
  host: HTMLElement;
  world: {
    scale: { x: number };
    x: number;
    y: number;
  };
};

type UsePresenceSyncOptions = {
  presenceApi: string;
  presenceChannelName: string;
  realtimeSessionRef: React.RefObject<RoomboardRealtimeSession | null>;
  realtimeStatus: RoomboardRealtimeStatus;
  roomCredentialsHeaders: Record<string, string>;
  sceneRef: React.RefObject<PresenceScene | null>;
  selected: PresenceFocus;
  useRealtimeFallback: boolean;
  user: PresenceUser | null;
};

/**
 * Owns the collaborator-presence lifecycle for one room: the local session id,
 * the presence list, cursor-position publishing (Phoenix channel, SSE POST, or
 * BroadcastChannel depending on transport), and the TTL prune that drops silent
 * collaborators from a quiet room.
 *
 * The returned `presenceRef` mirrors state for ticker callbacks that must read
 * the latest presence without re-registering on every change.
 */
export function usePresenceSync({
  presenceApi,
  presenceChannelName,
  realtimeSessionRef,
  realtimeStatus,
  roomCredentialsHeaders,
  sceneRef,
  selected,
  useRealtimeFallback,
  user,
}: UsePresenceSyncOptions) {
  const presenceSessionIdRef = useRef(createLocalId());
  const [presence, setPresence] = useState<PresenceSnapshot[]>([]);
  const presenceRef = useRef<PresenceSnapshot[]>([]);
  const credentialsRef = useRef(roomCredentialsHeaders);

  useEffect(() => {
    credentialsRef.current = roomCredentialsHeaders;
  });

  // `selected` is derived via items.find() in the parent, so it gets a new
  // reference on every board update. Mirror it into a ref so the publish
  // effect below can read the latest selection without restarting the
  // BroadcastChannel/pointermove/interval on every items change.
  const selectedRef = useRef(selected);

  useEffect(() => {
    selectedRef.current = selected;
  });

  const applyPresenceState = useCallback((snapshots: PresenceSnapshot[]) => {
    const selfId = presenceSessionIdRef.current;
    setPresence(
      snapshots.filter((snapshot) => snapshot.id !== selfId).sort((a, b) => b.updatedAt - a.updatedAt),
    );
  }, []);

  const applyPresenceUpdate = useCallback((snapshot: PresenceSnapshot) => {
    if (snapshot.id !== presenceSessionIdRef.current) {
      setPresence((current) => mergePresenceSnapshots(current, [snapshot]));
    }
  }, []);

  const applyPresenceLeave = useCallback((ids: string[]) => {
    setPresence((current) => current.filter((snapshot) => !ids.includes(snapshot.id)));
  }, []);


  const applyPresenceList = useCallback((snapshots: PresenceSnapshot[]) => {
    const selfId = presenceSessionIdRef.current;
    setPresence((current) =>
      mergePresenceSnapshots(
        current,
        snapshots.filter((snapshot) => snapshot.id !== selfId),
      ),
    );
  }, []);
  const clearPresence = useCallback(() => setPresence([]), []);

  // Publish the local cursor/selection to whichever transport is live:
  // BroadcastChannel always (same-browser tabs), Phoenix channel when
  // connected, or the SSE presence endpoint when running the fallback.
  useEffect(() => {
    if (!user?.profileComplete) {
      return;
    }

    const channel = useRealtimeFallback ? new BroadcastChannel(presenceChannelName) : null;
    const presenceSessionId = presenceSessionIdRef.current;
    let lastPresencePoint = { x: 0, y: 0 };
    let lastLocalSent = 0;
    let lastServerSent = 0;
    const sendPresence = (clientX?: number, clientY?: number) => {
      const now = Date.now();
      const scene = sceneRef.current;

      if (scene && Number.isFinite(clientX) && Number.isFinite(clientY)) {
        const hostRect = scene.host.getBoundingClientRect();
        const scale = scene.world.scale.x || 1;
        lastPresencePoint = {
          x: (clientX! - hostRect.left - scene.world.x) / scale,
          y: (clientY! - hostRect.top - scene.world.y) / scale,
        };
      }

      const snapshot = {
        id: presenceSessionId,
        name: user.name,
        color: user.color,
        focus: selectedRef.current ? selectedRef.current.title : "canvas",
        selection: selectedRef.current?.id,
        x: lastPresencePoint.x,
        y: lastPresencePoint.y,
        updatedAt: now,
      };

      if (channel && now - lastLocalSent >= 16) {
        lastLocalSent = now;
        channel.postMessage(snapshot);
      }

      if (!useRealtimeFallback) {
        if (realtimeStatus === "connected" && now - lastServerSent >= 50) {
          lastServerSent = now;
          realtimeSessionRef.current?.updatePresence(snapshot);
        }

        return;
      }

      if (now - lastServerSent < 180) {
        return;
      }

      lastServerSent = now;
      void fetch(presenceApi, {
        body: JSON.stringify(snapshot),
        headers: { "Content-Type": "application/json", ...credentialsRef.current },
        method: "POST",
      });
    };

    sendPresence();
    const onPointerMove = (event: PointerEvent) => sendPresence(event.clientX, event.clientY);
    window.addEventListener("pointermove", onPointerMove);
    const interval = window.setInterval(() => sendPresence(), 3000);

    return () => {
      channel?.close();
      window.removeEventListener("pointermove", onPointerMove);
      window.clearInterval(interval);
    };
  }, [presenceApi, presenceChannelName, realtimeStatus, realtimeSessionRef, sceneRef, selected?.id, selected?.title, useRealtimeFallback, user]);

  // ROADMAP #3 / AC #5: prune collaborators that have gone silent (tab close,
  // refresh, network loss) even when the room is quiet. mergePresenceSnapshots
  // already drops stale entries, but only when an incoming presence event
  // arrives — a still room would otherwise pin a stale collaborator on screen
  // past the TTL. Re-applying the TTL on a timer guarantees they disappear.
  useEffect(() => {
    const interval = window.setInterval(
      () => setPresence((current) => pruneStalePresence(current)),
      Math.round(PRESENCE_TTL_MS / 3),
    );

    return () => window.clearInterval(interval);
  }, []);

  // Keep the ticker-readable mirror in sync before the cursor overlay effect
  // runs within the same commit.
  useEffect(() => {
    presenceRef.current = presence;
  });

  return {
    applyPresenceLeave,
    applyPresenceList,
    applyPresenceState,
    applyPresenceUpdate,
    clearPresence,
    presence,
    presenceRef,
    presenceSessionIdRef,
  };
}
