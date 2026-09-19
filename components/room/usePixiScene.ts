"use client";

import { useEffect, type MutableRefObject } from "react";
import { Application, Container, Graphics } from "pixi.js";
import { destroyPixiApp, setWorldZoom, wheelZoomInStep, wheelZoomOutStep, type PixiScene } from "@/lib/pixiScene";

type UsePixiSceneArgs = {
  hostRef: MutableRefObject<HTMLDivElement | null>;
  sceneRef: MutableRefObject<PixiScene | null>;
  currentAppRef: MutableRefObject<Application | null>;
  tickerCleanupRef: MutableRefObject<(() => void)[]>;
  setSceneReady: (ready: boolean) => void;
  setSelectedId: (id: string) => void;
  setZoomPercent: (percent: number) => void;
  syncGridTransform: (scene: Pick<PixiScene, "world">) => void;
  syncTextResolution: (scale: number) => void;
};

/**
 * Boots the Pixi application inside `hostRef`: creates the world/cursor/item
 * layers, wires stage panning and wheel zoom, and tears everything down on
 * unmount. Extracted from CanvasRoom so the component only orchestrates data.
 */
export function usePixiScene({
  hostRef,
  sceneRef,
  currentAppRef,
  tickerCleanupRef,
  setSceneReady,
  setSelectedId,
  setZoomPercent,
  syncGridTransform,
  syncTextResolution,
}: UsePixiSceneArgs) {
  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    const hostEl = host;
    let disposed = false;
    const app = new Application();
    const world = new Container();
    const itemLayer = new Container();
    const cursorLayer = new Container();
    const connectionGraphics = new Graphics();
    const draftConnectionGraphics = new Graphics();
    const itemMap = new Map<string, Container>();
    let draggingStage = false;
    let lastPointer = { x: 0, y: 0 };

    async function boot() {
      try {
        await app.init({
          antialias: true,
          autoDensity: true,
          backgroundAlpha: 0,
          preserveDrawingBuffer: true,
          resizeTo: hostEl,
          resolution: Math.min(window.devicePixelRatio || 1, 3),
        });
      } catch (err) {
        console.error("Failed to initialize Pixi Application:", err);
        throw err;
      }

      if (disposed) {
        destroyPixiApp(app);
        return;
      }

      hostEl.appendChild(app.canvas);
      world.position.set(hostEl.clientWidth / 2 + 80, hostEl.clientHeight / 2 - 20);
      app.stage.addChild(world, cursorLayer);
      world.addChild(connectionGraphics, draftConnectionGraphics, itemLayer);
      sceneRef.current = {
        app,
        cursorLayer,
        host: hostEl,
        itemLayer,
        itemMap,
        world,
        connectionGraphics,
        draftConnectionGraphics,
      };
      currentAppRef.current = app;
      syncGridTransform({ world });
      setSceneReady(true);

      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;
      app.stage.on("pointerdown", (event) => {
        if (event.target !== app.stage) {
          return;
        }

        draggingStage = true;
        lastPointer = { x: event.global.x, y: event.global.y };
      });
      app.stage.on("pointerup", () => {
        draggingStage = false;
      });
      app.stage.on("pointerupoutside", () => {
        draggingStage = false;
      });
      app.stage.on("pointertap", (event) => {
        if (event.target === app.stage) {
          setSelectedId("");
        }
      });
      app.stage.on("globalpointermove", (event) => {
        if (!draggingStage) {
          return;
        }

        world.x += event.global.x - lastPointer.x;
        world.y += event.global.y - lastPointer.y;
        lastPointer = { x: event.global.x, y: event.global.y };
        syncGridTransform({ world });
      });

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const direction = event.deltaY > 0 ? wheelZoomOutStep : wheelZoomInStep;
        const hostRect = hostEl.getBoundingClientRect();
        const nextScale = setWorldZoom({ host: hostEl, world }, world.scale.x * direction, {
          x: event.clientX - hostRect.left,
          y: event.clientY - hostRect.top,
        });
        syncTextResolution(nextScale);
        syncGridTransform({ world });
        setZoomPercent(Math.round(nextScale * 100));
      };

      hostEl.addEventListener("wheel", onWheel, { passive: false });

      return () => hostEl.removeEventListener("wheel", onWheel);
    }

    let cleanupWheel: (() => void) | undefined;
    boot().then((cleanup) => {
      cleanupWheel = cleanup;
    });

    return () => {
      disposed = true;
      cleanupWheel?.();
      tickerCleanupRef.current.forEach((cleanup) => cleanup());
      tickerCleanupRef.current = [];
      sceneRef.current = null;
      currentAppRef.current = null;
      setSceneReady(false);
      destroyPixiApp(app);
      hostEl.replaceChildren();
    };
  }, [
    hostRef,
    sceneRef,
    currentAppRef,
    tickerCleanupRef,
    setSceneReady,
    setSelectedId,
    setZoomPercent,
    syncGridTransform,
    syncTextResolution,
  ]);
}
