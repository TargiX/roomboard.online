export type CanvasFpsMode = "vsync" | "half";

/**
 * Storage key for the canvas FPS mode. "vsync" follows the display refresh
 * rate (Pixi default); "half" caps the render ticker at ~30 FPS to cut CPU/GPU
 * draw on battery-constrained machines.
 */
export const CANVAS_FPS_STORAGE_KEY = "roomboard-canvas-fps";

/** Ticker cap applied in "half" mode. */
export const CANVAS_HALF_FPS = 30;

export function isCanvasFpsMode(value: unknown): value is CanvasFpsMode {
  return value === "vsync" || value === "half";
}

type CanvasFpsStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function defaultStorage(): CanvasFpsStorage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage;
}

/** Reads the persisted FPS mode; unknown or missing values fall back to "vsync". */
export function getStoredCanvasFpsMode(storage: CanvasFpsStorage | undefined = defaultStorage()): CanvasFpsMode {
  const raw = storage?.getItem(CANVAS_FPS_STORAGE_KEY);

  return isCanvasFpsMode(raw) ? raw : "vsync";
}

/** Persists the FPS mode; storage failures are ignored (preference is optional). */
export function saveStoredCanvasFpsMode(
  mode: CanvasFpsMode,
  storage: CanvasFpsStorage | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(CANVAS_FPS_STORAGE_KEY, mode);
  } catch {
    // Persistence is optional.
  }
}

/**
 * Applies an FPS mode to a Pixi-style ticker and returns the effective cap.
 * "vsync" leaves the ticker uncapped (0 = follow requestAnimationFrame).
 */
export function applyCanvasFpsMode(ticker: { maxFPS: number }, mode: CanvasFpsMode): number {
  ticker.maxFPS = mode === "half" ? CANVAS_HALF_FPS : 0;

  return ticker.maxFPS;
}
