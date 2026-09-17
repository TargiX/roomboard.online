import type { PresenceSnapshot } from "./presence";

/**
 * Pure screen-space cursor overlay math + sync, extracted from the
 * `CanvasRoom` presence effect (ROADMAP workstream 2: "Keep user cursors on a
 * separate screen-space overlay so pan/zoom does not drag remote pointers
 * incorrectly").
 *
 * The dependency-free shape (no pixi.js runtime import) lets the overlay
 * contract stay unit-testable under `node --experimental-strip-types`, the
 * same pattern as `lib/presenceTtl.ts`.
 */

/** Inputs for one cursor-overlay sync pass. */
export type CursorOverlaySyncInput = {
  /** Latest presence snapshots in world coordinates (newest-first). */
  presence: PresenceSnapshot[];
  /** Parent layer holding one cursor container per peer, labelled by peer id. */
  cursorLayer: CursorLayerLike;
  /** World container pan along x (screen px). */
  worldX: number;
  /** World container pan along y (screen px). */
  worldY: number;
  /** World container zoom factor (`0`/`NaN` falls back to `1`). */
  scale: number;
  /** Factory for a fresh per-peer cursor container (shape + pill + label). */
  createCursor: (snapshot: PresenceSnapshot) => CursorLike;
};

/**
 * Structural minimum of the pixi `Container` surface the sync touches.
 * Declared locally so this module never imports pixi.js at runtime.
 */
export type CursorLike = {
  label?: string | number;
  eventMode?: string;
  x: number;
  y: number;
  position: { set(x: number, y: number): unknown };
  destroy(options?: { children?: boolean }): unknown;
};

/** Structural minimum of the pixi `Container` cursor layer surface. */
export type CursorLayerLike = {
  children: CursorLike[];
  addChild(...children: CursorLike[]): unknown;
  removeChildAt(index: number): unknown;
};

/** Screen-space (cursor-layer) position of one world-space presence point. */
export type CursorScreenPosition = {
  x: number;
  y: number;
};

/**
 * Project a world-space presence point into cursor-layer space.
 *
 * Exact inverse of the local pointer mapping used when publishing presence
 * (`(clientX - hostLeft - world.x) / scale`), so a remote cursor sits on the
 * same board material their peer is pointing at regardless of pan/zoom.
 */
export function getCursorScreenPosition(
  point: Pick<PresenceSnapshot, "x" | "y">,
  worldX: number,
  worldY: number,
  scale: number,
): CursorScreenPosition {
  const safeScale = scale || 1;

  return {
    x: worldX + point.x * safeScale,
    y: worldY + point.y * safeScale,
  };
}

/**
 * Reconcile the cursor layer with the latest presence and the current world
 * transform in one idempotent pass:
 *
 * 1. cursors are (re)projected from world space through the *current*
 *    `worldX`/`worldY`/`scale`, so a pan or zoom re-pins every remote cursor
 *    even while the room is quiet and no presence events arrive;
 * 2. missing peers get a container from {@link CursorOverlaySyncInput.createCursor}
 *    (labelled by peer id, non-interactive);
 * 3. cursors whose peer disappeared — including peers that went back to the
 *    unpublished `(0, 0)` sentinel — are removed and destroyed.
 *
 * Returns how many existing cursors moved this pass, so callers can cheaply
 * detect a no-op (e.g. to skip extra work on quiet ticks).
 */
export function syncCursorsToPresence({
  presence,
  cursorLayer,
  worldX,
  worldY,
  scale,
  createCursor,
}: CursorOverlaySyncInput): number {
  const keep = new Set<string>();
  let moved = 0;

  for (const snapshot of presence) {
    // Parity with the local pointer publisher: (0, 0) is the "no pointer
    // published yet" sentinel and renders nothing.
    if (snapshot.x === 0 && snapshot.y === 0) {
      continue;
    }

    keep.add(snapshot.id);

    let cursor = cursorLayer.children.find(
      (child) => child.label === snapshot.id,
    );

    if (!cursor) {
      cursor = createCursor(snapshot);
      cursor.label = snapshot.id;
      cursor.eventMode = "none";
      cursorLayer.addChild(cursor);
    }

    const position = getCursorScreenPosition(snapshot, worldX, worldY, scale);
    if (cursor.x !== position.x || cursor.y !== position.y) {
      cursor.position.set(position.x, position.y);
      moved += 1;
    }
  }

  for (let i = cursorLayer.children.length - 1; i >= 0; i -= 1) {
    const child = cursorLayer.children[i];
    if (child.label === undefined || !keep.has(String(child.label))) {
      cursorLayer.removeChildAt(i);
      child.destroy({ children: true });
    }
  }

  return moved;
}
