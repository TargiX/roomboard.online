import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCanvasFpsMode,
  CANVAS_FPS_STORAGE_KEY,
  CANVAS_HALF_FPS,
  getStoredCanvasFpsMode,
  isCanvasFpsMode,
  saveStoredCanvasFpsMode,
} from "../lib/canvasFps.ts";

function makeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));

  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    map,
  };
}

describe("canvasFps", () => {
  it("defaults to vsync when storage is empty", () => {
    const storage = makeStorage();

    assert.equal(getStoredCanvasFpsMode(storage), "vsync");
  });

  it("defaults to vsync without any storage", () => {
    assert.equal(getStoredCanvasFpsMode(undefined), "vsync");
  });

  it("falls back to vsync on unknown stored values", () => {
    const storage = makeStorage({ [CANVAS_FPS_STORAGE_KEY]: "turbo" });

    assert.equal(getStoredCanvasFpsMode(storage), "vsync");
  });

  it("round-trips the half mode through storage", () => {
    const storage = makeStorage();

    saveStoredCanvasFpsMode("half", storage);
    assert.equal(storage.map.get(CANVAS_FPS_STORAGE_KEY), "half");
    assert.equal(getStoredCanvasFpsMode(storage), "half");
  });

  it("swallows storage failures when saving", () => {
    assert.doesNotThrow(() => saveStoredCanvasFpsMode("half", undefined));
  });

  it("falls back to vsync when the storage getter throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };

    assert.equal(getStoredCanvasFpsMode(storage), "vsync");
  });

  it("swallows save failures from a throwing storage", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
    };

    assert.doesNotThrow(() => saveStoredCanvasFpsMode("half", storage));
  });

  it("validates mode values", () => {
    assert.equal(isCanvasFpsMode("half"), true);
    assert.equal(isCanvasFpsMode("vsync"), true);
    assert.equal(isCanvasFpsMode("30"), false);
    assert.equal(isCanvasFpsMode(null), false);
  });

  it("caps the ticker at the half-rate FPS", () => {
    const ticker = { maxFPS: 0 };

    assert.equal(applyCanvasFpsMode(ticker, "half"), CANVAS_HALF_FPS);
    assert.equal(ticker.maxFPS, CANVAS_HALF_FPS);
  });

  it("uncaps the ticker in vsync mode", () => {
    const ticker = { maxFPS: CANVAS_HALF_FPS };

    assert.equal(applyCanvasFpsMode(ticker, "vsync"), 0);
    assert.equal(ticker.maxFPS, 0);
  });
});
