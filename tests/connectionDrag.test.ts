import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { register } from "node:module";
import type { Container } from "pixi.js";
import type { RoomItem } from "../lib/canvasRoom.ts";

// Register resolve hooks before importing the module under test so that its
// Next.js "@/*" path-alias imports resolve in native ESM.
register("./aliasResolveHooks.mjs", import.meta.url);

const { getCardSize } = await import("../lib/pixiScene.ts");

const {
  compactPipePoints,
  getConnectionFanOut,
  getConnectionPairKey,
  getDropTargetSide,
  getFacingSide,
  getItemCardRect,
  getNearestSocketSide,
  getPipeArrowHitPoint,
  getPointPipeRoute,
  getSocketPoint,
  getCardPipeRoute,
  upsertUniqueConnection,
} = await import("../components/room/connectionDrag.ts");

type CanvasRect = { x: number; y: number; width: number; height: number };

function rect(x: number, y: number, width = 100, height = 100): CanvasRect {
  return { x, y, width, height };
}

function imageItem(overrides: Partial<RoomItem> = {}): RoomItem {
  return {
    id: "item-1",
    type: "image",
    title: "Card",
    body: "Body",
    imageUrl: "https://example.com/asset.png",
    comments: [],
    status: "open",
    x: 10,
    y: 20,
    width: 300,
    height: 200,
    ...overrides,
  } as RoomItem;
}

describe("getFacingSide", () => {
  const from = rect(0, 0);

  it("returns right/left when the horizontal delta dominates", () => {
    assert.equal(getFacingSide(from, rect(200, 60)), "right");
    assert.equal(getFacingSide(from, { x: -500, y: 50 }), "left");
  });

  it("returns top/bottom when the vertical delta dominates", () => {
    assert.equal(getFacingSide(from, { x: 50, y: 400 }), "bottom");
    assert.equal(getFacingSide(from, { x: 50, y: -300 }), "top");
  });

  it("resolves the exact diagonal tie toward the horizontal side", () => {
    assert.equal(getFacingSide(from, { x: 100, y: 100 }), "right");
    assert.equal(getFacingSide(from, { x: 0, y: 100 }), "left");
  });
});

describe("getSocketPoint", () => {
  const card = rect(10, 20, 100, 50);

  it("pins each side socket to the card edge midpoint", () => {
    assert.deepEqual(getSocketPoint(card, "left"), { x: 10, y: 45 });
    assert.deepEqual(getSocketPoint(card, "right"), { x: 110, y: 45 });
    assert.deepEqual(getSocketPoint(card, "top"), { x: 60, y: 20 });
    assert.deepEqual(getSocketPoint(card, "bottom"), { x: 60, y: 70 });
  });
});

describe("getNearestSocketSide", () => {
  const card = rect(0, 0);

  it("picks the socket side closest to the pointer", () => {
    assert.equal(getNearestSocketSide(card, { x: 50, y: -100 }), "top");
    assert.equal(getNearestSocketSide(card, { x: 300, y: 50 }), "right");
    assert.equal(getNearestSocketSide(card, { x: 50, y: 300 }), "bottom");
    assert.equal(getNearestSocketSide(card, { x: -300, y: 50 }), "left");
  });
});

describe("getDropTargetSide", () => {
  const card = rect(0, 0);
  const source = rect(-500, 0);

  it("snaps to the socket side the pointer hovers near", () => {
    assert.equal(getDropTargetSide(source, card, { x: 50, y: 10 }), "top");
  });

  it("falls back to the side facing the source card when the pointer is mid-card", () => {
    assert.equal(getDropTargetSide(source, card, { x: 60, y: 60 }), "left");
  });
});

describe("compactPipePoints", () => {
  it("drops repeated and sub-half-unit points", () => {
    assert.deepEqual(
      compactPipePoints([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0.3, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ]),
      [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ],
    );
  });

  it("keeps an empty route empty", () => {
    assert.deepEqual(compactPipePoints([]), []);
  });
});

describe("getPointPipeRoute", () => {
  const card = rect(0, 0);

  it("routes card socket → outward stub → elbow → point and collapses a degenerate elbow", () => {
    assert.deepEqual(getPointPipeRoute(card, { x: 300, y: 50 }, "right"), [
      { x: 100, y: 50 },
      { x: 134, y: 50 },
      { x: 300, y: 50 },
    ]);
  });

  it("infers the facing side when none is given", () => {
    assert.deepEqual(getPointPipeRoute(card, { x: 300, y: 50 }), [
      { x: 100, y: 50 },
      { x: 134, y: 50 },
      { x: 300, y: 50 },
    ]);
  });

  it("routes vertically from the bottom socket", () => {
    assert.deepEqual(getPointPipeRoute(card, { x: 50, y: 300 }, "bottom"), [
      { x: 50, y: 100 },
      { x: 50, y: 134 },
      { x: 50, y: 300 },
    ]);
  });

  it("honors a drag-start override instead of the socket", () => {
    assert.deepEqual(getPointPipeRoute(card, { x: 0, y: -100 }, "top", { x: 0, y: 0 }), [
      { x: 0, y: 0 },
      { x: 0, y: -34 },
      { x: 0, y: -100 },
    ]);
  });
});

describe("getCardPipeRoute", () => {
  const left = rect(0, 0);
  const right = rect(300, 0);
  const below = rect(0, 300);

  it("routes side-to-side through the midpoint elbow for aligned horizontal cards", () => {
    assert.deepEqual(getCardPipeRoute(left, right), [
      { x: 100, y: 50 },
      { x: 134, y: 50 },
      { x: 200, y: 50 },
      { x: 266, y: 50 },
      { x: 300, y: 50 },
    ]);
  });

  it("shifts aligned horizontal cards onto a fan-out lane when requested", () => {
    assert.deepEqual(getCardPipeRoute(left, right, undefined, undefined, undefined, undefined, 10), [
      { x: 100, y: 50 },
      { x: 134, y: 50 },
      { x: 134, y: 60 },
      { x: 266, y: 60 },
      { x: 266, y: 50 },
      { x: 300, y: 50 },
    ]);
  });

  it("routes vertically through the midpoint elbow for stacked cards", () => {
    assert.deepEqual(getCardPipeRoute(left, below), [
      { x: 50, y: 100 },
      { x: 50, y: 134 },
      { x: 50, y: 200 },
      { x: 50, y: 266 },
      { x: 50, y: 300 },
    ]);
  });

  it("mixes orientations with an L-shaped lane between the stubs", () => {
    assert.deepEqual(getCardPipeRoute(left, left, "right", "top"), [
      { x: 100, y: 50 },
      { x: 134, y: 50 },
      { x: 50, y: 50 },
      { x: 50, y: -34 },
      { x: 50, y: 0 },
    ]);
  });
});

describe("getConnectionPairKey", () => {
  it("is direction-agnostic", () => {
    assert.equal(getConnectionPairKey("a", "b"), getConnectionPairKey("b", "a"));
    assert.equal(getConnectionPairKey("a", "b"), "a::b");
  });
});

describe("getConnectionFanOut", () => {
  it("is zero for a single connection", () => {
    assert.equal(getConnectionFanOut(0, 1), 0);
  });

  it("spreads two connections symmetrically", () => {
    assert.equal(getConnectionFanOut(0, 2), -10);
    assert.equal(getConnectionFanOut(1, 2), 10);
  });

  it("centers three and more connections", () => {
    assert.equal(getConnectionFanOut(0, 3), -10);
    assert.equal(getConnectionFanOut(1, 3), 0);
    assert.equal(getConnectionFanOut(2, 3), 10);
    assert.equal(getConnectionFanOut(1, 4), -5);
    assert.equal(getConnectionFanOut(2, 4), 5);
  });
});

describe("upsertUniqueConnection", () => {
  const existing = [
    { id: "a", from: "1", to: "2" },
    { id: "b", from: "2", to: "3" },
  ];

  it("replaces the reversed pair", () => {
    assert.deepEqual(upsertUniqueConnection(existing, { id: "c", from: "2", to: "1" }), [
      { id: "b", from: "2", to: "3" },
      { id: "c", from: "2", to: "1" },
    ]);
  });

  it("replaces the same connection id even when the pair changed", () => {
    assert.deepEqual(upsertUniqueConnection(existing, { id: "a", from: "3", to: "4" }), [
      { id: "b", from: "2", to: "3" },
      { id: "a", from: "3", to: "4" },
    ]);
  });

  it("appends a brand-new connection", () => {
    assert.deepEqual(upsertUniqueConnection(existing, { id: "c", from: "4", to: "5" }), [
      ...existing,
      { id: "c", from: "4", to: "5" },
    ]);
  });
});

describe("getPipeArrowHitPoint", () => {
  it("sits 26 units back from the route end along the last segment", () => {
    assert.deepEqual(
      getPipeArrowHitPoint([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
      { x: 74, y: 0 },
    );
    assert.deepEqual(
      getPipeArrowHitPoint([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 100, y: 0 },
      ]),
      { x: 74, y: 0 },
    );
  });

  it("falls back to the route end when the polyline is shorter than the marker offset", () => {
    assert.deepEqual(
      getPipeArrowHitPoint([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
      { x: 10, y: 0 },
    );
  });
});

describe("getItemCardRect", () => {
  it("prefers the live container position over the domain position", () => {
    const item = imageItem();
    const fakeContainer = { x: 99, y: 88 } as unknown as Container;
    const scene = { itemMap: new Map([["item-1", fakeContainer]]) };
    const size = getCardSize(item);

    assert.deepEqual(getItemCardRect(scene, item), { x: 99, y: 88, width: size.width, height: size.height });
  });

  it("falls back to the domain position when the card is not on stage", () => {
    const item = imageItem();
    const scene = { itemMap: new Map() };
    const size = getCardSize(item);

    assert.deepEqual(getItemCardRect(scene, item), { x: 10, y: 20, width: size.width, height: size.height });
  });
});
