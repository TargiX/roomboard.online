type FirstCardStorage = Pick<Storage, "getItem" | "setItem">;

const authoredFirstCardKey = "roomboard-authored-first-card";

function getBrowserStorage(): FirstCardStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function readAuthoredRooms(storage: FirstCardStorage | null) {
  if (!storage) {
    return {};
  }

  try {
    return JSON.parse(storage.getItem(authoredFirstCardKey) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

/**
 * `Room First Card Created` answers "did this visitor put their own material on
 * the board" — the launch funnel's activation step. Deriving that from an empty
 * board was wrong: the landing-review and moodboard starters seed six cards, so
 * on two of the three campaign routes the event could never fire and the funnel
 * showed a cliff no user had actually walked off.
 *
 * Tracked per room and per browser instead, so a reload does not re-fire it.
 */
export function hasAuthoredFirstCard(roomId: string, storage = getBrowserStorage()) {
  return Boolean(readAuthoredRooms(storage)[roomId]);
}

export function recordAuthoredFirstCard(roomId: string, storage = getBrowserStorage()) {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(
      authoredFirstCardKey,
      JSON.stringify({
        ...readAuthoredRooms(storage),
        [roomId]: true,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Storage is best-effort: when it is unavailable the event should still fire
 * once per mount rather than never, so the funnel degrades to over-reporting
 * instead of silently losing its activation step.
 */
export function resolveFirstCardEventName(
  roomId: string,
  alreadyAuthoredInSession: boolean,
  storage = getBrowserStorage(),
) {
  if (alreadyAuthoredInSession || hasAuthoredFirstCard(roomId, storage)) {
    return "Room Card Created";
  }

  return "Room First Card Created";
}
