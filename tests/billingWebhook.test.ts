import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Stripe from "stripe";

const PRICE_ID = "price_test_studio";

// billing.ts captures price ids from the environment at module load, so the
// env must be set before the dynamic import below resolves it.
process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID = PRICE_ID;

const {
  buildBillingProfileRow,
  buildBillingSubscriptionRow,
  resolveBillingPlanId,
  resolveStripeObjectId,
} = await import("../lib/billingWebhook.ts");

function buildSubscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    cancel_at_period_end: false,
    customer: "cus_test_123",
    id: "sub_test_123",
    lifecycle: 1,
    // Since Stripe API version 2025-03-31 the billing period lives on the
    // subscription item, not on the subscription itself.
    items: { data: [{ price: { id: PRICE_ID }, current_period_end: 1_900_000_000, current_period_start: 1_868_544_000 }] },
    metadata: {},
    status: "active",
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe("resolveStripeObjectId", () => {
  it("accepts a plain string id", () => {
    assert.equal(resolveStripeObjectId("cus_test_123"), "cus_test_123");
  });

  it("reads the id from an expanded customer object", () => {
    assert.equal(resolveStripeObjectId({ id: "cus_expanded" } as Stripe.Customer), "cus_expanded");
    assert.equal(resolveStripeObjectId({ id: "cus_deleted" } as Stripe.DeletedCustomer), "cus_deleted");
  });

  it("returns null for a missing customer", () => {
    assert.equal(resolveStripeObjectId(null), null);
  });
});

describe("resolveBillingPlanId", () => {
  it("prefers subscription metadata over session metadata and price lookup", () => {
    const subscription = buildSubscription({ metadata: { planId: "team-annual" } });
    const session = { metadata: { planId: "studio-annual" } } as Pick<Stripe.Checkout.Session, "metadata">;

    assert.equal(resolveBillingPlanId(subscription, session), "team-annual");
  });

  it("falls back to the checkout session metadata", () => {
    const session = { metadata: { planId: "team-annual" } } as Pick<Stripe.Checkout.Session, "metadata">;

    assert.equal(resolveBillingPlanId(buildSubscription(), session), "team-annual");
  });

  it("falls back to the configured price id mapping", () => {
    assert.equal(resolveBillingPlanId(buildSubscription()), "studio-annual");
  });

  it("returns null when nothing identifies a plan instead of guessing", () => {
    const unknown = buildSubscription({
      items: { data: [{ price: { id: "price_unknown" } }] } as Stripe.ApiList<Stripe.SubscriptionItem>,
    });

    assert.equal(resolveBillingPlanId(unknown), null);
    assert.equal(resolveBillingPlanId(buildSubscription(), null), "studio-annual");
  });
});

describe("buildBillingSubscriptionRow", () => {
  it("maps a subscription event to the billing_subscriptions upsert row", () => {
    const row = buildBillingSubscriptionRow(buildSubscription());

    assert.ok(row);
    assert.equal(row.stripe_subscription_id, "sub_test_123");
    assert.equal(row.stripe_customer_id, "cus_test_123");
    assert.equal(row.stripe_price_id, PRICE_ID);
    assert.equal(row.plan_id, "studio-annual");
    assert.equal(row.status, "active");
    assert.equal(row.cancel_at_period_end, false);
    assert.equal(row.user_id, null);
    assert.equal(row.current_period_start, new Date(1_868_544_000 * 1000).toISOString());
    assert.equal(row.current_period_end, new Date(1_900_000_000 * 1000).toISOString());
    assert.match(row.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("carries metadata plan and user ids from the checkout session", () => {
    const subscription = buildSubscription();
    const session = { metadata: { planId: "team-annual", userId: "user_42" } } as Pick<
      Stripe.Checkout.Session,
      "metadata"
    >;

    const row = buildBillingSubscriptionRow(subscription, session);

    assert.ok(row);
    assert.equal(row.plan_id, "team-annual");
    assert.equal(row.user_id, "user_42");
  });

  it("keeps period fields null when the subscription item omits them", () => {
    const bare = {
      ...buildSubscription(),
      items: { data: [{ price: { id: PRICE_ID } }] } as Stripe.ApiList<Stripe.SubscriptionItem>,
    } as Stripe.Subscription;

    const row = buildBillingSubscriptionRow(bare);

    assert.ok(row);
    assert.equal(row.current_period_end, null);
    assert.equal(row.current_period_start, null);
  });

  it("refuses to write a subscription row without a customer id", () => {
    assert.equal(buildBillingSubscriptionRow(buildSubscription({ customer: undefined })), null);
  });
});

describe("buildBillingProfileRow", () => {
  it("maps a subscription with a user id to the roomboard_profiles upsert row", () => {
    const subscription = buildSubscription({ metadata: { userId: "user_42" } });

    const row = buildBillingProfileRow(subscription);

    assert.ok(row);
    assert.equal(row.user_id, "user_42");
    assert.equal(row.stripe_customer_id, "cus_test_123");
    assert.match(row.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("returns null when the event carries no user id", () => {
    assert.equal(buildBillingProfileRow(buildSubscription()), null);
  });

  it("returns null when the customer id is missing", () => {
    assert.equal(
      buildBillingProfileRow(buildSubscription({ customer: undefined, metadata: { userId: "user_42" } })),
      null,
    );
  });
});
