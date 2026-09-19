export type LaunchHealthInput = {
  analyticsConfigured?: boolean;
  appUrl?: string;
  durableStorage: boolean;
  realtimeEndpoint?: string;
  realtimeSignedTokens: boolean;
  serverRealtimeFallback: boolean;
  storage: string;
  supportEmail?: string;
  uploadBucket?: string;
  uploadStorageConfigured?: boolean;
  uploadStoragePrivate?: boolean;
};

export type LaunchHealthCheck = {
  key:
    | "analytics_configured"
    | "app_origin"
    | "durable_storage"
    | "realtime_endpoint"
    | "realtime_signed_tokens"
    | "server_realtime_fallback"
    | "support_contact"
    | "upload_storage";
  ok: boolean;
  remediation: string;
  summary: string;
};

function normalizeOrigin(value = "") {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function isUsableSupportEmail(value = "") {
  const normalized = value.trim().toLowerCase();

  return (
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) &&
    !normalized.includes("example.") &&
    !normalized.includes("your-") &&
    !normalized.includes("replace-")
  );
}

function isHostedRealtimeEndpoint(value = "") {
  const origin = normalizeOrigin(value);

  return (
    origin.startsWith("https://") &&
    !origin.includes("localhost") &&
    !origin.includes("127.0.0.1") &&
    !origin.includes("example.") &&
    !origin.includes("your-")
  );
}

function isUsableStorageBucket(value = "") {
  const normalized = value.trim().toLowerCase();

  return (
    /^[a-z0-9][a-z0-9._-]{2,62}$/.test(normalized) &&
    !normalized.includes("example") &&
    !normalized.includes("your-") &&
    !normalized.includes("replace-")
  );
}

export function buildLaunchHealth(input: LaunchHealthInput) {
  const checks: LaunchHealthCheck[] = [
    {
      key: "analytics_configured",
      ok: Boolean(input.analyticsConfigured),
      remediation: "Set NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN and NEXT_PUBLIC_POSTHOG_HOST before production traffic.",
      summary: "PostHog receives the sanitized launch-funnel events.",
    },
    {
      key: "app_origin",
      ok: normalizeOrigin(input.appUrl) === "https://www.roomboard.online",
      remediation: "Set NEXT_PUBLIC_APP_URL=https://www.roomboard.online before production traffic.",
      summary: "Public app origin points at the canonical Roomboard domain.",
    },
    {
      key: "durable_storage",
      ok: input.durableStorage && input.storage === "supabase",
      remediation: "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and run supabase/roomboard-schema.sql.",
      summary: "Room data uses durable Supabase storage.",
    },
    {
      key: "upload_storage",
      ok:
        Boolean(input.uploadStorageConfigured) &&
        Boolean(input.uploadStoragePrivate) &&
        isUsableStorageBucket(input.uploadBucket),
      remediation:
        "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ROOMBOARD_UPLOAD_BUCKET, and keep the upload bucket private.",
      summary: "Image uploads use private Supabase storage with signed URLs.",
    },
    {
      key: "realtime_signed_tokens",
      ok: input.realtimeSignedTokens,
      remediation: "Set the same ROOMBOARD_REALTIME_SECRET on Next and the Phoenix sidecar.",
      summary: "Realtime joins use signed room tokens.",
    },
    {
      key: "realtime_endpoint",
      ok: isHostedRealtimeEndpoint(input.realtimeEndpoint),
      remediation: "Set NEXT_PUBLIC_ROOMBOARD_REALTIME_URL to the hosted Phoenix sidecar URL.",
      summary: "Browsers can join a hosted Phoenix realtime endpoint.",
    },
    {
      key: "server_realtime_fallback",
      ok: !input.serverRealtimeFallback,
      remediation:
        "Unset ROOMBOARD_ALLOW_SERVER_REALTIME_FALLBACK and NEXT_PUBLIC_ROOMBOARD_ALLOW_SERVER_FALLBACK in production.",
      summary: "Server realtime fallback is disabled for hosted production.",
    },
    {
      key: "support_contact",
      ok: isUsableSupportEmail(input.supportEmail),
      remediation: "Set NEXT_PUBLIC_ROOMBOARD_SUPPORT_EMAIL to a monitored support inbox.",
      summary: "A monitored support contact is visible before first-user traffic.",
    },
  ];

  return {
    checks,
    launchReady: checks.every((check) => check.ok),
  };
}
