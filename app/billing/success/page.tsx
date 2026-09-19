import Link from "next/link";
import type { Metadata } from "next";
import { billingPlans, getBillingPlan } from "@/lib/billing";

export const metadata: Metadata = {
  title: "Billing status",
  robots: {
    follow: false,
    index: false,
  },
};

type BillingSuccessSearchParams = Promise<{
  demo?: string;
  plan?: string;
  portal?: string;
  session_id?: string;
}>;

export default async function BillingSuccessPage({ searchParams }: { searchParams: BillingSuccessSearchParams }) {
  const params = await searchParams;
  const plan = getBillingPlan(params.plan);
  const isDemo = params.demo === "1";

  return (
    <main className="billing-success">
      <section>
        <div className="eyebrow">Billing status</div>
        <h1>
          {isDemo ? "Billing is not active here" : params.portal ? "Billing portal opened" : `${plan.name} is ready`}
        </h1>
        <p>
          {isDemo
            ? "Roomboard rooms do not require payment right now. Return to Roomboard to create or join a private decision room."
            : "Stripe Checkout completed and the webhook can persist subscription state into Supabase."}
        </p>
        <div className="billing-success__plans">
          {billingPlans.map((item) => (
            <span key={item.id}>{item.name}</span>
          ))}
        </div>
        <Link href="/">Back to Roomboard</Link>
      </section>
    </main>
  );
}
