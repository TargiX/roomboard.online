import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  captureCampaignAttribution,
  mergeAndSanitizeProductEventProperties,
  sanitizeProductEventProperties,
  setProductEventSinkForTests,
} from "../lib/productAnalytics.ts";

type CapturedAnalyticsEvent = {
  data?: Record<string, unknown>;
  name?: string;
};

const analyticsEnv = {
  host: "https://us.i.posthog.com",
  token: "phc_test_token",
};

function withAnalyticsEnv(enabled: boolean) {
  if (enabled) {
    process.env.NEXT_PUBLIC_POSTHOG_HOST = analyticsEnv.host;
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = analyticsEnv.token;
  } else {
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  }
}

afterEach(() => {
  setProductEventSinkForTests(null);
  withAnalyticsEnv(false);
});

function createStorageMock() {
  const data = new Map<string, string>();

  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

function withMockWindow(url: string) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const localStorage = createStorageMock();
  const sessionStorage = createStorageMock();
  const parsedUrl = new URL(url);

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      location: {
        pathname: parsedUrl.pathname,
        search: parsedUrl.search,
      },
      sessionStorage,
    },
  });

  return {
    localStorage,
    restore() {
      if (previousWindow) {
        Object.defineProperty(globalThis, "window", previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    },
  };
}

describe("sanitizeProductEventProperties", () => {
  it("drops room identifiers, tokens, URLs, and content-like fields", () => {
    const sanitized = sanitizeProductEventProperties({
      body: "Private note body",
      author: "Ilya",
      displayName: "Ilya M.",
      fileName: "client-landing.png",
      href: "https://roomboard.online/rooms/a#invite=secret",
      imageUrl: "https://example.com/client-shot.png",
      inviteToken: "secret",
      itemTitle: "Private card title",
      message: "Please review the private launch copy",
      owner_token: "owner-secret",
      path: "/rooms/private-room",
      roomId: "private-room",
      roomName: "Client launch review",
      text: "Private comment",
      token: "generic-secret",
      url: "https://roomboard.online/rooms/a",
      userName: "Ilya",
    });

    assert.deepEqual(sanitized, {});
  });

  it("keeps non-sensitive funnel, role, starter, and count fields", () => {
    const sanitized = sanitizeProductEventProperties({
      access: "locked",
      campaignContent: "landing-ad-a",
      itemCount: 6,
      role: "editor",
      source: "landing",
      starter: "landing-review",
      status: 429,
      visibility: "private",
    });

    assert.deepEqual(sanitized, {
      access: "locked",
      campaignContent: "landing-ad-a",
      itemCount: 6,
      role: "editor",
      source: "landing",
      starter: "landing-review",
      status: 429,
      visibility: "private",
    });
  });
});

describe("mergeAndSanitizeProductEventProperties", () => {
  it("sanitizes stored attribution and event properties after merging", () => {
    const sanitized = mergeAndSanitizeProductEventProperties(
      {
        campaignName: "launch",
        roomName: "Private client room",
        url: "https://roomboard.online/rooms/a#ownerToken=secret",
      },
      {
        itemCount: 3,
        ownerToken: "secret",
        source: "landing",
      },
    );

    assert.deepEqual(sanitized, {
      campaignName: "launch",
      itemCount: 3,
      source: "landing",
    });
  });
});

describe("captureCampaignAttribution", () => {
  it("captures first-traffic UTM params with landing context", () => {
    withAnalyticsEnv(true);
    const analyticsEvents: CapturedAnalyticsEvent[] = [];
    setProductEventSinkForTests((name, data) => analyticsEvents.push({ name, data }));
    const browser = withMockWindow(
      "https://www.roomboard.online/for/landing-review?utm_source=first_batch&utm_medium=direct&utm_campaign=landing_review&utm_content=founder_dm",
    );

    try {
      const attribution = captureCampaignAttribution({
        landingIntent: "landing-review",
        landingStarter: "landing-review",
      });

      assert.deepEqual(attribution, {
        campaignContent: "founder_dm",
        campaignMedium: "direct",
        campaignName: "landing_review",
        campaignSource: "first_batch",
        landingIntent: "landing-review",
        landingPath: "/for/landing-review",
        landingStarter: "landing-review",
      });
      assert.equal(browser.localStorage.getItem("roomboard-campaign-attribution"), JSON.stringify(attribution));
      assert.deepEqual(analyticsEvents, [
        {
          data: attribution,
          name: "Campaign Attributed",
        },
      ]);
    } finally {
      browser.restore();
    }
  });

  it("dedupes the campaign attributed event for the same first-traffic fingerprint", () => {
    withAnalyticsEnv(true);
    const analyticsEvents: CapturedAnalyticsEvent[] = [];
    setProductEventSinkForTests((name, data) => analyticsEvents.push({ name, data }));
    const browser = withMockWindow(
      "https://www.roomboard.online/for/landing-review?utm_source=first_batch&utm_medium=direct&utm_campaign=landing_review&utm_content=founder_dm",
    );

    try {
      captureCampaignAttribution({
        landingIntent: "landing-review",
        landingStarter: "landing-review",
      });
      captureCampaignAttribution({
        landingIntent: "landing-review",
        landingStarter: "landing-review",
      });

      assert.equal(analyticsEvents.length, 1);
      assert.equal(analyticsEvents[0]?.name, "Campaign Attributed");
    } finally {
      browser.restore();
    }
  });

  it("keeps stored attribution when later pages have no campaign params", () => {
    const browser = withMockWindow("https://www.roomboard.online/for/moodboard?source=linkedin&campaign=moodboard");

    try {
      const firstAttribution = captureCampaignAttribution({ landingStarter: "moodboard" });

      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
          localStorage: browser.localStorage,
          location: {
            pathname: "/rooms",
            search: "",
          },
          sessionStorage: createStorageMock(),
        },
      });

      assert.deepEqual(captureCampaignAttribution(), firstAttribution);
    } finally {
      browser.restore();
    }
  });

  it("does not store private room paths as landing attribution", () => {
    withAnalyticsEnv(true);
    const analyticsEvents: CapturedAnalyticsEvent[] = [];
    setProductEventSinkForTests((name, data) => analyticsEvents.push({ name, data }));
    const browser = withMockWindow(
      "https://www.roomboard.online/rooms/private-client-room?utm_source=first_batch&utm_campaign=landing_review#ownerToken=secret",
    );

    try {
      const attribution = captureCampaignAttribution({ landingStarter: "blank" });

      assert.deepEqual(attribution, {
        campaignName: "landing_review",
        campaignSource: "first_batch",
        landingStarter: "blank",
      });
      assert.equal(browser.localStorage.getItem("roomboard-campaign-attribution"), JSON.stringify(attribution));
      assert.deepEqual(analyticsEvents, [
        {
          data: attribution,
          name: "Campaign Attributed",
        },
      ]);
    } finally {
      browser.restore();
    }
  });

  it("sends no events when PostHog env is not configured", () => {
    withAnalyticsEnv(false);
    const analyticsEvents: CapturedAnalyticsEvent[] = [];
    setProductEventSinkForTests((name, data) => analyticsEvents.push({ name, data }));
    const browser = withMockWindow(
      "https://www.roomboard.online/for/landing-review?utm_source=first_batch&utm_campaign=landing_review",
    );

    try {
      captureCampaignAttribution({ landingStarter: "blank" });

      assert.deepEqual(analyticsEvents, []);
    } finally {
      browser.restore();
    }
  });
});
