import { Application, CanvasTextMetrics, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import type { RoomItem, RoomItemStatus } from "@/lib/canvasRoom";

/**
 * Shared Pixi.js scene plumbing for the room canvas: the scene bundle type,
 * zoom/text-resolution helpers, image texture loading, and texture-aware
 * teardown. Kept out of the React component so the render loop and the boot
 * hook can share one implementation.
 */
export type PixiScene = {
  app: Application;
  cursorLayer: Container;
  host: HTMLDivElement;
  itemLayer: Container;
  itemMap: Map<string, Container>;
  world: Container;
  connectionGraphics: Graphics;
  draftConnectionGraphics: Graphics;
};

export const pixiFont = "Geist, Inter, system-ui, sans-serif";

export const minCanvasZoom = 0.2;
export const maxCanvasZoom = 8;
export const wheelZoomInStep = 1.12;
export const wheelZoomOutStep = 0.89;
export const minPixiTextResolution = 4;
export const maxPixiTextResolution = 18;

export function clampZoom(scale: number) {
  return Math.min(maxCanvasZoom, Math.max(minCanvasZoom, scale));
}

export function getPixiTextResolution(scale: number) {
  return Math.min(maxPixiTextResolution, Math.max(minPixiTextResolution, Math.ceil(scale * 2)));
}

export function updateTextResolution(root: Container, resolution: number) {
  for (const child of root.children) {
    if (child instanceof Text) {
      child.resolution = resolution;
    }

    if (child instanceof Container) {
      updateTextResolution(child, resolution);
    }
  }
}

export function setWorldZoom(
  scene: Pick<PixiScene, "host" | "world">,
  nextScale: number,
  anchor?: { x: number; y: number },
) {
  const previousScale = scene.world.scale.x || 1;
  const scale = clampZoom(nextScale);
  const point = anchor ?? {
    x: scene.host.clientWidth / 2,
    y: scene.host.clientHeight / 2,
  };
  const worldX = (point.x - scene.world.x) / previousScale;
  const worldY = (point.y - scene.world.y) / previousScale;

  scene.world.scale.set(scale);
  scene.world.x = point.x - worldX * scale;
  scene.world.y = point.y - worldY * scale;

  return scale;
}

export function loadImageTexture(src: string) {
  return new Promise<Texture>((resolve, reject) => {
    const image = new Image();

    if (/^https?:\/\//.test(src)) {
      image.crossOrigin = "anonymous";
    }

    image.onload = () => {
      const texture = Texture.from(image);
      // Mipmaps keep downscaled photos smooth — without them, zooming the
      // board out aliases every image into pixel noise.
      texture.source.autoGenerateMipmaps = true;
      resolve(texture);
    };
    image.onerror = () => reject(new Error("Image could not be decoded."));
    image.src = src;
  });
}

export function destroyPixiApp(app: Application) {
  const appState = app as unknown as {
    _cancelResize?: (() => void) | null;
    renderer?: unknown;
  };

  if (!appState.renderer || appState._cancelResize === null) {
    return;
  }

  try {
    app.destroy({ removeView: true }, { children: true });
  } catch (error) {
    if (!(error instanceof TypeError && String(error).includes("_cancelResize"))) {
      console.warn("Error destroying Pixi app on unmount:", error);
    }
  }
}

/**
 * Destroy a card container and the GPU textures its sprites hold. Pixi's
 * `container.destroy({ children: true })` frees display objects but leaves
 * `Texture` sources alive — without this, every removed/re-rendered image card
 * leaks its texture for the app's lifetime.
 */
export function destroyItemContainer(container: Container) {
  const destroyTextures = (node: Container) => {
    for (const child of node.children) {
      if (child instanceof Sprite && child.texture && child.texture !== Texture.EMPTY) {
        child.texture.destroy(true);
      }
      if (child instanceof Container) {
        destroyTextures(child);
      }
    }
  };

  destroyTextures(container);
  container.destroy({ children: true });
}

/**
 * Card-render constants and helpers shared by the room canvas draw loop.
 *
 * `toColor`/`mixHex` translate hex strings into the integer colors Pixi.js
 * graphics primitives consume. `getCardSize` measures the text wrapping a
 * note card needs so the renderer can reserve enough vertical space. The
 * status meta + image display helpers translate domain data into the
 * pill/badge copy the renderer draws on each card.
 */
export const pixiMonoFont = "Geist Mono, ui-monospace, monospace";
export const minImageFrameHeight = 116;
export const connectionHandleRadius = 5.5;

export function toColor(hex: string) {
  return Number.parseInt(hex.replace("#", ""), 16);
}

export function mixHex(hex: string, mixWith: string, amount: number) {
  const clean = (value: string) => value.replace("#", "");
  const a = Number.parseInt(clean(hex).slice(0, 6), 16);
  const b = Number.parseInt(clean(mixWith).slice(0, 6), 16);

  if (Number.isNaN(a) || Number.isNaN(b)) {
    return toColor(mixWith);
  }

  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar * amount + br * (1 - amount));
  const g = Math.round(ag * amount + bg * (1 - amount));
  const bl = Math.round(ab * amount + bb * (1 - amount));

  return (r << 16) + (g << 8) + bl;
}

export type StatusMeta = {
  color: string;
  label: string;
  short: string;
};

export function getItemStatusMeta(status: RoomItemStatus): StatusMeta {
  if (status === "approved") {
    return { color: "#10b981", label: "Approved", short: "Approved" };
  }

  if (status === "reviewing") {
    return { color: "#0ea5e9", label: "Reviewing", short: "Review" };
  }

  if (status === "changes_requested") {
    return { color: "#f43f5e", label: "Changes requested", short: "Changes" };
  }

  return { color: "#8a909a", label: "Open", short: "Open" };
}

export function getDomain(url?: string) {
  if (!url) return "Link";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace("www.", "");
  } catch {
    return "Link";
  }
}

export function truncate(value: string, length = 96) {
  return value.length > length ? `${value.slice(0, length - 2)}...` : value;
}

export function truncateForWidth(value: string, width: number, averageCharWidth = 7) {
  return truncate(value, Math.max(8, Math.floor(width / averageCharWidth)));
}

function isDefaultImageTitle(value: string) {
  return ["image", "image reference", "visual reference"].includes(value.trim().toLowerCase());
}

function isDefaultImageBody(value: string) {
  return [
    "add context, critique, or decisions in the inspector.",
    "image reference for review.",
    "linked image ready for comments and visual decisions.",
    "reference image for review",
    "reference image for review.",
    "review thread ready - source saved.",
    "source saved - ready for review.",
    "uploaded image ready for comments and visual decisions.",
  ].includes(value.trim().toLowerCase());
}

export function getImageDisplayTitle(item: RoomItem) {
  if (!isDefaultImageTitle(item.title)) {
    return item.title;
  }

  const domain = getDomain(item.imageUrl);
  return domain === "Link" ? "Visual reference" : `Reference from ${domain}`;
}

export function getImageDisplayBody(item: RoomItem) {
  if (item.body && !isDefaultImageBody(item.body)) {
    return item.body;
  }

  if (item.comments.length > 0) {
    return `${item.comments.length} review note${item.comments.length === 1 ? "" : "s"} captured.`;
  }

  return item.imageUrl ? "Source saved - ready for review." : "Paste a URL or upload to start review.";
}

export function getCardSize(item: RoomItem) {
  if (item.type !== "image") {
    const cardWidth = Math.max(240, item.width || 240);
    const titleStyle = new TextStyle({
      fontFamily: pixiFont,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 17,
      wordWrap: true,
      wordWrapWidth: cardWidth - 28,
    });
    const bodyStyle = new TextStyle({
      fontFamily: pixiFont,
      fontSize: 12,
      fontWeight: "500",
      lineHeight: 18,
      wordWrap: true,
      wordWrapWidth: cardWidth - 28,
    });

    const titleMetrics = CanvasTextMetrics.measureText(item.title || "", titleStyle);
    const bodyMetrics = CanvasTextMetrics.measureText(item.body || item.imageUrl || "", bodyStyle);

    const headerHeight = 38;
    const footerHeight = 36;
    const titleHeight = item.title ? titleMetrics.height : 0;
    const bodyHeight = item.body || item.imageUrl ? bodyMetrics.height : 0;

    let h = headerHeight;
    h += 8; // top padding
    if (titleHeight) h += titleHeight + 4;
    if (bodyHeight) h += bodyHeight + 8;
    h += footerHeight + 4;

    return { width: cardWidth, height: Math.max(item.height || 120, h) };
  }

  return {
    width: Math.max(272, item.width),
    height: Math.max(252, item.height),
  };
}
