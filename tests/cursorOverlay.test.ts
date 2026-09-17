import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCursorScreenPosition,
  syncCursorsToPresence,
  type CursorLayerLike,
  type CursorLike,
} from "../lib/cursorOverlay.ts";
import type { PresenceSnapshot } from "../lib/presence.ts";

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

// Minimal cursor double mirroring the Container surface the sync touches.
class FakeCursor implements CursorLike {
  label?: string;
  eventMode?: string;
  x = 0;
  y = 0;
  destroyed = false;
  position = {
    set: (x: number, y: number) => {
      this.x = x;
      this.y = y;
    },
  };

  constructor(label?: string) {
    this.label = label;
  }

  destroy() {
    this.destroyed = true;
  }
}

class FakeLayer implements CursorLayerLike {
  children: FakeCursor[] = [];

  addChild(...added: FakeCursor[]) {
    this.children.push(...added);
  }

  removeChildAt(index: number) {
    return this.children.splice(index, 1)[0];
  }
}

type Harness = {
  layer: FakeLayer;
  created: FakeCursor[];
  run: (
    presence: PresenceSnapshot[],
    world: { x: number; y: number; scale: number },
  ) => number;
};

function harness(): Harness {
  const layer = new FakeLayer();
  const created: FakeCursor[] = [];

  return {
    layer,
    created,
    run(presence, world) {
      return syncCursorsToPresence({
        presence,
        cursorLayer: layer,
        worldX: world.x,
        worldY: world.y,
        scale: world.scale,
        createCursor: (snap) => {
          const cursor = new FakeCursor();
          created.push(cursor);
          return cursor;
        },
      });
    },
  };
}

describe("getCursorScreenPosition", () => {
  it("projects world coordinates through pan and zoom", () => {
    const position = getCursorScreenPosition({ x: 10, y: 20 }, 100, 50, 2);

    assert.deepEqual(position, { x: 120, y: 90 });
  });

  it("treats a degenerate zoom factor as identity scale", () => {
    const position = getCursorScreenPosition({ x: 10, y: -20 }, 100, 50, 0);

    assert.deepEqual(position, { x: 110, y: 30 });
  });
});

describe("syncCursorsToPresence", () => {
  it("creates, labels, and projects one cursor per present peer", () => {
    const h = harness();
    const moved = h.run(
      [snapshot({ id: "u1", x: 10, y: 20 }), snapshot({ id: "u2", name: "Bob", x: -5, y: 0 })],
      { x: 100, y: 50, scale: 2 },
    );

    // Both fresh cursors move from the container origin to their projected spot.
    assert.equal(moved, 2);
    assert.equal(h.layer.children.length, 2);
    assert.deepEqual(
      h.layer.children.map((cursor) => cursor.label),
      ["u1", "u2"],
    );
    assert.deepEqual(
      h.layer.children.map((cursor) => cursor.eventMode),
      ["none", "none"],
    );
    assert.deepEqual([h.layer.children[0].x, h.layer.children[0].y], [120, 90]);
    assert.deepEqual([h.layer.children[1].x, h.layer.children[1].y], [90, 50]);
  });

  it("re-projects cursors through the current world transform without new presence", () => {
    const h = harness();
    const presence = [snapshot({ id: "u1", x: 10, y: 20 })];
    h.run(presence, { x: 100, y: 50, scale: 2 });

    // Quiet room: the pan/zoom changed but no presence event arrived — the
    // cursor must follow the board instead of staying stranded.
    const moved = h.run(presence, { x: 140, y: 30, scale: 1.5 });

    assert.equal(moved, 1);
    const cursor = h.layer.children[0];
    assert.deepEqual([cursor.x, cursor.y], [155, 60]);
    assert.equal(cursor.destroyed, false);
  });

  it("is a no-op when presence and the world transform are unchanged", () => {
    const h = harness();
    const presence = [snapshot({ id: "u1", x: 10, y: 20 })];
    h.run(presence, { x: 100, y: 50, scale: 2 });

    const moved = h.run(presence, { x: 100, y: 50, scale: 2 });

    assert.equal(moved, 0);
    assert.equal(h.layer.children.length, 1);
    assert.equal(h.created.length, 1, "no duplicate cursor is created");
  });

  it("removes and destroys cursors whose peer left", () => {
    const h = harness();
    h.run(
      [snapshot({ id: "u1", x: 10, y: 20 }), snapshot({ id: "u2", name: "Bob", x: 5, y: 5 })],
      { x: 0, y: 0, scale: 1 },
    );

    const removed = h.run([snapshot({ id: "u2", name: "Bob", x: 5, y: 5 })], {
      x: 0,
      y: 0,
      scale: 1,
    });

    assert.equal(removed, 0);
    assert.equal(h.layer.children.length, 1);
    assert.equal(h.layer.children[0].label, "u2");
    assert.equal(h.created[0].destroyed, true);
  });

  it("treats the (0, 0) sentinel as no pointer and drops its stale cursor", () => {
    const h = harness();
    h.run([snapshot({ id: "u1", x: 10, y: 20 })], { x: 0, y: 0, scale: 1 });

    h.run([snapshot({ id: "u1", x: 0, y: 0 })], { x: 0, y: 0, scale: 1 });

    assert.equal(h.layer.children.length, 0);
    assert.equal(h.created[0].destroyed, true);
  });

  it("removes stray unlabelled children from the cursor layer", () => {
    const h = harness();
    h.run([snapshot({ id: "u1", x: 1, y: 2 })], { x: 0, y: 0, scale: 1 });
    const stray = new FakeCursor();
    h.layer.addChild(stray);

    h.run([snapshot({ id: "u1", x: 1, y: 2 })], { x: 0, y: 0, scale: 1 });

    assert.equal(h.layer.children.length, 1);
    assert.equal(h.layer.children[0].label, "u1");
    assert.equal(stray.destroyed, true);
  });
});
