"use client";

import { useCallback, useMemo, useState } from "react";
import type { RoomActivity, RoomConnection, RoomItem, RoomItemStatus } from "@/lib/canvasRoom";
import { buildRoomSnapshotDecisionUpdate } from "@/lib/roomSnapshotDecisionUpdate";

type StatusCounts = Record<RoomItemStatus, number>;

type Participant = {
  name: string;
  color: string;
};

type ActivityWithTime = RoomActivity & { timeLabel: string };

type RoomSnapshotViewProps = {
  roomId: string;
  roomName: string;
  items: RoomItem[];
  connections: RoomConnection[];
  activities: ActivityWithTime[];
  statusCounts: StatusCounts;
  participants: Participant[];
  capturedRelative: string;
};

const STATUS_META: Record<RoomItemStatus, { label: string; color: string; bg: string }> = {
  open: { label: "Open", color: "#0ea5e9", bg: "rgba(14,165,233,0.14)" },
  reviewing: {
    label: "Reviewing",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.14)",
  },
  approved: {
    label: "Approved",
    color: "#10b981",
    bg: "rgba(16,185,129,0.14)",
  },
  changes_requested: {
    label: "Changes",
    color: "#f43f5e",
    bg: "rgba(244,63,94,0.14)",
  },
};

function buildSnapshotDecisionBrief(items: RoomItem[]) {
  const approvedCount = items.filter((item) => item.status === "approved").length;
  const revisionCount = items.filter((item) => item.status === "changes_requested").length;
  const pendingCount = items.filter((item) => item.status === "open" || item.status === "reviewing").length;
  const priority: Record<Exclude<RoomItemStatus, "approved">, number> = {
    changes_requested: 0,
    reviewing: 1,
    open: 2,
  };
  const nextSteps = items
    .filter((item): item is RoomItem & { status: Exclude<RoomItemStatus, "approved"> } => item.status !== "approved")
    .sort((a, b) => priority[a.status] - priority[b.status] || b.updatedAt - a.updatedAt)
    .slice(0, 3)
    .map((item) => ({ id: item.id, status: item.status, title: item.title.trim() || "Untitled card" }));
  const headline =
    revisionCount > 0
      ? `${revisionCount} ${revisionCount === 1 ? "card needs" : "cards need"} revisions before the decision is final.`
      : pendingCount > 0
        ? `${pendingCount} ${pendingCount === 1 ? "card still needs" : "cards still need"} a decision.`
        : items.length > 0
          ? "Every card has a decision. This room is ready to share."
          : "This board is ready for its first decision.";

  return { approvedCount, headline, nextStep: nextSteps[0], pendingCount, revisionCount, nextSteps };
}

const PADDING = 64;

export function RoomSnapshotView({
  roomId,
  roomName,
  items,
  connections,
  activities,
  statusCounts,
  participants,
  capturedRelative,
}: RoomSnapshotViewProps) {
  const [copied, setCopied] = useState(false);
  const [copiedDecisionUpdate, setCopiedDecisionUpdate] = useState(false);

  const handleCopyLink = useCallback(() => {
    // Guard: the Clipboard API can be unavailable in non-secure contexts
    // or restricted environments. Without this guard, the optional chain
    // short-circuits to `undefined` and `.then()` throws a TypeError.
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(window.location.href).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  }, []);

  const handleCopyDecisionUpdate = useCallback(() => {
    if (!navigator.clipboard?.writeText) return;

    navigator.clipboard
      .writeText(
        buildRoomSnapshotDecisionUpdate({
          items,
          roomName,
          snapshotUrl: window.location.href,
        }),
      )
      .then(
        () => {
          setCopiedDecisionUpdate(true);
          setTimeout(() => setCopiedDecisionUpdate(false), 2000);
        },
        () => {},
      );
  }, [items, roomName]);

  // Compute board bounds from item positions.
  const { bounds, itemPositions } = useMemo(() => {
    if (items.length === 0) {
      return {
        bounds: { width: 800, height: 500 },
        itemPositions: new Map<string, { x: number; y: number; cx: number; cy: number }>(),
      };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const positions = new Map<string, { x: number; y: number; cx: number; cy: number }>();

    for (const item of items) {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.width);
      maxY = Math.max(maxY, item.y + item.height);
    }
    for (const item of items) {
      const x = item.x - minX + PADDING;
      const y = item.y - minY + PADDING;
      positions.set(item.id, {
        x,
        y,
        cx: x + item.width / 2,
        cy: y + item.height / 2,
      });
    }
    return {
      bounds: {
        width: maxX - minX + PADDING * 2,
        height: maxY - minY + PADDING * 2,
      },
      itemPositions: positions,
    };
  }, [items]);

  const totalComments = useMemo(() => items.reduce((sum, item) => sum + item.comments.length, 0), [items]);

  const activeStatuses = (Object.keys(statusCounts) as RoomItemStatus[]).filter((s) => statusCounts[s] > 0);
  const decisionBrief = useMemo(() => buildSnapshotDecisionBrief(items), [items]);

  return (
    <main className="snapshot-shell">
      {/* Header */}
      <header className="snapshot-header">
        <div className="snapshot-header-main">
          <div className="snapshot-title-row">
            <h1>{roomName}</h1>
            <span className="snapshot-badge">Read-only snapshot</span>
          </div>
          <p className="snapshot-captured">
            Captured {capturedRelative} · {items.length} card
            {items.length === 1 ? "" : "s"} · {totalComments} comment
            {totalComments === 1 ? "" : "s"} · {connections.length} connection
            {connections.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="snapshot-header-actions">
          {activeStatuses.length > 0 && (
            <div className="snapshot-status-chips">
              {activeStatuses.map((status) => (
                <span
                  key={status}
                  className="snapshot-status-chip"
                  style={{
                    color: STATUS_META[status].color,
                    background: STATUS_META[status].bg,
                  }}
                >
                  {STATUS_META[status].label} · {statusCounts[status]}
                </span>
              ))}
            </div>
          )}
          {participants.length > 0 && (
            <div className="snapshot-participants" aria-label="Participants">
              {participants.slice(0, 5).map((p, i) => (
                <span key={`${p.name}-${i}`} className="snapshot-avatar" style={{ background: p.color }} title={p.name}>
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
            </div>
          )}
          <button type="button" className="snapshot-copy-btn" onClick={handleCopyLink} aria-label="Copy snapshot link">
            {copied ? "✓ Copied" : "Copy link"}
          </button>
          <button
            type="button"
            className="snapshot-copy-btn"
            onClick={handleCopyDecisionUpdate}
            aria-label="Copy decision update"
          >
            {copiedDecisionUpdate ? "✓ Update copied" : "Copy decision update"}
          </button>
          <a className="snapshot-live-cta" href={`/rooms/${roomId}`}>
            Open live room →
          </a>
        </div>
      </header>

      <section
        aria-label="Decision brief"
        style={{
          alignItems: "flex-start",
          background: "linear-gradient(100deg, rgba(16,185,129,0.12), rgba(14,165,233,0.08))",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          flexWrap: "wrap",
          gap: 24,
          justifyContent: "space-between",
          padding: "18px clamp(20px, 4vw, 64px)",
        }}
      >
        <div style={{ flex: "1 1 20rem", minWidth: 0 }}>
          <p
            style={{
              color: "var(--muted)",
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            Decision brief
          </p>
          <p style={{ fontSize: "1rem", fontWeight: 650, margin: "6px 0 0" }}>{decisionBrief.headline}</p>
        </div>
        <div
          style={{
            alignItems: "flex-start",
            display: "flex",
            flex: "0 1 auto",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "flex-end",
            maxWidth: "100%",
            minWidth: 0,
          }}
        >
          <span className="snapshot-status-chip" style={{ color: "#10b981", background: "rgba(16,185,129,0.14)" }}>
            Approved · {decisionBrief.approvedCount}
          </span>
          {decisionBrief.revisionCount > 0 && (
            <span className="snapshot-status-chip" style={{ color: "#f43f5e", background: "rgba(244,63,94,0.14)" }}>
              Revisions · {decisionBrief.revisionCount}
            </span>
          )}
          {decisionBrief.pendingCount > 0 && (
            <span className="snapshot-status-chip" style={{ color: "#f59e0b", background: "rgba(245,158,11,0.14)" }}>
              Needs a call · {decisionBrief.pendingCount}
            </span>
          )}
        </div>
      </section>

      {decisionBrief.nextSteps.length > 0 && (
        <section
          aria-label="Decision next steps"
          style={{ borderBottom: "1px solid var(--line)", padding: "14px clamp(20px, 4vw, 64px)" }}
        >
          <p style={{ color: "var(--muted)", fontSize: "0.78rem", margin: "0 0 8px" }}>Still blocking the decision</p>
          {decisionBrief.nextStep && (
            <a
              href={`#snapshot-card-${encodeURIComponent(decisionBrief.nextStep.id)}`}
              style={{
                alignItems: "center",
                background: STATUS_META[decisionBrief.nextStep.status].bg,
                border: `1px solid ${STATUS_META[decisionBrief.nextStep.status].color}`,
                borderRadius: 10,
                color: "var(--text)",
                display: "inline-flex",
                fontSize: "0.9rem",
                fontWeight: 650,
                gap: 8,
                marginBottom: 12,
                maxWidth: "100%",
                padding: "9px 12px",
              }}
            >
              <span
                style={{
                  color: STATUS_META[decisionBrief.nextStep.status].color,
                  fontSize: "0.72rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Start here
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {decisionBrief.nextStep.title}
              </span>
              <span aria-hidden style={{ color: STATUS_META[decisionBrief.nextStep.status].color }}>
                ↓
              </span>
            </a>
          )}
          <ol style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", margin: 0, paddingLeft: 18 }}>
            {decisionBrief.nextSteps.map((item) => (
              <li key={item.id} style={{ color: "var(--text)", fontSize: "0.88rem" }}>
                {item.title}{" "}
                <span style={{ color: STATUS_META[item.status].color }}>· {STATUS_META[item.status].label}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Board */}
      {items.length === 0 ? (
        <div className="snapshot-empty">
          <p>This room has no cards yet.</p>
        </div>
      ) : (
        <div className="snapshot-board-scroll">
          <div className="snapshot-board" style={{ width: bounds.width, height: bounds.height }}>
            {/* SVG connections layer */}
            <svg className="snapshot-connections" width={bounds.width} height={bounds.height} aria-hidden>
              {connections.map((conn) => {
                const from = itemPositions.get(conn.from);
                const to = itemPositions.get(conn.to);
                if (!from || !to) return null;
                const midX = (from.cx + to.cx) / 2;
                return (
                  <path
                    key={conn.id}
                    d={`M ${from.cx} ${from.cy} Q ${midX} ${from.cy} ${to.cx} ${to.cy}`}
                    fill="none"
                    stroke={conn.color ?? "rgba(255,255,255,0.22)"}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                );
              })}
            </svg>

            {/* Cards */}
            {items.map((item) => {
              const pos = itemPositions.get(item.id);
              if (!pos) return null;
              const meta = STATUS_META[item.status];
              const isImage = item.type === "image";
              return (
                <div
                  key={item.id}
                  id={`snapshot-card-${encodeURIComponent(item.id)}`}
                  className={`snapshot-card snapshot-card--${item.type}${item.styleVariant === "highlight" ? " snapshot-card--highlight" : ""}`}
                  style={{
                    left: pos.x,
                    top: pos.y,
                    width: item.width,
                    minHeight: item.height,
                    borderLeftColor: meta.color,
                  }}
                >
                  {isImage && item.imageUrl ? (
                    <div className="snapshot-card-media">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.imageUrl} alt={item.title || "Card image"} loading="lazy" />
                    </div>
                  ) : null}
                  <div className="snapshot-card-body">
                    <div className="snapshot-card-top">
                      <span className="snapshot-card-status" style={{ color: meta.color, background: meta.bg }}>
                        {meta.label}
                      </span>
                      {item.comments.length > 0 && (
                        <span className="snapshot-card-comments">💬 {item.comments.length}</span>
                      )}
                    </div>
                    {item.title && <h3 className="snapshot-card-title">{item.title}</h3>}
                    {item.body && <p className="snapshot-card-text">{item.body}</p>}
                    <div className="snapshot-card-author">
                      <span className="snapshot-card-author-dot" style={{ background: item.color }} />
                      {item.author}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity timeline */}
      {activities.length > 0 && (
        <aside className="snapshot-activity">
          <h2>Recent activity</h2>
          <ul>
            {activities.map((act) => (
              <li key={act.id}>
                <span className="snapshot-activity-time">{act.timeLabel}</span>
                <span className="snapshot-activity-actor">{act.actor}</span>
                <span className="snapshot-activity-msg">{act.message}</span>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </main>
  );
}
