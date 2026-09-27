import type { Metadata } from "next";
import { AgentReviewEntry } from "./AgentReviewEntry";

export const dynamic = "force-dynamic";

const description =
  "Open a private decision room, connect your agent over MCP, and let it review the real material with you.";

export const metadata: Metadata = {
  alternates: {
    canonical: "/for/agent-review",
  },
  description,
  openGraph: {
    description,
    title: "Agent review room · Roomboard",
    type: "website",
    url: "/for/agent-review",
  },
  title: "Agent review room",
  twitter: {
    card: "summary_large_image",
    description,
    title: "Agent review room · Roomboard",
  },
};

export default function AgentReviewPage() {
  return <AgentReviewEntry />;
}
