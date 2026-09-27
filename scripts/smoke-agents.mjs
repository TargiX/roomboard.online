/**
 * Browser-free gate for the agent rooms MCP surface: mints an agent token,
 * drives the JSON-RPC flow (initialize, tools/list, room_send, room_read),
 * verifies the transcript lands in the room snapshot, then revokes the token
 * and confirms it dies. Complements scripts/smoke.mjs, whose browser flow
 * needs a GPU-capable headless Chromium.
 *
 * Usage: start the app (pnpm dev or pnpm start), then `pnpm smoke:agents`.
 * Set SMOKE_BASE_URL to target another deployment.
 */
const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3050";

async function json(response) {
  return { status: response.status, body: await response.json().catch(() => null) };
}

function fail(message) {
  throw new Error(message);
}

const created = await json(
  await fetch(`${baseUrl}/api/rooms`, {
    body: JSON.stringify({ name: "Smoke agent room", visibility: "private" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }),
);

if (!created.body?.room?.id || !created.body?.ownerToken) {
  fail(`Expected agent smoke room creation, got ${JSON.stringify(created.body)}`);
}

const { ownerToken, room } = created.body;
const ownerHeaders = { "Content-Type": "application/json", "X-Room-Owner-Token": ownerToken };

try {
  const mint = await json(
    await fetch(`${baseUrl}/api/rooms/${room.id}`, {
      body: JSON.stringify({ action: "agent-create", name: "Smoke agent" }),
      headers: ownerHeaders,
      method: "PATCH",
    }),
  );

  if (mint.status !== 200 || !mint.body?.token) {
    fail(`Expected agent token mint, got ${mint.status} ${JSON.stringify(mint.body)}`);
  }

  const token = mint.body.token;

  const mcpCall = async (method, params) => {
    const response = await fetch(`${baseUrl}/api/mcp`, {
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      method: "POST",
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  const unauthenticated = await fetch(`${baseUrl}/api/mcp`, {
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (unauthenticated.status !== 401) {
    fail(`Expected unauthenticated MCP to return 401, got ${unauthenticated.status}.`);
  }

  const streamProbe = await fetch(`${baseUrl}/api/mcp`);

  if (streamProbe.status !== 405) {
    fail(`Expected MCP GET to return 405 (stateless server), got ${streamProbe.status}.`);
  }

  const initialized = await mcpCall("initialize", { protocolVersion: "2025-06-18" });

  if (initialized.status !== 200 || initialized.body?.result?.protocolVersion !== "2025-06-18") {
    fail(`Expected MCP initialize handshake, got ${JSON.stringify(initialized.body)}`);
  }

  const tools = await mcpCall("tools/list");
  const toolNames = (tools.body?.result?.tools ?? []).map((tool) => tool.name);

  for (const expected of ["room_status", "room_read", "room_send", "room_comment_item", "room_decision_signal"]) {
    if (!toolNames.includes(expected)) {
      fail(`Expected tool ${expected} in the agent toolset, got ${toolNames.join(",")}`);
    }
  }

  const sent = await mcpCall("tools/call", { name: "room_send", arguments: { body: "Smoke agent checking in." } });
  const sentText = sent.body?.result?.content?.[0]?.text;
  const sentMessage = sentText ? JSON.parse(sentText).message : null;

  if (sent.body?.result?.isError || !sentMessage?.id) {
    fail(`Expected room_send to persist a message, got ${JSON.stringify(sent.body)}`);
  }

  const read = await mcpCall("tools/call", { name: "room_read", arguments: {} });
  const readText = read.body?.result?.content?.[0]?.text ?? "";

  if (!readText.includes("Smoke agent checking in.")) {
    fail(`Expected room_read to return the agent message, got ${readText.slice(0, 200)}`);
  }

  const snapshot = await json(await fetch(`${baseUrl}/api/rooms/${room.id}`, { headers: ownerHeaders }));

  if (
    !snapshot.body?.messages?.some((message) => message.id === sentMessage.id) ||
    snapshot.body?.agents?.length !== 1 ||
    JSON.stringify(snapshot.body).includes("tokenHash")
  ) {
    fail(
      `Expected snapshot to carry the transcript and a hash-free roster, got ${JSON.stringify(snapshot.body?.agents)}`,
    );
  }

  const revoke = await json(
    await fetch(`${baseUrl}/api/rooms/${room.id}`, {
      body: JSON.stringify({ action: "agent-revoke", agentId: mint.body.agent.id }),
      headers: ownerHeaders,
      method: "PATCH",
    }),
  );
  const afterRevoke = await mcpCall("tools/list");

  if (revoke.status !== 200 || afterRevoke.status !== 401) {
    fail(`Expected revoke to silence the token, got revoke=${revoke.status} mcp=${afterRevoke.status}`);
  }

  console.log(
    "Agent smoke passed: token mint, MCP handshake, toolset, transcript round-trip, snapshot projection, and revoke all behave.",
  );
} finally {
  const cleanup = await fetch(`${baseUrl}/api/rooms/${room.id}?permanent=true`, {
    headers: ownerHeaders,
    method: "DELETE",
  });

  if (!cleanup.ok) {
    fail(`Expected agent smoke room cleanup to succeed, got ${cleanup.status}`);
  }
}
