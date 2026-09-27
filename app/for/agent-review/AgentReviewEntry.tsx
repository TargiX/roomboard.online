"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, Lock, MessageSquare } from "lucide-react";
import { buildRoomPathWithHashToken } from "@/lib/roomLinks";
import { writeOwnerToken } from "@/lib/roomTokens";
import { prewarmRealtimeEndpoint } from "@/lib/realtimePrewarm";
import { trackProductEvent } from "@/lib/productAnalytics";

const stepCopy = [
  {
    title: "Create the room",
    body: "Hit start and a private, locked Roomboard room opens for the material you want reviewed.",
  },
  {
    title: "Connect your agent with the one-time token",
    body: "Roomboard hands you a single MCP token. Drop the command into Claude Code — your agent joins the room as a reviewer.",
  },
  {
    title: "Review together",
    body: "Transcript, card comments, statuses, and the final decision record — kept in one place while you and your agent work.",
  },
];

export function AgentReviewEntry() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousTheme = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = "dark";
    document.body.classList.add("landing");
    document.documentElement.style.height = "auto";
    document.documentElement.style.minHeight = "100%";
    document.documentElement.style.overflow = "visible";
    document.documentElement.style.overflowX = "clip";
    document.body.style.height = "auto";
    document.body.style.minHeight = "100%";
    document.body.style.overflow = "visible";
    document.body.style.overflowX = "clip";

    prewarmRealtimeEndpoint();

    return () => {
      if (previousTheme) {
        document.documentElement.dataset.theme = previousTheme;
      } else {
        delete document.documentElement.dataset.theme;
      }
      document.body.classList.remove("landing");
      document.documentElement.style.height = "";
      document.documentElement.style.minHeight = "";
      document.documentElement.style.overflow = "";
      document.documentElement.style.overflowX = "";
      document.body.style.height = "";
      document.body.style.minHeight = "";
      document.body.style.overflow = "";
      document.body.style.overflowX = "";
    };
  }, []);

  const startAgentRoom = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);
    setError("");
    trackProductEvent("Agent Room Start Clicked", { source: "agent_review_entry" });

    try {
      const response = await fetch("/api/rooms", {
        body: JSON.stringify({ name: "Agent review" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const isRateLimited = response.status === 429;
        setError(
          isRateLimited
            ? "Room creation is temporarily rate limited. Try again in a little while."
            : "Roomboard could not open a room. Please try again.",
        );
        trackProductEvent("Agent Room Create Failed", {
          reason: isRateLimited ? "rate_limited" : "bad_response",
          status: response.status,
        });
        return;
      }

      const data = (await response.json()) as { ownerToken?: string; room?: { id: string } };
      if (!data.room || !data.ownerToken) {
        setError("Roomboard opened a response without a room. Please try again.");
        trackProductEvent("Agent Room Create Failed", { reason: "missing_room" });
        return;
      }

      writeOwnerToken(data.room.id, data.ownerToken);
      trackProductEvent("Agent Room Created", { starter: "agent-review" });
      router.push(
        buildRoomPathWithHashToken(data.room.id, "ownerToken", data.ownerToken, {
          connectAgent: "1",
          new: "1",
          starter: "agent-review",
        }),
      );
    } catch {
      setError("Roomboard could not reach the room service. Please try again.");
      trackProductEvent("Agent Room Create Failed", { reason: "request_error" });
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, router]);

  return (
    <>
      <nav className="lp-nav">
        <div className="lp-shell lp-nav__inner">
          <a className="lp-nav__logo" href="/">
            <div className="mark" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="2" y="2" width="5" height="5" rx="1" />
                <rect x="9" y="2" width="5" height="5" rx="1" />
                <rect x="2" y="9" width="5" height="5" rx="1" />
                <rect x="9" y="9" width="5" height="5" rx="1" />
              </svg>
            </div>
            Roomboard
          </a>
          <div className="lp-nav__spacer" />
          <a className="lp-nav__login" href="/rooms">
            My rooms
          </a>
          <button className="lp-nav__cta" disabled={isCreating} onClick={() => void startAgentRoom()} type="button">
            Start agent room
          </button>
        </div>
      </nav>

      <main>
        <section className="lp-hero">
          <div className="lp-shell lp-hero__inner">
            <div className="lp-hero__signal">
              <Bot size={13} aria-hidden="true" />
              Agent review room
              <span className="sep">·</span>
              <span>MCP-enabled private room</span>
            </div>
            <h1>Agent review room.</h1>
            <p className="lead">
              Open a private decision room, connect your agent over MCP, and let it review the real material with you.
            </p>

            <div className="lp-hero__actions">
              <button className="lp-cta__cta" disabled={isCreating} onClick={() => void startAgentRoom()} type="button">
                {isCreating ? "Opening" : "Open agent review room"}
                <ArrowRight size={14} aria-hidden="true" />
              </button>
              <a className="lp-demo-cta" href="/">
                Back to home
              </a>
            </div>

            {error ? (
              <p className="lp-hero__error" role="status">
                {error}
              </p>
            ) : null}

            <div className="lp-steps" aria-label="How the agent review room works">
              {stepCopy.map((step, index) => (
                <article className="lp-step" key={step.title}>
                  <span className="lp-step__num">0{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  {index === 0 ? (
                    <div className="lp-step__demo" aria-hidden="true">
                      <div className="lp-demo-new-board">
                        <div>Private room</div>
                        Agent review
                        <span>|</span>
                      </div>
                      <div className="lp-demo-create">Open</div>
                    </div>
                  ) : index === 1 ? (
                    <div className="lp-step__demo" aria-hidden="true">
                      <div className="lp-demo-link">
                        <div>claude mcp add --transport http roomboard …</div>
                        <span>Run</span>
                      </div>
                    </div>
                  ) : (
                    <div className="lp-step__demo" aria-hidden="true">
                      <div className="lp-demo-link">
                        <div>Transcript · comments · decision</div>
                        <span>Review</span>
                      </div>
                      <div className="lp-demo-avatars" aria-hidden="true">
                        <div style={{ background: "#ef6b7a" }}>Y</div>
                        <div style={{ background: "#9b7bd9" }}>A</div>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>

            <div className="lp-section-link" aria-hidden="false" style={{ marginTop: 24 }}>
              <Lock size={12} aria-hidden="true" />
              Private &amp; locked by default
              <span className="sep" aria-hidden="true">
                ·
              </span>
              <Bot size={12} aria-hidden="true" />
              One-time MCP token
              <span className="sep" aria-hidden="true">
                ·
              </span>
              <MessageSquare size={12} aria-hidden="true" />
              Shared transcript
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
