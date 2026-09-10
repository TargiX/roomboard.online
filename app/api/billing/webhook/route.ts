import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/billing";
import { buildBillingProfileRow, buildBillingSubscriptionRow } from "@/lib/billingWebhook";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function upsertSubscription(subscription: Stripe.Subscription, session?: Stripe.Checkout.Session) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  const profileRow = buildBillingProfileRow(subscription, session);

  if (profileRow) {
    await supabase
      .from("roomboard_profiles")
      .upsert(profileRow, { onConflict: "user_id" })
      .throwOnError();
  }

  const subscriptionRow = buildBillingSubscriptionRow(subscription, session);

  if (!subscriptionRow) {
    return;
  }

  await supabase
    .from("billing_subscriptions")
    .upsert(subscriptionRow, { onConflict: "stripe_subscription_id" })
    .throwOnError();
}

async function getSubscriptionFromSession(stripe: Stripe, session: Stripe.Checkout.Session) {
  if (!session.subscription || typeof session.subscription !== "string") {
    return null;
  }

  return stripe.subscriptions.retrieve(session.subscription);
}

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    return NextResponse.json({ demo: true, received: true });
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Stripe webhook";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const subscription = await getSubscriptionFromSession(stripe, session);
      if (subscription) {
        await upsertSubscription(subscription, session);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await upsertSubscription(event.data.object);
      break;
  }

  return NextResponse.json({ received: true });
}
