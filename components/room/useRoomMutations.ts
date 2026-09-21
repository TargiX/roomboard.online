"use client";

import { type FormEvent, type RefObject, type SetStateAction, type Dispatch } from "react";
import type {
  RoomAccess,
  RoomConnection,
  RoomItem,
  RoomItemStatus,
  RoomItemStyleVariant,
  RoomInviteRole,
  RoomPermissions,
  RoomRecap,
  RoomSnapshot,
  RoomVisibility,
} from "@/lib/canvasRoom";
import { getDecisionCompletionSignal } from "@/lib/decisionCompletion";
import { recordAuthoredFirstCard, resolveFirstCardEventName } from "@/lib/firstCardSignal";
import { buildRoomInviteMessage } from "@/lib/roomInviteMessage";
import { buildRoomPathWithHashToken, setRoomHashToken } from "@/lib/roomLinks";
import { trackProductEvent } from "@/lib/productAnalytics";
import { inviteTokensKey, ownerTokensKey, readStoredTokenMap, writeOwnerToken, writeStoredTokenMap } from "@/lib/roomTokens";
import { upsertUniqueConnection } from "@/components/room/connectionDrag";
import { getDomain, truncate } from "@/lib/pixiScene";
import type { ProductAnalyticsProperties } from "@/components/room/roomTypes";

type RouterInstance = {
  push: (href: string) => void;
};

type LocalUser = {
  profileComplete?: boolean;
  id: string;
  name: string;
  color: string;
};

type PendingProfileItem = {
  activationProperties?: ProductAnalyticsProperties;
  initialText?: { title?: string; body?: string };
  size?: { width: number; height: number };
  type: "image" | "note";
  url?: string;
};

type ConnectionSide = NonNullable<RoomConnection["fromSide"]>;

type RoomMutationResponse = {
  error?: string;
  kind?: "comments" | "connections" | "decisionSignalsPerItem" | "items";
  limit?: number;
};

type LaunchStarterCopy = {
  body: string;
  invitePrompt: string;
  label: string;
  ownerNote: string;
  readyLabel: string;
  title: string;
};

type SampleStarter = "landing-review" | "moodboard" | "visual-decision";

type BoardEvent =
  | {
      type: "item:created";
      item: RoomItem;
    }
  | {
      type: "item:updated";
      item: RoomItem;
    }
  | {
      type: "item:moved";
      item: RoomItem;
    }
  | {
      type: "item:deleted";
      itemId: string;
    }
  | {
      type: "comment:created";
      comment: RoomItem["comments"][number];
      itemId: string;
    }
  | {
      type: "connection:created";
      connection: RoomConnection;
    }
  | {
      type: "connection:deleted";
      connectionId: string;
    }
  | {
      type: "room:updated";
      room: RoomSnapshot["room"];
    }
  | {
      type: "room:closed";
      room?: RoomSnapshot["room"];
    };

const SUPPORTED_UPLOAD_TYPES: ReadonlyArray<string> = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function getRoomCapacityCopy(data: RoomMutationResponse) {
  if (!data.kind || !data.limit) return "This room has reached its current private-beta capacity.";
  if (data.kind === "items")
    return `This room has reached its ${data.limit}-card limit. Delete an unused card before adding another.`;
  if (data.kind === "comments")
    return `This room has reached its ${data.limit}-comment limit. Start a fresh decision room for the next review.`;
  if (data.kind === "connections")
    return `This room has reached its ${data.limit}-connection limit. Remove an unused link before adding another.`;
  return `This card has reached its ${data.limit}-participant decision-signal limit.`;
}

async function copyTextToClipboard(text: string) {
  if (!navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function getFileSizeBucket(size: number) {
  if (size < 250_000) return "under_250kb";
  if (size < 1_000_000) return "under_1mb";
  if (size < 5_000_000) return "under_5mb";
  return "over_5mb";
}

function getSafeImageType(type: string) {
  if (type === "image/jpeg") return "jpeg";
  if (type === "image/png") return "png";
  if (type === "image/gif") return "gif";
  if (type === "image/webp") return "webp";
  if (type.startsWith("image/")) return "other_image";
  return "other";
}

function getUploadFailureCopy(status: number, error?: string) {
  if (status === 403) {
    return "Editor access is required to upload images. Open an editor invite or ask the creator for a fresh link.";
  }

  if (status === 429) {
    return "Too many uploads in a short time. Wait a little and try again.";
  }

  return error || "Upload failed. Try a PNG, JPG, GIF, or WebP image under 10MB.";
}

const IMAGE_CARD_CHROME_HEIGHT = 144;
const IMAGE_CARD_PADDING_X = 32;
const MIN_IMAGE_FRAME_WIDTH = 220;
const MAX_IMAGE_FRAME_WIDTH = 420;
const MAX_IMAGE_FRAME_HEIGHT = 320;
const MIN_IMAGE_FRAME_HEIGHT = 120;

function getImageCardSize(width?: number, height?: number) {
  if (!width || !height || width <= 0 || height <= 0) {
    return { width: 268, height: 220 };
  }

  const aspectRatio = Math.min(3.2, Math.max(0.35, width / height));
  let frameWidth = Math.min(MAX_IMAGE_FRAME_WIDTH, Math.max(MIN_IMAGE_FRAME_WIDTH, width));
  let frameHeight = frameWidth / aspectRatio;

  if (frameHeight > MAX_IMAGE_FRAME_HEIGHT) {
    frameHeight = MAX_IMAGE_FRAME_HEIGHT;
    frameWidth = frameHeight * aspectRatio;
  }

  if (frameHeight < MIN_IMAGE_FRAME_HEIGHT) {
    frameHeight = MIN_IMAGE_FRAME_HEIGHT;
    frameWidth = frameHeight * aspectRatio;
  }

  frameWidth = Math.min(MAX_IMAGE_FRAME_WIDTH, Math.max(MIN_IMAGE_FRAME_WIDTH, frameWidth));

  return {
    width: Math.round(frameWidth + IMAGE_CARD_PADDING_X),
    height: Math.round(frameHeight + IMAGE_CARD_CHROME_HEIGHT),
  };
}

function getImageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();

    if (/^https?:\/\//.test(src)) {
      image.crossOrigin = "anonymous";
    }

    image.onload = () =>
      resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    image.onerror = () => reject(new Error("Image dimensions could not be read."));
    image.src = src;
  });
}

type UseRoomMutationsOptions = {
  activities: RoomSnapshot["activities"];
  authoredFirstCardRef: RefObject<boolean>;
  canEditRoom: boolean;
  canManageRoom: boolean;
  comment: string;
  connections: RoomConnection[];
  displayRoomName: string;
  draftBody: string;
  draftStatus: RoomItemStatus;
  draftTitle: string;
  imageUrl: string;
  inviteToken: string;
  inviteTokens: Partial<Record<RoomInviteRole, string>>;
  isCreatingFirstDecisionNoteRef: RefObject<boolean>;
  isSnapshotPublic: boolean;
  isStartingSampleRoom: boolean;
  isTogglingSnapshot: boolean;
  items: RoomItem[];
  launchStarter: string;
  launchStarterCopy: Record<string, LaunchStarterCopy>;
  ownerToken: string;
  permissions: RoomPermissions;
  publishBoardEvent: (event: BoardEvent) => void;
  refreshRoomSnapshot: () => Promise<string | null>;
  requestProfile: () => void;
  roomAccess: RoomAccess;
  roomApi: string;
  roomCredentialsHeaders: Record<string, string>;
  roomId: string;
  roomUploadMaxBytes: number;
  router: RouterInstance;
  sampleStarterByRoomId: Record<string, SampleStarter>;
  sampleStarterRoomNames: Record<SampleStarter, string>;
  selected: RoomItem | null;
  selectedId: string;
  setBoardActionError: (value: string) => void;
  setComment: Dispatch<SetStateAction<string>>;
  setConnections: Dispatch<SetStateAction<RoomConnection[]>>;
  setControlError: (value: string) => void;
  setCopiedInviteMessage: Dispatch<SetStateAction<boolean>>;
  setCopiedRecap: Dispatch<SetStateAction<boolean>>;
  setCopiedLaunchLinks: Dispatch<SetStateAction<Partial<Record<"owner" | RoomInviteRole, boolean>>>>;
  setCopiedShare: Dispatch<SetStateAction<"current" | "owner" | RoomInviteRole | "">>;
  setCopiedSnapshotLink: Dispatch<SetStateAction<boolean>>;
  setCopyError: (value: string) => void;
  setDraftStatus: Dispatch<SetStateAction<RoomItemStatus>>;
  setIsClosingRoom: Dispatch<SetStateAction<boolean>>;
  setIsConfirmingPermanentDelete: Dispatch<SetStateAction<boolean>>;
  setIsCreatingFirstDecisionNote: Dispatch<SetStateAction<boolean>>;
  setIsDeletingRoom: Dispatch<SetStateAction<boolean>>;
  setIsRecapLoading: Dispatch<SetStateAction<boolean>>;
  setIsSnapshotPublic: Dispatch<SetStateAction<boolean>>;
  setIsStartingSampleRoom: Dispatch<SetStateAction<boolean>>;
  setIsTogglingAccess: Dispatch<SetStateAction<boolean>>;
  setIsTogglingSnapshot: Dispatch<SetStateAction<boolean>>;
  setItems: Dispatch<SetStateAction<RoomItem[]>>;
  setPendingProfileComment: Dispatch<SetStateAction<{ body: string; itemId: string } | null>>;
  setPendingProfileConnection: Dispatch<
    SetStateAction<{
      fromId: string;
      fromSide?: ConnectionSide;
      toId: string;
      toSide?: ConnectionSide;
    } | null>
  >;
  setPendingProfileItem: Dispatch<SetStateAction<PendingProfileItem | null>>;
  setPendingProfileStatus: Dispatch<SetStateAction<{ itemId: string; status: RoomItemStatus } | null>>;
  setPendingProfileUpload: Dispatch<SetStateAction<File | null>>;
  setRoomAccessState: Dispatch<SetStateAction<RoomAccess>>;
  setRoomRecap: Dispatch<SetStateAction<RoomRecap | null>>;
  setShowCloseModal: Dispatch<SetStateAction<boolean>>;
  setShowLaunchGuideBackupReminder: Dispatch<SetStateAction<boolean>>;
  setShowLockModal: Dispatch<SetStateAction<boolean>>;
  setSelectedId: Dispatch<SetStateAction<string>>;
  setUploadError: (value: string) => void;
  trackRoomActivationEvent: (name: string, properties?: ProductAnalyticsProperties) => void;
  user: LocalUser | null;
  userRef: RefObject<LocalUser | null>;
};

/**
 * Owns every board mutation that talks to the room API: create/update/duplicate
 * cards, comments, decisions, connections, room settings, recap fetching, and
 * the invite/snapshot copy actions. Extracted from CanvasRoom so the component
 * only orchestrates state, Pixi wiring, and rendering.
 *
 * Returns the same function names the JSX already calls — keep call sites in
 * place when you move things in or out.
 */
export function useRoomMutations({
  activities,
  authoredFirstCardRef,
  canEditRoom,
  canManageRoom,
  comment,
  connections,
  displayRoomName,
  draftBody,
  draftStatus,
  draftTitle,
  imageUrl,
  inviteToken,
  inviteTokens,
  isCreatingFirstDecisionNoteRef,
  isSnapshotPublic,
  isStartingSampleRoom,
  isTogglingSnapshot,
  items,
  launchStarter,
  launchStarterCopy,
  ownerToken,
  permissions,
  publishBoardEvent,
  refreshRoomSnapshot,
  requestProfile,
  roomAccess,
  roomApi,
  roomCredentialsHeaders,
  roomId,
  roomUploadMaxBytes,
  router,
  sampleStarterByRoomId,
  sampleStarterRoomNames,
  selected,
  selectedId,
  setBoardActionError,
  setComment,
  setConnections,
  setControlError,
  setCopiedInviteMessage,
  setCopiedRecap,
  setCopiedLaunchLinks,
  setCopiedShare,
  setCopiedSnapshotLink,
  setCopyError,
  setDraftStatus,
  setIsClosingRoom,
  setIsConfirmingPermanentDelete,
  setIsCreatingFirstDecisionNote,
  setIsDeletingRoom,
  setIsRecapLoading,
  setIsSnapshotPublic,
  setIsStartingSampleRoom,
  setIsTogglingAccess,
  setIsTogglingSnapshot,
  setItems,
  setPendingProfileComment,
  setPendingProfileConnection,
  setPendingProfileItem,
  setPendingProfileStatus,
  setPendingProfileUpload,
  setRoomAccessState,
  setRoomRecap,
  setShowCloseModal,
  setShowLaunchGuideBackupReminder,
  setShowLockModal,
  setSelectedId,
  setUploadError,
  trackRoomActivationEvent,
  user,
  userRef,
}: UseRoomMutationsOptions) {
  const getPublicSnapshotUrl = () => {
    const url = new URL(window.location.href);
    url.pathname = `/rooms/${roomId}/snapshot`;
    url.search = "";
    url.hash = "";
    return url.toString();
  };

  const getRoomShareUrl = (kind: "current" | "owner" | RoomInviteRole) => {
    const url = new URL(window.location.href);
    url.pathname = `/rooms/${roomId}`;
    url.search = "";

    if (kind === "owner") {
      if (!ownerToken) {
        return null;
      }

      setRoomHashToken(url, "ownerToken", ownerToken);
    } else if (kind !== "current") {
      const token = inviteTokens[kind];

      if (!token) {
        return null;
      }

      setRoomHashToken(url, "invite", token);
    } else if (inviteToken) {
      setRoomHashToken(url, "invite", inviteToken);
    } else if (permissions.role === "owner" && inviteTokens.editor) {
      setRoomHashToken(url, "invite", inviteTokens.editor);
    }

    return url.toString();
  };

  const createItem = async (
    type: "image" | "note",
    url?: string,
    size?: { width: number; height: number },
    initialText?: { title?: string; body?: string },
    activationProperties: ProductAnalyticsProperties = {},
  ) => {
    if (!canEditRoom) {
      return;
    }

    if (!user?.profileComplete) {
      setPendingProfileItem({ activationProperties, initialText, size, type, url });
      requestProfile();
      return;
    }

    setBoardActionError("");

    let response: Response;
    let data: RoomMutationResponse & { item?: RoomItem };

    try {
      response = await fetch(roomApi, {
        body: JSON.stringify({
          action: "item",
          author: user.name,
          body: initialText?.body ?? (type === "image" ? "Review thread ready - source saved." : "New note"),
          color: user.color,
          height: size?.height,
          imageUrl: url,
          title: initialText?.title ?? (type === "image" ? "Visual reference" : "Untitled note"),
          type,
          width: size?.width,
        }),
        headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
        method: "POST",
      });
      data = (await response.json()) as RoomMutationResponse & { item?: RoomItem };
    } catch {
      setBoardActionError("Roomboard could not add the card. Try again in a moment.");
      trackRoomActivationEvent("Room Board Action Failed", { action: "create_card", reason: "request_error" });
      return;
    }

    if (data.item) {
      // Seeded starters open with six cards, so "is the board empty" would have
      // meant this visitor could never register their first card on two of the
      // three campaign routes.
      const eventName = resolveFirstCardEventName(roomId, authoredFirstCardRef.current);
      if (eventName === "Room First Card Created") {
        authoredFirstCardRef.current = true;
        recordAuthoredFirstCard(roomId);
      }
      trackRoomActivationEvent(eventName, {
        ...activationProperties,
        cardType: type,
        itemCount: items.length + 1,
      });
      setItems((current) => {
        const next = new Map(current.map((item) => [item.id, item]));
        next.set(data.item!.id, data.item!);
        return Array.from(next.values()).sort((a, b) => a.createdAt - b.createdAt);
      });
      setSelectedId(data.item.id);
      publishBoardEvent({ type: "item:created", item: data.item });
      void refreshRoomSnapshot();
      return;
    }

    setBoardActionError(
      response.status === 403
        ? "Editor access is required to add cards. Open an editor invite or ask the creator for a fresh link."
        : response.status === 409
          ? getRoomCapacityCopy(data)
          : "Roomboard could not add the card. Try again in a moment.",
    );
    trackRoomActivationEvent("Room Board Action Failed", { action: "create_card", status: response.status });
  };

  const createFirstDecisionNote = async (
    source: "empty_room" | "launch_guide" | "decision_checkpoint" = "launch_guide",
  ) => {
    if (isCreatingFirstDecisionNoteRef.current) {
      return;
    }

    isCreatingFirstDecisionNoteRef.current = true;
    setIsCreatingFirstDecisionNote(true);

    try {
      await createItem(
        "note",
        undefined,
        undefined,
        {
          body: "What decision should this room help make? Drop the mockup, image, link, or idea people should react to.",
          title: "Decision question",
        },
        {
          preset: "decision_question",
          source,
          starter: launchStarter || "blank",
        },
      );
    } finally {
      isCreatingFirstDecisionNoteRef.current = false;
      setIsCreatingFirstDecisionNote(false);
    }
  };

  const createImageFromFile = async (file: File) => {
    if (!canEditRoom) {
      return;
    }

    setUploadError("");

    if (!file.type.startsWith("image/")) {
      setUploadError("Upload a PNG, JPG, GIF, or WebP image.");
      trackRoomActivationEvent("Room Upload Rejected", {
        reason: "not_image",
      });
      return;
    }

    if (!SUPPORTED_UPLOAD_TYPES.includes(file.type)) {
      setUploadError("Roomboard supports PNG, JPG, GIF, and WebP uploads.");
      trackRoomActivationEvent("Room Upload Rejected", {
        fileType: getSafeImageType(file.type),
        reason: "unsupported_type",
      });
      return;
    }

    if (file.size > roomUploadMaxBytes) {
      setUploadError("Images must be smaller than 10MB.");
      trackRoomActivationEvent("Room Upload Rejected", {
        fileSizeBucket: getFileSizeBucket(file.size),
        reason: "too_large",
      });
      return;
    }

    if (!user?.profileComplete) {
      setPendingProfileUpload(file);
      trackRoomActivationEvent("Room Upload Profile Required", {
        fileSizeBucket: getFileSizeBucket(file.size),
        fileType: getSafeImageType(file.type),
      });
      requestProfile();
      return;
    }

    trackRoomActivationEvent("Room Upload Started", {
      fileSizeBucket: getFileSizeBucket(file.size),
      fileType: getSafeImageType(file.type),
    });

    const localPreviewUrl = URL.createObjectURL(file);
    const imageSize = await getImageDimensions(localPreviewUrl)
      .then((dimensions) => getImageCardSize(dimensions.width, dimensions.height))
      .catch(() => getImageCardSize())
      .finally(() => URL.revokeObjectURL(localPreviewUrl));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("roomId", roomId);
    if (inviteToken) formData.append("inviteToken", inviteToken);
    if (ownerToken) formData.append("ownerToken", ownerToken);

    let response: Response;
    let data: { error?: string; mode?: string; url?: string };

    try {
      response = await fetch("/api/uploads", {
        body: formData,
        method: "POST",
      });
      data = (await response.json()) as { error?: string; mode?: string; url?: string };
    } catch {
      setUploadError("Roomboard could not reach the upload service. Try again in a moment.");
      trackRoomActivationEvent("Room Upload Failed", {
        reason: "request_error",
      });
      return;
    }

    if (data.url) {
      setUploadError("");
      trackRoomActivationEvent("Room Upload Completed", {
        mode: data.mode === "supabase" ? "supabase" : "local",
      });
      const fileTitle = file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]+/g, " ")
        .trim();
      await createItem(
        "image",
        data.url,
        imageSize,
        {
          body: "Review thread ready - source saved.",
          title: fileTitle ? truncate(fileTitle, 64) : "Uploaded visual reference",
        },
        {
          cardSource: "upload",
        },
      );
      return;
    }

    setUploadError(getUploadFailureCopy(response.status, data.error));
    trackRoomActivationEvent("Room Upload Failed", {
      status: response.status,
    });
  };

  const createImageFromUrl = async (url: string) => {
    if (!canEditRoom) {
      return;
    }

    const trimmedUrl = url.trim();
    const imageSize = await getImageDimensions(trimmedUrl)
      .then((dimensions) => getImageCardSize(dimensions.width, dimensions.height))
      .catch(() => getImageCardSize());

    const domain = getDomain(trimmedUrl);
    await createItem(
      "image",
      trimmedUrl,
      imageSize,
      {
        body: "Review thread ready - source saved.",
        title: domain === "Link" ? "Linked visual reference" : `Reference from ${domain}`,
      },
      {
        cardSource: "url",
      },
    );
  };

  const saveSelected = async () => {
    if (!selected || !canEditRoom) {
      return;
    }

    const nextImageSize =
      selected.type === "image" && imageUrl.trim() && imageUrl.trim() !== (selected.imageUrl ?? "")
        ? await getImageDimensions(imageUrl.trim())
            .then((dimensions) => getImageCardSize(dimensions.width, dimensions.height))
            .catch(() => undefined)
        : undefined;

    setBoardActionError("");

    let response: Response;
    let data: { item?: RoomItem };

    try {
      response = await fetch(roomApi, {
        body: JSON.stringify({
          body: draftBody,
          author: user?.name,
          height: nextImageSize?.height,
          id: selected.id,
          imageUrl,
          status: draftStatus,
          title: draftTitle,
          width: nextImageSize?.width,
        }),
        headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
        method: "PATCH",
      });
      data = (await response.json()) as { item?: RoomItem };
    } catch {
      setBoardActionError("Roomboard could not save the card. Try again in a moment.");
      trackRoomActivationEvent("Room Board Action Failed", { action: "save_card", reason: "request_error" });
      return;
    }

    if (data.item) {
      setBoardActionError("");
      setItems((current) => current.map((item) => (item.id === data.item!.id ? data.item! : item)));
      publishBoardEvent({ type: "item:updated", item: data.item });
      void refreshRoomSnapshot();
      return;
    }

    setBoardActionError(
      response.status === 403
        ? "Editor access is required to save cards. Open an editor invite or ask the creator for a fresh link."
        : "Roomboard could not save the card. Try again in a moment.",
    );
    trackRoomActivationEvent("Room Board Action Failed", { action: "save_card", status: response.status });
  };

  const updateItemStatus = async (itemId: string, status: RoomItemStatus) => {
    const currentUser = user;

    if (!itemId || !canEditRoom) {
      return;
    }

    setDraftStatus(status);

    if (!currentUser?.profileComplete) {
      setPendingProfileStatus({ itemId, status });
      requestProfile();
      return;
    }

    setBoardActionError("");

    let response: Response;
    let data: { item?: RoomItem };

    try {
      response = await fetch(roomApi, {
        body: JSON.stringify({
          author: currentUser.name,
          id: itemId,
          status,
        }),
        headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
        method: "PATCH",
      });
      data = (await response.json()) as { item?: RoomItem };
    } catch {
      setBoardActionError("Roomboard could not change the card status. Try again in a moment.");
      trackRoomActivationEvent("Room Board Action Failed", { action: "status", reason: "request_error" });
      return;
    }

    if (data.item) {
      trackRoomActivationEvent("Room Card Status Changed", { status });
      setItems((current) => current.map((item) => (item.id === data.item!.id ? data.item! : item)));
      publishBoardEvent({ type: "item:updated", item: data.item });
      void refreshRoomSnapshot();
      return;
    }

    setBoardActionError(
      response.status === 403
        ? "Editor access is required to change status. Open an editor invite or ask the creator for a fresh link."
        : "Roomboard could not change the card status. Try again in a moment.",
    );
    trackRoomActivationEvent("Room Board Action Failed", { action: "status", status: response.status });
  };

  const updateSelectedStatus = async (status: RoomItemStatus) => {
    if (!selected) {
      return;
    }

    await updateItemStatus(selected.id, status);
  };

  const addCommentToItem = async (itemId: string, body: string) => {
    const trimmedBody = body.trim();
    const currentUser = user;

    if (!itemId || !canEditRoom || trimmedBody.length === 0) {
      return;
    }

    if (!currentUser?.profileComplete) {
      setPendingProfileComment({ body: trimmedBody, itemId });
      requestProfile();
      return;
    }

    const targetItem = items.find((item) => item.id === itemId);
    setBoardActionError("");

    let response: Response;
    let data: RoomMutationResponse & { comment?: RoomItem["comments"][number] };

    try {
      response = await fetch(roomApi, {
        body: JSON.stringify({
          action: "comment",
          author: currentUser.name,
          body: trimmedBody,
          color: currentUser.color,
          itemId,
        }),
        headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
        method: "POST",
      });
      data = (await response.json()) as RoomMutationResponse & { comment?: RoomItem["comments"][number] };
    } catch {
      setBoardActionError("Roomboard could not add the comment. Try again in a moment.");
      trackRoomActivationEvent("Room Board Action Failed", { action: "comment", reason: "request_error" });
      return;
    }

    if (data.comment) {
      trackRoomActivationEvent("Room Comment Created", {
        commentCount: (targetItem?.comments.length ?? 0) + 1,
        itemStatus: targetItem?.status ?? "open",
      });
      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                comments: item.comments.some((entry) => entry.id === data.comment!.id)
                  ? item.comments
                  : [...item.comments, data.comment!],
                updatedAt: Math.max(item.updatedAt, data.comment!.createdAt),
              }
            : item,
        ),
      );
      publishBoardEvent({ type: "comment:created", comment: data.comment, itemId });
      void refreshRoomSnapshot();
      if (selectedId === itemId) {
        setComment("");
      }
      return;
    }

    setBoardActionError(
      response.status === 403
        ? "Editor access is required to comment. Open an editor invite or ask the creator for a fresh link."
        : response.status === 409
          ? getRoomCapacityCopy(data)
          : "Roomboard could not add the comment. Try again in a moment.",
    );
    trackRoomActivationEvent("Room Board Action Failed", { action: "comment", status: response.status });
  };

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selected) {
      return;
    }

    await addCommentToItem(selected.id, comment);
  };

  const toggleDecisionSignal = async (item: RoomItem) => {
    const currentUser = user;
    if (!canEditRoom) return;
    if (!currentUser?.profileComplete) {
      requestProfile();
      return;
    }

    setBoardActionError("");
    try {
      const response = await fetch(roomApi, {
        body: JSON.stringify({
          action: "decision-signal",
          author: currentUser.name,
          color: currentUser.color,
          itemId: item.id,
          voterId: currentUser.id,
        }),
        headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
        method: "POST",
      });
      const data = (await response.json()) as RoomMutationResponse & { item?: RoomItem };
      if (!data.item) {
        setBoardActionError(
          response.status === 403
            ? "Editor access is required to back a decision. Open an editor invite or ask the creator for a fresh link."
            : response.status === 409
              ? getRoomCapacityCopy(data)
              : "Roomboard could not update that decision signal. Try again in a moment.",
        );
        return;
      }
      setItems((current) => current.map((entry) => (entry.id === data.item!.id ? data.item! : entry)));
      publishBoardEvent({ type: "item:updated", item: data.item });
      void refreshRoomSnapshot();
    } catch {
      setBoardActionError("Roomboard could not update that decision signal. Try again in a moment.");
    }
  };

  const handleCreateConnection = async (
    fromId: string,
    toId: string,
    fromSide?: ConnectionSide,
    toSide?: ConnectionSide,
  ) => {
    if (!canEditRoom) {
      return;
    }

    const currentUser = userRef.current;

    if (!currentUser?.profileComplete) {
      setPendingProfileConnection({ fromId, fromSide, toId, toSide });
      requestProfile();
      return;
    }

    setBoardActionError("");

    let response: Response;
    let data: RoomMutationResponse & { connection?: RoomConnection };

    try {
      response = await fetch(roomApi, {
        body: JSON.stringify({
          action: "connection",
          author: currentUser.name,
          from: fromId,
          fromSide,
          to: toId,
          toSide,
          color: currentUser.color || "#48a7ff",
        }),
        headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
        method: "POST",
      });
      data = (await response.json()) as RoomMutationResponse & { connection?: RoomConnection };
    } catch {
      setBoardActionError("Roomboard could not connect those cards. Try again in a moment.");
      trackRoomActivationEvent("Room Board Action Failed", { action: "connection", reason: "request_error" });
      return;
    }

    if (data.connection) {
      trackRoomActivationEvent("Room Connection Created", {
        connectionCount: connections.length + 1,
      });
      setConnections((current) => upsertUniqueConnection(current, data.connection!));
      publishBoardEvent({ type: "connection:created", connection: data.connection });
      void refreshRoomSnapshot();
      return;
    }

    setBoardActionError(
      response.status === 403
        ? "Editor access is required to connect cards. Open an editor invite or ask the creator for a fresh link."
        : response.status === 409
          ? getRoomCapacityCopy(data)
          : "Roomboard could not connect those cards. Try again in a moment.",
    );
    trackRoomActivationEvent("Room Board Action Failed", { action: "connection", status: response.status });
  };

  const handleReverseConnection = async (connId: string) => {
    if (!canEditRoom) {
      return;
    }

    const response = await fetch(roomApi, {
      body: JSON.stringify({
        action: "reverse-connection",
        author: userRef.current?.name,
        connectionId: connId,
      }),
      headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
      method: "POST",
    });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { connection?: RoomConnection };

    if (data.connection) {
      setConnections((current) => upsertUniqueConnection(current, data.connection!));
      publishBoardEvent({ type: "connection:created", connection: data.connection });
      void refreshRoomSnapshot();
    }
  };

  const handleDeleteConnection = async (connId: string) => {
    if (!canEditRoom) {
      return;
    }

    const response = await fetch(roomApi, {
      body: JSON.stringify({
        action: "delete-connection",
        author: user?.name,
        connectionId: connId,
      }),
      headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
      method: "POST",
    });
    const data = (await response.json()) as { ok?: boolean };

    if (data.ok) {
      setConnections((current) => current.filter((connection) => connection.id !== connId));
      publishBoardEvent({ type: "connection:deleted", connectionId: connId });
      void refreshRoomSnapshot();
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!itemId || !canEditRoom) return;

    const response = await fetch(roomApi, {
      body: JSON.stringify({
        action: "delete-item",
        author: user?.name,
        id: itemId,
      }),
      headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
      method: "POST",
    });
    const data = (await response.json()) as { ok?: boolean };

    if (data.ok) {
      setItems((current) => current.filter((item) => item.id !== itemId));
      setConnections((current) =>
        current.filter((connection) => connection.from !== itemId && connection.to !== itemId),
      );
      publishBoardEvent({ type: "item:deleted", itemId });
      void refreshRoomSnapshot();
    }

    if (selectedId === itemId) {
      setSelectedId("");
    }
  };

  const handleDuplicateItem = async (itemId: string) => {
    if (!itemId || !canEditRoom) return;

    setBoardActionError("");

    try {
      const response = await fetch(roomApi, {
        body: JSON.stringify({
          action: "duplicate-item",
          author: user?.name,
          id: itemId,
        }),
        headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
        method: "POST",
      });
      const data = (await response.json()) as RoomMutationResponse & { item?: RoomItem };

      if (!data.item) {
        setBoardActionError(
          response.status === 403
            ? "Editor access is required to duplicate cards."
            : response.status === 409
              ? getRoomCapacityCopy(data)
              : "Roomboard could not duplicate the card. Try again in a moment.",
        );
        trackRoomActivationEvent("Room Board Action Failed", { action: "duplicate_card", status: response.status });
        return;
      }

      setItems((current) => [...current, data.item!].sort((a, b) => a.createdAt - b.createdAt));
      setSelectedId(data.item.id);
      publishBoardEvent({ type: "item:created", item: data.item });
      trackRoomActivationEvent("Room Card Duplicated", { cardType: data.item.type, itemCount: items.length + 1 });
      void refreshRoomSnapshot();
    } catch {
      setBoardActionError("Roomboard could not duplicate the card. Try again in a moment.");
      trackRoomActivationEvent("Room Board Action Failed", { action: "duplicate_card", reason: "request_error" });
    }
  };

  const patchItem = async (input: { color?: string; id: string; styleVariant?: RoomItemStyleVariant }) => {
    const response = await fetch(roomApi, {
      body: JSON.stringify({ author: user?.name, ...input }),
      headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
      method: "PATCH",
    });
    const data = (await response.json()) as { item?: RoomItem };

    if (data.item) {
      setItems((current) => current.map((item) => (item.id === data.item!.id ? data.item! : item)));
      publishBoardEvent({ type: "item:updated", item: data.item });
      void refreshRoomSnapshot();
    }
  };

  const toggleRoomAccess = async () => {
    if (!canManageRoom) {
      return;
    }

    setIsTogglingAccess(true);
    setControlError("");

    try {
      const nextAccess: RoomAccess = roomAccess === "locked" ? "link" : "locked";
      const response = await fetch(roomApi, {
        body: JSON.stringify({ action: "access", access: nextAccess }),
        headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
        method: "PATCH",
      });

      if (response.ok) {
        setRoomAccessState(nextAccess);
        const data = (await response.json()) as { room?: RoomSnapshot["room"] };

        if (data.room) {
          publishBoardEvent({ type: "room:updated", room: data.room });
          void refreshRoomSnapshot();
        }
      } else {
        setControlError(
          response.status === 403
            ? "Only the room creator can change access. Open the owner backup link if this is your room."
            : "Roomboard could not change room access. Try again in a moment.",
        );
        trackRoomActivationEvent("Room Access Change Failed", {
          status: response.status,
        });
      }
    } catch {
      setControlError("Roomboard could not reach the room service. Try again in a moment.");
      trackRoomActivationEvent("Room Access Change Failed", {
        reason: "request_error",
      });
    } finally {
      setIsTogglingAccess(false);
      setShowLockModal(false);
    }
  };

  const copyPublicSnapshotLink = async () => {
    setCopyError("");
    if (!(await copyTextToClipboard(getPublicSnapshotUrl()))) {
      setCopyError("Roomboard could not copy the public snapshot link. Try again or use your browser share menu.");
      return;
    }

    setCopiedSnapshotLink(true);
    window.setTimeout(() => setCopiedSnapshotLink(false), 1400);
  };

  const togglePublicSnapshot = async () => {
    if (!canManageRoom || isTogglingSnapshot) {
      return;
    }

    const nextIsSnapshotPublic = !isSnapshotPublic;
    setIsTogglingSnapshot(true);
    setControlError("");

    try {
      const response = await fetch(roomApi, {
        body: JSON.stringify({ action: "snapshot", isSnapshotPublic: nextIsSnapshotPublic }),
        headers: { "Content-Type": "application/json", ...roomCredentialsHeaders },
        method: "PATCH",
      });

      if (!response.ok) {
        setControlError(
          response.status === 403
            ? "Only the room creator can share or stop sharing a public snapshot. Open the owner backup link if this is your room."
            : "Roomboard could not update public snapshot sharing. Try again in a moment.",
        );
        return;
      }

      const data = (await response.json()) as { room?: RoomSnapshot["room"] };
      setIsSnapshotPublic(nextIsSnapshotPublic);
      if (data.room) {
        publishBoardEvent({ type: "room:updated", room: data.room });
        void refreshRoomSnapshot();
      }

      trackProductEvent(nextIsSnapshotPublic ? "Room Snapshot Shared" : "Room Snapshot Sharing Stopped", {
        role: permissions.role,
      });
      if (nextIsSnapshotPublic) {
        await copyPublicSnapshotLink();
      }
    } catch {
      setControlError("Roomboard could not reach the room service. Try again in a moment.");
    } finally {
      setIsTogglingSnapshot(false);
    }
  };

  const closeRoom = async () => {
    if (!canManageRoom) {
      return;
    }

    setIsClosingRoom(true);
    setControlError("");

    try {
      const response = await fetch(roomApi, { headers: roomCredentialsHeaders, method: "DELETE" });

      if (response.ok || response.status === 404) {
        if (response.ok) {
          const data = (await response.json()) as { room?: RoomSnapshot["room"] };
          publishBoardEvent({ type: "room:closed", room: data.room });

          const completion = getDecisionCompletionSignal({
            activities,
            currentActor: user?.name ?? "",
            items: items.map((item) => ({
              commentCount: item.comments.length,
              decisionSignalCount: item.decisionSignals?.length ?? 0,
              status: item.status,
            })),
          });
          const completionProperties = {
            ...completion,
            role: permissions.role,
            starter: launchStarter || "unknown",
          };
          trackProductEvent("Room Decision Closed", completionProperties);
          if (completion.qualifiesAsCollaborativeDecision) {
            trackProductEvent("Collaborative Decision Completed", completionProperties);
          }
        }

        router.push("/rooms");
      } else {
        setControlError(
          response.status === 403
            ? "Only the room creator can close this room. Open the owner backup link if this is your room."
            : "Roomboard could not close the room. Try again in a moment.",
        );
        trackRoomActivationEvent("Room Close Failed", {
          status: response.status,
        });
      }
    } catch {
      setControlError("Roomboard could not reach the room service. Try again in a moment.");
      trackRoomActivationEvent("Room Close Failed", {
        reason: "request_error",
      });
    } finally {
      setIsClosingRoom(false);
      setShowCloseModal(false);
    }
  };

  const deleteRoomPermanently = async () => {
    if (!canManageRoom) {
      return;
    }

    setIsDeletingRoom(true);
    setControlError("");

    try {
      const response = await fetch(`${roomApi}?permanent=true`, {
        headers: roomCredentialsHeaders,
        method: "DELETE",
      });

      if (response.ok || response.status === 404) {
        for (const storageKey of [ownerTokensKey, inviteTokensKey]) {
          const tokens = readStoredTokenMap(storageKey);
          delete tokens[roomId];
          writeStoredTokenMap(storageKey, tokens);
        }
        trackProductEvent("Room Permanently Deleted", { source: "room_surface" });
        router.push("/rooms");
      } else {
        setControlError(
          response.status === 403
            ? "Only the room creator can permanently delete this room. Open the owner backup link if this is your room."
            : "Roomboard could not confirm complete deletion. Retry, or contact support before sharing the room again.",
        );
        trackRoomActivationEvent("Room Permanent Delete Failed", { status: response.status });
      }
    } catch {
      setControlError(
        "Roomboard could not confirm complete deletion. Retry, or contact support before sharing the room again.",
      );
      trackRoomActivationEvent("Room Permanent Delete Failed", { reason: "request_error" });
    } finally {
      setIsDeletingRoom(false);
      setShowCloseModal(false);
      setIsConfirmingPermanentDelete(false);
    }
  };

  const copyRoomLink = async (kind: "current" | "owner" | RoomInviteRole) => {
    const url = getRoomShareUrl(kind);

    if (!url) {
      return;
    }

    setCopyError("");
    if (!(await copyTextToClipboard(url.toString()))) {
      setCopyError("Roomboard could not copy the link. Use the browser share menu or try again.");
      trackRoomActivationEvent("Room Copy Failed", {
        shareKind: kind,
      });
      return;
    }

    trackProductEvent(kind === "editor" || kind === "viewer" ? "Room Invite Copied" : "Room Link Copied", {
      role: permissions.role,
      shareKind: kind,
    });
    if (kind !== "current") {
      setCopiedLaunchLinks((current) => ({ ...current, [kind]: true }));
    }
    if (kind === "owner") {
      setShowLaunchGuideBackupReminder(false);
    }
    setCopiedShare(kind);
    window.setTimeout(() => setCopiedShare(""), 1400);
  };

  const copyInviteMessage = async () => {
    const url = getRoomShareUrl("editor");

    if (!url) {
      return;
    }

    const copy = launchStarterCopy[launchStarter] ?? launchStarterCopy["landing-review"];

    setCopyError("");
    if (
      !(await copyTextToClipboard(
        buildRoomInviteMessage({
          prompt: copy.invitePrompt,
          roomName: displayRoomName,
          url,
        }),
      ))
    ) {
      setCopyError(
        "Roomboard could not copy the invite message. Try the editor link button or your browser share menu.",
      );
      trackRoomActivationEvent("Room Copy Failed", {
        shareKind: "invite_message",
      });
      return;
    }

    setCopiedLaunchLinks((current) => ({ ...current, editor: true }));
    setCopiedInviteMessage(true);
    trackProductEvent("Room Invite Message Copied", {
      role: permissions.role,
      shareKind: "editor",
      starter: launchStarter || "unknown",
    });
    window.setTimeout(() => setCopiedInviteMessage(false), 1400);
  };

  const startRoomFromSample = async () => {
    const starter = sampleStarterByRoomId[roomId];

    if (!starter || isStartingSampleRoom) {
      return;
    }

    setControlError("");
    setIsStartingSampleRoom(true);
    trackProductEvent("Sample Room Start Clicked", { source: "sample_room_banner", starter });
    trackProductEvent("Room Start Clicked", { source: "sample_room_banner", starter });

    try {
      const response = await fetch("/api/rooms", {
        body: JSON.stringify({
          name: sampleStarterRoomNames[starter],
          starterTemplate: starter,
          visibility: "private",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setControlError(
          response.status === 429
            ? "Room creation is temporarily rate limited. Try again in a little while."
            : "Roomboard could not open your private room from this sample. Try again.",
        );
        trackProductEvent("Room Create Failed", {
          reason: response.status === 429 ? "rate_limited" : "bad_response",
          source: "sample_room_banner",
          starter,
          status: response.status,
        });
        return;
      }

      const data = (await response.json()) as {
        ownerToken?: string;
        room?: {
          access?: RoomAccess;
          id: string;
          itemCount?: number;
          visibility?: RoomVisibility;
        };
      };

      if (!data.room || !data.ownerToken) {
        setControlError("Roomboard opened a response without a room. Try again.");
        trackProductEvent("Room Create Failed", { reason: "missing_room", source: "sample_room_banner", starter });
        return;
      }

      trackProductEvent("Room Created", {
        access: data.room.access,
        itemCount: data.room.itemCount,
        source: "sample_room_banner",
        starter,
        visibility: data.room.visibility,
      });

      writeOwnerToken(data.room.id, data.ownerToken);

      router.push(
        buildRoomPathWithHashToken(data.room.id, "ownerToken", data.ownerToken, {
          new: "1",
          starter,
        }),
      );
    } catch {
      setControlError("Roomboard could not reach the room service. Try again.");
      trackProductEvent("Room Create Failed", { reason: "request_error", source: "sample_room_banner", starter });
    } finally {
      setIsStartingSampleRoom(false);
    }
  };

  // Import-side references pulled out so the hook file is self-contained; the
  // runtime helpers below finish wiring the closure below.
  const loadRoomRecap = async () => {
    setIsRecapLoading(true);
    setCopiedRecap(false);

    try {
      const headers: Record<string, string> = {
        ...(inviteToken ? { "X-Room-Invite-Token": inviteToken } : {}),
        ...(ownerToken ? { "X-Room-Owner-Token": ownerToken } : {}),
      };
      const response = await fetch(`${roomApi}/recap`, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { recap?: RoomRecap };

      if (!data.recap) {
        return null;
      }

      setRoomRecap(data.recap);
      return data.recap;
    } finally {
      setIsRecapLoading(false);
    }
  };

  return {
    addCommentToItem,
    closeRoom,
    copyInviteMessage,
    copyPublicSnapshotLink,
    copyRoomLink,
    createFirstDecisionNote,
    createImageFromFile,
    createImageFromUrl,
    createItem,
    deleteRoomPermanently,
    handleCreateConnection,
    handleDeleteConnection,
    handleDeleteItem,
    handleDuplicateItem,
    handleReverseConnection,
    loadRoomRecap,
    patchItem,
    saveSelected,
    startRoomFromSample,
    submitComment,
    toggleDecisionSignal,
    togglePublicSnapshot,
    toggleRoomAccess,
    updateItemStatus,
    updateSelectedStatus,
  };
}
