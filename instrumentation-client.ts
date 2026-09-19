import posthog from "posthog-js";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const isConfigured = Boolean(projectToken && apiHost);

if (!isConfigured && process.env.NODE_ENV === "development") {
  const missingVariable = projectToken ? "NEXT_PUBLIC_POSTHOG_HOST" : "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN";

  // Warn rather than throw: a missing analytics key must not kill hydration.
  console.warn(
    `[analytics] ${missingVariable} is missing — PostHog events will be silently dropped until it is configured.`,
  );
}

if (projectToken && apiHost) {
  posthog.init(projectToken, {
    api_host: apiHost,
    autocapture: false,
    capture_pageleave: false,
    capture_pageview: false,
    defaults: "2026-01-30",
    disable_session_recording: true,
    person_profiles: "identified_only",
  });
}
