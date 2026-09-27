"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Archive, Bot, Copy, LockKeyhole, ShieldCheck, Trash2, VolumeX } from "lucide-react";
import type { RoomPermissions } from "@/lib/canvasRoom";
import type { LocalUser, ProductAnalyticsProperties } from "@/components/room/roomTypes";
import type { RoomAgentPublic } from "@/lib/roomAgents";

type ProfileJoinCopy = {
  action: string;
  body: string;
  title: string;
};

export type RoomCloseModalProps = {
  show: boolean;
  isConfirmingPermanentDelete: boolean;
  isClosingRoom: boolean;
  isDeletingRoom: boolean;
  setShow: (open: boolean) => void;
  setIsConfirmingPermanentDelete: (value: boolean) => void;
  closeRoom: () => Promise<void>;
  deleteRoomPermanently: () => Promise<void>;
};

export function RoomCloseModal({
  show,
  isConfirmingPermanentDelete,
  isClosingRoom,
  isDeletingRoom,
  setShow,
  setIsConfirmingPermanentDelete,
  closeRoom,
  deleteRoomPermanently,
}: RoomCloseModalProps) {
  if (!show) return null;

  return (
    <div className="rb-modal-scrim" onClick={() => setShow(false)}>
      <div className="rb-modal" onClick={(event) => event.stopPropagation()}>
        <div className="rb-modal__head">
          <div className="rb-modal__eyebrow">Room state</div>
          <div className="rb-modal__title">
            {isConfirmingPermanentDelete ? "Permanently delete this room?" : "Close this room?"}
          </div>
          <div className="rb-modal__sub">
            {isConfirmingPermanentDelete
              ? "This removes the room, every card and comment, and its hosted uploads. This action cannot be undone."
              : "Close keeps the decision record. Permanent delete removes the room, comments, and hosted uploads and cannot be undone."}
          </div>
        </div>
        <div className="rb-modal__foot">
          <button
            className="rb-btn ghost"
            disabled={isClosingRoom || isDeletingRoom}
            onClick={() => {
              if (isConfirmingPermanentDelete) setIsConfirmingPermanentDelete(false);
              else setShow(false);
            }}
            type="button"
          >
            {isConfirmingPermanentDelete ? "Back" : "Keep open"}
          </button>
          <button
            className="rb-btn danger-line"
            disabled={isClosingRoom || isDeletingRoom}
            onClick={() => {
              if (isConfirmingPermanentDelete) void deleteRoomPermanently();
              else setIsConfirmingPermanentDelete(true);
            }}
            type="button"
          >
            <Trash2 size={13} aria-hidden="true" />
            {isDeletingRoom ? "Deleting" : isConfirmingPermanentDelete ? "Delete permanently" : "Review deletion"}
          </button>
          {!isConfirmingPermanentDelete && (
            <button
              className="rb-btn primary"
              disabled={isClosingRoom || isDeletingRoom}
              onClick={() => void closeRoom()}
              type="button"
            >
              <Archive size={13} aria-hidden="true" />
              {isClosingRoom ? "Closing" : "Close room"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export type RoomLockModalProps = {
  show: boolean;
  isTogglingAccess: boolean;
  setShow: (open: boolean) => void;
  toggleRoomAccess: () => Promise<void>;
};

export function RoomLockModal({ show, isTogglingAccess, setShow, toggleRoomAccess }: RoomLockModalProps) {
  if (!show) return null;

  return (
    <div className="rb-modal-scrim" onClick={() => !isTogglingAccess && setShow(false)}>
      <div className="rb-modal" onClick={(event) => event.stopPropagation()}>
        <div className="rb-modal__head">
          <div className="rb-modal__eyebrow">Room access</div>
          <div className="rb-modal__title">Lock this room?</div>
          <div className="rb-modal__sub">
            The room becomes invite-only. Anyone with the existing link stays in but new visitors will need an editor or
            viewer invite to join.
          </div>
        </div>
        <div className="rb-modal__foot">
          <button className="rb-btn ghost" disabled={isTogglingAccess} onClick={() => setShow(false)} type="button">
            Keep open
          </button>
          <button
            className="rb-btn primary"
            disabled={isTogglingAccess}
            onClick={() => void toggleRoomAccess()}
            type="button"
          >
            <LockKeyhole size={13} aria-hidden="true" />
            {isTogglingAccess ? "Locking" : "Lock room"}
          </button>
        </div>
      </div>
    </div>
  );
}

export type RoomProfileModalProps = {
  show: boolean;
  canLeaveLoader: boolean;
  requiresProfile: boolean;
  tempName: string;
  tempColor: string;
  user: LocalUser | null;
  displayRoomName: string;
  permissions: RoomPermissions;
  pendingProfileItem: unknown;
  pendingProfileUpload: File | null;
  pendingProfileComment: unknown;
  pendingProfileStatus: unknown;
  pendingProfileConnection: unknown;
  colors: string[];
  setShow: (open: boolean) => void;
  setTempName: (name: string) => void;
  setTempColor: (color: string) => void;
  setUser: (user: LocalUser) => void;
  setRequiresProfile: (value: boolean) => void;
  saveLocalUser: (user: LocalUser) => void;
  trackRoomActivationEvent: (name: string, properties: ProductAnalyticsProperties) => void;
  profileJoinCopy: ProfileJoinCopy;
  getRoleLabel: (permissions: RoomPermissions) => string;
};

export function RoomProfileModal({
  show,
  canLeaveLoader,
  requiresProfile,
  tempName,
  tempColor,
  user,
  displayRoomName,
  permissions,
  pendingProfileItem,
  pendingProfileUpload,
  pendingProfileComment,
  pendingProfileStatus,
  pendingProfileConnection,
  colors,
  setShow,
  setTempName,
  setTempColor,
  setUser,
  setRequiresProfile,
  saveLocalUser,
  trackRoomActivationEvent,
  profileJoinCopy,
  getRoleLabel,
}: RoomProfileModalProps) {
  if (!show || !canLeaveLoader) return null;

  return (
    <div className="rb-modal-scrim" onClick={() => !requiresProfile && setShow(false)}>
      <div className="rb-modal" onClick={(event) => event.stopPropagation()}>
        <div className="rb-modal__head">
          <div className="rb-modal__eyebrow">{requiresProfile ? getRoleLabel(permissions) : "Live session"}</div>
          <div className="rb-modal__title">
            {requiresProfile ? `${profileJoinCopy.title} "${displayRoomName}"` : "Customize display"}
          </div>
          <div className="rb-modal__sub">
            {pendingProfileItem ||
            pendingProfileUpload ||
            pendingProfileComment ||
            pendingProfileStatus ||
            pendingProfileConnection
              ? "Pick a display name. No account is needed; Roomboard will continue the action you started."
              : requiresProfile
                ? profileJoinCopy.body
                : "Pick a display name and cursor color for live collaboration."}
          </div>
        </div>
        <div className="rb-modal__body">
          <div className="rb-modal__row">
            <label className="rb-field__label" htmlFor="profile-name">
              Display name
            </label>
            <input
              autoFocus
              className="rb-input"
              id="profile-name"
              onChange={(event) => setTempName(event.target.value.slice(0, 24))}
              placeholder="Enter your name"
              value={tempName}
            />
          </div>
          <div className="rb-modal__row">
            <span className="rb-field__label">Cursor color</span>
            <div className="rb-color-pick">
              {colors.map((c) => (
                <button
                  className={tempColor === c ? "sel" : ""}
                  key={c}
                  onClick={() => setTempColor(c)}
                  style={{ background: c }}
                  type="button"
                />
              ))}
            </div>
          </div>
        </div>
        <div className="rb-modal__foot">
          {!requiresProfile && (
            <button className="rb-btn ghost" onClick={() => setShow(false)} type="button">
              Cancel
            </button>
          )}
          <button
            className="rb-btn primary"
            disabled={tempName.trim().length === 0}
            onClick={() => {
              if (tempName.trim() && user) {
                const updatedUser = {
                  ...user,
                  name: tempName.trim(),
                  color: tempColor,
                  profileComplete: true,
                };
                trackRoomActivationEvent("Room Display Name Saved", {
                  hadPendingAction: Boolean(
                    pendingProfileItem ||
                    pendingProfileUpload ||
                    pendingProfileComment ||
                    pendingProfileStatus ||
                    pendingProfileConnection,
                  ),
                  required: requiresProfile,
                });
                setUser(updatedUser);
                setRequiresProfile(false);
                saveLocalUser(updatedUser);
                setShow(false);
              }
            }}
            type="button"
          >
            {requiresProfile ? profileJoinCopy.action : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export type RoomAgentsModalProps = {
  agents: RoomAgentPublic[];
  onCreate: (
    name: string,
    options: { isArbiter: boolean },
  ) => Promise<{ agent: RoomAgentPublic; token: string } | null>;
  onRevoke: (agentId: string) => Promise<boolean>;
  moderation: { autoMuteFlags: number | null };
  onSetModeration: (value: number | null) => Promise<boolean>;
  onSetMuted: (agentId: string, muted: boolean) => Promise<boolean>;
  show: boolean;
  setShow: (open: boolean) => void;
};

const codeBlockStyle: CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 11.5,
  padding: "8px 10px",
  wordBreak: "break-all",
};

/**
 * Owner-only agent management: mints per-agent MCP tokens (shown exactly
 * once), lists the roster with soft presence, supports moderator arbiters,
 * per-agent mute toggling, and a flag-threshold auto-mute policy.
 */
export function RoomAgentsModal({
  agents,
  onCreate,
  onRevoke,
  moderation,
  onSetModeration,
  onSetMuted,
  show,
  setShow,
}: RoomAgentsModalProps) {
  const [copied, setCopied] = useState(false);
  const [created, setCreated] = useState<{ agent: RoomAgentPublic; token: string } | null>(null);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [isArbiter, setIsArbiter] = useState(false);
  const [revokingId, setRevokingId] = useState("");
  const [mutingId, setMutingId] = useState("");
  const [moderationDraft, setModerationDraft] = useState(() =>
    moderation.autoMuteFlags === null ? "" : String(moderation.autoMuteFlags),
  );
  const [savingModeration, setSavingModeration] = useState(false);
  const [moderationFeedback, setModerationFeedback] = useState("");
  const [moderationFeedbackTone, setModerationFeedbackTone] = useState<"ok" | "err" | "">("");

  // Re-seed on every open: the moderation policy can arrive with the first
  // snapshot, i.e. after this component mounted with an empty policy.
  useEffect(() => {
    if (show) {
      setModerationDraft(moderation.autoMuteFlags === null ? "" : String(moderation.autoMuteFlags));
      setModerationFeedback("");
      setModerationFeedbackTone("");
    }
  }, [show, moderation.autoMuteFlags]);

  if (!show) return null;

  const mcpUrl = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;
  const snippet = created
    ? `claude mcp add --transport http roomboard ${mcpUrl} --header "Authorization: Bearer ${created.token}"`
    : "";

  const close = () => {
    setShow(false);
    setCopied(false);
    setCreated(null);
    setError("");
    setName("");
    setIsArbiter(false);
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || isCreating) return;
    setIsCreating(true);
    setError("");
    const result = await onCreate(trimmed, { isArbiter });
    setIsCreating(false);

    if (result) {
      setCreated(result);
      setName("");
      setIsArbiter(false);
    } else {
      setError("Could not connect the agent. Only the room owner can create agent tokens.");
    }
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const revoke = async (agentId: string) => {
    setRevokingId(agentId);
    await onRevoke(agentId);
    setRevokingId("");
  };

  const toggleMuted = async (agentId: string, muted: boolean) => {
    if (mutingId) return;
    setMutingId(agentId);
    await onSetMuted(agentId, muted);
    setMutingId("");
  };

  const saveModeration = async () => {
    if (savingModeration) return;
    const trimmed = moderationDraft.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && (!Number.isFinite(next) || !Number.isInteger(next) || next < 1 || next > 20)) {
      setModerationFeedbackTone("err");
      setModerationFeedback("Pick a whole number between 1 and 20, or leave it empty to disable auto-mute.");
      return;
    }
    setSavingModeration(true);
    setModerationFeedback("");
    setModerationFeedbackTone("");
    const ok = await onSetModeration(next);
    setSavingModeration(false);
    if (ok) {
      setModerationFeedbackTone("ok");
      setModerationFeedback(next === null ? "Auto-mute disabled." : `Auto-mute after ${next} flags saved.`);
    } else {
      setModerationFeedbackTone("err");
      setModerationFeedback("Could not save the moderation policy.");
    }
  };

  return (
    <div className="rb-modal-scrim" onClick={close}>
      <div className="rb-modal" onClick={(event) => event.stopPropagation()}>
        <div className="rb-modal__head">
          <div className="rb-modal__eyebrow">Agents</div>
          <div className="rb-modal__title">Connect an agent</div>
          <div className="rb-modal__sub">
            Your own agent joins this room over MCP with a room-scoped token. Model keys, tools, and memory stay on the
            agent&apos;s machine; the room stores only a token hash.
          </div>
        </div>
        <div className="rb-modal__body">
          {created ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p className="rb-empty-copy">
                Token for <strong>{created.agent.name}</strong> — shown once, store it now:
              </p>
              <code style={codeBlockStyle}>{created.token}</code>
              <p className="rb-empty-copy">Claude Code connect command:</p>
              <code style={codeBlockStyle}>{snippet}</code>
              <button className="rb-btn ghost sm" onClick={() => void copySnippet()} type="button">
                <Copy size={13} aria-hidden="true" />
                {copied ? "Copied" : "Copy command"}
              </button>
              <button className="rb-btn primary" onClick={() => setCreated(null)} type="button">
                Connect another agent
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  aria-label="Agent name"
                  className="rb-input"
                  maxLength={24}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void create();
                  }}
                  placeholder="Agent name (e.g. Hermes)"
                  value={name}
                />
                <button
                  className="rb-btn primary"
                  disabled={isCreating || !name.trim()}
                  onClick={() => void create()}
                  type="button"
                >
                  <Bot size={13} aria-hidden="true" />
                  {isCreating ? "Connecting" : "Create token"}
                </button>
              </div>
              <label
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  fontSize: 12,
                  gap: 8,
                }}
              >
                <input
                  checked={isArbiter}
                  disabled={isCreating}
                  onChange={(event) => setIsArbiter(event.target.checked)}
                  type="checkbox"
                />
                <span>Security arbiter (read-only, can flag messages)</span>
              </label>
              {error ? (
                <p className="rb-empty-copy" style={{ color: "var(--danger, #f43f5e)" }}>
                  {error}
                </p>
              ) : null}
              {agents.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {agents.map((agent) => (
                    <div
                      key={agent.id}
                      style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between" }}
                    >
                      <span style={{ alignItems: "center", display: "inline-flex", gap: 8, minWidth: 0 }}>
                        <span className="presence-dot" style={{ background: agent.color }} />
                        <span style={{ fontSize: 12.5 }}>{agent.name}</span>
                        {agent.isArbiter ? (
                          <span
                            style={{
                              alignItems: "center",
                              border: "1px solid var(--border)",
                              borderRadius: 999,
                              color: "var(--text-2)",
                              display: "inline-flex",
                              fontSize: 10.5,
                              gap: 4,
                              padding: "2px 7px",
                            }}
                            title="Security arbiter"
                          >
                            <ShieldCheck size={11} aria-hidden="true" />
                            arbiter
                          </span>
                        ) : null}
                        {agent.muted ? (
                          <span
                            style={{
                              alignItems: "center",
                              border: "1px solid color-mix(in srgb, var(--warn, #c4942e) 40%, var(--border))",
                              borderRadius: 999,
                              color: "var(--warn, #c4942e)",
                              display: "inline-flex",
                              fontSize: 10.5,
                              gap: 4,
                              padding: "2px 7px",
                            }}
                            title="Muted by room policy"
                          >
                            <VolumeX size={11} aria-hidden="true" />
                            muted
                          </span>
                        ) : null}
                        <span style={{ color: "var(--text-3)", fontSize: 11 }}>
                          {agent.lastSeenAt ? `seen ${new Date(agent.lastSeenAt).toLocaleString()}` : "never connected"}
                        </span>
                      </span>
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          className="rb-btn ghost sm"
                          disabled={Boolean(mutingId) || isCreating}
                          onClick={() => void toggleMuted(agent.id, !agent.muted)}
                          type="button"
                        >
                          {mutingId === agent.id
                            ? agent.muted
                              ? "Unmuting"
                              : "Muting"
                            : agent.muted
                              ? "Unmute"
                              : "Mute"}
                        </button>
                        <button
                          className="rb-btn ghost sm"
                          disabled={revokingId === agent.id || Boolean(mutingId)}
                          onClick={() => void revoke(agent.id)}
                          type="button"
                        >
                          {revokingId === agent.id ? "Revoking" : "Revoke"}
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rb-empty-copy">No agents connected yet.</p>
              )}
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  marginTop: 4,
                  paddingTop: 10,
                }}
              >
                <span className="rb-field__label">Moderation policy</span>
                <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
                  <input
                    aria-label="Auto-mute after N flags"
                    className="rb-input"
                    max={20}
                    min={1}
                    onChange={(event) => {
                      setModerationDraft(event.target.value);
                      setModerationFeedback("");
                      setModerationFeedbackTone("");
                    }}
                    placeholder="off"
                    style={{ maxWidth: 90 }}
                    type="number"
                    value={moderationDraft}
                  />
                  <button
                    className="rb-btn ghost sm"
                    disabled={savingModeration}
                    onClick={() => void saveModeration()}
                    type="button"
                  >
                    {savingModeration ? "Saving" : "Save"}
                  </button>
                </div>
                <p className="rb-empty-copy">Auto-mute an agent after N flags on its messages</p>
                <p className="rb-empty-copy" style={{ fontSize: 11 }}>
                  Leave empty to disable auto-mute.
                </p>
                {moderationFeedback ? (
                  <p
                    className="rb-empty-copy"
                    style={{
                      color: moderationFeedbackTone === "err" ? "var(--danger, #f43f5e)" : "var(--ok, #2d9d6a)",
                      fontSize: 11,
                    }}
                  >
                    {moderationFeedback}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
        <div className="rb-modal__foot">
          <button className="rb-btn ghost" onClick={close} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
