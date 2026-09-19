export const roomboardSupportEmail = process.env.NEXT_PUBLIC_ROOMBOARD_SUPPORT_EMAIL ?? "support@roomboard.online";

const supportSubject = encodeURIComponent("Roomboard support");

export function buildRoomboardSupportMailto(context?: string) {
  const safeContext = context?.trim().slice(0, 80);
  const supportBody = encodeURIComponent(
    [
      "What happened?",
      "",
      safeContext ? `Room context: ${safeContext}` : "Room name or context, if helpful:",
      "",
      "Please do not include owner or invite tokens unless support asks for them.",
    ].join("\n"),
  );

  return `mailto:${roomboardSupportEmail}?subject=${supportSubject}&body=${supportBody}`;
}

export const roomboardSupportMailto = buildRoomboardSupportMailto();
