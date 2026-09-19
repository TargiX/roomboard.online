import { createHmac, timingSafeEqual } from "node:crypto";

const tokenVersion = "rb1";
const tokenTtlMs = 10 * 60 * 1000;

type RealtimeAccessPayload = {
  exp: number;
  roomId: string;
  role: string;
  v: typeof tokenVersion;
};

function getRealtimeAccessSecret() {
  return process.env.ROOMBOARD_REALTIME_SECRET?.trim() || "";
}

export function hasRoomboardRealtimeAccessSecret() {
  return Boolean(getRealtimeAccessSecret());
}

function encodeBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function signPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createRoomboardRealtimeAccessToken(roomId: string, role: string) {
  const secret = getRealtimeAccessSecret();

  if (!secret) {
    return null;
  }

  const payload: RealtimeAccessPayload = {
    exp: Date.now() + tokenTtlMs,
    roomId,
    role,
    v: tokenVersion,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyRoomboardRealtimeAccessToken(token: string, roomId: string) {
  const secret = getRealtimeAccessSecret();

  if (!secret) {
    return false;
  }

  // Sidecar parity: the signature is everything after the FIRST dot
  // (Elixir `String.split(token, ".", parts: 2)`), so trailing separators
  // or extra segments alter the compared signature instead of being ignored.
  const separatorIndex = token.indexOf(".");

  if (separatorIndex === -1) {
    return false;
  }

  const encodedPayload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);

  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<RealtimeAccessPayload>;
    return (
      payload.v === tokenVersion &&
      payload.roomId === roomId &&
      typeof payload.exp === "number" &&
      payload.exp > Date.now() &&
      typeof payload.role === "string"
    );
  } catch {
    return false;
  }
}
