import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPort = process.env.REALTIME_SMOKE_APP_PORT ?? "3061";
const phoenixPort = process.env.REALTIME_SMOKE_PHOENIX_PORT ?? "4061";
const baseUrl = `http://localhost:${appPort}`;
const realtimeUrl = `http://127.0.0.1:${phoenixPort}`;
const realtimeSecret = process.env.ROOMBOARD_REALTIME_SECRET ?? "local-realtime-smoke-secret";
const errors = [];
const children = [];

function spawnService(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  children.push(child);
  child.stdout.on("data", (data) => process.stdout.write(`[${name}] ${data}`));
  child.stderr.on("data", (data) => process.stderr.write(`[${name}] ${data}`));
  child.on("exit", (code, signal) => {
    if (code && !child.killed) {
      errors.push(`${name} exited with code ${code}${signal ? ` (${signal})` : ""}`);
    }
  });

  return child;
}

async function waitForHttp(url, timeoutMs = 45000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Service is still starting.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function createRoom() {
  const response = await fetch(`${baseUrl}/api/rooms`, {
    body: JSON.stringify({ name: "Realtime smoke room" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Room creation failed with ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.room?.id || !payload.ownerToken) {
    throw new Error(`Unexpected room creation payload: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function newRoomPage(browser, roomId, user, { inviteToken = "", ownerToken = "" } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 840 } });
  await context.addInitScript(
    ({ roomId: initRoomId, invite, owner, roomUser }) => {
      localStorage.setItem("canvas-room-user", JSON.stringify(roomUser));
      if (owner) {
        localStorage.setItem("roomboard-owner-tokens", JSON.stringify({ [initRoomId]: owner }));
      }
      if (invite) {
        localStorage.setItem("roomboard-invite-tokens", JSON.stringify({ [initRoomId]: invite }));
      }
    },
    { invite: inviteToken, owner: ownerToken, roomId, roomUser: user },
  );
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`[${user.name}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`[${user.name}] ${error.message}`));
  return { context, page };
}

async function waitForRoomReady(page, roomId) {
  await page.goto(`${baseUrl}/rooms/${roomId}`, { timeout: 20000, waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas", { timeout: 20000 });
  await page.locator(".rb-loader").waitFor({ state: "detached", timeout: 25000 });
}

async function waitForPresenceCount(page, count) {
  await page.waitForFunction(
    (expected) => document.querySelector(".rb-presence__count")?.textContent?.trim() === String(expected),
    count,
    { timeout: 20000 },
  );
}

async function waitForObjectCount(page, count) {
  await page.waitForFunction(
    (expected) =>
      Array.from(document.querySelectorAll(".rb-coords__chip")).some((element) => {
        const text = element.textContent?.replace(/\s+/g, "") ?? "";
        return text === `objects${expected}` || text === `objects${expected}/${expected}`;
      }),
    count,
    { timeout: 20000 },
  );
}

async function waitForSyncContract(page, { status, transport }) {
  await page
    .locator(`[data-sync-transport="${transport}"][data-sync-status="${status}"]`)
    .waitFor({ state: "visible", timeout: 20000 });
}

function stopChild(child) {
  if (!child.killed && child.exitCode === null) {
    child.kill("SIGTERM");
  }
}

try {
  const phoenix = spawnService("phoenix", "mix", ["phx.server"], {
    cwd: path.join(root, "realtime/roomboard_realtime"),
    env: { ...process.env, PORT: phoenixPort, ROOMBOARD_REALTIME_SECRET: realtimeSecret },
  });
  const next = spawnService("next", path.join(root, "node_modules/.bin/next"), ["dev", "-p", appPort], {
    env: {
      ...process.env,
      NEXT_PUBLIC_ROOMBOARD_REALTIME_URL: realtimeUrl,
      ROOMBOARD_REALTIME_SECRET: realtimeSecret,
    },
  });

  await Promise.all([waitForHttp(`${realtimeUrl}/health`), waitForHttp(baseUrl)]);

  const { ownerToken, room } = await createRoom();
  const snapshotResponse = await fetch(`${baseUrl}/api/rooms/${room.id}`, {
    headers: { "X-Room-Owner-Token": ownerToken },
  });
  if (!snapshotResponse.ok) {
    throw new Error(`Owner snapshot failed with ${snapshotResponse.status}`);
  }
  const snapshot = await snapshotResponse.json();
  const viewerToken = snapshot.inviteTokens?.viewer;
  if (!viewerToken) {
    throw new Error(`Owner snapshot did not include a viewer invite token: ${JSON.stringify(snapshot)}`);
  }
  const browser = await chromium.launch({ headless: true });

  try {
    const owner = await newRoomPage(
      browser,
      room.id,
      { id: "realtime-owner", name: "Realtime Owner", color: "#0ea5e9", profileComplete: true },
      { ownerToken },
    );
    const guest = await newRoomPage(
      browser,
      room.id,
      { id: "realtime-guest", name: "Realtime Guest", color: "#10b981", profileComplete: true },
      { inviteToken: viewerToken },
    );

    await Promise.all([waitForRoomReady(owner.page, room.id), waitForRoomReady(guest.page, room.id)]);
    await Promise.all([waitForPresenceCount(owner.page, 2), waitForPresenceCount(guest.page, 2)]);
    await Promise.all([
      waitForSyncContract(owner.page, { status: "connected", transport: "phoenix" }),
      waitForSyncContract(guest.page, { status: "connected", transport: "phoenix" }),
    ]);

    await owner.page.getByLabel("Add note").click();
    await waitForObjectCount(guest.page, 1);

    await owner.page.keyboard.press("Delete");
    await waitForObjectCount(guest.page, 0);

    stopChild(phoenix);
    await Promise.all([
      waitForSyncContract(owner.page, { status: "degraded", transport: "fallback" }),
      waitForSyncContract(guest.page, { status: "degraded", transport: "fallback" }),
    ]);

    await owner.page.getByLabel("Add note").click();
    await waitForObjectCount(guest.page, 1);

    const closeResponse = await fetch(`${baseUrl}/api/rooms/${room.id}`, {
      headers: { "X-Room-Owner-Token": ownerToken },
      method: "DELETE",
    });
    if (!closeResponse.ok) {
      throw new Error(`Expected room close to succeed, got ${closeResponse.status}`);
    }

    await owner.context.close();
    await guest.context.close();
  } finally {
    await browser.close();
  }

  if (errors.length > 0) {
    throw new Error(`Realtime smoke errors:\n${errors.join("\n")}`);
  }

  console.log(
    "Realtime smoke passed: Phoenix presence and board fanout work, then local fallback continues after Phoenix stops.",
  );
} finally {
  for (const child of children) {
    stopChild(child);
  }
}
