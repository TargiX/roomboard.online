export type RoomHashTokenParam = "ownerToken" | "invite";

function getHashParams(url: URL) {
  return new URLSearchParams(url.hash.replace(/^#/, ""));
}

export function setRoomHashToken(url: URL, param: RoomHashTokenParam, token: string) {
  const hashParams = getHashParams(url);
  hashParams.set(param, token);
  url.hash = hashParams.toString();
}

export function buildRoomPathWithHashToken(
  roomId: string,
  param: RoomHashTokenParam,
  token: string,
  searchParams: Record<string, string> = {},
) {
  const search = new URLSearchParams(searchParams);
  const hash = new URLSearchParams({ [param]: token });
  const query = search.toString();

  return `/rooms/${roomId}${query ? `?${query}` : ""}#${hash.toString()}`;
}

export function normalizeRoomRouteFromInput(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const hasUrlOrPathShape = /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/") || trimmed.includes("/");
    const url = new URL(
      trimmed.match(/^https?:\/\//i) ? trimmed : `https://roomboard.local/${trimmed.replace(/^\/+/, "")}`,
    );
    const parts = url.pathname.split("/").filter(Boolean);
    const roomIndex = parts.findIndex((part) => part === "rooms" || part === "r");
    const roomId = roomIndex >= 0 ? parts[roomIndex + 1] : !hasUrlOrPathShape && parts.length === 1 ? parts[0] : "";

    if (!roomId || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,96}$/.test(roomId)) {
      return "";
    }

    return `/rooms/${encodeURIComponent(roomId)}${url.search}${url.hash}`;
  } catch {
    return "";
  }
}

export function readRoomTokenFromUrl(url: URL, paramNames: string[]) {
  const hashParams = getHashParams(url);

  for (const paramName of paramNames) {
    const token = hashParams.get(paramName) ?? url.searchParams.get(paramName);

    if (token) {
      return token;
    }
  }

  return "";
}

export function resolveRoomInviteToken(url: URL, roomId: string, storedTokens: Record<string, string>) {
  const tokenFromUrl = readRoomTokenFromUrl(url, ["invite", "inviteToken"]);

  return {
    token: tokenFromUrl || storedTokens[roomId] || "",
    tokenFromUrl,
  };
}

export function isAuthorizedRoomInviteToken(token: string, role: string | null | undefined) {
  return Boolean(token) && (role === "editor" || role === "viewer");
}

export function persistAuthorizedRoomInviteToken(
  url: URL,
  roomId: string,
  token: string,
  role: string | null | undefined,
  storedTokens: Record<string, string>,
) {
  if (!isAuthorizedRoomInviteToken(token, role)) {
    return null;
  }

  stripRoomTokensFromUrl(url, ["invite", "inviteToken"]);
  return { ...storedTokens, [roomId]: token };
}

export function stripRoomTokensFromUrl(url: URL, paramNames: string[]) {
  const hashParams = getHashParams(url);

  for (const paramName of paramNames) {
    hashParams.delete(paramName);
    url.searchParams.delete(paramName);
  }

  url.hash = hashParams.toString();
}
