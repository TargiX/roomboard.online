"use client";

import { Archive, LockKeyhole, Trash2 } from "lucide-react";
import type { RoomPermissions } from "@/lib/canvasRoom";
import type { LocalUser, ProductAnalyticsProperties } from "@/components/room/roomTypes";

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
