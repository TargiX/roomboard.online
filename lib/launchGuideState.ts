type LaunchGuideStorage = Pick<Storage, "getItem" | "setItem">;

const dismissedLaunchGuidesKey = "roomboard-dismissed-launch-guides";

function getBrowserStorage(): LaunchGuideStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function readDismissedLaunchGuides(storage: LaunchGuideStorage | null) {
  if (!storage) {
    return {};
  }

  try {
    return JSON.parse(storage.getItem(dismissedLaunchGuidesKey) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function isRoomLaunchGuideDismissed(roomId: string, storage = getBrowserStorage()) {
  return Boolean(readDismissedLaunchGuides(storage)[roomId]);
}

export function dismissRoomLaunchGuide(roomId: string, storage = getBrowserStorage()) {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(
      dismissedLaunchGuidesKey,
      JSON.stringify({
        ...readDismissedLaunchGuides(storage),
        [roomId]: true,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
