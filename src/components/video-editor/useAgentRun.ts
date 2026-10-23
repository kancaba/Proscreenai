import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentRunEvent, AgentToolInfo } from "@/lib/agent/agentApi";
import type { AgentToolId } from "@/lib/agent/agentEvents";
import type { AgentProjectSnapshot } from "@/lib/agent/agentSnapshot";
import { EMPTY_PROPOSALS, type ProposalSet } from "@/lib/agent/proposals";

export interface AgentLogEntry {
  id: number;
  type: "message" | "tool" | "error";
  text: string;
  status?: "started" | "completed" | "failed";
}

/** Tokens used, added up over model calls. Input includes the part served from cache. */
export interface AgentUsage {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  costUsd: number;
}
const NO_USAGE: AgentUsage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, costUsd: 0 };
const addUsage = (a: AgentUsage, b: Omit<AgentUsage, "costUsd"> & { costUsd?: number }): AgentUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  cachedTokens: a.cachedTokens + b.cachedTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  costUsd: a.costUsd + (b.costUsd ?? 0),
});

export type AgentRunStatus = "idle" | "starting" | "running" | "done" | "failed" | "cancelled";

const STORAGE = { tool: "screenmovie.agent.tool", frames: "screenmovie.agent.frames", models: "screenmovie.agent.models" };
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A preference only.
  }
};

export type AgentRunState = ReturnType<typeof useAgentRun>;

/**
 * One AI agent conversation for the open video: picks a tool, runs tasks and follow-ups,
 * and keeps the proposals for review. Lives in the editor so switching inspector tabs
 * does not stop a run; changing the video does.
 */
export function useAgentRun(videoSourcePath: string | null, getSnapshot: () => AgentProjectSnapshot | null) {
  const [tools, setTools] = useState<AgentToolInfo[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [toolId, setToolIdState] = useState<AgentToolId | null>(() => read(STORAGE.tool) as AgentToolId | null);
  const [models, setModels] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(read(STORAGE.models) ?? "{}");
    } catch {
      return {};
    }
  });
  const [framesAllowed, setFramesAllowedState] = useState(() => read(STORAGE.frames) === "1");
  const [status, setStatus] = useState<AgentRunStatus>("idle");
  const [log, setLog] = useState<AgentLogEntry[]>([]);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [proposals, setProposals] = useState<ProposalSet>(EMPTY_PROPOSALS);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  // This task (with its follow-up) and the whole conversation.
  const [runUsage, setRunUsage] = useState<AgentUsage>(NO_USAGE);
  const [conversationUsage, setConversationUsage] = useState<AgentUsage>(NO_USAGE);
  const runIdRef = useRef<string | null>(null);
  const conversationRef = useRef(crypto.randomUUID());
  const logId = useRef(0);
  const getSnapshotRef = useRef(getSnapshot);
  getSnapshotRef.current = getSnapshot;

  const refreshTools = useCallback(async (force = false) => {
    setDetecting(true);
    try {
      const found = await window.electronAPI.agentDetectTools(force);
      setTools(found);
      setToolIdState((current) => {
        if (current && found.some((tool) => tool.id === current && tool.status !== "missing")) return current;
        return (found.find((tool) => tool.status === "ready") ?? found.find((tool) => tool.status !== "missing"))?.id ?? current;
      });
    } finally {
      setDetecting(false);
    }
  }, []);

  useEffect(() => {
    void refreshTools(false);
  }, [refreshTools]);

  const resetConversation = useCallback(() => {
    if (runIdRef.current) void window.electronAPI.agentCancel(runIdRef.current);
    runIdRef.current = null;
    setStatus("idle");
    setLog([]);
    setError(null);
    setSummary("");
    setProposals(EMPTY_PROPOSALS);
    setChosen(new Set());
    setSessionId(undefined);
    setRunUsage(NO_USAGE);
    setConversationUsage(NO_USAGE);
  }, []);

  // A new video starts a new conversation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the video changes
  useEffect(() => resetConversation, [videoSourcePath]);

  const setToolId = (id: AgentToolId) => {
    if (id === toolId) return;
    resetConversation();
    setToolIdState(id);
    write(STORAGE.tool, id);
  };
  const setModel = (model: string) => {
    if (!toolId) return;
    const next = { ...models, [toolId]: model.trim() };
    setModels(next);
    write(STORAGE.models, JSON.stringify(next));
  };
  const setFramesAllowed = (allowed: boolean) => {
    setFramesAllowedState(allowed);
    write(STORAGE.frames, allowed ? "1" : "0");
  };

  useEffect(() => {
    return window.electronAPI.onAgentEvent(({ runId, event }: { runId: string; event: AgentRunEvent }) => {
      if (runId !== runIdRef.current) return;
      if (event.kind === "session") setSessionId(event.id);
      else if (event.kind === "usage") {
        setRunUsage((current) => addUsage(current, event));
        setConversationUsage((current) => addUsage(current, event));
      }
      else if (event.kind === "message") {
        setSummary(event.text);
        setLog((entries) => [...entries, { id: ++logId.current, type: "message", text: event.text }]);
      } else if (event.kind === "tool") {
        setLog((entries) => {
          if (event.status !== "started") {
            let index = -1;
            entries.forEach((entry, i) => {
              if (entry.type === "tool" && entry.text === event.name && entry.status === "started") index = i;
            });
            if (index >= 0) return entries.map((entry, i) => (i === index ? { ...entry, status: event.status } : entry));
          }
          return [...entries, { id: ++logId.current, type: "tool", text: event.name, status: event.status }];
        });
      } else if (event.kind === "error") {
        setLog((entries) => [...entries, { id: ++logId.current, type: "error", text: event.message }]);
      } else if (event.kind === "done") {
        runIdRef.current = null;
        if (event.sessionId) setSessionId(event.sessionId);
        setProposals(event.proposals);
        setChosen(new Set(event.proposals.items.map((item) => item.id)));
        setError(event.error ?? null);
        setStatus(event.error ? (event.error.code === "cancelled" ? "cancelled" : "failed") : "done");
      }
    });
  }, []);

  const start = async (request: string, followUp = false) => {
    const snapshot = getSnapshotRef.current();
    if (!toolId || !snapshot || runIdRef.current || !request.trim()) return;
    setStatus("starting");
    setError(null);
    setSummary("");
    setRunUsage(NO_USAGE);
    if (!followUp) {
      conversationRef.current = crypto.randomUUID();
      setSessionId(undefined);
      setConversationUsage(NO_USAGE);
      setLog([]);
      setProposals(EMPTY_PROPOSALS);
      setChosen(new Set());
    }
    const result = await window.electronAPI.agentStart({
      tool: toolId,
      conversationId: conversationRef.current,
      request,
      snapshot,
      framesAllowed,
      ...(models[toolId] ? { model: models[toolId] } : {}),
      ...(followUp ? { sessionId, proposals } : {}),
    });
    if (!result.success) {
      setStatus("failed");
      setError({ code: result.code, message: result.message });
      return;
    }
    runIdRef.current = result.runId;
    setStatus("running");
  };

  const cancel = () => {
    if (runIdRef.current) void window.electronAPI.agentCancel(runIdRef.current);
  };

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Forget the proposals (after applying or rejecting them); the conversation stays open. */
  const clearProposals = () => {
    setProposals(EMPTY_PROPOSALS);
    setChosen(new Set());
  };

  return {
    tools,
    detecting,
    refreshTools,
    toolId,
    setToolId,
    model: (toolId && models[toolId]) || "",
    setModel,
    framesAllowed,
    setFramesAllowed,
    status,
    running: status === "starting" || status === "running",
    log,
    runUsage,
    conversationUsage,
    error,
    summary,
    proposals,
    chosen,
    toggle,
    setChosen,
    clearProposals,
    canFollowUp: Boolean(sessionId) && status !== "starting" && status !== "running",
    start,
    cancel,
    resetConversation,
  };
}
