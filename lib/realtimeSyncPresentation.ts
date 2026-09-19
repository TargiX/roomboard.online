export type RealtimeConnectionStatus = "connecting" | "connected" | "degraded" | "closed";

export type RealtimeSyncTransport = "phoenix" | "fallback" | "none";

export type RealtimeSyncTone = "positive" | "pending" | "warning" | "critical";

type RealtimeSyncPresentationOptions = {
  fallbackActive: boolean;
  hasRealtimeEndpoint: boolean;
  reconnecting: boolean;
  status: RealtimeConnectionStatus;
};

export type RealtimeSyncPresentation = {
  detail: string;
  label: string;
  status: RealtimeConnectionStatus;
  tone: RealtimeSyncTone;
  transport: RealtimeSyncTransport;
};

export function getRealtimeSyncAnnouncement(presentation: RealtimeSyncPresentation, hadOutage: boolean) {
  if (presentation.tone === "warning" || presentation.tone === "critical") {
    return {
      hadOutage: true,
      message: `Sync status: ${presentation.label}`,
    };
  }

  if (presentation.tone === "positive") {
    return {
      hadOutage: false,
      message: hadOutage ? `Sync status: ${presentation.label}` : "",
    };
  }

  return {
    hadOutage,
    message: hadOutage ? null : "",
  };
}

export function getRealtimeSyncPresentation({
  fallbackActive,
  hasRealtimeEndpoint,
  reconnecting,
  status,
}: RealtimeSyncPresentationOptions): RealtimeSyncPresentation {
  const transport: RealtimeSyncTransport = fallbackActive ? "fallback" : hasRealtimeEndpoint ? "phoenix" : "none";

  if (fallbackActive) {
    return {
      detail:
        "Local edits use Roomboard's SSE/BroadcastChannel fallback when available; Phoenix collaboration is not connected.",
      label: "Local fallback",
      status,
      tone: "warning",
      transport,
    };
  }

  if (hasRealtimeEndpoint && status === "connected") {
    return {
      detail: "Phoenix collaboration is connected.",
      label: "Live",
      status,
      tone: "positive",
      transport,
    };
  }

  if (hasRealtimeEndpoint && status === "connecting") {
    return {
      detail: "Joining Phoenix collaboration.",
      label: "Connecting",
      status,
      tone: "pending",
      transport,
    };
  }

  if (hasRealtimeEndpoint && status === "degraded" && reconnecting) {
    return {
      detail: "Phoenix collaboration is unavailable. Roomboard is retrying the session.",
      label: "Reconnecting",
      status,
      tone: "warning",
      transport,
    };
  }

  return {
    detail: hasRealtimeEndpoint
      ? "Phoenix collaboration is offline. Edits are not shared live."
      : "No realtime transport is available. Edits are not shared live.",
    label: "Offline",
    status,
    tone: "critical",
    transport,
  };
}
