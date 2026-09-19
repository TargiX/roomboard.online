export const serverRealtimeFallbackDisabledBody = {
  error: "Server realtime fallback is disabled for this deployment. Use Phoenix realtime.",
} as const;

export const serverRealtimeFallbackDisabledInit = {
  headers: { "Cache-Control": "no-store" },
  status: 409,
} as const;

export const serverRealtimeFallbackStreamDisabledInit = {
  headers: { "Cache-Control": "no-store" },
  status: 204,
} as const;

export function isServerRealtimeFallbackAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ROOMBOARD_ALLOW_SERVER_REALTIME_FALLBACK === "true";
}
