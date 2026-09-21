import { NextResponse } from "next/server";
import { getAppOrigin, getStripeClient } from "@/lib/billing";
import { checkRateLimitDistributed, getRequestClientKey } from "@/lib/requestRateLimit";
import { getSupabaseAdminClient, getSupabaseUserFromRequest } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PORTAL_LIMIT_PER_HOUR = 10;

export async function POST(request: Request) {
  const rateLimit = await checkRateLimitDistributed(
    `billing:portal:${getRequestClientKey(request)}`,
    PORTAL_LIMIT_PER_HOUR,
    60 * 60 * 1000,
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many portal requests. Try again later." },
      { headers: { "Retry-After": String(rateLimit.retryAfter) }, status: 429 },
    );
  }

  const origin = getAppOrigin(request);
  const stripe = getStripeClient();
  const supabase = getSupabaseAdminClient();

  if (!stripe || !supabase) {
    return NextResponse.json({
      demo: true,
      url: `${origin}/billing/success?demo=1&portal=1`,
    });
  }

  // The Stripe customer id is resolved server-side from the verified user's
  // subscription row. Accepting it from the request body would let anyone open
  // a billing portal session for an arbitrary Stripe customer.
  const user = await getSupabaseUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Sign in to manage billing." }, { status: 401 });
  }

  const { data: subscription } = await supabase
    .from("billing_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const customerId = subscription?.stripe_customer_id;

  if (!customerId) {
    return NextResponse.json({ error: "No billing account found for this user." }, { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: origin,
  });

  return NextResponse.json({ demo: false, url: session.url });
}
