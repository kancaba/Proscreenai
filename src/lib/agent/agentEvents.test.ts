import { describe, expect, it } from "vitest";
import { parseAgentLine } from "./agentEvents";

// Lines below are trimmed copies of real output from each tool.
describe("agent output parsing", () => {
  it("reads Claude Code stream-json, including a sign-in failure", () => {
    expect(parseAgentLine("claude", '{"type":"system","subtype":"init","session_id":"a58db922","tools":["mcp__screenmovie__get_project"]}')).toEqual([
      { kind: "session", id: "a58db922" },
    ]);
    expect(
      parseAgentLine("claude", '{"type":"assistant","message":{"content":[{"type":"text","text":"Looking at clicks."},{"type":"tool_use","name":"mcp__screenmovie__get_clicks","input":{}}]}}'),
    ).toEqual([
      { kind: "message", text: "Looking at clicks." },
      { kind: "tool", name: "get_clicks", status: "started" },
    ]);
    const [error] = parseAgentLine("claude", '{"type":"result","subtype":"success","is_error":true,"result":"Failed to authenticate: OAuth session expired and could not be refreshed","session_id":"a58db922"}');
    expect(error).toMatchObject({ kind: "error", code: "auth" });
    expect(parseAgentLine("claude", '{"type":"result","subtype":"success","is_error":false,"result":"Done"}')).toEqual([{ kind: "finished" }]);
  });

  it("reads Codex exec --json", () => {
    expect(parseAgentLine("codex", '{"type":"thread.started","thread_id":"01a15424"}')).toEqual([{ kind: "session", id: "01a15424" }]);
    expect(
      parseAgentLine("codex", '{"type":"item.completed","item":{"id":"item_1","type":"mcp_tool_call","server":"screenmovie","tool":"get_project","arguments":{},"result":null,"error":{"message":"MCP tool call requires approval"},"status":"failed"}}'),
    ).toEqual([{ kind: "tool", name: "get_project", status: "failed", detail: "MCP tool call requires approval" }]);
    expect(parseAgentLine("codex", '{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"20 seconds"}}')).toEqual([
      { kind: "message", text: "20 seconds" },
    ]);
    expect(parseAgentLine("codex", '{"type":"turn.completed"}')).toEqual([{ kind: "finished" }]);
    expect(parseAgentLine("codex", '{"type":"error","message":"401 Unauthorized"}')[0]).toMatchObject({ kind: "error", code: "auth" });
  });

  it("reads OpenCode run --format json", () => {
    const events = parseAgentLine(
      "opencode",
      '{"type":"tool_use","sessionID":"ses_eabd","part":{"type":"tool","tool":"screenmovie_get_project","state":{"status":"completed","input":{}}}}',
    );
    expect(events).toEqual([
      { kind: "session", id: "ses_eabd" },
      { kind: "tool", name: "get_project", status: "completed" },
    ]);
  });

  it("reads Cursor tool calls and ignores noise", () => {
    expect(
      parseAgentLine("cursor", '{"type":"tool_call","subtype":"started","call_id":"1","tool_call":{"mcpToolCall":{"args":{"name":"screenmovie-get_clicks","toolName":"get_clicks"}}}}'),
    ).toEqual([{ kind: "tool", name: "get_clicks", status: "started" }]);
    expect(parseAgentLine("cursor", "Reading additional input from stdin...")).toEqual([]);
    expect(parseAgentLine("codex", "{not json")).toEqual([]);
  });
  it("reads token usage from each tool", () => {
    expect(parseAgentLine("codex", '{"type":"turn.completed","usage":{"input_tokens":74910,"cached_input_tokens":68736,"output_tokens":232,"reasoning_output_tokens":0}}')).toEqual([
      { kind: "usage", inputTokens: 74910, cachedTokens: 68736, outputTokens: 232 },
      { kind: "finished" },
    ]);
    expect(parseAgentLine("claude", '{"type":"result","subtype":"success","is_error":false,"usage":{"input_tokens":10,"cache_read_input_tokens":900,"cache_creation_input_tokens":90,"output_tokens":50},"total_cost_usd":0.012}')[0]).toEqual({
      kind: "usage", inputTokens: 1000, cachedTokens: 900, outputTokens: 50, costUsd: 0.012,
    });
    expect(parseAgentLine("opencode", '{"type":"step_finish","sessionID":"s","part":{"type":"step-finish","tokens":{"total":8700,"input":7552,"output":14,"reasoning":110,"cache":{"write":0,"read":1024}},"cost":0}}')).toEqual([
      { kind: "session", id: "s" },
      { kind: "usage", inputTokens: 8576, cachedTokens: 1024, outputTokens: 124 },
    ]);
  });
});
