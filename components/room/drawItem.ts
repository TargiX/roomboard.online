import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import {
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  type FederatedPointerEvent,
  type Ticker,
} from "pixi.js";
import type { PresenceSnapshot } from "@/lib/presence";
import type { RoomItem, RoomConnectionSide } from "@/lib/canvasRoom";
import {
  connectionHandleRadius,
  getCardSize,
  getDomain,
  getImageDisplayBody,
  getImageDisplayTitle,
  getItemStatusMeta,
  loadImageTexture,
  minImageFrameHeight,
  mixHex,
  pixiMonoFont,
  toColor,
  truncate,
  truncateForWidth,
  type PixiScene,
  type StatusMeta,
} from "@/lib/pixiScene";
import type { CanvasPalette } from "@/components/room/roomTypes";

type LocalMove = {
  sentAt?: number;
  x: number;
  y: number;
};

type ConnectionDraft = {
  dragged: boolean;
  fromId: string;
  fromSide: ConnectionSide;
  originGlobal: CanvasPoint;
  pointer: CanvasPoint;
  start: CanvasPoint;
  targetId: string;
  targetSide?: ConnectionSide;
};

type CanvasPoint = {
  x: number;
  y: number;
};

type ConnectionSide = RoomConnectionSide;

type CanvasRect = CanvasPoint & {
  height: number;
  width: number;
};

type DragState = {
  draggingItem: Container | null;
  activeDragId: string;
  didMove: boolean;
  lastPointer: { x: number; y: number };
};

type InlineEdit = { id: string; field: "title" | "body"; text: string };

export type DrawItemContext = {
  // Refs (passed as ref objects, not .current)
  textResolutionRef: MutableRefObject<number>;
  dragStateRef: MutableRefObject<DragState>;
  isConnectingRef: MutableRefObject<boolean>;
  canEditRoomRef: MutableRefObject<boolean>;
  themeRef: MutableRefObject<"dark" | "light">;
  lastDragBroadcastRef: MutableRefObject<Map<string, number>>;
  draggingPositionsRef: MutableRefObject<Map<string, LocalMove>>;
  connectFromIdRef: MutableRefObject<string | null>;
  selectedIdRef: MutableRefObject<string>;
  remoteTargetsRef: MutableRefObject<Map<string, { x: number; y: number }>>;
  presenceRef: MutableRefObject<PresenceSnapshot[]>;
  hoveredConnectionTargetRef: MutableRefObject<string>;
  isDraggingRef: MutableRefObject<boolean>;
  itemTickersRef: MutableRefObject<Map<string, Array<(ticker: Ticker) => void>>>;
  connectionDraftRef: MutableRefObject<ConnectionDraft | null>;
  connectedItemIdsRef: MutableRefObject<Set<string>>;

  // Values
  palette: CanvasPalette;
  canEditRoom: boolean;
  theme: "dark" | "light";
  scene: PixiScene;
  dragBroadcastIntervalMs: number;
  connectionHandleHitRadius: number;

  // State setters
  setSelectedId: Dispatch<SetStateAction<string>>;
  setInlineEdit: Dispatch<SetStateAction<InlineEdit | null>>;
  setRenderGeneration: Dispatch<SetStateAction<number>>;
  setItems: Dispatch<SetStateAction<RoomItem[]>>;

  // Callbacks
  persistMove: (itemId: string, x: number, y: number) => void;
  broadcastMove: (itemId: string, x: number, y: number, sentAt?: number) => void;
  startConnectionDrag: (
    item: RoomItem,
    handle: { key: ConnectionSide; x: number; y: number },
    event: FederatedPointerEvent,
  ) => void;
  startOrCompleteConnection: (itemId: string) => void;

  // Helpers used by the body (kept in CanvasRoom to avoid widening scope)
  getInitials: (name: string) => string;
  pixiFont: string;
};

/**
 * Factory for the per-item card draw function. The renderer runs inside a
 * `useEffect` that captures many refs and callbacks; this factory closes over
 * them via `ctx` so the body stays free of inline per-card helpers.
 *
 * `drawPill` and `onDoubleClickText` stay nested inside the returned function
 * because they reference per-card locals (the link pill container, the text
 * field being clicked). `lastTextClickTime` likewise lives in the returned
 * function so each item tracks its own double-click cadence.
 */
export function createDrawItem(ctx: DrawItemContext) {
  const {
    textResolutionRef,
    dragStateRef,
    isConnectingRef,
    canEditRoomRef,
    themeRef,
    lastDragBroadcastRef,
    draggingPositionsRef,
    connectFromIdRef,
    selectedIdRef,
    remoteTargetsRef,
    presenceRef,
    hoveredConnectionTargetRef,
    isDraggingRef,
    itemTickersRef,
    connectionDraftRef,
    connectedItemIdsRef,
    palette,
    canEditRoom,
    theme,
    scene,
    dragBroadcastIntervalMs,
    connectionHandleHitRadius,
    setSelectedId,
    setInlineEdit,
    setRenderGeneration,
    setItems,
    persistMove,
    broadcastMove,
    startConnectionDrag,
    startOrCompleteConnection,
    getInitials,
    pixiFont,
  } = ctx;

  // setItems is required by the type contract but not referenced inside
  // drawItem itself; persistMove already closes over it.
  void setItems;

  return (item: RoomItem) => {
    const cardSize = getCardSize(item);
    const cardWidth = cardSize.width;
    const cardHeight = cardSize.height;
    const headerHeight = 38;
    const footerHeight = 36;
    const cardPad = 16;
    const imageInfoHeight = 58;
    const imageFrameTop = headerHeight + 11;
    const imageFrameGap = 12;
    const footerY = cardHeight - footerHeight;
    const imageInfoY = footerY - imageInfoHeight;
    const imageSource = getDomain(item.imageUrl);
    const sourcePillMaxWidth =
      item.type === "image" && item.imageUrl ? Math.min(118, Math.max(72, cardWidth * 0.34)) : 0;
    const sourcePillText = sourcePillMaxWidth > 0 ? truncateForWidth(imageSource, sourcePillMaxWidth - 24, 6.1) : "";
    const sourcePillWidth = sourcePillText
      ? Math.min(sourcePillMaxWidth, Math.max(66, sourcePillText.length * 6.1 + 24))
      : 0;
    const imageTitleGap = sourcePillWidth > 0 ? 8 : 0;
    const imageTitleWidth = Math.max(108, cardWidth - cardPad * 2 - sourcePillWidth - imageTitleGap);
    const imageBodyWidth = Math.max(132, cardWidth - cardPad * 2);
    const statusMeta = getItemStatusMeta(item.status);
    const handleLayer = new Container();
    const imageFrame = {
      x: cardPad,
      y: imageFrameTop,
      width: cardWidth - cardPad * 2,
      height: Math.max(minImageFrameHeight, imageInfoY - imageFrameTop - imageFrameGap),
    };
    const root = new Container();
    root.alpha = 0;
    root.scale.set(0.92);
    let fadeInDone = false;
    const card = new Graphics();
    const typeDot = new Graphics();
    const statusPill = new Graphics();
    const typeLabel = new Text({
      resolution: textResolutionRef.current,
      text: item.type === "image" ? "IMAGE" : "NOTE",
      style: {
        fill: palette.muted,
        fontFamily: pixiMonoFont,
        fontSize: 9.5,
        fontWeight: "700",
        letterSpacing: 0.7,
      },
    });
    const idText = new Text({
      resolution: textResolutionRef.current,
      text: `#${item.id.slice(0, 4).toUpperCase()}`,
      style: {
        fill: palette.faint,
        fontFamily: pixiMonoFont,
        fontSize: 10,
        fontWeight: "600",
      },
    });
    const statusText = new Text({
      resolution: textResolutionRef.current,
      text: statusMeta.short.toUpperCase(),
      style: {
        fill: statusMeta.color,
        fontFamily: pixiMonoFont,
        fontSize: 9,
        fontWeight: "700",
        letterSpacing: 0.45,
      },
    });
    const titleText = new Text({
      resolution: textResolutionRef.current,
      text: item.type === "image" ? truncateForWidth(getImageDisplayTitle(item), imageTitleWidth, 7.2) : item.title,
      style: {
        fill: palette.title,
        fontFamily: pixiFont,
        fontSize: 13,
        fontWeight: "700",
        lineHeight: 17,
        wordWrap: true,
        wordWrapWidth: item.type === "image" ? imageTitleWidth : cardWidth - 28,
      },
    });
    const bodyText = new Text({
      resolution: textResolutionRef.current,
      text:
        item.type === "image"
          ? truncateForWidth(getImageDisplayBody(item), imageBodyWidth, 6.2)
          : item.body || item.imageUrl || "",
      style: {
        fill: palette.body,
        fontFamily: pixiFont,
        fontSize: 12,
        fontWeight: "500",
        lineHeight: 18,
        wordWrap: true,
        wordWrapWidth: item.type === "image" ? imageBodyWidth : cardWidth - 28,
      },
    });
    const commentText = new Text({
      resolution: textResolutionRef.current,
      text: `${item.comments.length} comment${item.comments.length === 1 ? "" : "s"}`,
      style: {
        fill: palette.body,
        fontFamily: pixiMonoFont,
        fontSize: 10.5,
        fontWeight: "700",
      },
    });
    const authorInitialText = new Text({
      resolution: textResolutionRef.current,
      text: getInitials(item.author || "Roomboard").slice(0, 1),
      style: {
        fill: "#ffffff",
        fontFamily: pixiFont,
        fontSize: 8,
        fontWeight: "700",
      },
    });
    const authorAvatar = new Graphics();
    const authorText = new Text({
      resolution: textResolutionRef.current,
      text: item.author ? truncate(item.author, 14) : "Roomboard",
      style: {
        fill: palette.muted,
        fontFamily: pixiFont,
        fontSize: 11,
        fontWeight: "600",
      },
    });
    const imagePlaceholderTitle = new Text({
      resolution: textResolutionRef.current,
      text: "No image source",
      style: {
        fill: palette.title,
        fontFamily: pixiFont,
        fontSize: 13,
        fontWeight: "700",
      },
    });
    const imagePlaceholderBody = new Text({
      resolution: textResolutionRef.current,
      text: "Paste a URL or upload a reference",
      style: {
        fill: palette.muted,
        fontFamily: pixiFont,
        fontSize: 11,
        fontWeight: "600",
      },
    });

    root.position.set(item.x, item.y);
    root.eventMode = "static";
    root.hitArea = new Rectangle(0, 0, cardWidth, cardHeight);
    root.cursor = "pointer";
    let isHovered = false;
    typeDot.roundRect(0, 0, 6, 6, 1.5).fill({ color: toColor(item.color) });
    typeDot.position.set(cardPad, 17);
    typeLabel.position.set(cardPad + 12, 14);
    const statusPillWidth = Math.min(86, Math.max(50, statusText.width + 18));
    statusPill
      .roundRect(0, 0, statusPillWidth, 18, 999)
      .fill({ alpha: theme === "light" ? 0.12 : 0.16, color: toColor(statusMeta.color) });
    statusPill
      .roundRect(0, 0, statusPillWidth, 18, 999)
      .stroke({ alpha: theme === "light" ? 0.24 : 0.34, color: toColor(statusMeta.color), width: 1 });
    statusPill.position.set(cardPad + 58, 11);
    statusText.anchor.set(0.5);
    statusText.position.set(cardPad + 58 + statusPillWidth / 2, 20);
    idText.position.set(cardWidth - 52, 14);
    titleText.position.set(cardPad, item.type === "image" ? imageInfoY + 11 : headerHeight + 12);

    if (item.type === "image") {
      bodyText.visible = true;
      titleText.style.wordWrap = false;
      titleText.style.wordWrapWidth = imageTitleWidth;
      titleText.text = truncateForWidth(getImageDisplayTitle(item), imageTitleWidth, 7.2);
      bodyText.text = truncateForWidth(getImageDisplayBody(item), imageBodyWidth, 6.2);
      bodyText.style.fontSize = 11;
      bodyText.style.fill = palette.muted;
      bodyText.style.lineHeight = 15;
      bodyText.style.wordWrap = false;
      bodyText.style.wordWrapWidth = imageBodyWidth;
      bodyText.position.set(cardPad, imageInfoY + 33);
      imagePlaceholderTitle.visible = !item.imageUrl;
      imagePlaceholderBody.visible = !item.imageUrl;
      if (item.imageUrl) {
        imagePlaceholderTitle.visible = false;
        imagePlaceholderBody.visible = false;
      } else {
        titleText.text = truncateForWidth(getImageDisplayTitle(item), imageTitleWidth, 7.2);
        bodyText.text = truncateForWidth(getImageDisplayBody(item), imageBodyWidth, 6.2);
        imagePlaceholderTitle.anchor.set(0.5);
        imagePlaceholderBody.anchor.set(0.5);
        imagePlaceholderTitle.position.set(
          imageFrame.x + imageFrame.width / 2,
          imageFrame.y + imageFrame.height / 2 - 9,
        );
        imagePlaceholderBody.position.set(
          imageFrame.x + imageFrame.width / 2,
          imageFrame.y + imageFrame.height / 2 + 12,
        );
      }
    } else {
      bodyText.visible = true;
      bodyText.position.set(cardPad, headerHeight + 36);
      imagePlaceholderTitle.visible = false;
      imagePlaceholderBody.visible = false;
    }
    commentText.position.set(cardPad, footerY + 11);
    authorAvatar.roundRect(0, 0, 16, 16, 8).fill({ color: toColor(item.color) });
    authorInitialText.anchor.set(0.5);
    const authorGroupWidth = Math.min(104, 22 + authorText.width);
    const authorGroupX = Math.max(cardPad, cardWidth - authorGroupWidth - cardPad);
    authorAvatar.position.set(authorGroupX, footerY + 10);
    authorInitialText.position.set(authorGroupX + 8, footerY + 18);
    authorText.position.set(authorGroupX + 22, footerY + 12);

    let lastTextClickTime = 0;
    const onDoubleClickText = (event: FederatedPointerEvent, field: "title" | "body", text: string) => {
      if (!canEditRoomRef.current) return;
      const now = Date.now();
      if (now - lastTextClickTime < 350) {
        event.stopPropagation();
        setInlineEdit({ id: item.id, field, text });
        setSelectedId(item.id);
      }
      lastTextClickTime = now;
    };

    if (item.type === "note") {
      titleText.eventMode = "static";
      titleText.on("pointerdown", (event) => onDoubleClickText(event, "title", item.title));

      bodyText.eventMode = "static";
      bodyText.on("pointerdown", (event) => onDoubleClickText(event, "body", item.body || item.imageUrl || ""));
    }

    root.addChild(
      card,
      typeDot,
      typeLabel,
      statusPill,
      statusText,
      idText,
      titleText,
      bodyText,
      imagePlaceholderTitle,
      imagePlaceholderBody,
      commentText,
      authorAvatar,
      authorInitialText,
      authorText,
      handleLayer,
    );

    const connectionHandles = (
      [
        { key: "top", x: cardWidth / 2, y: 0 },
        { key: "right", x: cardWidth, y: cardHeight / 2 },
        { key: "bottom", x: cardWidth / 2, y: cardHeight },
        { key: "left", x: 0, y: cardHeight / 2 },
      ] satisfies Array<{ key: ConnectionSide; x: number; y: number }>
    ).map((handle) => {
      const dot = new Graphics();
      dot.position.set(handle.x, handle.y);
      dot.eventMode = canEditRoom ? "static" : "none";
      dot.cursor = "crosshair";
      dot.on("pointerdown", (event) => {
        event.stopPropagation();
        startConnectionDrag(item, handle, event);
      });
      dot.on("pointertap", (event) => {
        event.stopPropagation();
      });
      handleLayer.addChild(dot);
      return dot;
    });

    if (item.type === "image" && item.imageUrl) {
      const linkPill = new Container();
      const pillBg = new Graphics();
      const linkText = new Text({
        resolution: textResolutionRef.current,
        text: sourcePillText,
        style: {
          fill: palette.accent,
          fontFamily: pixiMonoFont,
          fontSize: 9.5,
          fontWeight: "600",
        },
      });

      linkPill.addChild(pillBg, linkText);

      const pillW = sourcePillWidth;
      const pillH = 22;

      linkText.anchor.set(0.5);
      linkText.position.set(pillW / 2, pillH / 2);

      const drawPill = (hovered = false) => {
        pillBg.clear();
        pillBg
          .roundRect(0, 0, pillW, pillH, 999)
          .fill({ alpha: hovered ? 0.18 : 0.11, color: toColor(palette.accent) });
        pillBg
          .roundRect(0, 0, pillW, pillH, 999)
          .stroke({ alpha: hovered ? 0.55 : 0.28, color: toColor(palette.accent), width: 1 });
      };

      drawPill(false);
      linkPill.position.set(cardWidth - pillW - cardPad, imageInfoY + 5);
      linkPill.eventMode = "static";
      linkPill.cursor = "pointer";

      linkPill.on("pointerover", () => drawPill(true));
      linkPill.on("pointerout", () => drawPill(false));
      linkPill.on("pointertap", (e) => {
        e.stopPropagation();
        window.open(item.imageUrl, "_blank", "noopener,noreferrer");
      });

      root.addChild(linkPill);
    }

    if (item.type === "image" && item.imageUrl) {
      loadImageTexture(item.imageUrl)
        .then((texture) => {
          if (root.destroyed || !texture) return;
          const sprite = new Sprite(texture);
          const imageW = imageFrame.width;
          const imageH = imageFrame.height;

          const scale = Math.max(imageW / texture.width, imageH / texture.height);
          sprite.width = texture.width * scale;
          sprite.height = texture.height * scale;

          sprite.x = imageFrame.x + (imageW - sprite.width) / 2;
          sprite.y = imageFrame.y + (imageH - sprite.height) / 2;

          const mask = new Graphics();
          mask.roundRect(imageFrame.x, imageFrame.y, imageW, imageH, 6).fill({ color: 0xffffff });
          sprite.mask = mask;

          root.addChildAt(sprite, 1);
          root.addChildAt(mask, 1);
        })
        .catch((err) => {
          console.error("Failed to load image texture:", err);
        });
    }

    let lastRepaintKey = "";
    const repaint = () => {
      const target = remoteTargetsRef.current.get(item.id);
      if (target) {
        const lerp = 0.45;
        const nx = root.x + (target.x - root.x) * lerp;
        const ny = root.y + (target.y - root.y) * lerp;
        if (Math.abs(target.x - nx) < 0.5 && Math.abs(target.y - ny) < 0.5) {
          root.position.set(target.x, target.y);
          remoteTargetsRef.current.delete(item.id);
        } else {
          root.position.set(nx, ny);
        }
      }
      if (!fadeInDone) {
        root.alpha = Math.min(1, root.alpha + 0.12);
        root.scale.set(Math.min(1, root.scale.x + 0.04));
        if (root.alpha >= 1 && root.scale.x >= 1) {
          root.alpha = 1;
          root.scale.set(1);
          fadeInDone = true;
        }
      }
      const selId = selectedIdRef.current;
      const editRoom = canEditRoomRef.current;
      const repaintKey = [
        selId === item.id,
        editRoom,
        isHovered,
        connectFromIdRef.current === item.id,
        hoveredConnectionTargetRef.current === item.id || connectionDraftRef.current?.targetId === item.id,
        isConnectingRef.current,
        connectedItemIdsRef.current.has(item.id),
        presenceRef.current.some((snapshot) => snapshot.selection === item.id),
        themeRef.current,
      ].join("|");

      if (repaintKey === lastRepaintKey) {
        return;
      }
      lastRepaintKey = repaintKey;

      card.clear();
      const active = selId === item.id;
      const sourceForConnection = connectFromIdRef.current === item.id;
      const hotTargetForConnection =
        hoveredConnectionTargetRef.current === item.id || connectionDraftRef.current?.targetId === item.id;
      const targetForConnection =
        hotTargetForConnection || Boolean(isConnectingRef.current && connectFromIdRef.current && !sourceForConnection);
      const showConnectionHandles =
        editRoom &&
        (isHovered ||
          active ||
          isConnectingRef.current ||
          sourceForConnection ||
          connectedItemIdsRef.current.has(item.id));
      const activeBorder = active || sourceForConnection;
      const cardTintAmount =
        item.type === "image"
          ? themeRef.current === "light"
            ? 0.025
            : 0.035
          : themeRef.current === "light"
            ? 0.045
            : 0.07;
      const fill = mixHex(item.color, palette.cardMix, cardTintAmount);

      // Main card body
      card.roundRect(0, 0, cardWidth, cardHeight, 10).fill({ alpha: theme === "light" ? 1 : 0.98, color: fill });

      // Separator lines
      card.rect(0, headerHeight - 1, cardWidth, 1).fill({ alpha: 0.95, color: toColor(palette.separator) });
      card.rect(0, footerY, cardWidth, 1).fill({ alpha: 0.95, color: toColor(palette.separator) });

      // Highlight logic
      if (item.styleVariant === "highlight") {
        // Tint Header
        card
          .roundRect(0, 0, cardWidth, headerHeight - 1, 10)
          .fill({ alpha: theme === "light" ? 0.12 : 0.18, color: toColor(item.color) });
        card
          .rect(0, 10, cardWidth, headerHeight - 11)
          .fill({ alpha: theme === "light" ? 0.12 : 0.18, color: toColor(item.color) }); // square bottom corners of header tint

        // Tint Footer
        card
          .roundRect(0, footerY + 1, cardWidth, footerHeight - 1, 10)
          .fill({ alpha: theme === "light" ? 0.12 : 0.18, color: toColor(item.color) });
        card
          .rect(0, footerY + 1, cardWidth, footerHeight - 8)
          .fill({ alpha: theme === "light" ? 0.12 : 0.18, color: toColor(item.color) }); // square top corners of footer tint
      } else {
        // Standard Footer
        card
          .roundRect(0, footerY + 1, cardWidth, footerHeight - 1, 10)
          .fill({ alpha: theme === "light" ? 0.88 : 0.52, color: toColor(palette.footer) });
        card
          .rect(0, footerY + 1, cardWidth, footerHeight - 8)
          .fill({ alpha: theme === "light" ? 0.88 : 0.52, color: toColor(palette.footer) });
      }

      if (item.type === "note") {
        titleText.cursor = editRoom ? "text" : "pointer";
        bodyText.cursor = editRoom ? "text" : "pointer";
      }

      if (item.type === "image") {
        card.rect(0, imageInfoY, cardWidth, 1).fill({ alpha: 0.7, color: toColor(palette.separator) });
        card
          .rect(0, imageInfoY + 1, cardWidth, imageInfoHeight - 1)
          .fill({ alpha: theme === "light" ? 0.72 : 0.36, color: toColor(palette.footer) });
      }

      if (item.type === "image" && item.imageUrl) {
        card
          .roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 6)
          .fill({ color: toColor(palette.frame) });
        card
          .roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 6)
          .stroke({ alpha: 0.75, color: toColor(palette.frameBorder), width: 1 });
      }

      if (item.type === "image" && !item.imageUrl) {
        card
          .roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 6)
          .fill({ alpha: theme === "light" ? 0.95 : 0.72, color: toColor(palette.frame) });
        card
          .roundRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, 6)
          .stroke({ alpha: 0.8, color: toColor(palette.frameBorder), width: 1 });
        const placeholderIconX = imageFrame.x + imageFrame.width / 2;
        const placeholderIconY = imageFrame.y + imageFrame.height / 2 - 40;
        card
          .roundRect(placeholderIconX - 17, placeholderIconY - 12, 34, 24, 5)
          .stroke({ alpha: 0.5, color: toColor(palette.frameBorder), width: 1 });
        card
          .circle(placeholderIconX - 7, placeholderIconY - 4, 2.2)
          .fill({ alpha: 0.55, color: toColor(palette.muted) });
        card.moveTo(placeholderIconX - 13, placeholderIconY + 7);
        card.lineTo(placeholderIconX - 3, placeholderIconY - 1);
        card.lineTo(placeholderIconX + 3, placeholderIconY + 4);
        card.lineTo(placeholderIconX + 12, placeholderIconY - 6);
        card.stroke({ alpha: 0.55, color: toColor(palette.muted), width: 1.4 });
      }

      card.roundRect(0, 0, cardWidth, cardHeight, 8).stroke({
        alpha: activeBorder || hotTargetForConnection ? 1 : 0.95,
        color: activeBorder || hotTargetForConnection ? toColor(palette.accent) : toColor(palette.border),
        width: activeBorder || hotTargetForConnection ? 2 : 1,
      });

      // Remote collaborator selection ring: presence carries each user's
      // selected item id; draw their color so co-editors see who is on what.
      const remoteSelector = presenceRef.current.find((snapshot) => snapshot.selection === item.id);
      if (remoteSelector) {
        card.roundRect(-4, -4, cardWidth + 8, cardHeight + 8, 11).stroke({
          alpha: 0.85,
          color: toColor(remoteSelector.color),
          width: 2.5,
        });
      }

      for (const handle of connectionHandles) {
        handle.clear();

        if (!showConnectionHandles) {
          handle.circle(0, 0, connectionHandleHitRadius).fill({ alpha: 0.001, color: 0xffffff });
          continue;
        }

        const handleColor = sourceForConnection ? palette.accent : targetForConnection ? palette.accent : item.color;
        const alpha = sourceForConnection || targetForConnection || active ? 1 : 0.78;
        const radius =
          sourceForConnection || hotTargetForConnection ? connectionHandleRadius + 1.2 : connectionHandleRadius;

        handle.circle(0, 0, connectionHandleHitRadius).fill({ alpha: 0.001, color: toColor(handleColor) });
        handle
          .circle(0, 0, radius + 4)
          .fill({ alpha: theme === "light" ? 0.82 : 0.74, color: toColor(palette.cardMix) });
        handle.circle(0, 0, radius).fill({ alpha, color: toColor(handleColor) });
        handle.circle(0, 0, radius).stroke({ alpha: 0.9, color: toColor(palette.title), width: 1.5 });

        if (sourceForConnection || hotTargetForConnection) {
          handle.circle(0, 0, radius + 5.5).stroke({ alpha: 0.55, color: toColor(handleColor), width: 1.5 });
        }
      }
    };

    root.on("pointerover", () => {
      isHovered = true;
    });

    root.on("pointerout", () => {
      isHovered = false;
    });

    root.on("pointertap", () => {
      if (!dragStateRef.current.didMove) {
        if (canEditRoomRef.current && isConnectingRef.current) {
          startOrCompleteConnection(item.id);
        } else {
          setSelectedId(item.id);
        }
      }
    });

    root.on("pointerdown", (event) => {
      if (!canEditRoomRef.current) {
        return;
      }

      isDraggingRef.current = true;
      dragStateRef.current.draggingItem = root;
      dragStateRef.current.activeDragId = item.id;
      dragStateRef.current.didMove = false;
      dragStateRef.current.lastPointer = { x: event.global.x, y: event.global.y };
      draggingPositionsRef.current.set(item.id, { x: root.x, y: root.y });
    });

    const endDrag = () => {
      const ds = dragStateRef.current;
      if (ds.draggingItem && ds.activeDragId) {
        if (ds.didMove) {
          persistMove(ds.activeDragId, ds.draggingItem.x, ds.draggingItem.y);
        } else {
          draggingPositionsRef.current.delete(ds.activeDragId);
          lastDragBroadcastRef.current.delete(ds.activeDragId);
        }

        ds.draggingItem = null;
        ds.activeDragId = "";
        isDraggingRef.current = false;
        setRenderGeneration((g) => g + 1);
      }
    };

    root.on("pointerup", endDrag);
    root.on("pointerupoutside", endDrag);
    root.on("globalpointermove", (event) => {
      const ds = dragStateRef.current;
      if (ds.draggingItem !== root) {
        return;
      }

      const dx = (event.global.x - ds.lastPointer.x) / scene.world.scale.x;
      const dy = (event.global.y - ds.lastPointer.y) / scene.world.scale.y;

      if (Math.abs(dx) + Math.abs(dy) > 1) {
        ds.didMove = true;
      }

      root.x += dx;
      root.y += dy;
      draggingPositionsRef.current.set(ds.activeDragId, { x: root.x, y: root.y });
      if (ds.didMove && ds.activeDragId) {
        const now = Date.now();
        const lastSent = lastDragBroadcastRef.current.get(ds.activeDragId) ?? 0;

        if (now - lastSent >= dragBroadcastIntervalMs) {
          lastDragBroadcastRef.current.set(ds.activeDragId, now);
          broadcastMove(ds.activeDragId, root.x, root.y, now);
        }
      }
      ds.lastPointer = { x: event.global.x, y: event.global.y };
    });

    scene.app.ticker.add(repaint);
    itemTickersRef.current.set(item.id, [repaint]);
    scene.itemLayer.addChild(root);
    scene.itemMap.set(item.id, root);
  };
}
