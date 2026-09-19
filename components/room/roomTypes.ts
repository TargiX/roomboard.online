import type { RoomDecisionSignal } from "@/lib/canvasRoom";

/** The browser-local collaborator identity remembered across rooms. */
export type LocalUser = {
  profileComplete?: boolean;
  id: string;
  name: string;
  color: string;
};

/** Color tokens for the Pixi card palette, derived from the room theme. */
export type CanvasPalette = {
  accent: string;
  border: string;
  body: string;
  cardMix: string;
  connector: string;
  faint: string;
  footer: string;
  frame: string;
  frameBorder: string;
  muted: string;
  separator: string;
  title: string;
};

/** The light/dark theme variant the room canvas renders in. */
export type RoomTheme = "dark" | "light";

/** Property bag forwarded to PostHog events from the room surface. */
export type ProductAnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export function isDecisionSignalOwnedByUser(signal: RoomDecisionSignal, user: LocalUser | null) {
  if (!user) return false;
  return signal.voterId ? signal.voterId === user.id : signal.voter.toLowerCase() === user.name.toLowerCase();
}
