import type { RoomSnapshot } from "./canvasRoom";
import {
  persistAuthorizedRoomInviteToken,
  readRoomTokenFromUrl,
  resolveRoomInviteToken,
  stripRoomTokensFromUrl,
} from "./roomLinks";

/**
 * Browser-local room credential storage. Owner and invite tokens are keyed by
 * room id so a visitor can reopen every room they created or joined without
 * accounts. Shared by the landing page, dashboard, and room canvas — keep the
 * storage keys in one place or the three surfaces drift.
 */
export const ownerTokensKey = "roomboard-owner-tokens";
export const inviteTokensKey = "roomboard-invite-tokens";

/** Stable id for browser-local identities (presence sessions, local users). */
export function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function readStoredTokenMap(key: string): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function writeStoredTokenMap(key: string, tokens: Record<string, string>) {
  try {
    localStorage.setItem(key, JSON.stringify(tokens));
    return true;
  } catch {
    return false;
  }
}

export function readOwnerTokens() {
  return readStoredTokenMap(ownerTokensKey);
}

export function readInviteTokens() {
  return readStoredTokenMap(inviteTokensKey);
}

export function storeRoomAccessToken(key: string, roomId: string, token: string) {
  return writeStoredTokenMap(key, { ...readStoredTokenMap(key), [roomId]: token });
}

export function writeOwnerToken(roomId: string, ownerToken: string) {
  const tokens = { ...readOwnerTokens(), [roomId]: ownerToken };

  try {
    localStorage.setItem(ownerTokensKey, JSON.stringify(tokens));
  } catch {
    // The first room URL also carries the owner token, so room access still works.
  }

  return tokens;
}

/** Owner token for a room: URL param wins (and is stripped), else storage. */
export function getOwnerToken(roomId: string) {
  if (typeof window === "undefined") {
    return "";
  }

  const url = new URL(window.location.href);
  const tokenFromUrl = readRoomTokenFromUrl(url, ["ownerToken"]);

  if (tokenFromUrl) {
    if (storeRoomAccessToken(ownerTokensKey, roomId, tokenFromUrl)) {
      stripRoomTokensFromUrl(url, ["ownerToken"]);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }

    return tokenFromUrl;
  }

  return readOwnerTokens()[roomId] ?? "";
}

export function getInviteToken(roomId: string) {
  if (typeof window === "undefined") {
    return { token: "", tokenFromUrl: "" };
  }

  const url = new URL(window.location.href);
  return resolveRoomInviteToken(url, roomId, readInviteTokens());
}

/** Persist an invite token only after the server confirmed it grants access. */
export function persistAuthorizedInviteToken(roomId: string, token: string, snapshot: RoomSnapshot) {
  if (typeof window === "undefined") {
    return false;
  }

  const url = new URL(window.location.href);
  const tokens = persistAuthorizedRoomInviteToken(url, roomId, token, snapshot.permissions?.role, readInviteTokens());

  if (!tokens) {
    return false;
  }

  if (!writeStoredTokenMap(inviteTokensKey, tokens)) {
    return false;
  }

  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}
