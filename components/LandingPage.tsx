"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { RoomItemStatus, RoomSummary } from "@/lib/canvasRoom";
import { LandingLower } from "./LandingLower";
import { captureCampaignAttribution, trackProductEvent } from "@/lib/productAnalytics";
import { prewarmRealtimeEndpoint } from "@/lib/realtimePrewarm";
import { buildRoomPathWithHashToken, normalizeRoomRouteFromInput } from "@/lib/roomLinks";
import { readInviteTokens, readOwnerTokens, writeOwnerToken } from "@/lib/roomTokens";

type LandingPageProps = {
  entryIntent?: StarterId | "general";
  initialStarter?: StarterId;
};

type RoomTab = "all" | "live" | "mine" | "joined";
export type StarterId = "landing-review" | "moodboard" | "blank";
type RoomCreateStarterTemplate = "landing-review" | "moodboard" | "visual-decision";
type PreviewColor = "amber" | "blue" | "green" | "rose" | "violet" | "slate";
type PreviewCardId = "a" | "b" | "c" | "d" | "e";
type MiniPreviewItem = {
  color: PreviewColor;
  imageUrl?: string;
  key: string;
  left: number;
  status: RoomItemStatus;
  top: number;
  type: "image" | "note";
  width: number;
  height: number;
};
type PreviewCursorTarget = { x: number; y: number };
type PreviewActivityFrame = {
  active: PreviewCardId;
  cursorTargets: Record<string, PreviewCursorTarget>;
  label: string;
  offsets: Partial<Record<PreviewCardId, PreviewCursorTarget>>;
  userId: string;
  titles: Partial<Record<PreviewCardId, string>>;
};

const previewActivityFrames: PreviewActivityFrame[] = [
  {
    active: "a",
    cursorTargets: { m: { x: 21, y: 18 }, j: { x: 75, y: 23 }, t: { x: 72, y: 70 } },
    label: "renaming",
    offsets: { a: { x: 0.4, y: -0.4 }, b: { x: 0, y: 0.2 }, d: { x: -0.2, y: 0.1 } },
    userId: "m",
    titles: { a: "Option A" },
  },
  {
    active: "b",
    cursorTargets: { m: { x: 20, y: 19 }, j: { x: 66, y: 22 }, t: { x: 72, y: 70 } },
    label: "dragging",
    offsets: { b: { x: -1.1, y: 0.8 }, c: { x: 0.2, y: 0.2 } },
    userId: "j",
    titles: { b: "@Sarah" },
  },
  {
    active: "c",
    cursorTargets: { m: { x: 21, y: 71 }, j: { x: 75, y: 23 }, t: { x: 70, y: 70 } },
    label: "typing",
    offsets: { c: { x: 0.9, y: -0.8 }, b: { x: -0.4, y: 0.5 } },
    userId: "t",
    titles: { c: "Moodboard" },
  },
  {
    active: "d",
    cursorTargets: { m: { x: 21, y: 71 }, j: { x: 75, y: 24 }, t: { x: 72, y: 70 } },
    label: "editing",
    offsets: { d: { x: 0.7, y: 0.5 }, a: { x: -0.2, y: 0.1 } },
    userId: "m",
    titles: { d: "Option B" },
  },
  {
    active: "b",
    cursorTargets: { m: { x: 20, y: 19 }, j: { x: 67, y: 23 }, t: { x: 72, y: 70 } },
    label: "reviewing",
    offsets: { b: { x: 0.35, y: -0.25 }, c: { x: -0.25, y: 0.4 } },
    userId: "j",
    titles: { b: "@Sarah" },
  },
];

const sampleRoomPathByStarter: Record<StarterId, string> = {
  blank: "/rooms/sample-visual-decision-room",
  "landing-review": "/rooms/pitch-deck-review",
  moodboard: "/rooms/sample-moodboard-decision",
};
const sampleRoomCtaByStarter: Record<StarterId, string> = {
  blank: "View example room",
  "landing-review": "See a finished decision",
  moodboard: "View moodboard sample",
};
type StarterOption = {
  id: StarterId;
  label: string;
  name: string;
  note: string;
  cta: string;
  outcome: string;
  promise: string;
  seeded: boolean;
};

const starterOptions: StarterOption[] = [
  {
    id: "landing-review",
    label: "Launch approval",
    name: "Launch approval",
    note: "Material → review → decision",
    cta: "Start launch approval",
    outcome:
      "A clean launch approval room with prompts for the decision, real material, approval criteria, and the final decision record.",
    promise: "Best when a page or campaign is nearly ready and one clear call is blocking launch.",
    seeded: true,
  },
  {
    id: "moodboard",
    label: "Moodboard",
    name: "Moodboard decision",
    note: "References + criteria",
    cta: "Start moodboard",
    outcome: "A moodboard room with reference images, decision criteria, team comments, and a next-step card.",
    promise: "Best when you need to choose a visual direction with other people.",
    seeded: true,
  },
  {
    id: "blank",
    label: "Blank room",
    name: "Visual decision room",
    note: "Clean canvas + guide",
    cta: "Start blank room",
    outcome: "A private blank canvas with a first decision prompt, invite links, and owner backup link ready.",
    promise: "Best when the material is already prepared and you just need a private room.",
    seeded: false,
  },
];
const heroCopyByIntent: Record<
  StarterId | "general",
  {
    leadLine1: string;
    leadLine2: string;
    signal: string;
    titleLine1: string;
    titleLine2: string;
  }
> = {
  general: {
    leadLine1: "Put the real launch material in one private room and invite the people who need to approve it.",
    leadLine2:
      "Collect approve-or-change calls beside the work, then close with a decision record everyone can follow.",
    signal: "Launch Approval Room",
    titleLine1: "Get the launch decision.",
    titleLine2: "Without the screenshot thread.",
  },
  "landing-review": {
    leadLine1: "Start with a clean approval template for the decision, launch material, criteria, and final record.",
    leadLine2:
      "Invite one reviewer, keep every call attached to the work, and close the room when the launch is decided.",
    signal: "Private Launch Approval",
    titleLine1: "Decide what ships.",
    titleLine2: "Then close the loop.",
  },
  moodboard: {
    leadLine1: "Open a private moodboard room for references, criteria, comments, and direction choices.",
    leadLine2: "Invite the people who need to decide and keep the visual conversation out of scattered threads.",
    signal: "Private Moodboard Decision Room",
    titleLine1: "Choose a visual direction together.",
    titleLine2: "Keep the decision in one room.",
  },
  blank: {
    leadLine1: "Open a private blank room when your screenshots, references, or product states are already ready.",
    leadLine2: "Add the first note, invite editors or viewers, and keep access controlled from the start.",
    signal: "Private Blank Decision Room",
    titleLine1: "Start a clean decision room.",
    titleLine2: "Invite only the right people.",
  },
};
const useCaseOptions: Array<{
  id: string;
  label: string;
  title: string;
  body: string;
  starterId: StarterId;
  cta: string;
}> = [
  {
    id: "landing-review",
    label: "For founders and marketers",
    title: "Review a landing page before traffic hits it.",
    body: "Drop desktop and mobile screenshots, compare copy options, collect comments, and lock the version the team should ship.",
    starterId: "landing-review",
    cta: "Start landing review",
  },
  {
    id: "moodboard",
    label: "For brand and creative work",
    title: "Choose a visual direction without a messy thread.",
    body: "Put references, notes, and decision criteria in one private room so the conversation stays attached to the material.",
    starterId: "moodboard",
    cta: "Start moodboard",
  },
  {
    id: "blank",
    label: "For any visual decision",
    title: "Open a clean room when the material is already ready.",
    body: "Use a blank canvas for screenshots, product states, campaign ideas, or design critique that does not need a starter board.",
    starterId: "blank",
    cta: "Start blank room",
  },
];
const previewBoardCopy: Record<
  StarterId,
  {
    boardTitle: string;
    decision: string;
    sticky: string;
    cards: Record<
      PreviewCardId,
      {
        body: string;
        color: PreviewColor;
        img?: string;
        title: string;
        type: "image" | "note";
      }
    >;
  }
> = {
  "landing-review": {
    boardTitle: "Launch Approval",
    decision: "Hero approved",
    sticky: "Ship the focused version",
    cards: {
      a: {
        type: "image",
        color: "blue",
        title: "Option A",
        body: "Landing v2",
        img: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=460&q=70",
      },
      b: { type: "note", color: "rose", title: "@Sarah", body: "Love the new headline" },
      c: {
        type: "image",
        color: "violet",
        title: "Moodboard",
        body: "Brand explorations",
        img: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=420&q=70",
      },
      d: {
        type: "image",
        color: "green",
        title: "Option B",
        body: "Landing v3",
        img: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=420&q=70",
      },
      e: { type: "note", color: "green", title: "@Tom", body: "This layout is more scannable" },
    },
  },
  moodboard: {
    boardTitle: "Moodboard Decision",
    decision: "Direction A",
    sticky: "Keep the palette warmer",
    cards: {
      a: {
        type: "image",
        color: "amber",
        title: "Reference A",
        body: "Warm editorial",
        img: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=460&q=70",
      },
      b: { type: "note", color: "rose", title: "@Nora", body: "A feels more ownable" },
      c: {
        type: "image",
        color: "violet",
        title: "Reference B",
        body: "Sharper product-led",
        img: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=420&q=70",
      },
      d: { type: "note", color: "green", title: "Criteria", body: "Recognizable first screen" },
      e: { type: "note", color: "blue", title: "Next step", body: "Upload the next mockup" },
    },
  },
  blank: {
    boardTitle: "Visual Decision Room",
    decision: "Ready to decide",
    sticky: "Make the call in one room",
    cards: {
      a: { type: "note", color: "blue", title: "Question", body: "What should we decide?" },
      b: {
        type: "image",
        color: "rose",
        title: "Mockup",
        body: "Option A",
        img: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=420&q=70",
      },
      c: { type: "note", color: "violet", title: "Invite", body: "Copy a ready message" },
      d: { type: "note", color: "green", title: "Viewer link", body: "Read-only decision" },
      e: { type: "note", color: "amber", title: "Status", body: "Open / reviewing / approved" },
    },
  },
};

function getStarterOption(starterId: StarterId) {
  return starterOptions.find((option) => option.id === starterId) ?? starterOptions[0];
}

function normalizeStarterId(value: string | null): StarterId | null {
  const normalized = value?.toLowerCase().replace(/_/g, "-").trim();

  if (!normalized) return null;
  if (["landing", "landing-page", "landing-review", "review"].includes(normalized)) return "landing-review";
  if (["mood", "moodboard", "references", "brand"].includes(normalized)) return "moodboard";
  if (["blank", "empty", "scratch"].includes(normalized)) return "blank";
  return null;
}

function readUrlStarter(): StarterId | null {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  return (
    normalizeStarterId(params.get("starter")) ??
    normalizeStarterId(params.get("template")) ??
    normalizeStarterId(params.get("use_case")) ??
    normalizeStarterId(params.get("campaign"))
  );
}

const LIcon = {
  Logo: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  ),
  Arrow: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  ),
  Plus: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M8 3v10M3 8h10" />
    </svg>
  ),
  External: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M6 3H3v10h10v-3M9 3h4v4M8 8l5-5" />
    </svg>
  ),
  Lock: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  ),
  Globe: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2a9 9 0 0 1 0 12M8 2a9 9 0 0 0 0 12" />
    </svg>
  ),
};

function slugInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trimStart()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 42);
}

function roomNameFromSlug(value: string) {
  return (
    value
      .replace(/-/g, " ")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Landing page review"
  );
}

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.round(diff / 60000));

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function formatCountLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function colorName(color: string): PreviewColor {
  const normalized = color.toLowerCase();

  if (["#ffd166", "#facc5c", "#d4a544", "#f59e0b", "#c4942e"].includes(normalized)) return "amber";
  if (["#0ea5e9", "#48a7ff", "#5b8def", "#3d7eff", "#6366f1"].includes(normalized)) return "blue";
  if (["#10b981", "#4ec18a", "#62d681", "#2d9d6a"].includes(normalized)) return "green";
  if (["#f43f5e", "#ef6b7a", "#ef6f5e", "#d94d5e"].includes(normalized)) return "rose";
  if (["#9b7bd9", "#8c5be0", "#7d5fc7"].includes(normalized)) return "violet";

  return "slate";
}

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "R";
}

function getRoomDecisionProgress(room: RoomSummary) {
  const approved = room.statusCounts?.approved ?? 0;
  const changes = room.statusCounts?.changes_requested ?? 0;
  const decided = approved + changes;
  const total = Math.max(0, room.itemCount);

  return {
    decided,
    percent: total > 0 ? Math.round((decided / total) * 100) : 0,
    total,
  };
}

function makePreviewItems(room: RoomSummary): MiniPreviewItem[] {
  if (room.previewItems.length > 0) {
    const minX = Math.min(...room.previewItems.map((item) => item.x));
    const minY = Math.min(...room.previewItems.map((item) => item.y));
    const maxX = Math.max(...room.previewItems.map((item) => item.x + item.width));
    const maxY = Math.max(...room.previewItems.map((item) => item.y + item.height));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);

    return room.previewItems.slice(0, 5).map((item, index) => ({
      color: colorName(item.color),
      imageUrl: item.imageUrl,
      key: `${room.id}-${index}`,
      left: 5 + ((item.x - minX) / spanX) * 68,
      status: item.status,
      top: 6 + ((item.y - minY) / spanY) * 58,
      type: item.type,
      width: Math.min(38, Math.max(18, (item.width / spanX) * 70)),
      height: Math.min(54, Math.max(22, (item.height / spanY) * 68)),
    }));
  }

  return [
    { color: "amber", key: `${room.id}-a`, left: 6, status: "approved", top: 10, type: "note", width: 26, height: 28 },
    { color: "blue", key: `${room.id}-b`, left: 40, status: "reviewing", top: 8, type: "image", width: 36, height: 50 },
    {
      color: "rose",
      key: `${room.id}-c`,
      left: 8,
      status: "changes_requested",
      top: 50,
      type: "note",
      width: 24,
      height: 32,
    },
    { color: "green", key: `${room.id}-d`, left: 80, status: "open", top: 60, type: "note", width: 16, height: 22 },
  ];
}

function PreviewBoard({ starterId }: { starterId: StarterId }) {
  const [activityIndex, setActivityIndex] = useState(0);
  const [cursors, setCursors] = useState([
    { id: "m", name: "Maya", color: "#ef6b7a", x: 56, y: 62 },
    { id: "j", name: "Jules", color: "#4ec18a", x: 72, y: 28 },
    { id: "t", name: "Theo", color: "#9b7bd9", x: 38, y: 78 },
  ]);

  // Spend the sidecar's cold start while the visitor is still reading, so the
  // room they open next has realtime already awake.
  useEffect(() => {
    prewarmRealtimeEndpoint();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActivityIndex((current) => (current + 1) % previewActivityFrames.length);
    }, 2600);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const frame = previewActivityFrames[activityIndex];
    setCursors((current) =>
      current.map((cursor) => {
        const target = frame.cursorTargets[cursor.id] ?? { x: cursor.x, y: cursor.y };
        return { ...cursor, x: target.x, y: target.y };
      }),
    );
  }, [activityIndex]);

  const activity = previewActivityFrames[activityIndex];
  const activeUser = cursors.find((cursor) => cursor.id === activity.userId);
  const preview = previewBoardCopy[starterId];
  const baseCards: Array<{
    body?: string;
    color: PreviewColor;
    id: PreviewCardId;
    id_: string;
    img?: string;
    left: number;
    title: string;
    top: number;
    type: "image" | "note";
    width: number;
  }> = [
    { id: "a", left: 13.6, top: 4.2, width: 20, id_: "C1", ...preview.cards.a },
    {
      id: "b",
      left: 39.3,
      top: 8,
      width: 17.5,
      id_: "C2",
      ...preview.cards.b,
    },
    { id: "c", left: 60.8, top: 6.2, width: 17.7, id_: "C5", ...preview.cards.c },
    { id: "d", left: 48.8, top: 51.5, width: 18.2, id_: "C4", ...preview.cards.d },
    { id: "e", left: 11.8, top: 59.7, width: 17.2, id_: "C3", ...preview.cards.e },
  ];
  const cards = baseCards.map((card) => {
    const targetTitle = starterId === "landing-review" ? activity.titles[card.id] : undefined;
    const isActive = activity.active === card.id;

    return {
      ...card,
      activityLabel: activity.label,
      activityUser: activeUser?.name ?? "Someone",
      isActive,
      left: card.left,
      title: targetTitle ?? card.title,
      top: card.top,
    };
  });
  const edges: Array<{
    color: "blue" | "green" | "purple" | "teal";
    d: string;
    dots: Array<{ x: number; y: number }>;
  }> = [
    {
      color: "purple",
      d: "M 13.6 33.4 C 7.8 33.4, 7.7 47.4, 13.2 52.7 C 15.5 55.2, 15.2 58.8, 13.8 59.7",
      dots: [
        { x: 13.6, y: 33.4 },
        { x: 13.8, y: 59.7 },
      ],
    },
    {
      color: "purple",
      d: "M 33.6 16.4 C 37.8 16.4, 37.0 25.3, 47.9 25.3",
      dots: [
        { x: 33.6, y: 16.4 },
        { x: 47.9, y: 25.3 },
      ],
    },
    {
      color: "purple",
      d: "M 47.9 25.3 C 52.0 31.2, 56.6 31.2, 60.8 24.3",
      dots: [
        { x: 47.9, y: 25.3 },
        { x: 60.8, y: 24.3 },
      ],
    },
    {
      color: "purple",
      d: "M 78.5 29.9 C 80.5 29.9, 80.1 34.0, 82.3 34.0",
      dots: [
        { x: 78.5, y: 29.9 },
        { x: 82.3, y: 34.0 },
      ],
    },
    {
      color: "blue",
      d: "M 67.0 68.1 C 75.2 69.6, 75.7 49.2, 82.3 49.2",
      dots: [
        { x: 67.0, y: 68.1 },
        { x: 82.3, y: 49.2 },
      ],
    },
    {
      color: "green",
      d: "M 29.0 67.9 C 35.5 67.9, 40.8 73.8, 48.8 72.0",
      dots: [
        { x: 29.0, y: 67.9 },
        { x: 48.8, y: 72.0 },
      ],
    },
  ];

  return (
    <div className="lp-preview">
      <div className="lp-preview__chrome">
        <div className="dots">
          <span />
          <span />
          <span />
        </div>
        <div className="preview-brand">
          <span className="preview-brand__mark">
            <LIcon.Logo />
          </span>
          Roomboard
        </div>
        <div className="url">
          {preview.boardTitle}
          <span className="live">Live</span>
        </div>
        <div className="who">
          {cursors.slice(0, 3).map((cursor) => (
            <div key={cursor.id} className="av" style={{ background: cursor.color }}>
              {cursor.name[0]}
            </div>
          ))}
          <span className="share">Invite reviewer</span>
        </div>
      </div>

      <div className="lp-preview__board">
        <div className="lp-preview__grid" />
        <div className="lp-preview__toolbar" aria-hidden="true">
          <span className="tool active" />
          <span className="tool square" />
          <span className="tool bubble" />
          <span className="tool link" />
          <span className="tool text" />
          <span className="tool grid" />
        </div>
        <div className="lp-preview__zoom" aria-hidden="true">
          <span />
          100%
        </div>
        <svg className="lp-preview__edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {edges.map((edge, index) => {
            return (
              <g key={index} className={`lp-preview__edge edge-${edge.color}`}>
                <path className="edge-halo" d={edge.d} vectorEffect="non-scaling-stroke" />
                <path className="edge-line" d={edge.d} vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </svg>

        {cards.map((card) => (
          <div
            key={card.id}
            className={`lp-preview__card card-${card.id} color-${card.color} ${card.type === "image" ? "image" : ""} ${card.isActive ? "is-active" : ""}`}
            style={{ left: `${card.left}%`, top: `${card.top}%`, width: `${card.width}%` }}
          >
            <div className="head">
              <span className="typedot" style={{ background: `var(--note-${card.color}-stripe)` }} />
              {card.title}
              <span className="id">#{card.id_}</span>
            </div>
            <div className="title">{card.type === "image" ? card.body : card.body}</div>
            {card.type === "image" ? (
              <div className="media">
                <img src={card.img} alt={card.title} />
                <span>{card.body}</span>
              </div>
            ) : null}
            <div className="foot">
              {card.id === "a" && "★ 12   ▢ 4"}
              {card.id === "b" && "2m"}
              {card.id === "c" && "▢ 8"}
              {card.id === "d" && "ↄ 7   ▢ 3"}
              {card.id === "e" && "1m"}
            </div>
          </div>
        ))}

        <div className="lp-preview__edge-dots" aria-hidden="true">
          {edges.flatMap((edge, edgeIndex) =>
            edge.dots.map((dot, dotIndex) => (
              <span
                key={`${edgeIndex}-${dotIndex}`}
                className={`edge-dot edge-${edge.color}`}
                style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
              />
            )),
          )}
        </div>

        <div className="lp-preview__sticky">
          <strong>Note</strong>
          {preview.sticky}
          <span>@Mike · 5m</span>
        </div>

        <div className="lp-preview__decision">
          <div>Decision</div>
          <strong>{preview.decision}</strong>
          <span>
            <LIcon.Lock /> Decision locked
          </span>
          <div className="mini-avatars">
            {["#ef6b7a", "#ffd166", "#4ec18a", "#62a9ff", "#9b7bd9"].map((color, index) => (
              <i key={color} style={{ background: color, marginLeft: index === 0 ? 0 : -5 }} />
            ))}
            <em>+2</em>
          </div>
        </div>

        <div className="lp-preview__minimap" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        {cursors.map((cursor) => (
          <div
            key={cursor.id}
            className={`lp-cursor ${activity.userId === cursor.id ? "is-active" : ""}`}
            style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
          >
            <svg viewBox="0 0 16 18" fill={cursor.color} aria-hidden="true">
              <path d="M2 1.5l11 7-5.5 1.5L5 16z" />
            </svg>
            <div className="pill" style={{ background: cursor.color }}>
              {cursor.name}
              {activity.userId === cursor.id && <span>{activity.label}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepDemo({ kind, starter }: { kind: 1 | 2 | 3; starter: StarterOption }) {
  const roomSlug = slugInput(starter.name) || starter.id;

  if (kind === 1) {
    return (
      <div className="lp-step__demo">
        <div className="lp-demo-new-board">
          <div>PRIVATE ROOM</div>
          {starter.name}
          <span>|</span>
        </div>
        <div className="lp-demo-create">Open room</div>
      </div>
    );
  }

  if (kind === 2) {
    return (
      <div className="lp-step__demo">
        <div className="lp-demo-note lp-demo-note-a">
          <div />
          <span>Note</span>
        </div>
        <div className="lp-demo-image" />
        <div className="lp-demo-note lp-demo-note-b">
          <div />
        </div>
      </div>
    );
  }

  return (
    <div className="lp-step__demo">
      <div className="lp-demo-link">
        <div>roomboard.online/rooms/{roomSlug}</div>
        <span>Invite</span>
      </div>
      <div className="lp-demo-avatars">
        {[
          { n: "M", c: "#ef6b7a" },
          { n: "J", c: "#4ec18a" },
          { n: "T", c: "#9b7bd9" },
          { n: "S", c: "#d4a544" },
        ].map((user, index) => (
          <div key={user.n} style={{ background: user.c, marginLeft: index === 0 ? 0 : -6 }}>
            {user.n}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoomCard({ room, onOpen }: { room: RoomSummary; onOpen: (roomId: string) => void }) {
  const previewItems = makePreviewItems(room);
  const progress = getRoomDecisionProgress(room);
  const participants = room.participants.length
    ? room.participants
    : [
        { name: "Maya", color: "#ef6b7a" },
        { name: "Jules", color: "#4ec18a" },
        { name: "Theo", color: "#9b7bd9" },
      ];

  return (
    <a
      className="lp-room"
      href={`/rooms/${room.id}`}
      onClick={(event) => {
        event.preventDefault();
        onOpen(room.id);
      }}
    >
      <div className="lp-room__thumb">
        {previewItems.map((item) => (
          <div
            key={item.key}
            className={`lp-room__minicard ${item.type} status-${item.status}`}
            style={{
              backgroundImage: item.imageUrl ? `url(${item.imageUrl})` : undefined,
              height: `${item.height}%`,
              left: `${item.left}%`,
              top: `${item.top}%`,
              width: `${item.width}%`,
            }}
          ></div>
        ))}
        <div className={`lp-room__live ${room.access === "locked" ? "locked" : ""}`}>
          <span className="dot" />
          {room.visibility === "private"
            ? "Private"
            : room.access === "locked"
              ? "Locked"
              : room.liveCount > 0
                ? `${room.liveCount} live`
                : "Idle"}
        </div>
      </div>
      <div className="lp-room__body">
        <div className="lp-room__title">{room.name}</div>
        <div className="lp-room__sub">
          <span>{formatCountLabel(room.noteCount, "note")}</span>
          <span className="sep">·</span>
          <span>{formatCountLabel(room.imageCount, "image")}</span>
          <span className="sep">·</span>
          <span>{formatCountLabel(room.connectionCount, "line")}</span>
          <span className="sep">·</span>
          <span>{formatRelativeTime(room.updatedAt)}</span>
        </div>
        <div className="lp-room__review" aria-label={`${progress.decided} of ${progress.total} cards decided`}>
          <span className="bar">
            <span style={{ width: `${progress.percent}%` }} />
          </span>
          <span>
            {progress.decided}/{progress.total || 0} decided
          </span>
        </div>
      </div>
      <div className="lp-room__foot">
        <div className="presence">
          {participants.slice(0, 4).map((member, index) => (
            <div key={`${member.name}-${index}`} className="av" style={{ background: member.color }}>
              {initials(member.name)}
            </div>
          ))}
        </div>
        <span className="open">
          Open <LIcon.External />
        </span>
      </div>
    </a>
  );
}

export function LandingPage({ entryIntent = "general", initialStarter = "landing-review" }: LandingPageProps) {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [tab, setTab] = useState<RoomTab>("all");
  const [inviteTokens, setInviteTokens] = useState<Record<string, string>>({});
  const [ownerTokens, setOwnerTokens] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteLinkError, setInviteLinkError] = useState("");
  const [selectedStarter, setSelectedStarter] = useState<StarterId>(initialStarter);

  useEffect(() => {
    captureCampaignAttribution({
      landingIntent: entryIntent,
      landingStarter: initialStarter,
    });
  }, [entryIntent, initialStarter]);

  useEffect(() => {
    const urlStarter = readUrlStarter();
    if (urlStarter) {
      setSelectedStarter(urlStarter);
      trackProductEvent("Starter Selected", { source: "url", starter: urlStarter });
    }
  }, []);

  useEffect(() => {
    const previousTheme = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = "dark";
    document.body.classList.add("landing");
    document.documentElement.style.height = "auto";
    document.documentElement.style.minHeight = "100%";
    document.documentElement.style.overflow = "visible";
    // overflow-x: clip (not hidden/auto) — a hidden/auto value turns body into
    // a scroll container, which detaches every position:sticky descendant from
    // the viewport scroll and breaks the pinned "how it works" gallery below.
    document.documentElement.style.overflowX = "clip";
    document.body.style.height = "auto";
    document.body.style.minHeight = "100%";
    document.body.style.overflow = "visible";
    document.body.style.overflowX = "clip";

    return () => {
      if (previousTheme) {
        document.documentElement.dataset.theme = previousTheme;
      } else {
        delete document.documentElement.dataset.theme;
      }
      document.body.classList.remove("landing");
      document.documentElement.style.height = "";
      document.documentElement.style.minHeight = "";
      document.documentElement.style.overflow = "";
      document.documentElement.style.overflowX = "";
      document.body.style.height = "";
      document.body.style.minHeight = "";
      document.body.style.overflow = "";
      document.body.style.overflowX = "";
    };
  }, []);

  useEffect(() => {
    const nextInviteTokens = readInviteTokens();
    const nextOwnerTokens = readOwnerTokens();
    setInviteTokens(nextInviteTokens);
    setOwnerTokens(nextOwnerTokens);

    const headers: Record<string, string> = {};
    if (Object.keys(nextOwnerTokens).length > 0) {
      headers["X-Owned-Rooms"] = JSON.stringify(nextOwnerTokens);
    }
    if (Object.keys(nextInviteTokens).length > 0) {
      headers["X-Invite-Rooms"] = JSON.stringify(nextInviteTokens);
    }

    let cancelled = false;
    fetch("/api/rooms", { headers })
      .then((response) => response.json() as Promise<{ rooms?: RoomSummary[] }>)
      .then((data) => {
        if (!cancelled && data.rooms) {
          setRooms(data.rooms);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const openRoom = useCallback(
    async (roomName?: string, source = "landing", starterId = selectedStarter) => {
      if (isCreating) {
        return;
      }

      const starter = getStarterOption(starterId);
      const shouldUseGuidedGeneralStarter =
        entryIntent === "general" && starter.id === "blank" && (source === "hero" || source === "nav");
      let roomStarterTemplate: RoomCreateStarterTemplate | undefined;

      if (shouldUseGuidedGeneralStarter) {
        roomStarterTemplate = "visual-decision";
      } else if (starter.id === "landing-review" || starter.id === "moodboard") {
        roomStarterTemplate = starter.id;
      }

      const trackedStarter = shouldUseGuidedGeneralStarter ? "visual-decision" : starter.id;
      setIsCreating(true);
      setCreateError("");
      trackProductEvent("Room Start Clicked", { source, starter: trackedStarter });

      try {
        const response = await fetch("/api/rooms", {
          body: JSON.stringify({
            name: roomNameFromSlug(roomName ?? starter.name),
            starterTemplate: roomStarterTemplate,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });

        if (!response.ok) {
          const isRateLimited = response.status === 429;
          setCreateError(
            isRateLimited
              ? "Room creation is temporarily rate limited. Try again in a little while."
              : "Roomboard could not open a room. Please try again.",
          );
          trackProductEvent("Room Create Failed", {
            reason: isRateLimited ? "rate_limited" : "bad_response",
            source,
            starter: trackedStarter,
            status: response.status,
          });
          return;
        }

        const data = (await response.json()) as { ownerToken?: string; room?: RoomSummary };

        if (data.room && data.ownerToken) {
          trackProductEvent("Room Created", {
            source,
            starter: trackedStarter,
            access: data.room.access,
            visibility: data.room.visibility,
            itemCount: data.room.itemCount,
          });
          setOwnerTokens(writeOwnerToken(data.room.id, data.ownerToken));
          setRooms((current) => [data.room!, ...current.filter((room) => room.id !== data.room!.id)]);
          router.push(
            buildRoomPathWithHashToken(data.room.id, "ownerToken", data.ownerToken, {
              new: "1",
              starter: trackedStarter,
            }),
          );
        } else {
          setCreateError("Roomboard opened a response without a room. Please try again.");
          trackProductEvent("Room Create Failed", { reason: "missing_room", source, starter: trackedStarter });
        }
      } catch {
        setCreateError("Roomboard could not reach the room service. Please try again.");
        trackProductEvent("Room Create Failed", { reason: "request_error", source, starter: trackedStarter });
      } finally {
        setIsCreating(false);
      }
    },
    [entryIntent, isCreating, router, selectedStarter],
  );

  const openDemoRoom = useCallback(() => {
    trackProductEvent("Sample Room Opened", { source: "landing", starter: selectedStarter });
    router.push(sampleRoomPathByStarter[selectedStarter]);
  }, [router, selectedStarter]);

  const openInviteLink = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const route = normalizeRoomRouteFromInput(inviteLink);

      if (!route) {
        setInviteLinkError("Paste a Roomboard room link or room id.");
        trackProductEvent("Room Invite Open Failed", { reason: "invalid_input", source: "landing_hero" });
        return;
      }

      setInviteLinkError("");
      trackProductEvent("Room Invite Opened", { source: "landing_hero" });
      router.push(route);
    },
    [inviteLink, router],
  );

  const visibleRooms = useMemo(() => {
    return rooms.filter((room) => {
      if (tab === "live") return room.liveCount > 0;
      if (tab === "mine") return Boolean(ownerTokens[room.id]);
      if (tab === "joined") return Boolean(inviteTokens[room.id]) && !ownerTokens[room.id];
      return true;
    });
  }, [inviteTokens, ownerTokens, rooms, tab]);

  const createdRooms = rooms.filter((room) => ownerTokens[room.id]).length;
  const joinedRooms = rooms.filter((room) => inviteTokens[room.id] && !ownerTokens[room.id]).length;
  const liveRooms = rooms.filter((room) => room.liveCount > 0).length;
  const selectedStarterOption = getStarterOption(selectedStarter);
  const heroPreviewStarter: StarterId = entryIntent === "general" ? "landing-review" : selectedStarter;
  const heroCopy = heroCopyByIntent[entryIntent === "general" ? "general" : selectedStarter];
  const primaryCtaLabel = entryIntent === "general" ? "Start launch approval" : selectedStarterOption.cta;
  return (
    <>
      <nav className="lp-nav">
        <div className="lp-shell lp-nav__inner">
          <a className="lp-nav__logo" href="/">
            <div className="mark">
              <LIcon.Logo />
            </div>
            Roomboard
          </a>
          <div className="lp-nav__center">
            <a className="lp-nav__link" href="#how">
              How it works
            </a>
            <a className="lp-nav__link" href="#use-cases">
              Use cases
            </a>
            <a className="lp-nav__link" href="#rooms">
              Rooms
            </a>
            <a className="lp-nav__link" href="#faq">
              FAQ
            </a>
          </div>
          <div className="lp-nav__spacer" />
          <a className="lp-nav__login" href="/rooms">
            My rooms
          </a>
          <button
            className="lp-nav__cta"
            disabled={isCreating}
            onClick={() => void openRoom(undefined, "nav")}
            type="button"
          >
            Start launch approval
          </button>
        </div>
      </nav>

      <main>
        <section className="lp-hero">
          <div className="lp-shell lp-hero__inner">
            <div className="lp-hero__signal">{heroCopy.signal}</div>
            <h1>
              {heroCopy.titleLine1}
              <br />
              <span>{heroCopy.titleLine2}</span>
            </h1>
            <p className="lead">
              {heroCopy.leadLine1}
              <br />
              {heroCopy.leadLine2}
            </p>

            <div className="lp-hero__actions">
              <button
                className="lp-cta__cta"
                disabled={isCreating}
                onClick={() => void openRoom(undefined, "hero")}
                type="button"
              >
                {isCreating ? "Opening" : primaryCtaLabel}
                <LIcon.Arrow />
              </button>
              <button className="lp-demo-cta" disabled={isCreating} onClick={openDemoRoom} type="button">
                {sampleRoomCtaByStarter[selectedStarter]}
              </button>
            </div>
            <form className="lp-paste" onSubmit={openInviteLink}>
              <LIcon.External />
              <input
                aria-label="Room invite link"
                onChange={(event) => {
                  setInviteLink(event.target.value);
                  setInviteLinkError("");
                }}
                placeholder="Paste invite link or room id"
                value={inviteLink}
              />
              <button type="submit">Open</button>
            </form>
            {inviteLinkError && (
              <p className="lp-hero__error" role="status">
                {inviteLinkError}
              </p>
            )}
            {createError && (
              <p className="lp-hero__error" role="status">
                {createError}
              </p>
            )}
            <PreviewBoard starterId={heroPreviewStarter} />
          </div>
        </section>

        <LandingLower
          isCreating={isCreating}
          startRoom={({ name, source, starter }) => void openRoom(name, source, starter)}
        />
      </main>
    </>
  );
}
