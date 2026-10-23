/**
 * Normalised progress events from the AI command-line tools. Each tool prints one JSON
 * object per line in its own shape; these parsers turn a line into zero or more events.
 * Unknown lines are ignored so a tool update cannot break a run.
 */

export type AgentToolId = "claude" | "codex" | "cursor" | "opencode";

export type AgentErrorCode = "auth" | "not-found" | "failed" | "cancelled" | "timeout" | "no-proposals";

export type AgentEvent =
  | { kind: "session"; id: string }
  | { kind: "message"; text: string }
  | { kind: "tool"; name: string; status: "started" | "completed" | "failed"; detail?: string }
  | { kind: "status"; text: string }
  /** Tokens used by one model call or turn; input includes cached input. Add them up. */
  | { kind: "usage"; inputTokens: number; cachedTokens: number; outputTokens: number; costUsd?: number }
  | { kind: "error"; code: AgentErrorCode; message: string }
  | { kind: "finished" };

type Json = Record<string, unknown>;
const asObject = (value: unknown): Json | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null);
const asString = (value: unknown) => (typeof value === "string" ? value : "");
const asCount = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

function usageEvent(inputTokens: number, cachedTokens: number, outputTokens: number, costUsd?: unknown): AgentEvent[] {
  if (inputTokens + outputTokens === 0) return [];
  const cost = typeof costUsd === "number" && Number.isFinite(costUsd) && costUsd > 0 ? { costUsd } : {};
  return [{ kind: "usage", inputTokens, cachedTokens, outputTokens, ...cost }];
}

const AUTH_PATTERN = /authenticat|not logged in|log ?in|oauth|api key|unauthori[sz]ed|401|credential/i;

/** Error event with a code the UI can explain ("sign in to the tool"). */
export function errorEvent(message: string): AgentEvent {
  return { kind: "error", code: AUTH_PATTERN.test(message) ? "auth" : "failed", message: message.slice(0, 600) };
}

/** Tool names arrive as "mcp__screenmovie__get_project", "screenmovie_get_project" or plain. */
export function shortToolName(name: string): string {
  return name.replace(/^mcp__screenmovie__/, "").replace(/^screenmovie[_.]/, "");
}

function parseClaudeLike(event: Json): AgentEvent[] {
  const type = asString(event.type);
  const events: AgentEvent[] = [];
  if (type === "system" && event.subtype === "init" && typeof event.session_id === "string") {
    events.push({ kind: "session", id: event.session_id });
  }
  if (type === "assistant") {
    const message = asObject(event.message);
    const content = Array.isArray(message?.content) ? message.content : [];
    for (const part of content) {
      const item = asObject(part);
      if (item?.type === "text" && asString(item.text).trim()) events.push({ kind: "message", text: asString(item.text).trim() });
      if (item?.type === "tool_use") events.push({ kind: "tool", name: shortToolName(asString(item.name)), status: "started" });
    }
  }
  if (type === "user") {
    const message = asObject(event.message);
    const content = Array.isArray(message?.content) ? message.content : [];
    for (const part of content) {
      const item = asObject(part);
      if (item?.type === "tool_result") {
        events.push({ kind: "tool", name: "", status: item.is_error ? "failed" : "completed" });
      }
    }
  }
  // Cursor's tool calls.
  if (type === "tool_call") {
    const call = asObject(event.tool_call);
    const key = call ? Object.keys(call)[0] ?? "" : "";
    const inner = asObject(call?.[key]);
    const args = asObject(inner?.args);
    const name = asString(args?.toolName) || asString(args?.name) || asString(inner?.name) || key.replace(/ToolCall$/, "");
    events.push({ kind: "tool", name: shortToolName(name), status: event.subtype === "completed" ? "completed" : "started" });
  }
  if (type === "result") {
    const usage = asObject(event.usage);
    if (usage) {
      const cached = asCount(usage.cache_read_input_tokens) || asCount(usage.cacheReadTokens);
      const input = asCount(usage.input_tokens) + cached + asCount(usage.cache_creation_input_tokens) + asCount(usage.inputTokens) + asCount(usage.cacheWriteTokens);
      events.push(...usageEvent(input, cached, asCount(usage.output_tokens) + asCount(usage.outputTokens), event.total_cost_usd));
    }
    if (event.is_error === true || (typeof event.subtype === "string" && event.subtype.startsWith("error"))) {
      events.push(errorEvent(asString(event.result) || asString(event.error) || asString(event.subtype)));
    } else {
      events.push({ kind: "finished" });
    }
  }
  return events;
}

function parseCodex(event: Json): AgentEvent[] {
  const type = asString(event.type);
  if (type === "thread.started" && typeof event.thread_id === "string") return [{ kind: "session", id: event.thread_id }];
  if (type === "turn.completed") {
    // OpenAI counts cached input inside input_tokens.
    const usage = asObject(event.usage);
    const counted = usage ? usageEvent(asCount(usage.input_tokens), asCount(usage.cached_input_tokens), asCount(usage.output_tokens)) : [];
    return [...counted, { kind: "finished" }];
  }
  if (type === "turn.failed") return [errorEvent(asString(asObject(event.error)?.message) || "The turn failed")];
  if (type === "error") return [errorEvent(asString(event.message) || "Codex reported an error")];
  if (type !== "item.started" && type !== "item.completed") return [];
  const item = asObject(event.item);
  if (!item) return [];
  if (item.type === "agent_message" && type === "item.completed" && asString(item.text).trim()) {
    return [{ kind: "message", text: asString(item.text).trim() }];
  }
  if (item.type === "mcp_tool_call") {
    const failed = item.status === "failed" || asObject(item.error) !== null;
    return [{
      kind: "tool",
      name: shortToolName(asString(item.tool)),
      status: type === "item.started" ? "started" : failed ? "failed" : "completed",
      ...(failed ? { detail: asString(asObject(item.error)?.message) } : {}),
    }];
  }
  if (item.type === "error" && asString(item.message)) return [errorEvent(asString(item.message))];
  return [];
}

function parseOpenCode(event: Json): AgentEvent[] {
  const type = asString(event.type);
  const events: AgentEvent[] = [];
  if (typeof event.sessionID === "string") events.push({ kind: "session", id: event.sessionID });
  const part = asObject(event.part);
  if (type === "text" && part && asString(part.text).trim()) events.push({ kind: "message", text: asString(part.text).trim() });
  if (type === "tool_use" && part) {
    const state = asObject(part.state);
    const status = state?.status === "error" ? "failed" : state?.status === "completed" ? "completed" : "started";
    events.push({ kind: "tool", name: shortToolName(asString(part.tool)), status });
  }
  if (type === "step_finish" && part) {
    const tokens = asObject(part.tokens);
    const cache = asObject(tokens?.cache);
    if (tokens) {
      const cached = asCount(cache?.read);
      events.push(...usageEvent(asCount(tokens.input) + cached + asCount(cache?.write), cached, asCount(tokens.output) + asCount(tokens.reasoning), part.cost));
    }
  }
  if (type === "error") {
    const error = asObject(event.error);
    events.push(errorEvent(asString(asObject(error?.data)?.message) || asString(error?.name) || "OpenCode reported an error"));
  }
  return events;
}

/** Events in one output line of a tool; non-JSON lines produce nothing. */
export function parseAgentLine(tool: AgentToolId, line: string): AgentEvent[] {
  const text = line.trim();
  if (!text.startsWith("{")) return [];
  let event: Json | null = null;
  try {
    event = asObject(JSON.parse(text));
  } catch {
    return [];
  }
  if (!event) return [];
  if (tool === "codex") return parseCodex(event);
  if (tool === "opencode") return parseOpenCode(event);
  return parseClaudeLike(event);
}
