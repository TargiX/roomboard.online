"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { FederatedPointerEvent } from "pixi.js";
import type { RoomConnectionSide, RoomItem } from "@/lib/canvasRoom";
import { getCardSize, type PixiScene } from "@/lib/pixiScene";
import type { LocalUser } from "@/components/room/roomTypes";

type ConnectionSide = RoomConnectionSide;

type CanvasPoint = {
  x: number;
  y: number;
};

type CanvasRect = CanvasPoint & {
  height: number;
  width: number;
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

type ConnectionHandle = {
  key: ConnectionSide;
  x: number;
  y: number;
};

export type ConnectionHandlersContext = {
  // Scene + state setters
  scene: PixiScene;
  connectionArrowHitRadius: number;
  setSelectedId: Dispatch<SetStateAction<string>>;
  setIsConnecting: Dispatch<SetStateAction<boolean>>;
  setConnectFromId: Dispatch<SetStateAction<string | null>>;

  // Refs
  connectionDraftRef: MutableRefObject<ConnectionDraft | null>;
  hoveredConnectionTargetRef: MutableRefObject<string>;
  isConnectingRef: MutableRefObject<boolean>;
  connectFromIdRef: MutableRefObject<string | null>;
  canEditRoomRef: MutableRefObject<boolean>;
  visibleItemsRef: MutableRefObject<RoomItem[]>;
  visibleConnectionsRef: MutableRefObject<
    Array<{
      id: string;
      from: string;
      to: string;
      fromSide?: ConnectionSide;
      toSide?: ConnectionSide;
    }>
  >;
  connectionPairCountsRef: MutableRefObject<Map<string, number>>;
  userRef: MutableRefObject<LocalUser | null>;

  // Callbacks
  requestProfile: () => void;
  handleCreateConnection: (
    fromId: string,
    toId: string,
    fromSide?: ConnectionSide,
    toSide?: ConnectionSide,
  ) => Promise<void>;
  handleReverseConnection: (connectionId: string) => Promise<void>;
};

export type ConnectionHandlers = {
  handleConnectionPointerMove: (event: FederatedPointerEvent) => void;
  finishConnectionDrag: (event?: FederatedPointerEvent) => void;
  handleConnectionStageTap: (event: FederatedPointerEvent) => void;
  handleConnectionKeyDown: (event: KeyboardEvent) => void;
  startConnectionDrag: (item: RoomItem, handle: ConnectionHandle, event: FederatedPointerEvent) => void;
  startOrCompleteConnection: (itemId: string) => void;
};

/**
 * Connection-drag handlers extracted from the render useEffect in CanvasRoom.
 *
 * Closes over scene geometry, refs, and the connection lifecycle callbacks
 * the parent owns (`handleCreateConnection`, `handleReverseConnection`,
 * `requestProfile`). `drawItem` consumes `startConnectionDrag` and
 * `startOrCompleteConnection` through its ctx, so the factory returns them
 * too. Event-listener wiring (and its teardown) stays in CanvasRoom because
 * it depends on the structural-change key from the render effect.
 */
export function createConnectionHandlers(ctx: ConnectionHandlersContext): ConnectionHandlers {
  const {
    scene,
    setSelectedId,
    setIsConnecting,
    setConnectFromId,
    connectionDraftRef,
    hoveredConnectionTargetRef,
    isConnectingRef,
    connectFromIdRef,
    canEditRoomRef,
    visibleItemsRef,
    visibleConnectionsRef,
    connectionPairCountsRef,
    userRef,
    requestProfile,
    handleCreateConnection,
    handleReverseConnection,
  } = ctx;

  const getCardRect = (item: RoomItem): CanvasRect => getItemCardRect(scene, item);

  const toWorldPoint = (global: CanvasPoint) => ({
    x: (global.x - scene.world.x) / scene.world.scale.x,
    y: (global.y - scene.world.y) / scene.world.scale.y,
  });

  const findConnectionTarget = (point: CanvasPoint, fromId: string) => {
    const hitSlop = 18;
    const currentItems = visibleItemsRef.current;

    for (let index = currentItems.length - 1; index >= 0; index -= 1) {
      const candidate = currentItems[index];

      if (candidate.id === fromId) {
        continue;
      }

      const rect = getCardRect(candidate);

      if (
        point.x >= rect.x - hitSlop &&
        point.x <= rect.x + rect.width + hitSlop &&
        point.y >= rect.y - hitSlop &&
        point.y <= rect.y + rect.height + hitSlop
      ) {
        return candidate.id;
      }
    }

    return "";
  };

  const findConnectionArrowTarget = (point: CanvasPoint) => {
    let closestId = "";
    let closestDistance = ctx.connectionArrowHitRadius;
    const drawnPairCounts = new Map<string, number>();

    for (const connection of visibleConnectionsRef.current) {
      const fromItem = visibleItemsRef.current.find((item) => item.id === connection.from);
      const toItem = visibleItemsRef.current.find((item) => item.id === connection.to);

      if (!fromItem || !toItem) {
        continue;
      }

      const pairKey = getConnectionPairKey(connection.from, connection.to);
      const pairIndex = drawnPairCounts.get(pairKey) ?? 0;
      const pairTotal = connectionPairCountsRef.current.get(pairKey) ?? 1;
      const route = getCardPipeRoute(
        getCardRect(fromItem),
        getCardRect(toItem),
        connection.fromSide,
        connection.toSide,
        undefined,
        undefined,
        getConnectionFanOut(pairIndex, pairTotal),
      );
      const arrowPoint = getPipeArrowHitPoint(route);
      const distance = Math.hypot(point.x - arrowPoint.x, point.y - arrowPoint.y);
      drawnPairCounts.set(pairKey, pairIndex + 1);

      if (distance <= closestDistance) {
        closestId = connection.id;
        closestDistance = distance;
      }
    }

    return closestId;
  };

  const clearConnectionState = () => {
    connectionDraftRef.current = null;
    hoveredConnectionTargetRef.current = "";
    isConnectingRef.current = false;
    connectFromIdRef.current = null;
    setIsConnecting(false);
    setConnectFromId(null);
  };

  const clearConnectionDraft = () => {
    connectionDraftRef.current = null;
    hoveredConnectionTargetRef.current = "";
  };

  const completeConnection = (fromId: string, toId: string, fromSide?: ConnectionSide, toSide?: ConnectionSide) => {
    if (!fromId || !toId || fromId === toId) {
      clearConnectionState();
      return;
    }

    void handleCreateConnection(fromId, toId, fromSide, toSide);
    setSelectedId(toId);
    clearConnectionState();
  };

  const startOrCompleteConnection = (itemId: string) => {
    if (!canEditRoomRef.current) {
      return;
    }

    if (!userRef.current?.profileComplete) {
      requestProfile();
      return;
    }

    const fromId = connectFromIdRef.current;

    if (!fromId) {
      isConnectingRef.current = true;
      connectFromIdRef.current = itemId;
      setIsConnecting(true);
      setConnectFromId(itemId);
      setSelectedId(itemId);
      return;
    }

    if (fromId === itemId) {
      clearConnectionState();
      return;
    }

    completeConnection(fromId, itemId);
  };

  const startConnectionDrag = (item: RoomItem, handle: ConnectionHandle, event: FederatedPointerEvent) => {
    if (!canEditRoomRef.current) {
      return;
    }

    if (!userRef.current?.profileComplete) {
      requestProfile();
      return;
    }

    const fromId = connectFromIdRef.current;

    if (fromId && fromId !== item.id) {
      completeConnection(fromId, item.id);
      return;
    }

    const itemRect = getCardRect(item);
    const start = {
      x: itemRect.x + handle.x,
      y: itemRect.y + handle.y,
    };

    connectionDraftRef.current = {
      dragged: false,
      fromId: item.id,
      fromSide: handle.key,
      originGlobal: { x: event.global.x, y: event.global.y },
      pointer: start,
      start,
      targetId: "",
    };
    hoveredConnectionTargetRef.current = "";
    isConnectingRef.current = true;
    connectFromIdRef.current = item.id;
    setIsConnecting(true);
    setConnectFromId(item.id);
    setSelectedId(item.id);
  };

  const handleConnectionPointerMove = (event: FederatedPointerEvent) => {
    const draft = connectionDraftRef.current;
    if (!draft) {
      return;
    }

    const point = toWorldPoint(event.global);
    const moved = Math.hypot(event.global.x - draft.originGlobal.x, event.global.y - draft.originGlobal.y);

    draft.pointer = point;

    if (moved > 4) {
      draft.dragged = true;
    }

    draft.targetId = findConnectionTarget(point, draft.fromId);
    if (draft.targetId) {
      const fromItem = visibleItemsRef.current.find((item) => item.id === draft.fromId);
      const targetItem = visibleItemsRef.current.find((item) => item.id === draft.targetId);
      draft.targetSide =
        fromItem && targetItem ? getDropTargetSide(getCardRect(fromItem), getCardRect(targetItem), point) : undefined;
    } else {
      draft.targetSide = undefined;
    }
    hoveredConnectionTargetRef.current = draft.targetId;
  };

  const finishConnectionDrag = (event?: FederatedPointerEvent) => {
    const draft = connectionDraftRef.current;
    if (!draft) {
      return;
    }

    if (event?.global) {
      const point = toWorldPoint(event.global);
      draft.pointer = point;
      draft.targetId = findConnectionTarget(point, draft.fromId);
      if (draft.targetId) {
        const fromItem = visibleItemsRef.current.find((item) => item.id === draft.fromId);
        const targetItem = visibleItemsRef.current.find((item) => item.id === draft.targetId);
        draft.targetSide =
          fromItem && targetItem ? getDropTargetSide(getCardRect(fromItem), getCardRect(targetItem), point) : undefined;
      } else {
        draft.targetSide = undefined;
      }
      hoveredConnectionTargetRef.current = draft.targetId;
    }

    if (draft.targetId) {
      const fromItem = visibleItemsRef.current.find((item) => item.id === draft.fromId);
      const targetItem = visibleItemsRef.current.find((item) => item.id === draft.targetId);
      const toSide =
        fromItem && targetItem
          ? getDropTargetSide(getCardRect(fromItem), getCardRect(targetItem), draft.pointer)
          : draft.targetSide;

      completeConnection(draft.fromId, draft.targetId, draft.fromSide, toSide);
      return;
    }

    if (draft.dragged) {
      clearConnectionState();
      return;
    }

    clearConnectionDraft();
  };

  const handleConnectionStageTap = (event: FederatedPointerEvent) => {
    if (!connectionDraftRef.current && canEditRoomRef.current) {
      const connectionId = findConnectionArrowTarget(toWorldPoint(event.global));

      if (connectionId) {
        event.stopPropagation();
        void handleReverseConnection(connectionId);
        return;
      }
    }

    if (event.target === scene.app.stage && isConnectingRef.current) {
      clearConnectionState();
    }
  };

  const handleConnectionKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && isConnectingRef.current) {
      clearConnectionState();
    }
  };

  return {
    handleConnectionPointerMove,
    finishConnectionDrag,
    handleConnectionStageTap,
    handleConnectionKeyDown,
    startConnectionDrag,
    startOrCompleteConnection,
  };
}

/**
 * Card rect lookup shared by the connection handlers and the connection
 * render loop: prefers the live container position from the scene's item map
 * so a freshly dragged card yields its rendered position, falling back to the
 * domain x/y when the card isn't on the stage yet (drag origin, draft pick).
 */
export function getItemCardRect(scene: Pick<PixiScene, "itemMap">, item: RoomItem): CanvasRect {
  const size = getCardSize(item);
  const container = scene.itemMap.get(item.id);

  return {
    height: size.height,
    width: size.width,
    x: container?.x ?? item.x,
    y: container?.y ?? item.y,
  };
}

// Pipe-routing constants consumed by the geometry helpers below. Defined at
// module scope so the geometry helpers don't need a ctx-closure dance.
const ctx_connectionHandleHitRadius = 12;
const ctx_connectionPipeOffset = 34;
const ctx_connectionPipeFanOutStep = 10;

function getRectCenter(rect: CanvasRect): CanvasPoint {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function getSideVector(side: ConnectionSide): CanvasPoint {
  if (side === "left") return { x: -1, y: 0 };
  if (side === "right") return { x: 1, y: 0 };
  if (side === "top") return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

export function getFacingSide(fromRect: CanvasRect, toRect: CanvasRect | CanvasPoint): ConnectionSide {
  const fromCenter = getRectCenter(fromRect);
  const toCenter = "width" in toRect ? getRectCenter(toRect) : toRect;
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy) * 0.82) {
    return dx >= 0 ? "right" : "left";
  }

  return dy >= 0 ? "bottom" : "top";
}

export function getSocketPoint(rect: CanvasRect, side: ConnectionSide): CanvasPoint {
  if (side === "left" || side === "right") {
    return {
      x: side === "left" ? rect.x : rect.x + rect.width,
      y: rect.y + rect.height / 2,
    };
  }

  return {
    x: rect.x + rect.width / 2,
    y: side === "top" ? rect.y : rect.y + rect.height,
  };
}

export function getNearestSocketSide(rect: CanvasRect, point: CanvasPoint): ConnectionSide {
  const sides: ConnectionSide[] = ["top", "right", "bottom", "left"];
  let nearestSide: ConnectionSide = "right";
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const side of sides) {
    const socket = getSocketPoint(rect, side);
    const distance = Math.hypot(point.x - socket.x, point.y - socket.y);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestSide = side;
    }
  }

  return nearestSide;
}

export function getDropTargetSide(fromRect: CanvasRect, toRect: CanvasRect, pointer: CanvasPoint): ConnectionSide {
  const nearestSide = getNearestSocketSide(toRect, pointer);
  const nearestSocket = getSocketPoint(toRect, nearestSide);
  const nearSocketDistance = Math.hypot(pointer.x - nearestSocket.x, pointer.y - nearestSocket.y);

  if (nearSocketDistance <= ctx_connectionHandleHitRadius * 2.4) {
    return nearestSide;
  }

  return getFacingSide(toRect, fromRect);
}

export function compactPipePoints(points: CanvasPoint[]): CanvasPoint[] {
  const next: CanvasPoint[] = [];

  for (const point of points) {
    const previous = next[next.length - 1];

    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.5) {
      next.push(point);
    }
  }

  return next;
}

export function getPointPipeRoute(
  fromRect: CanvasRect,
  toPoint: CanvasPoint,
  fromSide?: ConnectionSide,
  startOverride?: CanvasPoint,
): CanvasPoint[] {
  const sourceSide = fromSide ?? getFacingSide(fromRect, toPoint);
  const sourceVector = getSideVector(sourceSide);
  const start = startOverride ?? getSocketPoint(fromRect, sourceSide);
  const sourceOut = {
    x: start.x + sourceVector.x * ctx_connectionPipeOffset,
    y: start.y + sourceVector.y * ctx_connectionPipeOffset,
  };
  const elbow =
    sourceSide === "left" || sourceSide === "right"
      ? { x: toPoint.x, y: sourceOut.y }
      : { x: sourceOut.x, y: toPoint.y };

  return compactPipePoints([start, sourceOut, elbow, toPoint]);
}

export function getCardPipeRoute(
  fromRect: CanvasRect,
  toRect: CanvasRect,
  fromSide?: ConnectionSide,
  toSide?: ConnectionSide,
  startOverride?: CanvasPoint,
  endOverride?: CanvasPoint,
  fanOut = 0,
): CanvasPoint[] {
  const sourceSide = fromSide ?? getFacingSide(fromRect, toRect);
  const targetSide = toSide ?? getFacingSide(toRect, fromRect);
  const sourceVector = getSideVector(sourceSide);
  const targetVector = getSideVector(targetSide);
  const startPort = startOverride ?? getSocketPoint(fromRect, sourceSide);
  const endPort = endOverride ?? getSocketPoint(toRect, targetSide);
  const sourceOut = {
    x: startPort.x + sourceVector.x * ctx_connectionPipeOffset,
    y: startPort.y + sourceVector.y * ctx_connectionPipeOffset,
  };
  const targetIn = {
    x: endPort.x + targetVector.x * ctx_connectionPipeOffset,
    y: endPort.y + targetVector.y * ctx_connectionPipeOffset,
  };
  const sourceHorizontal = sourceSide === "left" || sourceSide === "right";
  const targetHorizontal = targetSide === "left" || targetSide === "right";
  const points = [startPort, sourceOut];

  if (sourceHorizontal && targetHorizontal) {
    if (Math.abs(sourceOut.y - targetIn.y) < 1 && fanOut !== 0) {
      const laneY = sourceOut.y + fanOut;
      points.push({ x: sourceOut.x, y: laneY }, { x: targetIn.x, y: laneY });
    } else {
      const midX = sourceOut.x + (targetIn.x - sourceOut.x) / 2 + fanOut;
      points.push({ x: midX, y: sourceOut.y }, { x: midX, y: targetIn.y });
    }
  } else if (!sourceHorizontal && !targetHorizontal) {
    if (Math.abs(sourceOut.x - targetIn.x) < 1 && fanOut !== 0) {
      const laneX = sourceOut.x + fanOut;
      points.push({ x: laneX, y: sourceOut.y }, { x: laneX, y: targetIn.y });
    } else {
      const midY = sourceOut.y + (targetIn.y - sourceOut.y) / 2 + fanOut;
      points.push({ x: sourceOut.x, y: midY }, { x: targetIn.x, y: midY });
    }
  } else if (sourceHorizontal) {
    const laneX = targetIn.x + fanOut;
    points.push({ x: laneX, y: sourceOut.y }, { x: laneX, y: targetIn.y });
  } else {
    const laneY = targetIn.y + fanOut;
    points.push({ x: sourceOut.x, y: laneY }, { x: targetIn.x, y: laneY });
  }

  points.push(targetIn, endPort);

  return compactPipePoints(points);
}

export function getConnectionPairKey(fromId: string, toId: string) {
  return [fromId, toId].sort().join("::");
}

export function getConnectionFanOut(index: number, total: number) {
  if (total <= 1) {
    return 0;
  }

  if (total === 2) {
    return index === 0 ? -ctx_connectionPipeFanOutStep : ctx_connectionPipeFanOutStep;
  }

  return (index - (total - 1) / 2) * ctx_connectionPipeFanOutStep;
}

type UpsertConnection = {
  from: string;
  id: string;
  to: string;
};

export function upsertUniqueConnection<T extends UpsertConnection>(connections: T[], incoming: T): T[] {
  const incomingPairKey = getConnectionPairKey(incoming.from, incoming.to);
  return [
    ...connections.filter(
      (connection) =>
        connection.id !== incoming.id && getConnectionPairKey(connection.from, connection.to) !== incomingPairKey,
    ),
    incoming,
  ];
}

function getPipeMarker(points: CanvasPoint[], distanceFromEnd = 26) {
  const end = points[points.length - 1] ?? { x: 0, y: 0 };
  let remainingDistance = distanceFromEnd;

  for (let index = points.length - 2; index >= 0; index -= 1) {
    const start = points[index];
    const segmentEnd = points[index + 1];
    const dx = segmentEnd.x - start.x;
    const dy = segmentEnd.y - start.y;
    const length = Math.hypot(dx, dy);

    if (length < 0.5) {
      continue;
    }

    const direction = {
      x: dx / length,
      y: dy / length,
    };

    if (remainingDistance <= length) {
      return {
        direction,
        point: {
          x: segmentEnd.x - direction.x * remainingDistance,
          y: segmentEnd.y - direction.y * remainingDistance,
        },
      };
    }

    remainingDistance -= length;
  }

  return {
    direction: { x: 1, y: 0 },
    point: end,
  };
}

export function getPipeArrowHitPoint(points: CanvasPoint[]) {
  return getPipeMarker(points).point;
}
