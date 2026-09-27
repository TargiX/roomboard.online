import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoomAgentMcpResponder, mcpDefaultProtocolVersion, mcpToolJson } from "../lib/roomAgentMcp.ts";

const serverInfo = { name: "roomboard-test", version: "0.0.0" };

function buildResponder() {
  const executed: Array<{ args: Record<string, unknown>; name: string }> = [];
  const responder = createRoomAgentMcpResponder({
    instructions: "Behave.",
    serverInfo,
    tools: {
      boom: {
        description: "always throws",
        inputSchema: { type: "object", properties: {} },
        async execute() {
          throw new Error("secret internal detail");
        },
      },
      echo: {
        description: "echoes arguments",
        inputSchema: { type: "object", properties: { value: { type: "string" } } },
        async execute(args) {
          executed.push({ name: "echo", args });
          return mcpToolJson({ echo: args });
        },
      },
    },
  });
  return { executed, responder };
}

const rpc = (method: string, params?: unknown, id: number | string = 1) => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params === undefined ? {} : { params }),
});

type RpcEnvelope = { result?: Record<string, unknown>; error?: { code: number; message: string } };

function asRpc(json: unknown): RpcEnvelope {
  return json as RpcEnvelope;
}

describe("MCP JSON-RPC envelope", () => {
  it("negotiates supported protocol versions and falls back to the default", async () => {
    const { responder } = buildResponder();

    const supported = asRpc((await responder.handle(rpc("initialize", { protocolVersion: "2025-06-18" }))).json);
    assert.equal(supported.result?.protocolVersion, "2025-06-18");
    assert.deepEqual(supported.result?.serverInfo, serverInfo);
    assert.equal(supported.result?.instructions, "Behave.");

    const unknown = asRpc((await responder.handle(rpc("initialize", { protocolVersion: "1999-01-01" }))).json);
    assert.equal(unknown.result?.protocolVersion, mcpDefaultProtocolVersion);
    assert.deepEqual(unknown.result?.capabilities, { tools: { listChanged: false } });
  });

  it("answers notifications with 202 and no body", async () => {
    const { responder } = buildResponder();
    const response = await responder.handle({ jsonrpc: "2.0", method: "notifications/initialized" });
    assert.equal(response.status, 202);
    assert.equal(response.json, undefined);
  });

  it("lists tools with their schemas", async () => {
    const { responder } = buildResponder();
    const listed = asRpc((await responder.handle(rpc("tools/list"))).json);
    const tools = listed.result?.tools as Array<{ description: string; inputSchema: unknown; name: string }>;
    assert.deepEqual(
      tools.map((tool) => tool.name),
      ["boom", "echo"],
    );
    assert.equal(tools[1].description, "echoes arguments");
  });

  it("dispatches tools/call with arguments and returns text content", async () => {
    const { executed, responder } = buildResponder();
    const called = asRpc(
      (await responder.handle(rpc("tools/call", { name: "echo", arguments: { value: "hi" } }))).json,
    );
    const content = called.result?.content as Array<{ text: string; type: string }>;
    assert.equal(content[0].type, "text");
    assert.deepEqual(JSON.parse(content[0].text), { echo: { value: "hi" } });
    assert.deepEqual(executed, [{ name: "echo", args: { value: "hi" } }]);
  });

  it("rejects unknown tools with invalid params", async () => {
    const { responder } = buildResponder();
    const unknown = asRpc((await responder.handle(rpc("tools/call", { name: "nope" }))).json);
    assert.equal(unknown.error?.code, -32602);
  });

  it("hides tool crash details behind a generic error result", async () => {
    const { responder } = buildResponder();
    const crashed = asRpc((await responder.handle(rpc("tools/call", { name: "boom" }))).json);
    assert.equal(crashed.error, undefined);
    const result = crashed.result as { content: Array<{ text: string }>; isError?: boolean };
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text.includes("secret internal detail"), false);
  });

  it("rejects malformed envelopes and unknown methods", async () => {
    const { responder } = buildResponder();
    const bad = asRpc((await responder.handle({ jsonrpc: "1.0", id: 1, method: "ping" })).json);
    assert.equal(bad.error?.code, -32600);

    const unknownMethod = asRpc((await responder.handle(rpc("tools/destroy"))).json);
    assert.equal(unknownMethod.error?.code, -32601);
  });

  it("handles batches by replying only to requests", async () => {
    const { responder } = buildResponder();
    const response = await responder.handle([
      { jsonrpc: "2.0", method: "notifications/initialized" },
      rpc("ping", undefined, 7),
    ]);
    assert.equal(response.status, 200);
    const replies = response.json as Array<RpcEnvelope & { id: number }>;
    assert.equal(replies.length, 1);
    assert.equal(replies[0].id, 7);
    assert.deepEqual(replies[0].result, {});
  });
});
