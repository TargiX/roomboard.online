import type { PresenceSnapshot } from "./presence";

/**
 * How long (ms) a collaborator can go silent before they are considered stale.
 *
 * Shared invariant behind ROADMAP issue #3 ("Stale collaborators disappear after
 * tab close, refresh, or network loss"): a snapshot older than this window is
 * pruned from the visible presence list even when no further realtime events
 * arrive (e.g. a quiet room after someone closes their tab).
 */
export const PRESENCE_TTL_MS = 15_000;

/**
 * Drop presence snapshots older than the TTL and return them newest-first.
 *
 * Pure and dependency-free (the {@link PresenceSnapshot} import is type-only and
 * erased at runtime) so it can be unit-tested in isolation and called from a
 * client-side timer without pulling in the realtime transport or canvas.
 *
 * Keep policy is intentionally strict-less-than (`now - updatedAt < ttlMs`) to
 * match the existing `mergePresenceSnapshots` behaviour: a snapshot that is
 * exactly TTL old is treated as stale and removed.
 *
 * Reference identity: when no entries are stale, the input array is returned
 * unchanged. This lets the prune timer in {@link CanvasRoom} feed the result
 * straight into `setPresence` without forcing a React re-render on every tick
 * of a quiet room.
 */
export function pruneStalePresence(
  snapshots: PresenceSnapshot[],
  now: number = Date.now(),
  ttlMs: number = PRESENCE_TTL_MS,
): PresenceSnapshot[] {
  const fresh = snapshots.filter((snapshot) => now - snapshot.updatedAt < ttlMs);

  if (fresh.length === snapshots.length) {
    return snapshots;
  }

  return fresh.sort((a, b) => b.updatedAt - a.updatedAt);
}
