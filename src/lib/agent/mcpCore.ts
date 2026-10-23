/**
 * The JSON-RPC part of a small MCP server (tools only). The transport (HTTP in the main
 * process) hands each request body to `handleMcpRequest` and sends back what it returns.
 */

export type McpContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
export interface McpToolResult {
  content: McpContent[];
  isError?: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  handler: (args: Record<string, unknown>) => Promise<McpToolResult>;
}

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

type JsonRpcMessage = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

export const textResult = (text: string, isError = false): McpToolResult => ({ content: [{ type: "text", text }], ...(isError ? { isError } : {}) });

async function handleOne(message: JsonRpcMessage, tools: McpTool[], serverName: string, instructions?: string): Promise<JsonRpcResponse | null> {
  // Notifications (no id) need no answer.
  if (message.id === undefined) return null;
  const id = message.id ?? null;
  const error = (code: number, text: string): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message: text } });
  switch (message.method) {
    case "initialize": {
      const requested = typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : "";
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: serverName, version: "1.0.0" },
          ...(instructions ? { instructions } : {}),
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, ...(annotations ? { annotations } : {}) })),
        },
      };
    case "tools/call": {
      const name = typeof message.params?.name === "string" ? message.params.name : "";
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) return error(-32602, `Unknown tool: ${name}`);
      const args = message.params?.arguments && typeof message.params.arguments === "object" ? (message.params.arguments as Record<string, unknown>) : {};
      try {
        return { jsonrpc: "2.0", id, result: await tool.handler(args) };
      } catch (caught) {
        // A failing tool is a result the agent can read, not a protocol error.
        return { jsonrpc: "2.0", id, result: textResult(caught instanceof Error ? caught.message : String(caught), true) };
      }
    }
    default:
      return error(-32601, `Method not found: ${message.method ?? ""}`);
  }
}

/** Answers one request body (a message or a batch); null when nothing needs an answer. */
export async function handleMcpRequest(body: string, tools: McpTool[], serverName = "screenmovie", instructions?: string): Promise<unknown | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } };
  }
  if (Array.isArray(parsed)) {
    const answers = (await Promise.all(parsed.map((item) => handleOne(item as JsonRpcMessage, tools, serverName, instructions)))).filter(Boolean);
    return answers.length > 0 ? answers : null;
  }
  if (!parsed || typeof parsed !== "object") return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
  return handleOne(parsed as JsonRpcMessage, tools, serverName, instructions);
}
