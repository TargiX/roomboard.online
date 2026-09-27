/**
 * Minimal stateless MCP (Streamable HTTP) JSON-RPC envelope for the agent
 * rooms endpoint: `initialize`, `ping`, `tools/list`, `tools/call`, single
 * messages and batches. Deliberately no SSE stream — Vercel functions must
 * not hold connections open, so agents poll `room_read` with a cursor.
 */

export const mcpSupportedProtocolVersions = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const mcpDefaultProtocolVersion = "2025-03-26";

export type McpToolContent = { type: "text"; text: string };

export type McpToolResult = {
  content: McpToolContent[];
  isError?: boolean;
};

export type McpTool = {
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<McpToolResult>;
};

export type McpResponderOptions = {
  instructions?: string;
  serverInfo: { name: string; version: string };
  tools: Record<string, McpTool>;
};

/** HTTP status plus optional JSON body; `json === undefined` means 202 with no body (notifications). */
export type McpResponse = { status: number; json?: unknown };

const JSONRPC_INVALID_REQUEST = -32600;
const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_INVALID_PARAMS = -32602;

function rpcError(id: string | number | null, code: number, message: string): McpResponse {
  return { status: 200, json: { jsonrpc: "2.0", id, error: { code, message } } };
}

function rpcResult(id: string | number | null, result: unknown): McpResponse {
  return { status: 200, json: { jsonrpc: "2.0", id, result } };
}

export function mcpToolJson(payload: unknown): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

export function mcpToolError(message: string): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}

export function createRoomAgentMcpResponder({ instructions, serverInfo, tools }: McpResponderOptions) {
  const toolList = Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));

  async function dispatch(id: string | number, method: string, params: unknown): Promise<McpResponse> {
    switch (method) {
      case "initialize": {
        const requested = (params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
        const protocolVersion =
          typeof requested === "string" && (mcpSupportedProtocolVersions as readonly string[]).includes(requested)
            ? requested
            : mcpDefaultProtocolVersion;

        return rpcResult(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo,
          ...(instructions ? { instructions } : {}),
        });
      }
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: toolList });
      case "tools/call": {
        const call = params as { name?: unknown; arguments?: unknown } | undefined;
        const name = typeof call?.name === "string" ? call.name : "";
        const tool = tools[name];

        if (!tool) {
          return rpcError(id, JSONRPC_INVALID_PARAMS, `Unknown tool: ${name || "(none)"}`);
        }

        const args =
          call?.arguments && typeof call.arguments === "object" && !Array.isArray(call.arguments)
            ? (call.arguments as Record<string, unknown>)
            : {};

        try {
          return rpcResult(id, await tool.execute(args));
        } catch {
          // Tool internals must not leak through the protocol response.
          return rpcResult(id, mcpToolError("The room could not process this call. Retry once, then tell the human."));
        }
      }
      default:
        return rpcError(id, JSONRPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  }

  return {
    async handle(body: unknown): Promise<McpResponse> {
      const messages = Array.isArray(body) ? body : [body];

      if (messages.length === 0) {
        return rpcError(null, JSONRPC_INVALID_REQUEST, "Empty batch.");
      }

      const responses: unknown[] = [];

      for (const raw of messages) {
        if (!raw || typeof raw !== "object") {
          responses.push(rpcError(null, JSONRPC_INVALID_REQUEST, "Request must be a JSON object.").json);
          continue;
        }

        const message = raw as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };

        if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
          responses.push(rpcError(null, JSONRPC_INVALID_REQUEST, "Invalid JSON-RPC 2.0 request.").json);
          continue;
        }

        if (message.id === undefined || message.id === null) {
          // Notifications (notifications/initialized, notifications/cancelled, ...) get no reply.
          continue;
        }

        if (typeof message.id !== "string" && typeof message.id !== "number") {
          responses.push(rpcError(null, JSONRPC_INVALID_REQUEST, "Request id must be a string or number.").json);
          continue;
        }

        responses.push((await dispatch(message.id, message.method, message.params)).json);
      }

      if (responses.length === 0) {
        return { status: 202 };
      }

      return { status: 200, json: Array.isArray(body) ? responses : responses[0] };
    },
  };
}
