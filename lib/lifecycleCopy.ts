import type { RoomAccess, RoomPermissions } from "./canvasRoom.ts";

export type LifecycleCopy = {
  accessBanner: string;
  accessBadge: string;
  emptyStateAction: string;
  emptyStateBody: string;
  emptyStateTitle: string;
};

export type ProfileJoinCopy = {
  action: string;
  body: string;
  title: string;
};

export function getProfileJoinCopy(permissions: RoomPermissions): ProfileJoinCopy {
  if (permissions.role === "owner") {
    return {
      action: "Enter room",
      title: "Choose your display name",
      body: "Pick the name and cursor color people will see in this room. No account is needed; this browser keeps creator access for invites, owner backup, access, and closing the room.",
    };
  }

  if (permissions.role === "viewer") {
    return {
      action: "Enter as viewer",
      title: "Enter as viewer",
      body: "Pick a display name and cursor color. No account is needed; this read-only invite lets you follow the decision without changing the board.",
    };
  }

  return {
    action: "Enter as editor",
    title: "Enter as editor",
    body: "Pick a display name and cursor color. No account is needed; this editor invite lets you add cards, comment on the work, and help move the decision forward.",
  };
}

export function getLifecycleCopy(
  permissions: RoomPermissions,
  access: RoomAccess,
  displayName: string,
  hasInvitedTokens: boolean,
): LifecycleCopy {
  const name = displayName.trim() || "guest";
  const role = permissions.role;

  if (access === "locked") {
    if (role === "owner") {
      return {
        accessBadge: "Locked · invite only",
        accessBanner: "Room is invite-only. Share the editor or viewer link from the header.",
        emptyStateTitle: `${name}, start with one decision question`,
        emptyStateBody:
          "Add a decision note, screenshot, or reference first. Then share an editor link when there is visual material for the team to react to.",
        emptyStateAction: "Copy editor link",
      };
    }

    if (role === "editor") {
      return {
        accessBadge: "Locked · editor",
        accessBanner: "This room is invite-only. You joined with an editor link and can still edit the board.",
        emptyStateTitle: `Hi ${name}, ready to start`,
        emptyStateBody:
          "Drop a decision note or upload an image to start the room. Other invited editors will see your changes in realtime.",
        emptyStateAction: "Add the first card",
      };
    }

    return {
      accessBadge: "Locked · viewer",
      accessBanner: "This room is invite-only. You joined with a viewer link and can read without editing.",
      emptyStateTitle: `${name}, this room is empty`,
      emptyStateBody: "The creator has not added any cards yet. Check back later or ask them to share what to decide.",
      emptyStateAction: "Open rooms console",
    };
  }

  if (role === "owner") {
    return {
      accessBadge: "Open · link access",
      accessBanner: "Anyone with the room link can join as an editor. Use Lock in the header to switch to invite-only.",
      emptyStateTitle: `${name}, this is a fresh room`,
      emptyStateBody:
        "Add a decision note or upload an image to start the room. You can change the access at any time from the header.",
      emptyStateAction: "Add the first card",
    };
  }

  if (role === "editor") {
    return {
      accessBadge: "Open · editor",
      accessBanner: "This room is open to anyone with the link. Your edits are visible to other editors in realtime.",
      emptyStateTitle: `Hi ${name}, ready to start`,
      emptyStateBody:
        "Drop a decision note or upload an image to start the room. Other editors will see your changes in realtime.",
      emptyStateAction: "Add the first card",
    };
  }

  return {
    accessBadge: "Open · viewer",
    accessBanner: "You're viewing this room as a read-only guest. Ask the creator for editor access to contribute.",
    emptyStateTitle: `${name}, this room is empty`,
    emptyStateBody:
      "The creator has not added any cards yet. Check back later, or ask the creator to share what to decide.",
    emptyStateAction: "Open rooms console",
  };
}
