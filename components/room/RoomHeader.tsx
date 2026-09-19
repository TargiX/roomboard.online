"use client";

import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronDown,
  Copy,
  Eye,
  HelpCircle,
  LayoutGrid,
  LockKeyhole,
  Moon,
  Pencil,
  Send,
  Share2,
  Sun,
  UnlockKeyhole,
} from "lucide-react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { CSSProperties } from "react";
import type { RoomAccess, RoomInviteRole, RoomPermissions, RoomVisibility } from "@/lib/canvasRoom";
import type { LocalUser, RoomTheme } from "@/components/room/roomTypes";
import type { PresenceSnapshot } from "@/lib/presence";
import { buildRoomPathWithHashToken } from "@/lib/roomLinks";
import { trackProductEvent } from "@/lib/productAnalytics";
import { writeOwnerToken } from "@/lib/roomTokens";

export type RoomHeaderProps = {
  // UI state + setters
  showMainMenu: boolean;
  setShowMainMenu: (open: boolean) => void;
  setTempName: (name: string) => void;
  setTempColor: (color: string) => void;
  setRequiresProfile: (value: boolean) => void;
  setShowProfileModal: (open: boolean) => void;
  setShowCloseModal: (open: boolean) => void;

  // Routing
  router: AppRouterInstance;

  // Permissions / data
  canManageRoom: boolean;
  canEditRoom: boolean;
  ownerToken: string;
  displayRoomName: string;
  roomAccess: RoomAccess;
  roomVisibility: RoomVisibility;
  permissions: RoomPermissions;
  theme: RoomTheme;
  user: LocalUser | null;
  presence: PresenceSnapshot[];
  peopleCount: number;
  isSnapshotPublic: boolean;
  isTogglingAccess: boolean;
  isTogglingSnapshot: boolean;
  copiedShare: "current" | "owner" | RoomInviteRole | "";
  copiedSnapshotLink: boolean;

  // Derived flags
  primaryShareKind: "current" | RoomInviteRole;
  primaryShareCopiesInviteMessage: boolean;
  primaryShareCopied: boolean;

  // Callbacks
  copyRoomLink: (kind: "current" | "owner" | RoomInviteRole) => Promise<void> | void;
  copyInviteMessage: () => Promise<void> | void;
  copyPublicSnapshotLink: () => Promise<void> | void;
  requestToggleRoomAccess: () => void;
  togglePublicSnapshot: () => Promise<void> | void;
  toggleTheme: () => void;

  // Static
  roomCanvasSupportMailto: string;
  getRoleLabel: (permissions: RoomPermissions) => string;
  getInitials: (name: string) => string;
};

const dropdownItemStyle: CSSProperties = {
  background: "none",
  border: "none",
  borderRadius: "4px",
  color: "var(--text-1)",
  cursor: "pointer",
  display: "flex",
  fontSize: "14px",
  padding: "8px 12px",
  textAlign: "left",
  width: "100%",
};

/**
 * Top bar: logo/main-menu dropdown, breadcrumb, status pill, theme toggle,
 * support link, presence avatars, lock/share/close buttons, and the primary
 * invite button. Extracted from CanvasRoom so the canvas surface only owns
 * the board and the modals own their own dialogs.
 */
export function RoomHeader({
  showMainMenu,
  setShowMainMenu,
  setTempName,
  setTempColor,
  setRequiresProfile,
  setShowProfileModal,
  setShowCloseModal,
  router,
  canManageRoom,
  canEditRoom,
  ownerToken,
  displayRoomName,
  roomAccess,
  roomVisibility,
  permissions,
  theme,
  user,
  presence,
  peopleCount,
  isSnapshotPublic,
  isTogglingAccess,
  isTogglingSnapshot,
  copiedShare,
  copiedSnapshotLink,
  primaryShareKind,
  primaryShareCopiesInviteMessage,
  primaryShareCopied,
  copyRoomLink,
  copyInviteMessage,
  copyPublicSnapshotLink,
  requestToggleRoomAccess,
  togglePublicSnapshot,
  toggleTheme,
  roomCanvasSupportMailto,
  getRoleLabel,
  getInitials,
}: RoomHeaderProps) {
  return (
    <header className="rb-header">
      <div className="rb-header__left">
        <div className="rb-logo-container" style={{ position: "relative" }}>
          <button
            aria-label="Main menu"
            className="rb-logo"
            onClick={() => setShowMainMenu(!showMainMenu)}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              margin: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
            type="button"
          >
            <span className="rb-logo__mark">
              <LayoutGrid size={12} aria-hidden="true" />
            </span>
            <h1 className="header-title rb-logo__word">Roomboard</h1>
            <ChevronDown size={14} style={{ marginLeft: 4, opacity: 0.5 }} aria-hidden="true" />
          </button>
          {showMainMenu && (
            <>
              <div onClick={() => setShowMainMenu(false)} style={{ inset: 0, position: "fixed", zIndex: 9998 }} />
              <div
                className="rb-dropdown"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  left: 0,
                  marginTop: "8px",
                  minWidth: "200px",
                  padding: "4px",
                  position: "absolute",
                  top: "100%",
                  zIndex: 9999,
                }}
              >
                <button
                  className="rb-dropdown-item"
                  onClick={() => {
                    setShowMainMenu(false);
                    router.push("/rooms");
                  }}
                  style={dropdownItemStyle}
                  type="button"
                >
                  Back to Dashboard
                </button>
                {canManageRoom && ownerToken && (
                  <button
                    className="rb-dropdown-item"
                    onClick={() => {
                      setShowMainMenu(false);
                      void copyRoomLink("owner");
                    }}
                    style={dropdownItemStyle}
                    type="button"
                  >
                    {copiedShare === "owner" ? "Owner Link Copied" : "Copy Owner Backup"}
                  </button>
                )}
                {canManageRoom && isSnapshotPublic && (
                  <button
                    className="rb-dropdown-item"
                    onClick={() => {
                      setShowMainMenu(false);
                      void togglePublicSnapshot();
                    }}
                    style={dropdownItemStyle}
                    type="button"
                  >
                    Stop public snapshot
                  </button>
                )}
                <button
                  className="rb-dropdown-item"
                  onClick={async () => {
                    setShowMainMenu(false);
                    trackProductEvent("Room Start Clicked", { source: "room_menu" });
                    const res = await fetch("/api/rooms", {
                      body: JSON.stringify({ name: "Untitled Room", visibility: "private" }),
                      headers: { "Content-Type": "application/json" },
                      method: "POST",
                    });
                    const data = (await res.json()) as { ownerToken?: string; room?: { id: string } };
                    if (data.room && data.ownerToken) {
                      trackProductEvent("Room Created", { source: "room_menu" });
                      writeOwnerToken(data.room.id, data.ownerToken);
                      router.push(
                        buildRoomPathWithHashToken(data.room.id, "ownerToken", data.ownerToken, {
                          new: "1",
                          starter: "blank",
                        }),
                      );
                    }
                  }}
                  style={dropdownItemStyle}
                  type="button"
                >
                  Create New Room
                </button>
              </div>
            </>
          )}
        </div>
        <div className="rb-breadcrumb" aria-label="Current room">
          <span className="rb-breadcrumb__sep">/</span>
          <span className="rb-breadcrumb__name">{displayRoomName}</span>
        </div>
        <button
          className={`rb-status ${roomAccess === "locked" ? "locked" : ""} ${canEditRoom ? "" : "readonly"}`}
          onClick={() => void copyRoomLink("current")}
          style={{ cursor: "pointer", outline: "none" }}
          title="Manage sharing and access"
          type="button"
        >
          <span className="rb-status__dot" />
          {getRoleLabel(permissions)} · {roomAccess === "locked" ? "invited" : "link"}
          {roomVisibility === "private" ? " · private" : ""}
        </button>
      </div>

      <div className="rb-header__right">
        <button
          aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
          className="rb-btn ghost sm rb-theme-toggle"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          type="button"
        >
          {theme === "dark" ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
        </button>
        <a
          aria-label="Contact Roomboard support"
          className="rb-btn ghost sm"
          href={roomCanvasSupportMailto}
          title="Contact support"
        >
          <HelpCircle size={14} aria-hidden="true" />
        </a>
        <div className="rb-presence" aria-label={`${peopleCount} people in room`}>
          {user && (
            <button
              className="rb-presence__avatar you"
              onClick={() => {
                setTempName(user.name);
                setTempColor(user.color);
                setRequiresProfile(false);
                setShowProfileModal(true);
              }}
              style={{ backgroundColor: user.color }}
              title="Customize display name"
              type="button"
            >
              {getInitials(user.name)}
            </button>
          )}
          {presence.slice(0, 4).map((snapshot) => (
            <span
              className="rb-presence__avatar"
              key={snapshot.id}
              style={{ backgroundColor: snapshot.color }}
              title={snapshot.name}
            >
              {getInitials(snapshot.name)}
            </span>
          ))}
          <span className="rb-presence__count">{peopleCount}</span>
        </div>
        <span className="rb-divider" />
        {canManageRoom && (
          <>
            <button
              className="rb-btn"
              disabled={isTogglingAccess}
              onClick={() => requestToggleRoomAccess()}
              type="button"
            >
              {roomAccess === "locked" ? (
                <UnlockKeyhole size={14} aria-hidden="true" />
              ) : (
                <LockKeyhole size={14} aria-hidden="true" />
              )}
              <span>{roomAccess === "locked" ? "Unlock" : "Lock"}</span>
            </button>
            <button className="rb-btn" onClick={() => void copyRoomLink("editor")} type="button">
              <Pencil size={14} aria-hidden="true" />
              <span>{copiedShare === "editor" ? "Copied" : "Editor link"}</span>
            </button>
            <button className="rb-btn" onClick={() => void copyRoomLink("viewer")} type="button">
              <Eye size={14} aria-hidden="true" />
              <span>{copiedShare === "viewer" ? "Copied" : "Viewer link"}</span>
            </button>
            <button
              className="rb-btn"
              disabled={isTogglingSnapshot}
              onClick={() => void (isSnapshotPublic ? copyPublicSnapshotLink() : togglePublicSnapshot())}
              type="button"
            >
              <Share2 size={14} aria-hidden="true" />
              <span>
                {isTogglingSnapshot
                  ? "Sharing"
                  : copiedSnapshotLink
                    ? "Snapshot copied"
                    : isSnapshotPublic
                      ? "Snapshot link"
                      : "Share snapshot"}
              </span>
            </button>
            <button className="rb-btn" onClick={() => setShowCloseModal(true)} type="button">
              <Archive size={14} aria-hidden="true" />
              <span>Close</span>
            </button>
          </>
        )}
        <button
          className="rb-btn primary"
          onClick={() => {
            if (primaryShareCopiesInviteMessage) {
              void copyInviteMessage();
              return;
            }

            void copyRoomLink(primaryShareKind);
          }}
          type="button"
        >
          {primaryShareCopiesInviteMessage ? (
            <Send size={14} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
          <span>{primaryShareCopied ? "Invite copied" : canManageRoom ? "Invite reviewer" : "Share"}</span>
        </button>
      </div>
    </header>
  );
}
