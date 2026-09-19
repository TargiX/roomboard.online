import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { normalizeBaseUrl, runProductionRealtimeHealth } from "./production-realtime-health.mjs";

const defaultBaseUrl = "https://www.roomboard.online";
const healthTimeoutMs = 60_000;
const requestTimeoutMs = 20_000;
const browserTimeoutMs = 30_000;

/** @param {Record<string, string | undefined>} env */
export function resolveProductionSessionBaseUrl(env = process.env) {
  const override = env.PRODUCTION_REALTIME_BASE_URL;

  if (override !== undefined && String(override).trim() === "") {
    throw new Error("PRODUCTION_REALTIME_BASE_URL must not be empty when provided.");
  }

  const rawUrl = new URL(String(override ?? defaultBaseUrl).trim());
  if (rawUrl.search || rawUrl.hash) {
    throw new Error("Production realtime session smoke base URL must not contain a query string or fragment.");
  }

  const baseUrl = normalizeBaseUrl(rawUrl.toString());
  const url = new URL(baseUrl);

  if (url.protocol !== "https:") {
    throw new Error("Production realtime session smoke requires an https base URL.");
  }

  if (url.username || url.password) {
    throw new Error("Production realtime session smoke base URL must not contain credentials.");
  }

  if (url.pathname !== "/") {
    throw new Error("Production realtime session smoke base URL must be an origin without a path.");
  }

  return baseUrl;
}

export function redactSensitiveValues(value, secrets) {
  let message = value instanceof Error ? value.message : String(value);

  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length > 0) {
      message = message.split(secret).join("[REDACTED]");
    }
  }

  return message;
}

export function formatSessionFailure(primaryFailure, cleanupFailure, closeFailures = [], secrets = []) {
  const lines = [];

  if (primaryFailure) {
    lines.push(`Primary failure: ${redactSensitiveValues(primaryFailure, secrets)}`);
  }

  if (cleanupFailure) {
    lines.push(`Cleanup failure: ${redactSensitiveValues(cleanupFailure, secrets)}`);
  }

  for (const failure of closeFailures) {
    lines.push(`Browser close failure: ${redactSensitiveValues(failure, secrets)}`);
  }

  return lines.join("\n");
}

async function fetchWithTimeout(url, init = {}) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
}

async function createOwnedRoom(baseUrl) {
  const response = await fetchWithTimeout(`${baseUrl}/api/rooms`, {
    body: JSON.stringify({ name: `Production realtime smoke ${new Date().toISOString()}` }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Room creation returned ${response.status}.`);
  }

  const payload = await response.json();
  if (typeof payload?.room?.id !== "string" || typeof payload?.ownerToken !== "string") {
    throw new Error("Room creation returned an unexpected payload.");
  }

  return payload;
}

async function loadOwnerSnapshot(baseUrl, roomId, ownerToken) {
  const response = await fetchWithTimeout(`${baseUrl}/api/rooms/${encodeURIComponent(roomId)}`, {
    headers: { "X-Room-Owner-Token": ownerToken },
  });

  if (!response.ok) {
    throw new Error(`Owner snapshot returned ${response.status}.`);
  }

  const snapshot = await response.json();
  if (typeof snapshot?.inviteTokens?.editor !== "string") {
    throw new Error("Owner snapshot did not include an editor invite token.");
  }

  return snapshot;
}

async function openRoomContext(browser, baseUrl, roomId, user, access, contexts) {
  const context = await browser.newContext({ viewport: { height: 840, width: 1280 } });
  contexts.push(context);
  await context.addInitScript(
    ({ initialAccess, initialRoomId, initialUser }) => {
      localStorage.setItem("canvas-room-user", JSON.stringify(initialUser));

      if (initialAccess.ownerToken) {
        localStorage.setItem("roomboard-owner-tokens", JSON.stringify({ [initialRoomId]: initialAccess.ownerToken }));
      }

      if (initialAccess.inviteToken) {
        localStorage.setItem("roomboard-invite-tokens", JSON.stringify({ [initialRoomId]: initialAccess.inviteToken }));
      }
    },
    { initialAccess: access, initialRoomId: roomId, initialUser: user },
  );

  const page = await context.newPage();
  page.setDefaultTimeout(browserTimeoutMs);
  page.setDefaultNavigationTimeout(browserTimeoutMs);
  await page.goto(`${baseUrl}/rooms/${encodeURIComponent(roomId)}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas");
  await page.locator(".rb-loader").waitFor({ state: "detached" });
  return { context, page };
}

async function waitForPresenceCount(page, expected) {
  await page.waitForFunction(
    (count) => document.querySelector(".rb-presence__count")?.textContent?.trim() === String(count),
    expected,
  );
}

function buildLiveSyncContractSelector() {
  return '[data-sync-transport="phoenix"][data-sync-status="connected"]';
}

export async function waitForLiveSync(page) {
  await page.locator(buildLiveSyncContractSelector()).waitFor({ state: "visible" });
}

async function waitForObjectCount(page, expected) {
  await page.waitForFunction(
    (count) =>
      Array.from(document.querySelectorAll(".rb-coords__chip")).some((element) => {
        const text = element.textContent?.replace(/\s+/g, "") ?? "";
        const match = /^objects(?:\d+\/)?(\d+)$/.exec(text);
        return match ? Number.parseInt(match[1], 10) === count : false;
      }),
    expected,
  );
}

async function cleanupRoom(baseUrl, roomId, ownerToken) {
  const response = await fetchWithTimeout(`${baseUrl}/api/rooms/${encodeURIComponent(roomId)}?permanent=true`, {
    headers: { "X-Room-Owner-Token": ownerToken },
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Owner-authenticated DELETE returned ${response.status}.`);
  }
}

async function closeWithTimeout(label, close) {
  let timeout;

  try {
    await Promise.race([
      close(),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} did not close within ${requestTimeoutMs}ms.`)),
          requestTimeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function runProductionRealtimeSessionSmoke() {
  const baseUrl = resolveProductionSessionBaseUrl();
  const sensitiveValues = [];
  let browser;
  let roomId = "";
  let ownerToken = "";
  let primaryFailure = null;
  let cleanupFailure = null;
  const contexts = [];
  const closeFailures = [];

  try {
    // Deliberately ignore every override except PRODUCTION_REALTIME_BASE_URL for this production-only probe.
    await runProductionRealtimeHealth({ baseUrl, realtimeEndpoint: "", timeoutMs: healthTimeoutMs });

    const created = await createOwnedRoom(baseUrl);
    roomId = created.room.id;
    ownerToken = created.ownerToken;
    sensitiveValues.push(ownerToken);

    const snapshot = await loadOwnerSnapshot(baseUrl, roomId, ownerToken);
    const editorToken = snapshot.inviteTokens.editor;
    const initialObjectCount = Array.isArray(snapshot.items) ? snapshot.items.length : 0;
    sensitiveValues.push(editorToken);

    browser = await chromium.launch({ headless: true, timeout: browserTimeoutMs });
    const owner = await openRoomContext(
      browser,
      baseUrl,
      roomId,
      { color: "#0ea5e9", id: "production-realtime-owner", name: "Production Realtime Owner", profileComplete: true },
      { ownerToken },
      contexts,
    );
    const editor = await openRoomContext(
      browser,
      baseUrl,
      roomId,
      { color: "#10b981", id: "production-realtime-editor", name: "Production Realtime Editor", profileComplete: true },
      { inviteToken: editorToken },
      contexts,
    );

    await Promise.all([
      waitForLiveSync(owner.page),
      waitForLiveSync(editor.page),
      waitForPresenceCount(owner.page, 2),
      waitForPresenceCount(editor.page, 2),
    ]);

    const [mutationResponse] = await Promise.all([
      owner.page.waitForResponse(
        (response) =>
          response.url() === `${baseUrl}/api/rooms/${encodeURIComponent(roomId)}` &&
          response.request().method() === "POST",
      ),
      owner.page.getByLabel("Add note", { exact: true }).click(),
    ]);

    if (!mutationResponse.ok()) {
      throw new Error(`Owner Add note mutation returned ${mutationResponse.status()}.`);
    }

    await waitForObjectCount(editor.page, initialObjectCount + 1);
  } catch (error) {
    primaryFailure = error;
  } finally {
    if (roomId && ownerToken) {
      try {
        await cleanupRoom(baseUrl, roomId, ownerToken);
      } catch (error) {
        cleanupFailure = error;
      }
    }

    for (const context of contexts.reverse()) {
      try {
        await closeWithTimeout("Browser context", () => context.close());
      } catch (error) {
        closeFailures.push(error);
      }
    }

    if (browser) {
      try {
        await closeWithTimeout("Browser", () => browser.close());
      } catch (error) {
        closeFailures.push(error);
      }
    }
  }

  if (primaryFailure || cleanupFailure || closeFailures.length > 0) {
    throw new Error(formatSessionFailure(primaryFailure, cleanupFailure, closeFailures, sensitiveValues));
  }

  return { baseUrl };
}

async function main() {
  const result = await runProductionRealtimeSessionSmoke();
  console.log(`Production realtime session smoke passed against ${result.baseUrl}; the owned smoke room was deleted.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
