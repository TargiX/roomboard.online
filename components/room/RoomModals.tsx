"use client";

import { useState, type CSSProperties } from "react";
import { Archive, Bot, Copy, LockKeyhole, Trash2 } from "lucide-react";
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
  onCreate: (name: string) => Promise<{ agent: RoomAgentPublic; token: string } | null>;
  onRevoke: (agentId: string) => Promise<boolean>;
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
 * once) and lists the roster with soft presence.
 */
export function RoomAgentsModal({
  agents,
  onCreate,
  onRevoke,
  show,
  setShow,
}: RoomAgentsModalProps) {
  const [copied, setCopied] = useState(false);
  const [created, setCreated] = useState<{ agent: RoomAgentPublic; token: string } | null>(null);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [revokingId, setRevokingId] = useState("");

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
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || isCreating) return;
    setIsCreating(true);
    setError("");
    const result = await onCreate(trimmed);
    setIsCreating(false);

    if (result) {
      setCreated(result);
      setName("");
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
                        <span style={{ color: "var(--text-3)", fontSize: 11 }}>
                          {agent.lastSeenAt ? `seen ${new Date(agent.lastSeenAt).toLocaleString()}` : "never connected"}
                        </span>
                      </span>
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          className="rb-btn ghost sm"
                          disabled={revokingId === agent.id || isCreating}
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
