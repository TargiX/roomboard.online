#!/usr/bin/env node
/**
 * Rule-based demo agent for Roomboard agent rooms: a minimal MCP client with
 * no LLM in the loop, so the room can be exercised (and shown to users)
 * without spending any model quota. It polls once per run (or every
 * --interval seconds with --watch), reacts to wake mentions, assigned cards,
 * and open review rounds with deterministic rules, and logs every action.
 *
 * Usage:
 *   node scripts/demo-agent.mjs --token rba1_<roomId>_<secret> \
 *     [--url http://localhost:3050/api/mcp] [--watch --interval 15] [--max-actions 8]
 *
 * Rules (deliberately boring, all content-free templates):
 *  - assigned card without my comment: post a finding (body length heuristic);
 *  - assigned card with a substantive body (>= 40 chars): back it once;
 *  - open review round waiting on me: critique phase -> comment, vote -> signal;
 *  - transcript message mentioning me: answer it in one short message;
 *  - room turn budget exhausted or agent muted: stop quietly.
 */
import { setTimeout as delay } from "node:timers/promises";

function arg(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const url = arg("--url", "http://localhost:3050/api/mcp");
const token = arg("--token");
const watch = process.argv.includes("--watch");
const intervalMs = Number(arg("--interval", "15")) * 1000;
const maxActions = Number(arg("--max-actions", "8"));

if (!token) {
  console.error("demo-agent: --token is required (room owner mints it via Connect agent).");
  process.exit(2);
}

let rpcId = 0;

async function rpc(method, params, isNotification = false) {
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(
      isNotification ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: ++rpcId, method, params },
    ),
  });

  if (isNotification) {
    return null;
  }

  const body = await response.json();

  if (body.error) {
    throw new Error(`MCP error ${body.error.code}: ${body.error.message}`);
  }

  return body.result;
}

async function call(name, args) {
  const result = await rpc("tools/call", { name, arguments: args });
  const text = result?.content?.[0]?.text;

  if (result?.isError) {
    return { error: text ? JSON.parse(text).error : "tool error" };
  }

  return { value: text ? JSON.parse(text) : null };
}

function log(line) {
  console.log(`[demo-agent] ${line}`);
}

async function runPass() {
  let actions = 0;

  const status = await call("room_status", {});

  if (status.error) {
    log(`stopped: ${status.error}`);
    return false;
  }

  const me = status.value.you;
  log(`in room as ${me.name}; turn budget remaining ${status.value.turnBudget.remaining}`);

  if (status.value.turnBudget.exhausted) {
    log("room turn budget exhausted; waiting for a human.");
    return true;
  }

  const read = await call("room_read", {});

  if (read.error) {
    log(`stopped: ${read.error}`);
    return false;
  }

  const room = read.value;
  const itemsById = new Map((room.items ?? []).map((item) => [item.id, item]));
  const myCommentOn = (itemId) => (itemsById.get(itemId)?.comments ?? []).some((comment) => comment.author === me.name);
  const mySignalOn = (itemId) =>
    (itemsById.get(itemId)?.decisionSignals ?? []).some((signal) => signal.voterId === `agent:${me.id}`);

  const act = async (label, name, args) => {
    const result = await call(name, args);
    if (result.error) {
      log(`${label} failed: ${result.error}`);
      return false;
    }
    actions += 1;
    log(label);
    return true;
  };

  // 1. Assigned cards and open rounds: critique first, then back substantive ones.
  const assignedIds = new Set((status.value.yourCards ?? []).map((card) => card.id));
  for (const round of room.openRounds ?? []) {
    if (round.pendingYou) assignedIds.add(round.itemId);
  }

  for (const itemId of assignedIds) {
    if (actions >= maxActions) break;
    const item = itemsById.get(itemId);
    if (!item) continue;
    const round = (room.openRounds ?? []).find((candidate) => candidate.itemId === itemId);
    const bodyLength = (item.body ?? "").trim().length;

    if (round?.phase === "vote") {
      if (!mySignalOn(itemId)) {
        await act(`vote phase: backed "${item.title}"`, "room_decision_signal", { itemId });
      }
      continue;
    }

    if (!myCommentOn(itemId)) {
      const finding =
        bodyLength >= 40
          ? `Copy present (${bodyLength} chars). Check it states what changes for the user and survives a mobile truncation.`
          : `No substantive copy yet (body under 40 chars). Add the draft text, price or plan names, and the CTA before review.`;
      await act(`critique: commented on "${item.title}"`, "room_comment_item", { itemId, body: finding });
    }

    if (bodyLength >= 40 && !mySignalOn(itemId) && round?.phase !== "critique") {
      await act(`backed "${item.title}" (body looks substantive)`, "room_decision_signal", { itemId });
    }
  }

  // 2. Wake: answer messages that mention me and that I have not answered yet.
  const wakeIds = new Set(room.wake ?? []);
  for (const message of room.messages ?? []) {
    if (actions >= maxActions) break;
    if (!wakeIds.has(message.id) || message.authorId === `agent:${me.id}`) continue;
    const alreadyAnswered = (room.messages ?? []).some(
      (candidate) =>
        candidate.authorId === `agent:${me.id}` && candidate.body.includes(`re: ${message.id.slice(0, 8)}`),
    );
    if (alreadyAnswered) continue;
    await act(`wake: answered ${message.authorName}`, "room_send", {
      body: `re: ${message.id.slice(0, 8)} — on it; findings land as comments on the assigned cards.`,
    });
  }

  log(`pass done (${actions} actions)`);
  return true;
}

await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "roomboard-demo-agent", version: "1.0.0" },
});
await rpc("notifications/initialized", {}, true);

if (!watch) {
  await runPass();
} else {
  while (await runPass()) {
    await delay(intervalMs);
  }
}
