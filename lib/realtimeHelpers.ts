import type { PresenceSnapshot } from "./presence";

/**
 * Client-side presence + realtime transport helpers.
 *
 * These are kept dependency-free (type-only imports) so they can be unit-tested
 * in isolation from the Phoenix socket and the Pixi canvas. They encode the
 * realtime collaboration invariants tracked by ROADMAP issue #3:
 *
 * - Presence snapshots are dropped once they have not been heard from within
 *   {@link PRESENCE_TTL_MS}, so stale collaborators disappear after tab close,
 *   refresh, or network loss.
 * - Newer presence always wins over older presence for the same collaborator.
 * - Phoenix presence diffs are flattened into the shared snapshot shape.
 */

/** How long a collaborator can go silent before being considered stale. */
export const PRESENCE_TTL_MS = 15_000;

/** Raw Phoenix presence state keyed by presence key. */
export type PresenceState = Record<string, { metas?: PresenceSnapshot[] }>;

export type RealtimeConnectionStatus = "connecting" | "connected" | "degraded" | "closed";

export type RealtimeSyncTransport = "phoenix" | "fallback" | "none";

type RealtimeSyncContractOptions = {
  hasRealtimeEndpoint: boolean;
  status: RealtimeConnectionStatus;
  useRealtimeFallback: boolean;
};

/**
 * Derive the human label and stable machine-readable realtime contract.
 */
export function getRealtimeSyncContract({
  hasRealtimeEndpoint,
  status,
  useRealtimeFallback,
}: RealtimeSyncContractOptions) {
  const transport: RealtimeSyncTransport =
    hasRealtimeEndpoint && !useRealtimeFallback ? "phoenix" : useRealtimeFallback ? "fallback" : "none";
  const label =
    status === "connecting"
      ? "connecting"
      : status === "closed"
        ? "closed"
        : status === "degraded" && transport === "phoenix"
          ? "reconnecting"
          : "live";

  return { label, status, transport };
}

/**
 * Normalize a realtime endpoint into a Phoenix socket URL.
 *
 * Phoenix expects the websocket at `<endpoint>/socket`; a trailing slash on the
 * configured endpoint must not produce a double slash.
 */
export function normalizeEndpoint(endpoint: string) {
  return `${endpoint.replace(/\/$/, "")}/socket`;
}

/**
 * Flatten raw Phoenix presence state into a list of snapshots.
 *
 * Entries without an `id` (incomplete meta payloads) are filtered out so the
 * canvas never renders a faceless collaborator.
 */
export function presenceStateToSnapshots(state: PresenceState) {
  return Object.values(state)
    .flatMap((entry) => entry.metas ?? [])
    .filter((presence): presence is PresenceSnapshot => Boolean(presence?.id));
}

/**
 * Merge an incoming set of presence snapshots into the current set.
 *
 * - Existing snapshots older than {@link PRESENCE_TTL_MS} are pruned, which is
 *   the client-side safety net for collaborators lost to a network drop or an
 *   unclean tab close.
 * - For a given collaborator id, the newest snapshot (by `updatedAt`) wins.
 * - The result is sorted newest-first so the most active collaborator renders
 *   on top of the cursor overlay.
 */
export function mergePresenceSnapshots(current: PresenceSnapshot[], incoming: PresenceSnapshot[]) {
  const now = Date.now();
  const merged = new Map<string, PresenceSnapshot>();

  for (const snapshot of current) {
    if (now - snapshot.updatedAt < PRESENCE_TTL_MS) {
      merged.set(snapshot.id, snapshot);
    }
  }

  for (const snapshot of incoming) {
    const existing = merged.get(snapshot.id);

    if (!existing || snapshot.updatedAt >= existing.updatedAt) {
      merged.set(snapshot.id, snapshot);
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}
