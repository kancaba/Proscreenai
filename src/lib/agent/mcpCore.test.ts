import { describe, expect, it } from "vitest";
import { handleMcpRequest, type McpTool, textResult } from "./mcpCore";

const tools: McpTool[] = [
  { name: "echo", description: "Echo", inputSchema: { type: "object" }, handler: async (args) => textResult(JSON.stringify(args)) },
  { name: "boom", description: "Fails", inputSchema: { type: "object" }, handler: async () => { throw new Error("bad input"); } },
];

describe("MCP core", () => {
  it("initialises with a supported protocol version", async () => {
    const answer = (await handleMcpRequest('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}', tools)) as { result: { protocolVersion: string } };
    expect(answer.result.protocolVersion).toBe("2025-03-26");
  });

  it("lists and calls tools; tool failures are readable results", async () => {
    const list = (await handleMcpRequest('{"jsonrpc":"2.0","id":2,"method":"tools/list"}', tools)) as { result: { tools: Array<{ name: string }> } };
    expect(list.result.tools.map((tool) => tool.name)).toEqual(["echo", "boom"]);
    const call = (await handleMcpRequest('{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"echo","arguments":{"a":1}}}', tools)) as { result: { content: Array<{ text: string }> } };
    expect(call.result.content[0].text).toBe('{"a":1}');
    const failed = (await handleMcpRequest('{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"boom"}}', tools)) as { result: { isError: boolean } };
    expect(failed.result.isError).toBe(true);
  });

  it("ignores notifications and rejects junk", async () => {
    expect(await handleMcpRequest('{"jsonrpc":"2.0","method":"notifications/initialized"}', tools)).toBeNull();
    expect(await handleMcpRequest("{", tools)).toMatchObject({ error: { code: -32700 } });
    expect(await handleMcpRequest('{"jsonrpc":"2.0","id":5,"method":"nope"}', tools)).toMatchObject({ error: { code: -32601 } });
  });
});
