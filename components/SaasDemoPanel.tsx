"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Code2, CreditCard, Database, LogIn, LogOut, ShieldCheck, Webhook } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type DemoPlan = {
  annualPrice: string;
  description: string;
  id: "team-annual" | "studio-annual";
  name: string;
};

type SubscriptionRow = {
  current_period_end: string | null;
  plan_id: string | null;
  status: string;
  stripe_customer_id: string;
};

const demoPlans: DemoPlan[] = [
  {
    annualPrice: "$190",
    description: "Client rooms, comments, uploads, and shared room history.",
    id: "team-annual",
    name: "Team Annual",
  },
  {
    annualPrice: "$490",
    description: "Studio workspace, higher limits, and portfolio-scale reviews.",
    id: "studio-annual",
    name: "Studio Annual",
  },
];

function githubUrl() {
  return process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/TargiX/flux-graph-pixi";
}

function statusLabel(value?: string | null) {
  if (!value) {
    return "demo ready";
  }

  return value.replace(/_/g, " ");
}

export function SaasDemoPanel() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("demo@roomboard.online");
  const [password, setPassword] = useState("roomboard-demo");
  const [session, setSession] = useState<Session | null>(null);
  const [demoSignedIn, setDemoSignedIn] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<DemoPlan["id"]>("team-annual");
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [message, setMessage] = useState(
    "Demo mode works without cloud keys; real Supabase/Stripe turns on automatically.",
  );
  const [isBusy, setIsBusy] = useState(false);

  const isSignedIn = Boolean(session || demoSignedIn);
  const activeEmail = session?.user.email ?? (demoSignedIn ? email : "");

  const refreshBillingState = useCallback(
    async (activeSession: Session | null) => {
      if (!supabase || !activeSession) {
        setSubscription(null);
        return;
      }

      const userId = activeSession.user.id;

      await supabase.from("roomboard_profiles").upsert(
        {
          email: activeSession.user.email,
          full_name: activeSession.user.email?.split("@")[0] ?? "Roomboard user",
          user_id: userId,
        },
        { onConflict: "user_id" },
      );

      const { data, error } = await supabase
        .from("billing_subscriptions")
        .select("current_period_end, plan_id, status, stripe_customer_id")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error) {
        setSubscription(data as SubscriptionRow | null);
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setSession(data.session);
      void refreshBillingState(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void refreshBillingState(nextSession);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [refreshBillingState, supabase]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);

    try {
      if (!supabase) {
        setDemoSignedIn(true);
        setMessage("Local demo identity is active. Add Supabase public env vars for real Auth + RLS.");
        return;
      }

      const signIn = await supabase.auth.signInWithPassword({ email, password });

      if (signIn.error) {
        const signUp = await supabase.auth.signUp({ email, password });

        if (signUp.error) {
          setMessage(signUp.error.message);
          return;
        }

        setSession(signUp.data.session);
        setMessage(
          signUp.data.session
            ? "Supabase user created and signed in."
            : "Supabase user created. Confirm email if your project requires it.",
        );
        return;
      }

      setSession(signIn.data.session);
      setMessage("Supabase session active. RLS queries now run as this user.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }

    setDemoSignedIn(false);
    setSession(null);
    setSubscription(null);
    setMessage("Signed out.");
  }

  async function startCheckout() {
    setIsBusy(true);

    try {
      const response = await fetch("/api/billing/checkout", {
        body: JSON.stringify({
          email: activeEmail || email,
          planId: selectedPlan,
          userId: session?.user.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { demo?: boolean; url?: string };

      if (!data.url) {
        setMessage("Checkout route did not return a URL.");
        return;
      }

      window.location.assign(data.url);
    } finally {
      setIsBusy(false);
    }
  }

  async function openPortal() {
    setIsBusy(true);

    try {
      const response = await fetch("/api/billing/portal", {
        body: JSON.stringify({ customerId: subscription?.stripe_customer_id }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { url?: string };

      if (data.url) {
        window.location.assign(data.url);
      }
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="lp-saas" id="billing">
      <div className="lp-saas__head">
        <div>
          <div className="eyebrow">SaaS demo surface</div>
          <h2>Auth, RLS, annual subscriptions, and webhooks are wired into the app.</h2>
        </div>
        <a className="lp-saas__github" href={githubUrl()} rel="noreferrer" target="_blank">
          <Code2 />
          GitHub
        </a>
      </div>

      <div className="lp-saas__grid">
        <div className="lp-saas__panel lp-saas__auth">
          <div className="lp-saas__panel-head">
            <ShieldCheck />
            <div>
              <h3>Supabase Auth</h3>
              <p>{supabase ? "Connected through NEXT_PUBLIC_SUPABASE_*" : "Local demo identity"}</p>
            </div>
          </div>

          <form className="lp-saas__form" onSubmit={handleAuth}>
            <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
            <input
              autoComplete="current-password"
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
            {isSignedIn ? (
              <button onClick={handleSignOut} type="button">
                <LogOut />
                Sign out
              </button>
            ) : (
              <button disabled={isBusy} type="submit">
                <LogIn />
                Sign in / create
              </button>
            )}
          </form>

          <div className="lp-saas__identity">
            <span className={isSignedIn ? "ok" : ""} />
            {isSignedIn ? activeEmail : "No active user"}
          </div>
        </div>

        <div className="lp-saas__panel lp-saas__billing">
          <div className="lp-saas__panel-head">
            <CreditCard />
            <div>
              <h3>Stripe Billing</h3>
              <p>Checkout Sessions in subscription mode with annual Prices</p>
            </div>
          </div>

          <div className="lp-saas__plans">
            {demoPlans.map((plan) => (
              <button
                className={selectedPlan === plan.id ? "active" : ""}
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                type="button"
              >
                <span>
                  <strong>{plan.name}</strong>
                  <small>{plan.description}</small>
                </span>
                <b>{plan.annualPrice}/yr</b>
              </button>
            ))}
          </div>

          <div className="lp-saas__billing-actions">
            <button disabled={isBusy} onClick={startCheckout} type="button">
              <CreditCard />
              Annual checkout
            </button>
            <button disabled={isBusy} onClick={openPortal} type="button">
              Manage billing
            </button>
          </div>
        </div>

        <div className="lp-saas__panel lp-saas__status">
          <div className="lp-saas__panel-head">
            <Database />
            <div>
              <h3>RLS state</h3>
              <p>Profiles and subscriptions are user-scoped</p>
            </div>
          </div>
          <dl>
            <div>
              <dt>Session</dt>
              <dd>{isSignedIn ? "authenticated" : "anonymous"}</dd>
            </div>
            <div>
              <dt>Subscription</dt>
              <dd>{statusLabel(subscription?.status)}</dd>
            </div>
            <div>
              <dt>Plan</dt>
              <dd>{subscription?.plan_id ?? selectedPlan}</dd>
            </div>
          </dl>
        </div>

        <div className="lp-saas__panel lp-saas__webhook">
          <div className="lp-saas__panel-head">
            <Webhook />
            <div>
              <h3>Webhook ingestion</h3>
              <p>/api/billing/webhook persists Stripe lifecycle events</p>
            </div>
          </div>
          <div className="lp-saas__events">
            <span>checkout.session.completed</span>
            <span>customer.subscription.updated</span>
            <span>customer.subscription.deleted</span>
          </div>
          <p className="lp-saas__message">{message}</p>
        </div>
      </div>
    </section>
  );
}
