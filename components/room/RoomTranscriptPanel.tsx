"use client";

/**
 * Side panel for the decision-room transcript. Humans and BYO agents post
 * `room:message` events; this component renders them as a chat-style log with a
 * presence strip, an agent-mute banner when the turn budget is exhausted, and a
 * composer that respects read-only/closed states. Positioning, width, and panel
 * lifecycle live in `CanvasRoom`; this component only owns presentation.
 *
 * Styling deliberately mirrors `RoomInspector` — same dark-board chrome, same
 * `rb-inspector` shell, same `rb-comment` bubble shape, same accent button —
 * so the panel visually belongs next to the inspector without inventing a new
 * design language. Transcript-specific layout (scroll container, mention chips,
 * own-message alignment, agent badge, composer textarea) leans on inline
 * styles so the file is self-contained.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { AlertTriangle, Bot, Flag, MessageSquare, Send, X } from "lucide-react";
import { MAX_ROOM_MESSAGE_BODY, type RoomAgentPublic, type RoomMessage, type RoomMessageFlag } from "@/lib/roomAgents";

export type RoomTranscriptPanelProps = {
  agents: RoomAgentPublic[];
  canEdit: boolean;
  canManage: boolean;
  currentUserId?: string;
  flags: RoomMessageFlag[];
  isRoomClosed?: boolean;
  messages: RoomMessage[];
  onClose: () => void;
  onFlag: (messageId: string) => Promise<boolean> | boolean;
  onSend: (body: string) => Promise<boolean> | boolean;
  show: boolean;
  turnBudget: { exhausted: boolean; remaining: number };
};

// Soft presence window for the "online" indicator — matches the MCP throttle so
// the dot reflects whether the agent has been seen within a heartbeat cycle.
const PRESENCE_WINDOW_MS = 90_000;

// Pixel slack below the scroll bottom that still counts as "near bottom" —
// small enough that reading history never yanks the viewport, generous enough
// to absorb sub-pixel rounding across browsers.
const SCROLL_NEAR_BOTTOM_PX = 64;

// Show the remaining-char counter only when the user is approaching the limit,
// matching the inspector's quiet-by-default chrome.
const REMAINING_HINT_THRESHOLD = 120;

// Tiny ghost button for the per-message flag affordance. Sized to sit beside
// the timestamp without disrupting the row's baseline. Hover/focus states are
// inherited from the .rb-app button focus rule; warn tint comes via currentColor.
const flagButtonStyle: CSSProperties = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  borderRadius: 4,
  color: "var(--text-3)",
  cursor: "pointer",
  display: "inline-flex",
  marginLeft: 6,
  opacity: 0.7,
  padding: 2,
};

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function resolveAgentColor(agents: RoomAgentPublic[], authorId: string): string | undefined {
  if (authorId.startsWith("agent:")) {
    const id = authorId.slice("agent:".length);
    return agents.find((agent) => agent.id === id)?.color;
  }
  return undefined;
}

function resolveAgentName(agents: RoomAgentPublic[], agentId: string): string {
  const match = agents.find((agent) => agent.id === agentId);
  return match?.name ?? agentId;
}

export function RoomTranscriptPanel({
  agents,
  canEdit,
  canManage,
  currentUserId,
  flags,
  isRoomClosed,
  messages,
  onClose,
  onFlag,
  onSend,
  show,
  turnBudget,
}: RoomTranscriptPanelProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [flaggingIds, setFlaggingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());

  // Track presence without forcing a re-render every animation frame: tick
  // every 30s so online/dimmed states stay roughly in sync with the 90s window.
  useEffect(() => {
    if (!show) return undefined;
    const handle = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(handle);
  }, [show]);

  // Reset the composer whenever the panel is hidden so reopening starts clean.
  useEffect(() => {
    if (!show) {
      setDraft("");
      setIsSending(false);
    }
  }, [show]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef(true);

  const onScroll = () => {
    const node = listRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    stickyRef.current = distanceFromBottom <= SCROLL_NEAR_BOTTOM_PX;
  };

  // Auto-scroll only when the user was already near the bottom — preserves
  // their reading position when they scroll back into history.
  useEffect(() => {
    if (!show) return;
    const node = listRef.current;
    if (!node) return;
    if (stickyRef.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, show]);

  // Build an agent lookup map once per roster change so the per-message render
  // stays O(messages) instead of scanning the roster on every bubble.
  const agentById = useMemo(() => {
    const map = new Map<string, RoomAgentPublic>();
    for (const agent of agents) map.set(agent.id, agent);
    return map;
  }, [agents]);

  // Group flags by message id in one pass so per-message render stays O(1).
  // Order is preserved so the `title` reads in flag-creation order.
  const flagsByMessageId = useMemo(() => {
    const map = new Map<string, RoomMessageFlag[]>();
    for (const flag of flags) {
      const bucket = map.get(flag.messageId);
      if (bucket) bucket.push(flag);
      else map.set(flag.messageId, [flag]);
    }
    return map;
  }, [flags]);

  const composerDisabled = !canEdit || Boolean(isRoomClosed) || isSending;
  const remaining = MAX_ROOM_MESSAGE_BODY - draft.length;
  const showRemainingHint = remaining <= REMAINING_HINT_THRESHOLD;

  const handleFlag = async (messageId: string) => {
    if (flaggingIds.has(messageId)) return;
    setFlaggingIds((current) => {
      const next = new Set(current);
      next.add(messageId);
      return next;
    });
    try {
      await onFlag(messageId);
    } finally {
      setFlaggingIds((current) => {
        if (!current.has(messageId)) return current;
        const next = new Set(current);
        next.delete(messageId);
        return next;
      });
    }
  };

  const submit = async () => {
    const body = draft.trim();
    if (!body || composerDisabled) return;
    setIsSending(true);
    try {
      const result = await onSend(body);
      if (result) {
        setDraft("");
        // Re-anchor to the bottom on the next paint so the just-sent message
        // lands in view even if the roster bumps the height after send.
        requestAnimationFrame(() => {
          const node = listRef.current;
          if (node) node.scrollTop = node.scrollHeight;
        });
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Plain Enter inserts a newline; Cmd/Ctrl+Enter commits. Mirrors the
    // expected chat-composer semantics (Slack/Linear) rather than overloading
    // Enter alone, which would trap users inside the textarea.
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  if (!show) return null;

  return (
    <aside className="rb-inspector rb-transcript" aria-label="Room transcript">
      <div className="rb-inspector__head">
        <span className="rb-inspector__type">
          <MessageSquare size={14} aria-hidden="true" />
          Transcript
        </span>
        <span className="rb-transcript__presence" aria-label="Agents in this room">
          {agents.length === 0 ? (
            <span className="rb-transcript__presence-empty" aria-hidden="true">
              No agents yet
            </span>
          ) : (
            agents.map((agent) => {
              const lastSeen = agent.lastSeenAt;
              const isOnline = typeof lastSeen === "number" && now - lastSeen <= PRESENCE_WINDOW_MS;
              return (
                <span
                  className={`rb-transcript__agent ${isOnline ? "" : "dim"}`}
                  key={agent.id}
                  title={`${agent.name}${isOnline ? " (online)" : " (idle)"}`}
                >
                  <span className="presence-dot" style={{ background: agent.color }} />
                  <Bot size={11} aria-hidden="true" style={{ color: agent.color }} />
                  <span className="rb-transcript__agent-name">{agent.name}</span>
                </span>
              );
            })
          )}
        </span>
        <button aria-label="Close transcript" className="rb-inspector__close" onClick={onClose} type="button">
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="rb-inspector__body rb-transcript__body">
        {turnBudget.exhausted ? (
          <div className="rb-banner rb-banner--readonly rb-transcript__banner" role="status">
            Agents are muted until a human speaks.
          </div>
        ) : null}

        {messages.length === 0 ? (
          <p className="rb-empty-copy">No messages yet. Say hi or let an agent report in.</p>
        ) : (
          <div aria-live="polite" className="rb-transcript__list" onScroll={onScroll} ref={listRef}>
            {messages.map((message) => {
              const isOwn = Boolean(currentUserId && message.authorId === currentUserId);
              const agentColor = resolveAgentColor(agents, message.authorId);
              const messageFlags = flagsByMessageId.get(message.id);
              const flagCount = messageFlags?.length ?? 0;
              const flagReasons =
                flagCount > 0
                  ? messageFlags!
                      .map((flag) => flag.reason)
                      .filter((reason) => reason.length > 0)
                      .join("; ")
                  : "";
              const flagTitle = flagReasons.length > 0 ? flagReasons : "Flagged for review";
              const isFlagging = flaggingIds.has(message.id);
              const rowStyle: CSSProperties = isOwn
                ? { borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border-soft))" }
                : {};
              return (
                <div
                  className={`rb-comment rb-transcript__message ${isOwn ? "own" : ""}`}
                  key={message.id}
                  style={rowStyle}
                >
                  <div className="rb-comment__head">
                    <span className="rb-comment__avatar" style={{ background: agentColor ?? "var(--accent)" }}>
                      {getInitials(message.authorName)}
                    </span>
                    <span className="rb-comment__name">{message.authorName}</span>
                    {message.authorKind === "agent" ? (
                      <span
                        className="rb-transcript__badge"
                        style={{ color: agentColor ?? "var(--text-2)" }}
                        title="Agent"
                      >
                        <Bot size={11} aria-hidden="true" />
                        bot
                      </span>
                    ) : null}
                    {flagCount > 0 ? (
                      <span
                        aria-label={`${flagCount} moderation flag${flagCount === 1 ? "" : "s"}`}
                        className="rb-transcript__badge"
                        style={{ color: "var(--warn, #f59e0b)" }}
                        title={flagTitle}
                      >
                        <AlertTriangle size={11} aria-hidden="true" />
                        {flagCount}
                      </span>
                    ) : null}
                    <span className="rb-transcript__time" title={new Date(message.createdAt).toISOString()}>
                      {formatTime(message.createdAt)}
                    </span>
                    {canManage ? (
                      <button
                        aria-label="Flag message for review"
                        className="rb-transcript__flag"
                        disabled={isFlagging}
                        onClick={() => void handleFlag(message.id)}
                        type="button"
                        style={flagButtonStyle}
                      >
                        <Flag size={11} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                  <div className="rb-comment__body rb-transcript__body-text">
                    {message.mentions && message.mentions.length > 0 ? (
                      <MessageBody body={message.body} mentions={message.mentions} agentById={agentById} />
                    ) : (
                      message.body
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isRoomClosed ? (
          <p className="rb-empty-copy rb-transcript__closed-note">This room is closed. New messages are disabled.</p>
        ) : (
          <form className="rb-comment-compose rb-transcript__compose" onSubmit={handleSubmit}>
            <textarea
              aria-label="Send message"
              className="rb-transcript__textarea"
              disabled={composerDisabled}
              maxLength={MAX_ROOM_MESSAGE_BODY}
              onChange={(event) => setDraft(event.target.value.slice(0, MAX_ROOM_MESSAGE_BODY))}
              onKeyDown={handleKeyDown}
              placeholder={canEdit ? "Send a message to the room…" : "Read-only"}
              rows={3}
              value={draft}
            />
            <div className="rb-transcript__compose-actions">
              {showRemainingHint ? (
                <span aria-live="polite" className={`rb-transcript__remaining ${remaining <= 0 ? "is-zero" : ""}`}>
                  {remaining}
                </span>
              ) : null}
              <button aria-label="Send message" disabled={composerDisabled || draft.trim().length === 0} type="submit">
                <Send size={13} aria-hidden="true" />
              </button>
            </div>
          </form>
        )}
      </div>
    </aside>
  );
}

/**
 * Render the body text with mentions lifted into `@name` chips. Splits on the
 * raw mention tokens (agent ids) so the rest of the message stays as plain
 * text; falls back to the raw id when the roster has no match so unknown
 * mentions are still visible rather than silently dropped.
 */
function MessageBody({
  body,
  mentions,
  agentById,
}: {
  body: string;
  mentions: string[];
  agentById: Map<string, RoomAgentPublic>;
}) {
  // Build a single regex that matches any mention token. Tokens are sorted by
  // length descending so ids that share a prefix (e.g. "agent-1" vs
  // "agent-10") don't get truncated by the alternation. `escapeRegExp` keeps
  // dashes/dots in agent ids literal.
  const sortedTokens = [...mentions].sort((a, b) => b.length - a.length);
  const splitter = new RegExp(sortedTokens.map((token) => escapeRegExp(token)).join("|"), "g");
  const segments = body.split(splitter);
  // `split` with a capturing-less regex discards the matches, so walk the body
  // a second time with `matchAll` to recover the actual tokens that fired.
  const matched = body.matchAll(splitter);
  const matchedTokens: string[] = [];
  for (const match of matched) matchedTokens.push(match[0]);
  return (
    <>
      {segments.map((segment, index) => (
        <span key={`s-${index}`}>
          {segment}
          {index < matchedTokens.length ? (
            <span className="rb-transcript__mention" key={`m-${index}`}>
              @{resolveAgentName(Array.from(agentById.values()), matchedTokens[index]!)}
            </span>
          ) : null}
        </span>
      ))}
    </>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
