import type Stripe from "stripe";
import { getBillingPlanByPriceId, unixToIso } from "./billing.ts";

export type BillingSubscriptionRow = {
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  current_period_start: string | null;
  plan_id: string | null;
  status: string;
  stripe_customer_id: string;
  stripe_price_id: string | null;
  stripe_subscription_id: string;
  updated_at: string;
  user_id: string | null;
};

export type BillingProfileRow = {
  stripe_customer_id: string;
  updated_at: string;
  user_id: string;
};

/** Stripe ids arrive either as strings or as expanded customer objects. */
export function resolveStripeObjectId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  return typeof value === "string" ? value : (value?.id ?? null);
}

/**
 * Resolve the billed plan with a strict precedence: subscription metadata,
 * checkout session metadata, then the price-id lookup table. Returns null when
 * none of them identify a plan, so callers fail visibly instead of guessing.
 */
export function resolveBillingPlanId(
  subscription: Pick<Stripe.Subscription, "metadata" | "items">,
  session?: Pick<Stripe.Checkout.Session, "metadata"> | null,
) {
  return (
    subscription.metadata?.planId ||
    session?.metadata?.planId ||
    resolveBillingPlanIdFromPrice(subscription)?.id ||
    null
  );
}

function resolveBillingPlanIdFromPrice(subscription: Pick<Stripe.Subscription, "items">) {
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  return getBillingPlanByPriceId(priceId);
}

export function resolveBillingUserId(
  subscription: Pick<Stripe.Subscription, "metadata">,
  session?: Pick<Stripe.Checkout.Session, "metadata"> | null,
) {
  return subscription.metadata?.userId || session?.metadata?.userId || null;
}

/** Build the billing_subscriptions upsert row for a Stripe subscription event. */
export function buildBillingSubscriptionRow(
  subscription: Stripe.Subscription,
  session?: Pick<Stripe.Checkout.Session, "metadata"> | null,
): BillingSubscriptionRow | null {
  const customerId = resolveStripeObjectId(subscription.customer);

  if (!customerId) {
    return null;
  }

  // Since Stripe API version 2025-03-31 the billing period is an item-level
  // field, so read it from the same item that supplies stripe_price_id.
  const subscriptionItem = subscription.items?.data?.[0];

  return {
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_end: unixToIso(subscriptionItem?.current_period_end),
    current_period_start: unixToIso(subscriptionItem?.current_period_start),
    plan_id: resolveBillingPlanId(subscription, session),
    status: subscription.status,
    stripe_customer_id: customerId,
    stripe_price_id: subscription.items?.data?.[0]?.price?.id ?? null,
    stripe_subscription_id: subscription.id,
    updated_at: new Date().toISOString(),
    user_id: resolveBillingUserId(subscription, session),
  };
}

/** Build the roomboard_profiles upsert row when the event carries a user id. */
export function buildBillingProfileRow(
  subscription: Stripe.Subscription,
  session?: Pick<Stripe.Checkout.Session, "metadata"> | null,
): BillingProfileRow | null {
  const userId = resolveBillingUserId(subscription, session);
  const customerId = resolveStripeObjectId(subscription.customer);

  if (!userId || !customerId) {
    return null;
  }

  return {
    stripe_customer_id: customerId,
    updated_at: new Date().toISOString(),
    user_id: userId,
  };
}
