import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveRoomUploadUrl } from "./roomboardUploads.ts";

export type RoomItemType = "image" | "note";
export const roomItemStatuses = ["open", "reviewing", "approved", "changes_requested"] as const;
export type RoomItemStatus = (typeof roomItemStatuses)[number];
export const roomItemStyleVariants = ["minimal", "highlight"] as const;
export type RoomItemStyleVariant = (typeof roomItemStyleVariants)[number];

export function isRoomItemStyleVariant(value: unknown): value is RoomItemStyleVariant {
  return typeof value === "string" && roomItemStyleVariants.includes(value as RoomItemStyleVariant);
}

export type RoomComment = {
  id: string;
  author: string;
  body: string;
  color: string;
  createdAt: number;
};

export type RoomDecisionSignal = {
  voterId?: string;
  voter: string;
  color: string;
  createdAt: number;
};

export type RoomActivityType =
  | "access_changed"
  | "comment_created"
  | "decision_signal_updated"
  | "connection_created"
  | "connection_deleted"
  | "item_created"
  | "item_deleted"
  | "item_moved"
  | "item_updated"
  | "room_closed"
  | "room_created"
  | "status_changed";

export type RoomActivity = {
  id: string;
  actor: string;
  createdAt: number;
  itemId?: string;
  itemTitle?: string;
  message: string;
  type: RoomActivityType;
};

export type RoomItem = {
  id: string;
  type: RoomItemType;
  status: RoomItemStatus;
  title: string;
  body: string;
  imageUrl?: string;
  author: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  comments: RoomComment[];
  decisionSignals?: RoomDecisionSignal[];
  styleVariant?: RoomItemStyleVariant;
};

export type RoomConnectionSide = "top" | "right" | "bottom" | "left";

const roomConnectionSideValues = new Set<string>(["top", "right", "bottom", "left"]);

function normalizeRoomConnectionSide(side?: string): RoomConnectionSide | undefined {
  return side && roomConnectionSideValues.has(side) ? (side as RoomConnectionSide) : undefined;
}

function getRoomConnectionPairKey(from: string, to: string) {
  return [from, to].sort().join("::");
}

function dedupeRoomConnections(connections: RoomConnection[]) {
  const next = new Map<string, RoomConnection>();

  for (const connection of connections) {
    const pairKey = getRoomConnectionPairKey(connection.from, connection.to);

    if (!next.has(pairKey)) {
      next.set(pairKey, connection);
    }
  }

  return Array.from(next.values());
}

export type RoomConnection = {
  id: string;
  from: string;
  fromSide?: RoomConnectionSide;
  to: string;
  toSide?: RoomConnectionSide;
  color?: string;
};

export type RoomAccess = "link" | "locked";
export type RoomVisibility = "public" | "private";
export const roomStarterTemplates = ["landing-review", "moodboard", "visual-decision"] as const;
export type RoomStarterTemplate = (typeof roomStarterTemplates)[number];
export type RoomRole = "owner" | "editor" | "viewer";
export type RoomInviteRole = Exclude<RoomRole, "owner">;
export type RoomCredentials = {
  inviteToken?: string | null;
  ownerToken?: string | null;
};
export type RoomPermissions = {
  canEdit: boolean;
  canManage: boolean;
  role: RoomRole;
};

export type RoomSummary = {
  id: string;
  name: string;
  access: RoomAccess;
  visibility: RoomVisibility;
  isSnapshotPublic: boolean;
  shareInvite?: {
    role: RoomInviteRole;
    token: string;
  };
  createdAt: number;
  updatedAt: number;
  itemCount: number;
  noteCount: number;
  imageCount: number;
  commentCount: number;
  connectionCount: number;
  activityCount: number;
  liveCount: number;
  statusCounts: Record<RoomItemStatus, number>;
  participants: Array<{
    name: string;
    color: string;
  }>;
  previewItems: Array<{
    type: RoomItemType;
    status: RoomItemStatus;
    color: string;
    imageUrl?: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
};

export type RoomSnapshot = {
  inviteTokens?: Record<RoomInviteRole, string>;
  realtimeToken?: string | null;
  room: RoomSummary;
  permissions: RoomPermissions;
  items: RoomItem[];
  connections: RoomConnection[];
  activities: RoomActivity[];
  history?: RoomHistoryEntry[];
};

export type RoomRecapItem = {
  id: string;
  title: string;
  type: RoomItemType;
  body: string;
  author: string;
  commentCount: number;
  comments?: string[];
  decisionSignalCount: number;
  source?: string;
};

export type RoomRecapSection = {
  status: RoomItemStatus;
  label: string;
  count: number;
  items: RoomRecapItem[];
};

export type RoomRecap = {
  roomId: string;
  roomName: string;
  updatedAt: number;
  totalItems: number;
  decidedCount: number;
  unresolvedCount: number;
  noteCount: number;
  imageCount: number;
  commentCount: number;
  connectionCount: number;
  sections: RoomRecapSection[];
  recentActivities: RoomActivity[];
  markdown: string;
};

export type RoomDecisionBrief = {
  approvedCount: number;
  headline: string;
  nextStep?: {
    id: string;
    status: Exclude<RoomItemStatus, "approved">;
    title: string;
  };
  pendingCount: number;
  revisionCount: number;
  nextSteps: Array<{
    id: string;
    status: Exclude<RoomItemStatus, "approved">;
    title: string;
  }>;
};

type RoomClient = {
  credentials?: RoomCredentials;
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

export type RoomHistoryEntry = {
  version: number;
  updatedAt: number;
  itemCount: number;
  connectionCount: number;
  commentCount: number;
};
type RoomDocument = {
  id: string;
  name: string;
  access: RoomAccess;
  visibility?: RoomVisibility;
  isSnapshotPublic?: boolean;
  inviteTokens?: Record<RoomInviteRole, string>;
  ownerToken: string;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  /** Epoch ms after which invite tokens stop granting access; owner unaffected. */
  inviteExpiresAt?: number;
  /** Capped audit trail of committed document versions (newest last). */
  history?: RoomHistoryEntry[];
  deletionRequestedAt?: number;
  items: RoomItem[];
  connections: RoomConnection[];
  activities?: RoomActivity[];
  /** Optimistic-concurrency token; bumped by every conditional save. */
  version?: number;
};

type RoomMutation<T> = (room: RoomDocument) => T;

type RoomStore = {
  delete: (roomId: string) => Promise<void>;
  get: (roomId: string) => Promise<RoomDocument | null>;
  list: () => Promise<RoomDocument[]>;
  /**
   * Persists the document. When `expectedVersion` is given the write only
   * succeeds if the stored document still carries that version; returns false
   * on conflict so callers can re-read and retry.
   */
  save: (room: RoomDocument, expectedVersion?: number) => Promise<boolean>;
};

type RoomCredentialsInput = RoomCredentials | string | null | undefined;
type RoomListAccess =
  | Record<string, string>
  | {
      inviteTokens?: Record<string, string>;
      ownerTokens?: Record<string, string>;
    };

export const DEFAULT_ROOM_ID = "pitch-deck-review";
export const MOODBOARD_SAMPLE_ROOM_ID = "sample-moodboard-decision";
export const VISUAL_DECISION_SAMPLE_ROOM_ID = "sample-visual-decision-room";
export const SAMPLE_ROOM_IDS = [DEFAULT_ROOM_ID, MOODBOARD_SAMPLE_ROOM_ID, VISUAL_DECISION_SAMPLE_ROOM_ID] as const;
const DEFAULT_ROOM_OWNER_TOKEN = "demo-owner";
const ROOMBOARD_SUPABASE_TABLE = process.env.ROOMBOARD_SUPABASE_TABLE ?? "roomboard_rooms";
const maxRoomActivities = 80;
export const roomCapacityLimits = {
  comments: 240,
  connections: 160,
  decisionSignalsPerItem: 50,
  items: 80,
} as const;

export type RoomCapacityKind = keyof typeof roomCapacityLimits;

export class RoomCapacityError extends Error {
  readonly kind: RoomCapacityKind;
  readonly limit: number;

  constructor(kind: RoomCapacityKind, limit: number) {
    super(`Room ${kind} limit of ${limit} reached.`);
    this.name = "RoomCapacityError";
    this.kind = kind;
    this.limit = limit;
  }
}

export function isRoomCapacityError(error: unknown): error is RoomCapacityError {
  return (
    error instanceof RoomCapacityError ||
    (error instanceof Error && error.name === "RoomCapacityError" && "kind" in error && "limit" in error)
  );
}

export function assertRoomCapacity(kind: RoomCapacityKind, current: number, increment = 1) {
  const limit = roomCapacityLimits[kind];
  if (current + increment > limit) {
    throw new RoomCapacityError(kind, limit);
  }
}

type SampleRoomConfig = {
  id: (typeof SAMPLE_ROOM_IDS)[number];
  name: string;
  starterTemplate: RoomStarterTemplate;
};

const sampleRoomConfigs: SampleRoomConfig[] = [
  {
    id: DEFAULT_ROOM_ID,
    name: "Launch Approval — Decision Complete",
    starterTemplate: "landing-review",
  },
  {
    id: MOODBOARD_SAMPLE_ROOM_ID,
    name: "Moodboard Decision",
    starterTemplate: "moodboard",
  },
  {
    id: VISUAL_DECISION_SAMPLE_ROOM_ID,
    name: "Visual Decision Room",
    starterTemplate: "visual-decision",
  },
];
const landingApprovalSampleVersionItemId = "note-decision-record";

function isSampleRoomId(roomId: string) {
  return SAMPLE_ROOM_IDS.includes(roomId as (typeof SAMPLE_ROOM_IDS)[number]);
}

const encoder = new TextEncoder();
const clientsByRoom = new Map<string, Set<RoomClient>>();
const globalForRooms = globalThis as unknown as {
  localRoomDocuments?: Map<string, RoomDocument>;
  roomStore?: RoomStore;
  supabaseRoomClient?: SupabaseClient;
};

function encode(event: string, payload: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function cloneRoom(room: RoomDocument): RoomDocument {
  return normalizeRoomDocument(structuredClone(room) as RoomDocument);
}

function deriveInviteToken(room: Pick<RoomDocument, "id" | "ownerToken">, role: RoomInviteRole) {
  return createHash("sha256")
    .update(`${room.id}:${room.ownerToken}:${role}:roomboard-invite-v1`)
    .digest("hex")
    .slice(0, 36);
}

function createInviteTokens(): Record<RoomInviteRole, string> {
  return {
    editor: crypto.randomUUID(),
    viewer: crypto.randomUUID(),
  };
}

function normalizeRoomItemStatus(status: unknown): RoomItemStatus {
  return typeof status === "string" && roomItemStatuses.includes(status as RoomItemStatus)
    ? (status as RoomItemStatus)
    : "open";
}

function normalizeActivity(value: unknown): RoomActivity | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const activity = value as Partial<RoomActivity>;

  if (
    typeof activity.id !== "string" ||
    typeof activity.message !== "string" ||
    typeof activity.type !== "string" ||
    !Number.isFinite(activity.createdAt)
  ) {
    return null;
  }

  const createdAt = Number(activity.createdAt);

  return {
    id: activity.id,
    actor:
      typeof activity.actor === "string" && activity.actor.trim() ? activity.actor.trim().slice(0, 24) : "Roomboard",
    createdAt: Math.round(createdAt),
    itemId: typeof activity.itemId === "string" ? activity.itemId : undefined,
    itemTitle: typeof activity.itemTitle === "string" ? activity.itemTitle.slice(0, 72) : undefined,
    message: activity.message.slice(0, 160),
    type: activity.type as RoomActivityType,
  };
}

function normalizeActor(actor?: string) {
  return actor?.trim().slice(0, 24) || "Editor";
}

function normalizeRoomColor(color: unknown, fallback = "#48a7ff") {
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim().toLowerCase() : fallback;
}

function clampRoomNumber(value: unknown, fallback: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value as number))) : fallback;
}

function appendRoomActivity(
  room: RoomDocument,
  activity: Omit<RoomActivity, "actor" | "createdAt" | "id"> & {
    actor?: string;
    createdAt?: number;
  },
) {
  const entry: RoomActivity = {
    ...activity,
    actor: normalizeActor(activity.actor),
    createdAt: activity.createdAt ?? Date.now(),
    id: crypto.randomUUID(),
    message: activity.message.slice(0, 160),
  };

  room.activities = [entry, ...(room.activities ?? [])].slice(0, maxRoomActivities);
  return entry;
}

function getEmptyStatusCounts(): Record<RoomItemStatus, number> {
  return {
    approved: 0,
    changes_requested: 0,
    open: 0,
    reviewing: 0,
  };
}

function normalizeRoomDocument(room: RoomDocument): RoomDocument {
  return {
    ...room,
    visibility: room.visibility === "public" ? "public" : "private",
    isSnapshotPublic: room.isSnapshotPublic === true,
    inviteTokens: {
      editor:
        typeof room.inviteTokens?.editor === "string" ? room.inviteTokens.editor : deriveInviteToken(room, "editor"),
      viewer:
        typeof room.inviteTokens?.viewer === "string" ? room.inviteTokens.viewer : deriveInviteToken(room, "viewer"),
    },
    items: room.items.map((item) => ({
      ...item,
      color: normalizeRoomColor(item.color),
      comments: item.comments.map((comment) => ({
        ...comment,
        color: normalizeRoomColor(comment.color),
      })),
      decisionSignals: item.decisionSignals?.map((signal) => ({
        ...signal,
        color: normalizeRoomColor(signal.color),
      })),
      height: clampRoomNumber(item.height, item.type === "image" ? 220 : 156, 80, 1200),
      status: normalizeRoomItemStatus((item as Partial<RoomItem>).status),
      width: clampRoomNumber(item.width, item.type === "image" ? 268 : 236, 120, 1200),
      x: clampRoomNumber(item.x, 0, -100000, 100000),
      y: clampRoomNumber(item.y, 0, -100000, 100000),
    })),
    connections: room.connections.map((connection) => ({
      ...connection,
      color: normalizeRoomColor(connection.color),
    })),
    activities: (room.activities ?? [])
      .map(normalizeActivity)
      .filter((activity): activity is RoomActivity => Boolean(activity))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, maxRoomActivities),
  };
}

function slugifyRoomId(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);

  return `${slug || "room"}-${crypto.randomUUID().slice(0, 8)}`;
}

function resolveStarterTemplate(starter: boolean | RoomStarterTemplate): RoomStarterTemplate | null {
  if (starter === true) return "landing-review";
  if (starter === false) return null;
  return starter;
}

function createStarterItems(createdAt = Date.now(), template: RoomStarterTemplate = "landing-review"): RoomItem[] {
  if (template === "visual-decision") {
    return [
      {
        id: "note-question",
        type: "note",
        status: "reviewing",
        title: "Decision question",
        body: "What needs to be decided in this room? Replace this with the exact choice the team should make.",
        author: "Roomboard",
        color: "#facc5c",
        x: -320,
        y: -140,
        width: 252,
        height: 156,
        createdAt: createdAt - 60000,
        updatedAt: createdAt - 12000,
        comments: [],
      },
      {
        id: "note-material",
        type: "note",
        status: "open",
        title: "Visual material",
        body: "Upload screenshots, paste image links, or drop references here so feedback stays attached to the work.",
        author: "Roomboard",
        color: "#48a7ff",
        x: 0,
        y: -140,
        width: 268,
        height: 156,
        createdAt: createdAt - 54000,
        updatedAt: createdAt - 30000,
        comments: [],
      },
      {
        id: "note-feedback",
        type: "note",
        status: "open",
        title: "Feedback to collect",
        body: "Ask collaborators to comment on specific cards, change statuses, or add alternatives before the room is closed.",
        author: "Roomboard",
        color: "#ef6f5e",
        x: 330,
        y: -120,
        width: 268,
        height: 156,
        createdAt: createdAt - 50000,
        updatedAt: createdAt - 18000,
        comments: [],
      },
      {
        id: "note-criteria",
        type: "note",
        status: "open",
        title: "Decision criteria",
        body: "Write the 2-3 criteria that matter most. Example: clear on mobile, easy to explain, ready to send today.",
        author: "Roomboard",
        color: "#62d681",
        x: -260,
        y: 120,
        width: 260,
        height: 156,
        createdAt: createdAt - 36000,
        updatedAt: createdAt - 16000,
        comments: [],
      },
      {
        id: "note-decision",
        type: "note",
        status: "open",
        title: "Final decision",
        body: "When the team agrees, summarize the call here and close the room so the decision does not drift.",
        author: "Roomboard",
        color: "#9b7bd9",
        x: 110,
        y: 170,
        width: 272,
        height: 144,
        createdAt: createdAt - 12000,
        updatedAt: createdAt - 12000,
        comments: [],
      },
    ];
  }

  if (template === "moodboard") {
    return [
      {
        id: "note-direction",
        type: "note",
        status: "reviewing",
        title: "Direction",
        body: "Choose the visual direction before the team starts collecting more references. Keep this room focused on what should ship.",
        author: "Mira",
        color: "#facc5c",
        x: -320,
        y: -120,
        width: 244,
        height: 164,
        createdAt: createdAt - 60000,
        updatedAt: createdAt - 12000,
        comments: [
          {
            id: "comment-1",
            author: "Nora",
            body: "Option A feels more ownable. Option B is safer but less memorable.",
            color: "#48a7ff",
            createdAt: createdAt - 42000,
          },
        ],
      },
      {
        id: "image-reference-a",
        type: "image",
        status: "open",
        title: "Reference A",
        body: "Warm, editorial, tactile.",
        imageUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
        author: "Kai",
        color: "#ef6f5e",
        x: 0,
        y: -150,
        width: 268,
        height: 188,
        createdAt: createdAt - 54000,
        updatedAt: createdAt - 30000,
        comments: [],
      },
      {
        id: "image-reference-b",
        type: "image",
        status: "open",
        title: "Reference B",
        body: "Sharper, more product-led, higher contrast.",
        imageUrl: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=900&q=80",
        author: "Nora",
        color: "#48a7ff",
        x: 330,
        y: -130,
        width: 268,
        height: 188,
        createdAt: createdAt - 50000,
        updatedAt: createdAt - 26000,
        comments: [
          {
            id: "comment-2",
            author: "Mira",
            body: "This is cleaner, but we should soften the palette before approving it.",
            color: "#facc5c",
            createdAt: createdAt - 25000,
          },
        ],
      },
      {
        id: "note-criteria",
        type: "note",
        status: "approved",
        title: "Decision criteria",
        body: "1. Recognizable in the first screen. 2. Works with screenshots. 3. Does not feel like a generic template.",
        author: "Ilya",
        color: "#62d681",
        x: -260,
        y: 120,
        width: 252,
        height: 156,
        createdAt: createdAt - 36000,
        updatedAt: createdAt - 18000,
        comments: [],
      },
      {
        id: "note-next-step",
        type: "note",
        status: "open",
        title: "Next step",
        body: "Pick one direction, upload the next mockup, then invite viewers for the final pass.",
        author: "Roomboard",
        color: "#9b7bd9",
        x: 100,
        y: 160,
        width: 260,
        height: 144,
        createdAt: createdAt - 12000,
        updatedAt: createdAt - 12000,
        comments: [],
      },
    ];
  }

  return [
    {
      id: "note-decision-question",
      type: "note",
      status: "reviewing",
      title: "Decision question",
      body: "What exactly must be approved before this launch can ship? Replace this prompt with one concrete decision.",
      author: "Roomboard",
      color: "#facc5c",
      x: -320,
      y: -160,
      width: 252,
      height: 156,
      createdAt: createdAt - 60000,
      updatedAt: createdAt - 60000,
      comments: [],
    },
    {
      id: "note-visual-material",
      type: "note",
      status: "open",
      title: "Visual to approve",
      body: "Upload the current desktop screenshot or creative here. Reviewers should react to the real launch material, not a description of it.",
      author: "Roomboard",
      color: "#48a7ff",
      x: 20,
      y: -130,
      width: 268,
      height: 164,
      createdAt: createdAt - 55000,
      updatedAt: createdAt - 55000,
      comments: [],
    },
    {
      id: "note-copy-review",
      type: "note",
      status: "open",
      title: "Copy to approve",
      body: "Paste the headline, CTA, or campaign message that needs a call. Keep alternatives on separate cards when reviewers must compare them.",
      author: "Roomboard",
      color: "#62d681",
      x: 340,
      y: -140,
      width: 252,
      height: 164,
      createdAt: createdAt - 48000,
      updatedAt: createdAt - 48000,
      comments: [],
    },
    {
      id: "note-mobile-check",
      type: "note",
      status: "open",
      title: "Mobile check",
      body: "Add the narrow-screen state that must be approved before launch. Call out anything reviewers should inspect at a glance.",
      author: "Roomboard",
      color: "#9b7bd9",
      x: -280,
      y: 80,
      width: 252,
      height: 156,
      createdAt: createdAt - 35000,
      updatedAt: createdAt - 35000,
      comments: [],
    },
    {
      id: "note-criteria",
      type: "note",
      status: "open",
      title: "Approval criteria",
      body: "Define 2–3 checks before inviting people. Example: clear in five seconds, credible on mobile, ready to publish today.",
      author: "Roomboard",
      color: "#ef6f5e",
      x: 360,
      y: 120,
      width: 244,
      height: 150,
      createdAt: createdAt - 18000,
      updatedAt: createdAt - 18000,
      comments: [],
    },
    {
      id: "note-decision-record",
      type: "note",
      status: "open",
      title: "Decision record",
      body: "When the final reviewer responds, write what ships, what changes, and who owns the next action. Then close the room.",
      author: "Roomboard",
      color: "#62d681",
      x: 60,
      y: 180,
      width: 252,
      height: 150,
      createdAt: createdAt - 10000,
      updatedAt: createdAt - 10000,
      comments: [],
    },
  ];
}

function createFinishedLandingApprovalSampleItems(createdAt = Date.now()): RoomItem[] {
  const approved = "approved" as const;

  return [
    {
      id: "note-decision-question",
      type: "note",
      status: approved,
      title: "Decision: which hero ships?",
      body: "Approve the focused launch hero for the public release. The page must explain the product in five seconds and remain credible on mobile.",
      author: "Mira",
      color: "#facc5c",
      x: -320,
      y: -160,
      width: 260,
      height: 164,
      createdAt: createdAt - 720000,
      updatedAt: createdAt - 120000,
      comments: [
        {
          id: "sample-comment-question",
          author: "Noah",
          body: "One call, not a general design review. I can approve this today.",
          color: "#48a7ff",
          createdAt: createdAt - 660000,
        },
      ],
    },
    {
      id: "image-desktop-final",
      type: "image",
      status: approved,
      title: "Desktop hero — focused version",
      body: "Short promise, one proof point, one launch CTA.",
      imageUrl: "https://images.unsplash.com/photo-1559028012-481c04fa702d?auto=format&fit=crop&w=900&q=80",
      author: "Ilya",
      color: "#48a7ff",
      x: 0,
      y: -150,
      width: 284,
      height: 196,
      createdAt: createdAt - 680000,
      updatedAt: createdAt - 90000,
      comments: [
        {
          id: "sample-comment-desktop",
          author: "Mira",
          body: "Approved. The product is visible before the first scroll and the CTA is unambiguous.",
          color: "#facc5c",
          createdAt: createdAt - 180000,
        },
      ],
    },
    {
      id: "note-copy-final",
      type: "note",
      status: approved,
      title: "Approved launch copy",
      body: "Review the launch visually. Invite the people who need to decide. Leave with a decision record.",
      author: "Noah",
      color: "#62d681",
      x: 350,
      y: -140,
      width: 264,
      height: 164,
      createdAt: createdAt - 620000,
      updatedAt: createdAt - 80000,
      comments: [
        {
          id: "sample-comment-copy",
          author: "Ilya",
          body: "This names the workflow and the outcome. Ship it.",
          color: "#62d681",
          createdAt: createdAt - 150000,
        },
      ],
    },
    {
      id: "image-mobile-final",
      type: "image",
      status: approved,
      title: "Mobile launch state",
      body: "Single clear CTA, proof directly below, no horizontal overflow.",
      imageUrl: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=900&q=80",
      author: "Mira",
      color: "#9b7bd9",
      x: -270,
      y: 100,
      width: 252,
      height: 196,
      createdAt: createdAt - 540000,
      updatedAt: createdAt - 70000,
      comments: [
        {
          id: "sample-comment-mobile",
          author: "Noah",
          body: "Approved after the CTA spacing fix.",
          color: "#48a7ff",
          createdAt: createdAt - 140000,
        },
      ],
    },
    {
      id: "note-criteria-final",
      type: "note",
      status: approved,
      title: "Approval criteria met",
      body: "✓ Clear in five seconds\n✓ Product visible above the fold\n✓ Mobile state reviewed\n✓ Ready to publish today",
      author: "Roomboard",
      color: "#ef6f5e",
      x: 30,
      y: 170,
      width: 252,
      height: 164,
      createdAt: createdAt - 500000,
      updatedAt: createdAt - 60000,
      comments: [],
    },
    {
      id: landingApprovalSampleVersionItemId,
      type: "note",
      status: approved,
      title: "Decision record — ready to ship",
      body: "Ship the focused hero with the approved launch copy and mobile state. Ilya publishes today; Mira checks production after release.",
      author: "Mira",
      color: "#62d681",
      x: 340,
      y: 150,
      width: 286,
      height: 170,
      createdAt: createdAt - 420000,
      updatedAt: createdAt - 30000,
      comments: [
        {
          id: "sample-comment-record",
          author: "Noah",
          body: "Decision closed. No further review needed before launch.",
          color: "#48a7ff",
          createdAt: createdAt - 45000,
        },
      ],
    },
  ];
}

function createStarterConnections(template: RoomStarterTemplate = "landing-review"): RoomConnection[] {
  if (template === "visual-decision") {
    return [
      {
        id: "conn-1",
        from: "note-question",
        to: "note-material",
        color: "#facc5c",
      },
      {
        id: "conn-2",
        from: "note-material",
        to: "note-feedback",
        color: "#ef6f5e",
      },
      {
        id: "conn-3",
        from: "note-criteria",
        to: "note-decision",
        color: "#62d681",
      },
    ];
  }

  if (template === "moodboard") {
    return [
      {
        id: "conn-1",
        from: "note-direction",
        to: "image-reference-a",
        color: "#facc5c",
      },
      {
        id: "conn-2",
        from: "note-direction",
        to: "image-reference-b",
        color: "#48a7ff",
      },
      {
        id: "conn-3",
        from: "note-criteria",
        to: "note-next-step",
        color: "#62d681",
      },
    ];
  }

  return [
    {
      id: "conn-1",
      from: "note-decision-question",
      to: "note-visual-material",
      color: "#facc5c",
    },
    {
      id: "conn-2",
      from: "note-visual-material",
      to: "note-copy-review",
      color: "#48a7ff",
    },
    {
      id: "conn-3",
      from: "note-visual-material",
      to: "note-mobile-check",
      color: "#9b7bd9",
    },
    {
      id: "conn-4",
      from: "note-copy-review",
      to: "note-decision-record",
      color: "#62d681",
    },
    {
      id: "conn-5",
      from: "note-criteria",
      to: "note-decision-record",
      color: "#ef6f5e",
    },
  ];
}

function createRoomDocument(
  id: string,
  name: string,
  starter: boolean | RoomStarterTemplate = false,
  ownerToken = crypto.randomUUID(),
  visibility: RoomVisibility = "private",
  access: RoomAccess = "locked",
): RoomDocument {
  const createdAt = Date.now();
  const starterTemplate = resolveStarterTemplate(starter);
  const room: RoomDocument = {
    id,
    name,
    access,
    visibility,
    inviteTokens: createInviteTokens(),
    ownerToken,
    createdAt,
    updatedAt: createdAt,
    items: starterTemplate ? createStarterItems(createdAt, starterTemplate) : [],
    connections: starterTemplate ? createStarterConnections(starterTemplate) : [],
    activities: [],
  };

  appendRoomActivity(room, {
    actor: starterTemplate ? "Roomboard" : "Creator",
    createdAt,
    message: starterTemplate ? "Added a starter review board." : `Created "${name}".`,
    type: "room_created",
  });

  if (starterTemplate === "landing-review") {
    appendRoomActivity(room, {
      actor: "Roomboard",
      createdAt: createdAt - 60000,
      message: 'Created "Decision question"',
      itemId: "note-decision-question",
      itemTitle: "Decision question",
      type: "item_created",
    });
    appendRoomActivity(room, {
      actor: "Roomboard",
      createdAt: createdAt - 55000,
      message: 'Created "Visual to approve"',
      itemId: "note-visual-material",
      itemTitle: "Visual to approve",
      type: "item_created",
    });
    appendRoomActivity(room, {
      actor: "Roomboard",
      createdAt: createdAt - 48000,
      message: 'Created "Copy to approve"',
      itemId: "note-copy-review",
      itemTitle: "Copy to approve",
      type: "item_created",
    });
    appendRoomActivity(room, {
      actor: "Roomboard",
      createdAt: createdAt - 35000,
      message: 'Created "Mobile check"',
      itemId: "note-mobile-check",
      itemTitle: "Mobile check",
      type: "item_created",
    });
    appendRoomActivity(room, {
      actor: "Roomboard",
      createdAt: createdAt - 18000,
      message: 'Created "Approval criteria"',
      itemId: "note-criteria",
      itemTitle: "Approval criteria",
      type: "item_created",
    });
    appendRoomActivity(room, {
      actor: "Roomboard",
      createdAt: createdAt - 10000,
      message: 'Created "Decision record"',
      itemId: "note-decision-record",
      itemTitle: "Decision record",
      type: "item_created",
    });
  } else if (starterTemplate === "moodboard") {
    appendRoomActivity(room, {
      actor: "Mira",
      createdAt: createdAt - 60000,
      message: 'Created "Direction"',
      itemId: "note-direction",
      itemTitle: "Direction",
      type: "item_created",
    });
    appendRoomActivity(room, {
      actor: "Kai",
      createdAt: createdAt - 54000,
      message: 'Added image "Reference A"',
      itemId: "image-reference-a",
      itemTitle: "Reference A",
      type: "item_created",
    });
    appendRoomActivity(room, {
      actor: "Nora",
      createdAt: createdAt - 50000,
      message: 'Added image "Reference B"',
      itemId: "image-reference-b",
      itemTitle: "Reference B",
      type: "item_created",
    });
    appendRoomActivity(room, {
      actor: "Ilya",
      createdAt: createdAt - 36000,
      message: 'Created "Decision criteria"',
      itemId: "note-criteria",
      itemTitle: "Decision criteria",
      type: "item_created",
    });
    appendRoomActivity(room, {
      actor: "Roomboard",
      createdAt: createdAt - 12000,
      message: 'Created "Next step"',
      itemId: "note-next-step",
      itemTitle: "Next step",
      type: "item_created",
    });
  } else if (starterTemplate === "visual-decision") {
    appendRoomActivity(room, {
      actor: "Roomboard",
      createdAt: createdAt - 60000,
      message: 'Created "Decision question"',
      itemId: "note-question",
      itemTitle: "Decision question",
      type: "item_created",
    });
    appendRoomActivity(room, {
      actor: "Roomboard",
      createdAt: createdAt - 54000,
      message: 'Created "Visual material"',
      itemId: "note-material",
      itemTitle: "Visual material",
      type: "item_created",
    });
    appendRoomActivity(room, {
      actor: "Roomboard",
      createdAt: createdAt - 50000,
      message: 'Created "Feedback to collect"',
      itemId: "note-feedback",
      itemTitle: "Feedback to collect",
      type: "item_created",
    });
    appendRoomActivity(room, {
      actor: "Roomboard",
      createdAt: createdAt - 36000,
      message: 'Created "Decision criteria"',
      itemId: "note-criteria",
      itemTitle: "Decision criteria",
      type: "item_created",
    });
    appendRoomActivity(room, {
      actor: "Roomboard",
      createdAt: createdAt - 12000,
      message: 'Created "Final decision"',
      itemId: "note-decision",
      itemTitle: "Final decision",
      type: "item_created",
    });
  }

  return room;
}

function createFinishedLandingApprovalSampleConnections(): RoomConnection[] {
  return [
    { id: "sample-conn-1", from: "note-decision-question", to: "image-desktop-final", color: "#facc5c" },
    { id: "sample-conn-2", from: "image-desktop-final", to: "note-copy-final", color: "#48a7ff" },
    { id: "sample-conn-3", from: "image-desktop-final", to: "image-mobile-final", color: "#9b7bd9" },
    { id: "sample-conn-4", from: "note-copy-final", to: landingApprovalSampleVersionItemId, color: "#62d681" },
    { id: "sample-conn-5", from: "note-criteria-final", to: landingApprovalSampleVersionItemId, color: "#ef6f5e" },
  ];
}

function createSampleRoomDocument(config: SampleRoomConfig, ownerToken = crypto.randomUUID()) {
  const room = createRoomDocument(config.id, config.name, config.starterTemplate, ownerToken, "public", "locked");

  if (config.starterTemplate !== "landing-review") {
    return room;
  }

  const sampleFinishedAt = room.createdAt;
  room.createdAt = sampleFinishedAt - 720000;
  room.items = createFinishedLandingApprovalSampleItems(sampleFinishedAt);
  room.connections = createFinishedLandingApprovalSampleConnections();
  room.activities = [];
  appendRoomActivity(room, {
    actor: "Mira",
    createdAt: sampleFinishedAt - 720000,
    message: "Opened the launch approval decision.",
    itemId: "note-decision-question",
    itemTitle: "Decision: which hero ships?",
    type: "item_created",
  });
  appendRoomActivity(room, {
    actor: "Ilya",
    createdAt: sampleFinishedAt - 680000,
    message: 'Added "Desktop hero — focused version"',
    itemId: "image-desktop-final",
    itemTitle: "Desktop hero — focused version",
    type: "item_created",
  });
  appendRoomActivity(room, {
    actor: "Noah",
    createdAt: sampleFinishedAt - 180000,
    message: "Commented on the desktop hero",
    itemId: "image-desktop-final",
    itemTitle: "Desktop hero — focused version",
    type: "comment_created",
  });
  appendRoomActivity(room, {
    actor: "Mira",
    createdAt: sampleFinishedAt - 90000,
    message: "Approved the desktop hero",
    itemId: "image-desktop-final",
    itemTitle: "Desktop hero — focused version",
    type: "status_changed",
  });
  appendRoomActivity(room, {
    actor: "Noah",
    createdAt: sampleFinishedAt - 45000,
    message: "Confirmed the launch decision",
    itemId: landingApprovalSampleVersionItemId,
    itemTitle: "Decision record — ready to ship",
    type: "comment_created",
  });
  appendRoomActivity(room, {
    actor: "Mira",
    createdAt: sampleFinishedAt - 30000,
    message: "Completed the decision record",
    itemId: landingApprovalSampleVersionItemId,
    itemTitle: "Decision record — ready to ship",
    type: "status_changed",
  });
  room.updatedAt = sampleFinishedAt - 30000;
  return room;
}

function getClients(roomId: string) {
  if (!clientsByRoom.has(roomId)) {
    clientsByRoom.set(roomId, new Set());
  }

  return clientsByRoom.get(roomId)!;
}

function localStoreFilePath() {
  return path.join(process.cwd(), ".roomboard-data", "rooms.json");
}

function loadLocalDocuments() {
  if (globalForRooms.localRoomDocuments) {
    return globalForRooms.localRoomDocuments;
  }

  const documents = new Map<string, RoomDocument>();

  try {
    const parsed = JSON.parse(readFileSync(localStoreFilePath(), "utf8")) as RoomDocument[];
    for (const room of parsed) {
      documents.set(room.id, room);
    }
  } catch {
    // First local run: the file will be written after the first mutation.
  }

  globalForRooms.localRoomDocuments = documents;
  return documents;
}

function persistLocalDocuments(documents: Map<string, RoomDocument>) {
  const filePath = localStoreFilePath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(Array.from(documents.values()), null, 2));
}

function createLocalRoomStore(): RoomStore {
  return {
    async delete(roomId) {
      const documents = loadLocalDocuments();
      documents.delete(roomId);
      persistLocalDocuments(documents);
    },
    async get(roomId) {
      const room = loadLocalDocuments().get(roomId);
      return room ? cloneRoom(room) : null;
    },
    async list() {
      return Array.from(loadLocalDocuments().values()).map(cloneRoom);
    },
    async save(room, expectedVersion) {
      const documents = loadLocalDocuments();
      if (expectedVersion !== undefined) {
        const stored = documents.get(room.id);
        if (!stored || (stored.version ?? 0) !== expectedVersion) {
          return false;
        }
      }
      documents.set(room.id, cloneRoom(room));
      persistLocalDocuments(documents);
      return true;
    },
  };
}

function getSupabaseClient() {
  if (globalForRooms.supabaseRoomClient) {
    return globalForRooms.supabaseRoomClient;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  globalForRooms.supabaseRoomClient = createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
  return globalForRooms.supabaseRoomClient;
}

export function getRoomStoreMode() {
  return getSupabaseClient() ? "supabase" : "local";
}

function createSupabaseRoomStore(client: SupabaseClient): RoomStore {
  return {
    async delete(roomId) {
      await client.from(ROOMBOARD_SUPABASE_TABLE).delete().eq("id", roomId).throwOnError();
    },
    async get(roomId) {
      const { data } = await client
        .from(ROOMBOARD_SUPABASE_TABLE)
        .select("document")
        .eq("id", roomId)
        .maybeSingle()
        .throwOnError();

      return data?.document ? normalizeRoomDocument(data.document as RoomDocument) : null;
    },
    async list() {
      const { data } = await client
        .from(ROOMBOARD_SUPABASE_TABLE)
        .select("document")
        .is("closed_at", null)
        .throwOnError();

      return (data ?? []).map((row) => normalizeRoomDocument(row.document as RoomDocument));
    },
    async save(room, expectedVersion) {
      const row = {
        closed_at: room.closedAt ?? null,
        document: room,
        id: room.id,
        updated_at: new Date(room.updatedAt).toISOString(),
      };

      if (expectedVersion === undefined) {
        await client.from(ROOMBOARD_SUPABASE_TABLE).upsert(row, { onConflict: "id" }).throwOnError();
        return true;
      }

      // Conditional update: only write when the stored document still carries
      // the version we read. Legacy rows without a version count as 0.
      const { data } = await client
        .from(ROOMBOARD_SUPABASE_TABLE)
        .update(row)
        .eq("id", room.id)
        .or(`document->>version.is.null,document->>version.eq.${expectedVersion}`)
        .select("id")
        .throwOnError();

      return (data?.length ?? 0) > 0;
    },
  };
}

function getRoomStore() {
  if (globalForRooms.roomStore) {
    return globalForRooms.roomStore;
  }

  const supabase = getSupabaseClient();
  globalForRooms.roomStore = supabase ? createSupabaseRoomStore(supabase) : createLocalRoomStore();
  return globalForRooms.roomStore;
}

function toRoomSummary(
  room: RoomDocument,
  items: RoomItem[] = room.items,
  options: { shareInviteRole?: RoomInviteRole } = {},
): RoomSummary {
  const participants = new Map<string, { name: string; color: string }>();
  const statusCounts = getEmptyStatusCounts();

  for (const item of items) {
    statusCounts[normalizeRoomItemStatus(item.status)] += 1;

    if (item.author && !participants.has(item.author)) {
      participants.set(item.author, { name: item.author, color: item.color });
    }

    for (const comment of item.comments) {
      if (comment.author && !participants.has(comment.author)) {
        participants.set(comment.author, { name: comment.author, color: comment.color });
      }
    }
  }

  const shareInviteToken = options.shareInviteRole ? room.inviteTokens?.[options.shareInviteRole] : undefined;

  return {
    id: room.id,
    name: room.name,
    access: room.access,
    visibility: room.visibility ?? "private",
    isSnapshotPublic: room.isSnapshotPublic === true,
    shareInvite:
      options.shareInviteRole && shareInviteToken
        ? {
            role: options.shareInviteRole,
            token: shareInviteToken,
          }
        : undefined,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    itemCount: items.length,
    noteCount: items.filter((item) => item.type === "note").length,
    imageCount: items.filter((item) => item.type === "image").length,
    commentCount: items.reduce((total, item) => total + item.comments.length, 0),
    connectionCount: dedupeRoomConnections(room.connections).length,
    activityCount: room.activities?.length ?? 0,
    liveCount: clientsByRoom.get(room.id)?.size ?? 0,
    statusCounts,
    participants: Array.from(participants.values()).slice(0, 4),
    previewItems: items.slice(0, 5).map((item) => ({
      type: item.type,
      status: normalizeRoomItemStatus(item.status),
      color: item.color,
      imageUrl: item.imageUrl,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    })),
  };
}

async function resolveRoomItemUploads(items: RoomItem[]) {
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      imageUrl: await resolveRoomUploadUrl(item.imageUrl),
    })),
  );
}

async function toRoomSummaryWithUploads(room: RoomDocument, options: { shareInviteRole?: RoomInviteRole } = {}) {
  return toRoomSummary(room, await resolveRoomItemUploads(room.items), options);
}

const recapStatusLabels: Record<RoomItemStatus, string> = {
  approved: "Approved",
  changes_requested: "Changes requested",
  open: "Open",
  reviewing: "In review",
};
const recapStatusOrder: RoomItemStatus[] = ["approved", "changes_requested", "reviewing", "open"];

function compactRecapText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function getSourceHost(imageUrl?: string) {
  if (!imageUrl) {
    return undefined;
  }

  try {
    return new URL(imageUrl).hostname.replace(/^www\./, "");
  } catch {
    return "image source";
  }
}

function toRecapItem(item: RoomItem): RoomRecapItem {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    body: compactRecapText(item.body, 120),
    author: item.author,
    commentCount: item.comments.length,
    comments: item.comments.slice(0, 2).map((comment) => `${comment.author}: ${compactRecapText(comment.body, 80)}`),
    decisionSignalCount: item.decisionSignals?.length ?? 0,
    source: getSourceHost(item.imageUrl),
  };
}

const decisionBriefStatusOrder: Record<Exclude<RoomItemStatus, "approved">, number> = {
  changes_requested: 0,
  reviewing: 1,
  open: 2,
};

export function buildRoomDecisionBrief(items: RoomItem[]): RoomDecisionBrief {
  const approvedCount = items.filter((item) => item.status === "approved").length;
  const revisionCount = items.filter((item) => item.status === "changes_requested").length;
  const pendingCount = items.filter((item) => item.status === "open" || item.status === "reviewing").length;
  const nextSteps = items
    .filter((item): item is RoomItem & { status: Exclude<RoomItemStatus, "approved"> } => item.status !== "approved")
    .sort((a, b) => {
      const priority = decisionBriefStatusOrder[a.status] - decisionBriefStatusOrder[b.status];
      return priority || b.updatedAt - a.updatedAt;
    })
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      status: item.status,
      title: item.title.trim() || "Untitled card",
    }));

  const headline =
    revisionCount > 0
      ? `${revisionCount} ${revisionCount === 1 ? "card needs" : "cards need"} revisions before the decision is final.`
      : pendingCount > 0
        ? `${pendingCount} ${pendingCount === 1 ? "card still needs" : "cards still need"} a decision.`
        : items.length > 0
          ? "Every card has a decision. This room is ready to share."
          : "This board is ready for its first decision.";

  return {
    approvedCount,
    headline,
    nextStep: nextSteps[0],
    pendingCount,
    revisionCount,
    nextSteps,
  };
}

export function buildRoomRecap(
  snapshot: Pick<RoomSnapshot, "activities" | "connections" | "items" | "room">,
): RoomRecap {
  const sections = recapStatusOrder.map((status) => {
    const sectionItems = snapshot.items
      .filter((item) => item.status === status)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(toRecapItem);

    return {
      status,
      label: recapStatusLabels[status],
      count: sectionItems.length,
      items: sectionItems,
    };
  });
  const decidedCount = (snapshot.room.statusCounts.approved ?? 0) + (snapshot.room.statusCounts.changes_requested ?? 0);
  const unresolvedCount = (snapshot.room.statusCounts.open ?? 0) + (snapshot.room.statusCounts.reviewing ?? 0);
  const recentActivities = [...snapshot.activities].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  const markdownLines = [
    `# Roomboard recap: ${snapshot.room.name}`,
    "",
    `Updated: ${new Date(snapshot.room.updatedAt).toISOString()}`,
    `Progress: ${decidedCount}/${snapshot.items.length} cards decided, ${unresolvedCount} unresolved`,
    `Board: ${snapshot.room.noteCount} notes, ${snapshot.room.imageCount} images, ${snapshot.room.commentCount} comments, ${snapshot.connections.length} links`,
    "",
  ];

  for (const section of sections) {
    markdownLines.push(`## ${section.label} (${section.count})`);

    if (section.items.length === 0) {
      markdownLines.push("- None");
    } else {
      for (const item of section.items) {
        const meta = [
          item.type,
          item.author ? `by ${item.author}` : "",
          item.commentCount > 0 ? `${item.commentCount} comments` : "",
          item.decisionSignalCount > 0 ? `${item.decisionSignalCount} decision signals` : "",
          item.source ? `source: ${item.source}` : "",
        ]
          .filter(Boolean)
          .join(" | ");
        const body = item.body ? ` - ${item.body}` : "";
        markdownLines.push(`- ${item.title}${body}${meta ? ` (${meta})` : ""}`);
        for (const comment of item.comments ?? []) {
          markdownLines.push(`  - ${comment}`);
        }
      }
    }

    markdownLines.push("");
  }

  const brief = buildRoomDecisionBrief(snapshot.items);
  markdownLines.push("## Decision brief");
  markdownLines.push(`- ${brief.headline}`);
  for (const step of brief.nextSteps) {
    markdownLines.push(`- Next: ${step.title} (${step.status.replace("_", " ")})`);
  }
  markdownLines.push("");

  if (snapshot.connections.length > 0) {
    const titleById = new Map(snapshot.items.map((item) => [item.id, item.title.trim() || "Untitled card"]));
    markdownLines.push("## Card links");
    for (const connection of snapshot.connections) {
      markdownLines.push(
        `- ${titleById.get(connection.from) ?? connection.from} -> ${titleById.get(connection.to) ?? connection.to}`,
      );
    }
    markdownLines.push("");
  }

  if (recentActivities.length > 0) {
    markdownLines.push("## Recent activity");
    for (const activity of recentActivities) {
      markdownLines.push(`- ${activity.message} - ${activity.actor}, ${new Date(activity.createdAt).toISOString()}`);
    }
  }

  return {
    roomId: snapshot.room.id,
    roomName: snapshot.room.name,
    updatedAt: snapshot.room.updatedAt,
    totalItems: snapshot.items.length,
    decidedCount,
    unresolvedCount,
    noteCount: snapshot.room.noteCount,
    imageCount: snapshot.room.imageCount,
    commentCount: snapshot.room.commentCount,
    connectionCount: snapshot.connections.length,
    sections,
    recentActivities,
    markdown: markdownLines.join("\n").trim(),
  };
}

async function ensureSampleRoom(config: SampleRoomConfig) {
  const store = getRoomStore();
  const existing = await store.get(config.id);

  if (!existing) {
    await store.save(createSampleRoomDocument(config));
    return;
  }

  let shouldSave = false;

  if (existing.name !== config.name) {
    existing.name = config.name;
    shouldSave = true;
  }

  const hasExpectedTemplateShape =
    config.starterTemplate === "moodboard"
      ? existing.items.some((item) => item.id === "note-direction")
      : config.starterTemplate === "visual-decision"
        ? existing.items.some((item) => item.id === "note-material") &&
          existing.items.some((item) => item.id === "note-feedback") &&
          !existing.items.some((item) => item.id === "image-option-a" || item.id === "image-option-b")
        : existing.items.some((item) => item.id === landingApprovalSampleVersionItemId) &&
          existing.items.every((item) => item.status === "approved");
  if (existing.items.length < 5 || !hasExpectedTemplateShape) {
    const refreshedSample = createSampleRoomDocument(config, existing.ownerToken);
    existing.items = refreshedSample.items;
    existing.connections = refreshedSample.connections;
    existing.activities = refreshedSample.activities;
    shouldSave = true;
  }

  if (existing.ownerToken === DEFAULT_ROOM_OWNER_TOKEN || existing.access !== "locked") {
    existing.ownerToken = crypto.randomUUID();
    existing.inviteTokens = createInviteTokens();
    existing.access = "locked";
    existing.visibility = "public";
    shouldSave = true;
  }

  if (shouldSave) {
    existing.updatedAt = Date.now();
    await store.save(existing);
  }
}

async function ensureDefaultRoom() {
  for (const config of sampleRoomConfigs) {
    await ensureSampleRoom(config);
  }
}

async function getExistingRoom(roomId = DEFAULT_ROOM_ID) {
  await ensureDefaultRoom();
  const room = await getRoomStore().get(roomId);
  return room && !room.closedAt ? room : null;
}

/**
 * A room existed when a request was authorized but was gone by the time it was
 * mutated — closed from another tab, or deleted mid-flight. Routes translate
 * this into 404 instead of letting it surface as an unhandled 500.
 */
export class RoomNotFoundError extends Error {
  readonly roomId: string;

  constructor(roomId: string) {
    super(`Room "${roomId}" not found.`);
    this.name = "RoomNotFoundError";
    this.roomId = roomId;
  }
}

/**
 * Checks the name as well as the prototype: route and library code can end up in
 * separate bundle chunks, and a duplicated class would defeat a bare instanceof.
 */
export function isRoomNotFoundError(error: unknown): error is RoomNotFoundError {
  return error instanceof RoomNotFoundError || (error instanceof Error && error.name === "RoomNotFoundError");
}

async function getRoom(roomId = DEFAULT_ROOM_ID) {
  const room = await getExistingRoom(roomId);

  if (!room) {
    throw new RoomNotFoundError(roomId);
  }

  return room;
}

function normalizeRoomCredentials(input?: RoomCredentialsInput): RoomCredentials {
  if (!input) {
    return {};
  }

  if (typeof input === "string") {
    return { ownerToken: input };
  }

  return {
    inviteToken: input.inviteToken ?? null,
    ownerToken: input.ownerToken ?? null,
  };
}

function getRoomRole(room: RoomDocument, credentialsInput?: RoomCredentialsInput): RoomRole | null {
  const credentials = normalizeRoomCredentials(credentialsInput);

  if (credentials.ownerToken && credentials.ownerToken === room.ownerToken) {
    return "owner";
  }

  const inviteExpired = room.inviteExpiresAt !== undefined && room.inviteExpiresAt <= Date.now();

  if (!inviteExpired && credentials.inviteToken && credentials.inviteToken === room.inviteTokens?.editor) {
    return "editor";
  }

  if (!inviteExpired && credentials.inviteToken && credentials.inviteToken === room.inviteTokens?.viewer) {
    return "viewer";
  }

  if (isSampleRoomId(room.id)) {
    return "viewer";
  }

  if (room.access === "link") {
    return "editor";
  }

  return null;
}

function toRoomPermissions(role: RoomRole): RoomPermissions {
  return {
    canEdit: role === "owner" || role === "editor",
    canManage: role === "owner",
    role,
  };
}

/** Thrown when two writers race the same room document and the loser exhausts retries. */
export class RoomConflictError extends Error {
  readonly roomId: string;

  constructor(roomId: string) {
    super(`Room "${roomId}" changed while the update was being saved.`);
    this.name = "RoomConflictError";
    this.roomId = roomId;
  }
}

export function isRoomConflictError(error: unknown): error is RoomConflictError {
  return error instanceof RoomConflictError || (error instanceof Error && error.name === "RoomConflictError");
}

async function mutateRoom<T>(roomId: string, mutation: RoomMutation<T>) {
  // Read-modify-write guarded by a version check: a concurrent writer bumps
  // the version, our conditional save fails, and we re-read and retry once.
  // Beyond that we surface a conflict instead of silently dropping a write.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const room = await getRoom(roomId);
    const expectedVersion = room.version ?? 0;
    const result = mutation(room);
    room.connections = dedupeRoomConnections(room.connections);
    room.updatedAt = Date.now();
    room.version = expectedVersion + 1;
    // Capped audit trail: every committed version records the board shape so
    // the room's evolution is inspectable without storing full diffs.
    room.history = [
      ...(room.history ?? []),
      {
        version: room.version,
        updatedAt: room.updatedAt,
        itemCount: room.items.length,
        connectionCount: room.connections.length,
        commentCount: room.items.reduce((total, item) => total + item.comments.length, 0),
      },
    ].slice(-50);

    if (await getRoomStore().save(room, expectedVersion)) {
      await publishRoomSnapshot(roomId);
      return result;
    }
  }

  throw new RoomConflictError(roomId);
}

export async function createRoom(
  name: string,
  visibility: RoomVisibility = "private",
  starter: boolean | RoomStarterTemplate = false,
  access: RoomAccess = "locked",
) {
  await ensureDefaultRoom();
  const room = createRoomDocument(
    slugifyRoomId(name),
    name.trim().slice(0, 80) || "Untitled room",
    starter,
    crypto.randomUUID(),
    visibility,
    access,
  );
  await getRoomStore().save(room);

  return {
    ownerToken: room.ownerToken,
    room: toRoomSummary(room, room.items, { shareInviteRole: "editor" }),
  };
}

function normalizeRoomListAccess(access?: RoomListAccess): {
  inviteTokens: Record<string, string>;
  ownerTokens: Record<string, string>;
} {
  if (!access) {
    return { inviteTokens: {}, ownerTokens: {} };
  }

  const structuredAccess = access as {
    inviteTokens?: unknown;
    ownerTokens?: unknown;
  };
  const hasStructuredTokens =
    (structuredAccess.ownerTokens !== undefined && typeof structuredAccess.ownerTokens === "object") ||
    (structuredAccess.inviteTokens !== undefined && typeof structuredAccess.inviteTokens === "object");

  if (hasStructuredTokens) {
    return {
      inviteTokens: (structuredAccess.inviteTokens as Record<string, string> | undefined) ?? {},
      ownerTokens: (structuredAccess.ownerTokens as Record<string, string> | undefined) ?? {},
    };
  }

  return { inviteTokens: {}, ownerTokens: access as Record<string, string> };
}

export async function listRooms(access?: RoomListAccess) {
  await ensureDefaultRoom();
  const { inviteTokens, ownerTokens } = normalizeRoomListAccess(access);

  const rooms = (await getRoomStore().list())
    .filter((room) => !room.closedAt)
    .filter((room) => {
      if (ownerTokens[room.id] === room.ownerToken) return true;
      const inviteToken = inviteTokens[room.id];
      if (inviteToken && (inviteToken === room.inviteTokens?.editor || inviteToken === room.inviteTokens?.viewer)) {
        return true;
      }
      return false;
    });

  return (
    await Promise.all(
      rooms.map((room) =>
        toRoomSummaryWithUploads(room, ownerTokens[room.id] === room.ownerToken ? { shareInviteRole: "editor" } : {}),
      ),
    )
  ).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getRoomSummary(roomId = DEFAULT_ROOM_ID): Promise<RoomSummary | null> {
  const room = await getExistingRoom(roomId);
  return room ? toRoomSummaryWithUploads(room) : null;
}

export async function listRoomItems(roomId = DEFAULT_ROOM_ID) {
  return (await getRoom(roomId)).items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function listRoomConnections(roomId = DEFAULT_ROOM_ID) {
  return dedupeRoomConnections((await getRoom(roomId)).connections);
}

export async function getRoomSnapshot(
  roomId = DEFAULT_ROOM_ID,
  credentialsInput?: RoomCredentialsInput,
): Promise<RoomSnapshot | null> {
  const room = await getExistingRoom(roomId);

  if (!room) {
    return null;
  }

  const role = getRoomRole(room, credentialsInput);

  if (!role) {
    return null;
  }

  const permissions = toRoomPermissions(role);
  const items = await resolveRoomItemUploads(room.items.sort((a, b) => a.createdAt - b.createdAt));

  return {
    inviteTokens: permissions.canManage ? room.inviteTokens : undefined,
    room: toRoomSummary(room, items),
    permissions,
    items,
    connections: dedupeRoomConnections(room.connections),
    activities: (room.activities ?? []).slice(0, 50),
    history: room.history ?? [],
  };
}

export async function getPublicRoomSnapshot(roomId = DEFAULT_ROOM_ID): Promise<RoomSnapshot | null> {
  const room = await getExistingRoom(roomId);

  if (!room || !room.isSnapshotPublic) {
    return null;
  }

  const items = await resolveRoomItemUploads(room.items.sort((a, b) => a.createdAt - b.createdAt));

  return {
    room: toRoomSummary(room, items),
    permissions: toRoomPermissions("viewer"),
    items,
    connections: dedupeRoomConnections(room.connections),
    activities: (room.activities ?? []).slice(0, 50),
  };
}

export async function publishRoomSnapshot(roomId = DEFAULT_ROOM_ID) {
  const clients = getClients(roomId);

  for (const client of clients) {
    try {
      const snapshot = await getRoomSnapshot(roomId, client.credentials);

      if (!snapshot) {
        clients.delete(client);
        continue;
      }

      client.controller.enqueue(encode("room", snapshot));
    } catch {
      clients.delete(client);
    }
  }
}

export async function getRoomPermissions(roomId = DEFAULT_ROOM_ID, credentialsInput?: RoomCredentialsInput) {
  const room = await getExistingRoom(roomId);

  if (!room) {
    return null;
  }

  const role = getRoomRole(room, credentialsInput);
  return role ? toRoomPermissions(role) : null;
}

export async function isRoomOwner(roomId = DEFAULT_ROOM_ID, credentialsInput?: RoomCredentialsInput) {
  const room = await getExistingRoom(roomId);
  return Boolean(room && getRoomRole(room, credentialsInput) === "owner");
}

export async function canAccessRoom(roomId = DEFAULT_ROOM_ID, credentialsInput?: RoomCredentialsInput) {
  return Boolean(await getRoomPermissions(roomId, credentialsInput));
}

export async function canEditRoom(roomId = DEFAULT_ROOM_ID, credentialsInput?: RoomCredentialsInput) {
  return Boolean((await getRoomPermissions(roomId, credentialsInput))?.canEdit);
}

export async function setRoomAccess(roomId: string, access: RoomAccess, credentialsInput?: RoomCredentialsInput) {
  if (!(await isRoomOwner(roomId, credentialsInput))) {
    return null;
  }

  return mutateRoom(roomId, (room) => {
    room.access = access;
    appendRoomActivity(room, {
      actor: "Creator",
      message: `Changed room access to ${access === "locked" ? "invite only" : "link editing"}.`,
      type: "access_changed",
    });
    return toRoomSummary(room);
  });
}

export async function setRoomVisibility(
  roomId: string,
  visibility: RoomVisibility,
  credentialsInput?: RoomCredentialsInput,
) {
  if (!(await isRoomOwner(roomId, credentialsInput))) {
    return null;
  }

  return mutateRoom(roomId, (room) => {
    room.visibility = visibility;
    appendRoomActivity(room, {
      actor: "Creator",
      message: `Changed room visibility to ${visibility}.`,
      type: "access_changed",
    });
    return toRoomSummary(room);
  });
}

export async function setRoomSnapshotPublic(
  roomId: string,
  isSnapshotPublic: boolean,
  credentialsInput?: RoomCredentialsInput,
) {
  if (!(await isRoomOwner(roomId, credentialsInput))) {
    return null;
  }

  return mutateRoom(roomId, (room) => {
    room.isSnapshotPublic = isSnapshotPublic;
    appendRoomActivity(room, {
      actor: "Creator",
      message: isSnapshotPublic ? "Enabled the public read-only snapshot." : "Disabled the public read-only snapshot.",
      type: "access_changed",
    });
    return toRoomSummary(room);
  });
}

/**
 * Owner-only: set (or clear with null) the epoch-ms instant after which invite
 * tokens stop granting access. The owner token is never affected.
 */
export async function setRoomInviteExpiry(
  roomId: string,
  inviteExpiresAt: number | null,
  credentialsInput?: RoomCredentialsInput,
) {
  if (!(await isRoomOwner(roomId, credentialsInput))) {
    return null;
  }

  return mutateRoom(roomId, (room) => {
    room.inviteExpiresAt = inviteExpiresAt ?? undefined;
    appendRoomActivity(room, {
      actor: "Creator",
      message: inviteExpiresAt
        ? `Invite links now expire ${new Date(inviteExpiresAt).toISOString()}.`
        : "Removed the invite link expiry.",
      type: "access_changed",
    });
    return toRoomSummary(room);
  });
}

export async function closeRoom(roomId = DEFAULT_ROOM_ID, credentialsInput?: RoomCredentialsInput) {
  const room = await getExistingRoom(roomId);

  if (!room || !(await isRoomOwner(roomId, credentialsInput))) {
    return null;
  }

  const summary = toRoomSummary(room);
  const message = encode("closed", { room: summary });
  appendRoomActivity(room, {
    actor: "Creator",
    message: "Closed the room.",
    type: "room_closed",
  });
  room.closedAt = Date.now();
  room.updatedAt = Date.now();
  await getRoomStore().save(room);

  const clients = getClients(roomId);
  for (const client of clients) {
    try {
      client.controller.enqueue(message);
      client.controller.close();
    } catch {
      // The browser may already have dropped the SSE connection.
    }
  }

  clientsByRoom.delete(roomId);
  return summary;
}

export async function deleteRoomPermanently(roomId: string, credentialsInput?: RoomCredentialsInput) {
  const room = await getRoomStore().get(roomId);

  if (!room || getRoomRole(room, credentialsInput) !== "owner") {
    return false;
  }

  await getRoomStore().delete(roomId);

  const clients = getClients(roomId);
  for (const client of clients) {
    try {
      client.controller.enqueue(encode("deleted", { roomId }));
      client.controller.close();
    } catch {
      // The browser may already have dropped the realtime connection.
    }
  }

  clientsByRoom.delete(roomId);
  return true;
}

export async function beginRoomPermanentDeletion(roomId: string, credentialsInput?: RoomCredentialsInput) {
  const room = await getRoomStore().get(roomId);

  if (!room || getRoomRole(room, credentialsInput) !== "owner") {
    return false;
  }

  const requestedAt = room.deletionRequestedAt ?? Date.now();
  room.deletionRequestedAt = requestedAt;
  room.closedAt ??= requestedAt;
  room.updatedAt = Date.now();
  await getRoomStore().save(room);

  const clients = getClients(roomId);
  for (const client of clients) {
    try {
      client.controller.enqueue(encode("closed", { room: toRoomSummary(room) }));
      client.controller.close();
    } catch {
      // The browser may already have dropped the realtime connection.
    }
  }

  clientsByRoom.delete(roomId);
  return true;
}

export async function canPermanentlyDeleteRoom(roomId: string, credentialsInput?: RoomCredentialsInput) {
  const room = await getRoomStore().get(roomId);
  return Boolean(room && getRoomRole(room, credentialsInput) === "owner");
}

export async function createRoomItem(
  input: {
    type: RoomItemType;
    title: string;
    body?: string;
    imageUrl?: string;
    author: string;
    color: string;
    status?: RoomItemStatus;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    actor?: string;
  },
  roomId = DEFAULT_ROOM_ID,
) {
  return mutateRoom(roomId, (room) => {
    assertRoomCapacity("items", room.items.length);

    const itemCount = room.items.length;
    const item: RoomItem = {
      id: crypto.randomUUID(),
      type: input.type,
      status: normalizeRoomItemStatus(input.status),
      title: input.title.trim().slice(0, 72) || (input.type === "image" ? "Image" : "Note"),
      body: (input.body ?? "").trim().slice(0, 420),
      imageUrl: input.imageUrl?.trim().slice(0, 2400),
      author: input.author.trim().slice(0, 24) || "Visitor",
      color: normalizeRoomColor(input.color),
      x: clampRoomNumber(input.x, -120 + (itemCount % 5) * 74, -100000, 100000),
      y: clampRoomNumber(input.y, -40 + (itemCount % 4) * 58, -100000, 100000),
      width: clampRoomNumber(input.width, input.type === "image" ? 268 : 236, 120, 1200),
      height: clampRoomNumber(input.height, input.type === "image" ? 220 : 156, 80, 1200),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      comments: [],
    };

    room.items.push(item);
    appendRoomActivity(room, {
      actor: input.actor ?? input.author,
      itemId: item.id,
      itemTitle: item.title,
      message: `Added ${item.type === "image" ? "image" : "note"} "${item.title}".`,
      type: "item_created",
    });
    return item;
  });
}

export async function updateRoomItem(
  input: {
    id: string;
    title?: string;
    body?: string;
    imageUrl?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    color?: string;
    status?: RoomItemStatus;
    styleVariant?: RoomItemStyleVariant;
    actor?: string;
  },
  roomId = DEFAULT_ROOM_ID,
) {
  return mutateRoom(roomId, (room) => {
    const item = room.items.find((candidate) => candidate.id === input.id);

    if (!item) {
      return null;
    }

    const before = {
      body: item.body,
      color: item.color,
      imageUrl: item.imageUrl,
      status: item.status,
      styleVariant: item.styleVariant,
      title: item.title,
      width: item.width,
      height: item.height,
      x: item.x,
      y: item.y,
    };

    if (input.title !== undefined) {
      item.title = input.title.trim().slice(0, 72) || item.title;
    }

    if (input.body !== undefined) {
      item.body = input.body.trim().slice(0, 420);
    }

    if (input.imageUrl !== undefined) {
      item.imageUrl = input.imageUrl.trim().slice(0, 2400);
    }

    if (input.color !== undefined) {
      item.color = normalizeRoomColor(input.color, item.color);
    }

    if (input.status !== undefined) {
      item.status = normalizeRoomItemStatus(input.status);
    }

    if (input.styleVariant !== undefined) {
      item.styleVariant = input.styleVariant;
    }

    if (Number.isFinite(input.x)) {
      item.x = clampRoomNumber(input.x, item.x, -100000, 100000);
    }

    if (Number.isFinite(input.y)) {
      item.y = clampRoomNumber(input.y, item.y, -100000, 100000);
    }

    if (Number.isFinite(input.width)) {
      item.width = clampRoomNumber(input.width, item.width, 120, 1200);
    }

    if (Number.isFinite(input.height)) {
      item.height = clampRoomNumber(input.height, item.height, 80, 1200);
    }

    item.updatedAt = Date.now();
    const moved =
      (Number.isFinite(input.x) && item.x !== before.x) || (Number.isFinite(input.y) && item.y !== before.y);
    const statusChanged = input.status !== undefined && item.status !== before.status;
    const renamed = item.title !== before.title;
    const contentChanged =
      item.body !== before.body ||
      item.imageUrl !== before.imageUrl ||
      item.color !== before.color ||
      item.styleVariant !== before.styleVariant ||
      item.width !== before.width ||
      item.height !== before.height;

    if (statusChanged) {
      appendRoomActivity(room, {
        actor: input.actor,
        itemId: item.id,
        itemTitle: item.title,
        message: `Set "${item.title}" to ${item.status.replace("_", " ")}.`,
        type: "status_changed",
      });
    } else if (moved) {
      appendRoomActivity(room, {
        actor: input.actor,
        itemId: item.id,
        itemTitle: item.title,
        message: `Moved "${item.title}".`,
        type: "item_moved",
      });
    } else if (renamed || contentChanged) {
      appendRoomActivity(room, {
        actor: input.actor,
        itemId: item.id,
        itemTitle: item.title,
        message: `${renamed ? "Renamed" : "Updated"} "${item.title}".`,
        type: "item_updated",
      });
    }

    return item;
  });
}

export async function addRoomComment(
  input: {
    itemId: string;
    author: string;
    body: string;
    color: string;
  },
  roomId = DEFAULT_ROOM_ID,
) {
  return mutateRoom(roomId, (room) => {
    const item = room.items.find((candidate) => candidate.id === input.itemId);

    if (!item) {
      return null;
    }

    const commentCount = room.items.reduce((total, candidate) => total + candidate.comments.length, 0);
    assertRoomCapacity("comments", commentCount);

    const comment: RoomComment = {
      id: crypto.randomUUID(),
      author: input.author.trim().slice(0, 24) || "Visitor",
      body: input.body.trim().slice(0, 320),
      color: normalizeRoomColor(input.color),
      createdAt: Date.now(),
    };

    item.comments.push(comment);
    item.updatedAt = Date.now();
    appendRoomActivity(room, {
      actor: comment.author,
      itemId: item.id,
      itemTitle: item.title,
      message: `Commented on "${item.title}".`,
      type: "comment_created",
    });
    return comment;
  });
}

export async function toggleRoomItemDecisionSignal(
  input: { itemId: string; voterId: string; voter: string; color: string },
  roomId = DEFAULT_ROOM_ID,
) {
  return mutateRoom(roomId, (room) => {
    const item = room.items.find((candidate) => candidate.id === input.itemId);
    const voterId = input.voterId.trim().slice(0, 96);
    const voter = input.voter.trim().slice(0, 24) || "Visitor";
    if (!item || !voterId) return null;

    const signals = item.decisionSignals ?? [];
    const existingIndex = signals.findIndex((signal) =>
      signal.voterId ? signal.voterId === voterId : signal.voter.toLowerCase() === voter.toLowerCase(),
    );
    if (existingIndex < 0) {
      assertRoomCapacity("decisionSignalsPerItem", signals.length);
    }
    item.decisionSignals =
      existingIndex >= 0
        ? signals.filter((_, index) => index !== existingIndex)
        : [...signals, { voterId, voter, color: normalizeRoomColor(input.color), createdAt: Date.now() }];
    item.updatedAt = Date.now();
    appendRoomActivity(room, {
      actor: voter,
      itemId: item.id,
      itemTitle: item.title,
      message: existingIndex >= 0 ? `Removed support for "${item.title}".` : `Backed "${item.title}" for the decision.`,
      type: "decision_signal_updated",
    });
    return item;
  });
}

export async function createRoomConnection(
  from: string,
  to: string,
  color?: string,
  roomId = DEFAULT_ROOM_ID,
  actor?: string,
  sides?: {
    fromSide?: RoomConnectionSide;
    toSide?: RoomConnectionSide;
  },
) {
  return mutateRoom(roomId, (room) => {
    const fromSide = normalizeRoomConnectionSide(sides?.fromSide);
    const toSide = normalizeRoomConnectionSide(sides?.toSide);
    const pairKey = getRoomConnectionPairKey(from, to);
    const existing = room.connections.find(
      (connection) => getRoomConnectionPairKey(connection.from, connection.to) === pairKey,
    );

    if (existing) {
      const previousFromSide = existing.fromSide;
      const previousToSide = existing.toSide;
      const directionChanged = existing.from !== from || existing.to !== to;
      existing.from = from;
      existing.to = to;
      existing.fromSide = fromSide ?? (directionChanged ? previousToSide : previousFromSide);
      existing.toSide = toSide ?? (directionChanged ? previousFromSide : previousToSide);
      existing.color = normalizeRoomColor(color, existing.color);

      if (directionChanged) {
        const fromItem = room.items.find((item) => item.id === from);
        const toItem = room.items.find((item) => item.id === to);
        appendRoomActivity(room, {
          actor,
          itemId: from,
          itemTitle: fromItem?.title,
          message: `Reversed link from "${fromItem?.title ?? "card"}" to "${toItem?.title ?? "card"}".`,
          type: "connection_created",
        });
      }

      return existing;
    }

    assertRoomCapacity("connections", room.connections.length);

    const connection: RoomConnection = {
      id: crypto.randomUUID(),
      from,
      fromSide,
      to,
      toSide,
      color: normalizeRoomColor(color),
    };

    room.connections.push(connection);
    const fromItem = room.items.find((item) => item.id === from);
    const toItem = room.items.find((item) => item.id === to);
    appendRoomActivity(room, {
      actor,
      itemId: from,
      itemTitle: fromItem?.title,
      message: `Linked "${fromItem?.title ?? "card"}" to "${toItem?.title ?? "card"}".`,
      type: "connection_created",
    });
    return connection;
  });
}

export async function reverseRoomConnection(id: string, roomId = DEFAULT_ROOM_ID, actor?: string) {
  return mutateRoom(roomId, (room) => {
    const connection = room.connections.find((candidate) => candidate.id === id);

    if (!connection) {
      return null;
    }

    const previousFrom = connection.from;
    const previousFromSide = connection.fromSide;
    connection.from = connection.to;
    connection.to = previousFrom;
    connection.fromSide = connection.toSide;
    connection.toSide = previousFromSide;

    const fromItem = room.items.find((item) => item.id === connection.from);
    const toItem = room.items.find((item) => item.id === connection.to);
    appendRoomActivity(room, {
      actor,
      itemId: connection.from,
      itemTitle: fromItem?.title,
      message: `Reversed link from "${fromItem?.title ?? "card"}" to "${toItem?.title ?? "card"}".`,
      type: "connection_created",
    });

    return connection;
  });
}

export async function deleteRoomConnection(id: string, roomId = DEFAULT_ROOM_ID, actor?: string) {
  return mutateRoom(roomId, (room) => {
    const connection = room.connections.find((candidate) => candidate.id === id);
    const before = room.connections.length;
    room.connections = room.connections.filter((connection) => connection.id !== id);
    if (room.connections.length !== before) {
      const fromItem = room.items.find((item) => item.id === connection?.from);
      const toItem = room.items.find((item) => item.id === connection?.to);
      appendRoomActivity(room, {
        actor,
        itemId: connection?.from,
        itemTitle: fromItem?.title,
        message: `Removed link between "${fromItem?.title ?? "card"}" and "${toItem?.title ?? "card"}".`,
        type: "connection_deleted",
      });
    }
    return room.connections.length !== before;
  });
}

export async function duplicateRoomItem(id: string, roomId = DEFAULT_ROOM_ID, actor?: string) {
  return mutateRoom(roomId, (room) => {
    const source = room.items.find((item) => item.id === id);

    if (!source) {
      return null;
    }

    assertRoomCapacity("items", room.items.length);

    const item: RoomItem = {
      ...source,
      id: crypto.randomUUID(),
      author: actor?.trim().slice(0, 24) || source.author,
      comments: [],
      decisionSignals: [],
      createdAt: Date.now(),
      title: `Copy of ${source.title}`.slice(0, 72),
      updatedAt: Date.now(),
      x: Math.round(source.x + 40),
      y: Math.round(source.y + 40),
    };

    room.items.push(item);
    appendRoomActivity(room, {
      actor: actor ?? source.author,
      itemId: item.id,
      itemTitle: item.title,
      message: `Duplicated "${source.title}".`,
      type: "item_created",
    });
    return item;
  });
}

export async function deleteRoomItem(id: string, roomId = DEFAULT_ROOM_ID, actor?: string) {
  return mutateRoom(roomId, (room) => {
    const deletedItem = room.items.find((item) => item.id === id);
    const before = room.items.length;
    room.items = room.items.filter((item) => item.id !== id);

    if (room.items.length === before) {
      return false;
    }

    room.connections = room.connections.filter((connection) => connection.from !== id && connection.to !== id);
    appendRoomActivity(room, {
      actor,
      itemId: id,
      itemTitle: deletedItem?.title,
      message: `Deleted "${deletedItem?.title ?? "card"}".`,
      type: "item_deleted",
    });
    return true;
  });
}

export { type LifecycleCopy, type ProfileJoinCopy, getLifecycleCopy, getProfileJoinCopy } from "./lifecycleCopy.ts";

export function createRoomStream(roomId = DEFAULT_ROOM_ID, credentials?: RoomCredentials) {
  const clients = getClients(roomId);
  const id = crypto.randomUUID();
  let interval: ReturnType<typeof setInterval>;
  let client: RoomClient | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      client = { credentials, id, controller };
      clients.add(client);

      void getRoomSnapshot(roomId, credentials).then((snapshot) => {
        if (snapshot && !closed) {
          try {
            controller.enqueue(encode("room", snapshot));
          } catch {
            closed = true;
            if (client) {
              clients.delete(client);
            }
          }
        }
      });

      interval = setInterval(() => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(encode("ping", { now: Date.now() }));
        } catch {
          closed = true;
          clearInterval(interval);
          if (client) {
            clients.delete(client);
          }
        }
      }, 5000);
    },
    cancel() {
      closed = true;
      clearInterval(interval);

      for (const candidate of clients) {
        if (candidate.id === id) {
          clients.delete(candidate);
        }
      }
    },
  });

  return stream;
}
