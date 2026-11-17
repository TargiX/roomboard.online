import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

// billing.ts captures the Stripe price ids from the environment at module
// load, so both plan price env vars must be set before the dynamic import
// below resolves the plan table.
const TEAM_PRICE_ID = "price_test_team";
const STUDIO_PRICE_ID = "price_test_studio";
process.env.STRIPE_TEAM_ANNUAL_PRICE_ID = TEAM_PRICE_ID;
process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID = STUDIO_PRICE_ID;

const {
  billingPlans,
  formatAnnualPrice,
  getAppOrigin,
  getBillingPlan,
  getBillingPlanByPriceId,
  getStripeClient,
} = await import("../lib/billing.ts");

const envBackup: Record<string, string | undefined> = {};
function stashEnv(key: string) {
  if (!(key in envBackup)) {
    envBackup[key] = process.env[key];
  }
}
function setEnv(key: string, value: string | undefined) {
  stashEnv(key);
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

beforeEach(() => {
  // getAppOrigin reads these at call time; start each case from a clean slate.
  setEnv("NEXT_PUBLIC_APP_URL", undefined);
  setEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined);
});

afterEach(() => {
  for (const [key, value] of Object.entries(envBackup)) {
    setEnv(key, value);
  }
});

describe("formatAnnualPrice", () => {
  it("formats whole-dollar cent amounts without decimals", () => {
    assert.equal(formatAnnualPrice(19_000), "$190");
    assert.equal(formatAnnualPrice(49_000), "$490");
  });

  it("renders zero and small amounts", () => {
    assert.equal(formatAnnualPrice(0), "$0");
    assert.equal(formatAnnualPrice(99), "$1");
  });

  it("groups thousands", () => {
    assert.equal(formatAnnualPrice(1_234_500), "$12,345");
  });
});

describe("getBillingPlan", () => {
  it("resolves each published plan id", () => {
    for (const plan of billingPlans) {
      assert.equal(getBillingPlan(plan.id), plan);
    }
  });

  it("falls back to the first plan for an unknown id", () => {
    assert.equal(getBillingPlan("enterprise-forever"), billingPlans[0]);
  });

  it("falls back to the first plan for null or undefined ids", () => {
    assert.equal(getBillingPlan(null), billingPlans[0]);
    assert.equal(getBillingPlan(undefined), billingPlans[0]);
  });
});

describe("getBillingPlanByPriceId", () => {
  it("maps configured Stripe price ids back to their plan", () => {
    assert.equal(getBillingPlanByPriceId(TEAM_PRICE_ID)?.id, "team-annual");
    assert.equal(getBillingPlanByPriceId(STUDIO_PRICE_ID)?.id, "studio-annual");
  });

  it("returns null for unknown, null, or unset price ids", () => {
    assert.equal(getBillingPlanByPriceId("price_unknown"), null);
    assert.equal(getBillingPlanByPriceId(null), null);
    assert.equal(getBillingPlanByPriceId(undefined), null);
  });
});

describe("getAppOrigin", () => {
  const request = new Request("https://fallback.example.com/rooms");

  it("prefers the request origin header", () => {
    const withOrigin = new Request("https://fallback.example.com/rooms", {
      headers: { origin: "https://client.example.com" },
    });

    assert.equal(getAppOrigin(withOrigin), "https://client.example.com");
  });

  it("uses NEXT_PUBLIC_APP_URL when no origin header is present", () => {
    setEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");

    assert.equal(getAppOrigin(request), "https://app.example.com");
  });

  it("prefixes https:// onto VERCEL_PROJECT_PRODUCTION_URL", () => {
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", "roomboard.online");

    assert.equal(getAppOrigin(request), "https://roomboard.online");
  });

  it("falls back to the request url origin", () => {
    assert.equal(getAppOrigin(request), "https://fallback.example.com");
  });
});

describe("getStripeClient", () => {
  it("returns null without a configured secret key", () => {
    setEnv("STRIPE_SECRET_KEY", undefined);
    // First call in this process resolves the memoized client.
    assert.equal(getStripeClient(), null);
  });

  it("memoizes the first resolution and ignores later env changes", () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test_late_binding");

    // The singleton was already pinned to null by the missing key above;
    // setting the env afterwards must not conjure a new client.
    assert.equal(getStripeClient(), null);
  });
});
