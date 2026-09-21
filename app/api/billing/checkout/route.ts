import { NextResponse } from "next/server";
import { getAppOrigin, getBillingPlan, getStripeClient } from "@/lib/billing";
import { readJsonBody } from "@/lib/requestJson";
import { checkRateLimitDistributed, getRequestClientKey } from "@/lib/requestRateLimit";
import { getSupabaseUserFromRequest } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHECKOUT_LIMIT_PER_HOUR = 10;

type CheckoutPayload = {
  email?: string;
  planId?: string;
};

export async function POST(request: Request) {
  const rateLimit = await checkRateLimitDistributed(
    `billing:checkout:${getRequestClientKey(request)}`,
    CHECKOUT_LIMIT_PER_HOUR,
    60 * 60 * 1000,
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Try again later." },
      { headers: { "Retry-After": String(rateLimit.retryAfter) }, status: 429 },
    );
  }

  const origin = getAppOrigin(request);
  const body = await readJsonBody<CheckoutPayload>(request, 8 * 1024);

  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const plan = getBillingPlan(body.value.planId);
  const stripe = getStripeClient();

  if (!stripe || !plan.stripePriceId) {
    return NextResponse.json({
      demo: true,
      mode: "demo",
      url: `${origin}/billing/success?demo=1&plan=${plan.id}`,
    });
  }

  // Live checkout requires a verified Supabase session: the user id written
  // into Stripe metadata is what the webhook later uses to link the
  // subscription, so it must come from the token, never the request body.
  const user = await getSupabaseUserFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: "Sign in before starting checkout." },
      { status: 401 },
    );
  }

  const session = await stripe.checkout.sessions.create({
    allow_promotion_codes: true,
    customer_email: (user.email ?? body.value.email) || undefined,
    line_items: [
      {
        price: plan.stripePriceId,
        quantity: 1,
      },
    ],
    metadata: {
      planId: plan.id,
      userId: user.id,
    },
    mode: "subscription",
    subscription_data: {
      metadata: {
        planId: plan.id,
        userId: user.id,
      },
    },
    success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: origin,
  });

  return NextResponse.json({ demo: false, mode: "stripe", url: session.url });
}
