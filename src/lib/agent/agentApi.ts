import type { AgentEvent, AgentToolId } from "./agentEvents";
import type { AgentProjectSnapshot } from "./agentSnapshot";
import type { ProposalSet } from "./proposals";

/** Shapes shared by the editor and the main process for AI agent runs. */
export type AgentToolStatus = "ready" | "signed-out" | "missing" | "error";

export interface AgentToolInfo {
  id: AgentToolId;
  name: string;
  status: AgentToolStatus;
  path?: string;
  version?: string;
  detail?: string;
}

export interface AgentStartInput {
  tool: AgentToolId;
  /** Same for a task and its follow-ups. */
  conversationId: string;
  request: string;
  snapshot: AgentProjectSnapshot;
  /** Proposals to keep working on (a follow-up). */
  proposals?: ProposalSet;
  /** Continue the tool's earlier conversation. */
  sessionId?: string;
  model?: string;
  framesAllowed: boolean;
}

export type AgentRunEvent =
  | AgentEvent
  | { kind: "tool"; name: string; status: "started" | "completed" | "failed"; detail?: string }
  | { kind: "done"; proposals: ProposalSet; sessionId?: string; error?: { code: string; message: string } };
