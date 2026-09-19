import posthog from "posthog-js";

// Bundlers resolve the posthog-js default export to the singleton client,
// but bare Node ESM exposes a namespace object with the client under `.posthog`.
type PosthogClient = {
  capture: (name: string, properties?: Record<string, unknown>) => unknown;
};

const posthogClient: PosthogClient | null = (() => {
  const candidate = posthog as unknown as Partial<PosthogClient> & { posthog?: Partial<PosthogClient> };

  if (typeof candidate.capture === "function") {
    return candidate as PosthogClient;
  }

  return typeof candidate.posthog?.capture === "function" ? (candidate.posthog as PosthogClient) : null;
})();

type AnalyticsValue = string | number | boolean | null | undefined;

type ProductEventProperties = Record<string, AnalyticsValue>;

const campaignStorageKey = "roomboard-campaign-attribution";
const campaignSessionKey = "roomboard-campaign-attributed";
const blockedProductEventKeys = new Set([
  "body",
  "cardbody",
  "cardcontent",
  "cardtitle",
  "content",
  "author",
  "displayname",
  "filename",
  "file_name",
  "href",
  "imageurl",
  "image_url",
  "invitetoken",
  "invite_token",
  "itembody",
  "itemtitle",
  "link",
  "message",
  "path",
  "pathname",
  "ownertoken",
  "owner_token",
  "roomid",
  "room_id",
  "roomname",
  "room_name",
  "text",
  "title",
  "token",
  "url",
  "username",
]);
const campaignParamMap = {
  campaignContent: "utm_content",
  campaignMedium: "utm_medium",
  campaignName: "utm_campaign",
  campaignSource: "utm_source",
  campaignTerm: "utm_term",
  ref: "ref",
} as const;

function cleanAnalyticsValue(value: string | null) {
  return value?.trim().slice(0, 96) || "";
}

function normalizeAnalyticsKey(key: string) {
  return key.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
}

function getSafeLandingPath(pathname = "") {
  if (pathname === "/" || pathname === "/privacy" || pathname.startsWith("/for/")) {
    return pathname;
  }

  return "";
}

export function sanitizeProductEventProperties(properties: ProductEventProperties = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => {
      if (value === undefined) {
        return false;
      }

      return !blockedProductEventKeys.has(normalizeAnalyticsKey(key));
    }),
  ) as ProductEventProperties;
}

type ProductEventSink = (name: string, properties: ProductEventProperties) => void;

const defaultProductEventSink: ProductEventSink = (name, properties) => {
  posthogClient?.capture(name, properties);
};

let productEventSink: ProductEventSink = defaultProductEventSink;

/** Test seam: redirects the sanitized event sink without touching PostHog internals. */
export function setProductEventSinkForTests(sink: ProductEventSink | null) {
  productEventSink = sink ?? defaultProductEventSink;
}

function sendProductEvent(name: string, properties: ProductEventProperties = {}) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || !process.env.NEXT_PUBLIC_POSTHOG_HOST) {
    return;
  }

  productEventSink(name, sanitizeProductEventProperties(properties));
}

export function mergeAndSanitizeProductEventProperties(
  storedAttribution: ProductEventProperties = {},
  properties: ProductEventProperties = {},
) {
  return sanitizeProductEventProperties({
    ...storedAttribution,
    ...properties,
  });
}

function readStoredCampaignAttribution(): ProductEventProperties {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(campaignStorageKey) ?? "{}") as ProductEventProperties;
  } catch {
    return {};
  }
}

function writeStoredCampaignAttribution(properties: ProductEventProperties) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(campaignStorageKey, JSON.stringify(properties));
  } catch {
    // Campaign attribution is helpful, not required for the app to work.
  }
}

export function captureCampaignAttribution(context: ProductEventProperties = {}): ProductEventProperties {
  if (typeof window === "undefined") {
    return {};
  }

  const params = new URLSearchParams(window.location.search);
  const captured: ProductEventProperties = {};

  for (const [property, param] of Object.entries(campaignParamMap)) {
    const value = cleanAnalyticsValue(params.get(param));
    if (value) {
      captured[property] = value;
    }
  }

  if (!captured.campaignSource) {
    const campaignSource = cleanAnalyticsValue(params.get("source"));
    if (campaignSource) {
      captured.campaignSource = campaignSource;
    }
  }

  if (!captured.campaignName) {
    const campaignName = cleanAnalyticsValue(params.get("campaign"));
    if (campaignName) {
      captured.campaignName = campaignName;
    }
  }

  const hasCampaignParams = Object.keys(captured).length > 0;
  const safeLandingPath = getSafeLandingPath(window.location.pathname);
  const contextWithPath: ProductEventProperties = {
    ...context,
    ...(safeLandingPath ? { landingPath: safeLandingPath } : {}),
  };
  const hasContext = Object.values(contextWithPath).some(
    (value) => value !== undefined && value !== null && value !== "",
  );
  const storedAttribution = readStoredCampaignAttribution();

  if (!hasCampaignParams && !hasContext) {
    return storedAttribution;
  }

  if (!hasCampaignParams && Object.keys(storedAttribution).length > 0) {
    return storedAttribution;
  }

  const attribution: ProductEventProperties = {
    ...storedAttribution,
    ...captured,
    ...contextWithPath,
  };

  writeStoredCampaignAttribution(attribution);

  if (hasCampaignParams) {
    try {
      const fingerprint = JSON.stringify(attribution);
      if (window.sessionStorage.getItem(campaignSessionKey) !== fingerprint) {
        window.sessionStorage.setItem(campaignSessionKey, fingerprint);
        sendProductEvent("Campaign Attributed", attribution);
      }
    } catch {
      // Session de-duping is optional.
    }
  }

  return attribution;
}

export function trackProductEvent(name: string, properties: ProductEventProperties = {}) {
  try {
    sendProductEvent(name, mergeAndSanitizeProductEventProperties(readStoredCampaignAttribution(), properties));
  } catch {
    // Analytics must never block the room workflow.
  }
}
