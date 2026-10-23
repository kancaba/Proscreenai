import { Bot, Check, LoaderCircle, Maximize2, RefreshCw, Square, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import type { AgentToolId } from "@/lib/agent/agentEvents";
import { AGENT_TASKS } from "@/lib/agent/agentTasks";
import type { Proposal, ProposalKind } from "@/lib/agent/proposals";
import { useScopedT } from "../../contexts/I18nContext";
import type { AgentRunState, AgentUsage } from "./useAgentRun";

const SIGN_IN_COMMANDS: Record<AgentToolId, string> = {
  claude: "claude  →  /login",
  codex: "codex login",
  cursor: "agent login",
  opencode: "opencode auth login",
};
const KIND_ORDER: ProposalKind[] = ["zoom", "caption", "text", "trim", "speed"];

const clock = (ms: number) => {
  const seconds = ms / 1000;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
};

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
/** "74.9K in (68.7K cached) · 232 out · $0.012", with the words in the user's language. */
function formatUsage(usage: AgentUsage, words: { input: string; cached: string; output: string }) {
  const parts = [`${compact.format(usage.inputTokens)} ${words.input}${usage.cachedTokens > 0 ? ` (${compact.format(usage.cachedTokens)} ${words.cached})` : ""}`, `${compact.format(usage.outputTokens)} ${words.output}`];
  if (usage.costUsd > 0) parts.push(`$${usage.costUsd.toFixed(usage.costUsd < 0.1 ? 3 : 2)}`);
  return parts.join(" · ");
}

function describeProposal(item: Proposal) {
  if (item.kind === "zoom") return `${item.depth} · ${item.reason ?? ""}`;
  if (item.kind === "speed") return `${item.speed}× · ${item.reason ?? ""}`;
  if (item.kind === "caption" || item.kind === "text") return item.text;
  return item.reason ?? "";
}

interface AgentPanelProps {
  state: AgentRunState;
  available: boolean;
  onApply: () => void;
  onSeek: (seconds: number) => void;
  /** "wide": the large two-column view (in a dialog). */
  variant?: "compact" | "wide";
  /** Opens the large view; omitted inside it. */
  onExpand?: () => void;
}

/** Edits with the user's own AI tool (Claude Code, Codex, Cursor, OpenCode); changes need the user's approval. */
export function AgentPanel({ state, available, onApply, onSeek, variant = "compact", onExpand }: AgentPanelProps) {
  const wide = variant === "wide";
  const usageText = (usage: AgentUsage) => formatUsage(usage, { input: t("agent.usage.input"), cached: t("agent.usage.cached"), output: t("agent.usage.output") });
  const t = useScopedT("editor");
  const [request, setRequest] = useState("");
  const [followUp, setFollowUp] = useState("");
  const tool = state.tools?.find((candidate) => candidate.id === state.toolId);
  const usable = available && tool && (tool.status === "ready" || tool.status === "error") && !state.running;
  const grouped = KIND_ORDER.map((kind) => ({ kind, items: state.proposals.items.filter((item) => item.kind === kind).sort((a, b) => a.startMs - b.startMs) })).filter((group) => group.items.length > 0);
  const chosenCount = state.proposals.items.filter((item) => state.chosen.has(item.id)).length;

  const header = (
    <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
      <Bot size={14} className="text-[#2563EB]" />
      {t("agent.title")}
      {onExpand && (
        <button type="button" data-testid="agent-expand" onClick={onExpand} title={t("agent.expand")} aria-label={t("agent.expand")} className="ml-auto flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-normal text-slate-400 hover:bg-white/10 hover:text-slate-200">
          <Maximize2 size={11} /> {t("agent.expand")}
        </button>
      )}
    </div>
  );
  const controls = <>
      {!wide && <p className="text-[11px] leading-snug text-slate-400">{t("agent.description")}</p>}

      <div className="flex items-center gap-1.5">
        <select
          data-testid="agent-tool"
          value={state.toolId ?? ""}
          disabled={state.running || !state.tools}
          onChange={(event) => state.setToolId(event.target.value as AgentToolId)}
          className="min-w-0 flex-1 rounded bg-white/5 px-2 py-1.5 text-[11px] text-slate-200 outline-none"
        >
          {!state.tools && <option value="">{t("agent.detecting")}</option>}
          {state.tools?.map((candidate) => (
            <option key={candidate.id} value={candidate.id} disabled={candidate.status === "missing"}>
              {candidate.name} — {t(`agent.toolStatus.${candidate.status}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          title={t("agent.refresh")}
          aria-label={t("agent.refresh")}
          onClick={() => void state.refreshTools(true)}
          disabled={state.detecting || state.running}
          className="rounded p-1.5 text-slate-400 hover:bg-white/10 disabled:opacity-40"
        >
          <RefreshCw size={12} className={state.detecting ? "animate-spin" : ""} />
        </button>
      </div>
      {tool?.status === "signed-out" && (
        <p className="text-[11px] leading-snug text-amber-300" data-testid="agent-sign-in">
          {t("agent.signIn", undefined, { tool: tool.name })} <code className="rounded bg-white/10 px-1">{SIGN_IN_COMMANDS[tool.id]}</code>
        </p>
      )}
      {state.tools && state.tools.every((candidate) => candidate.status === "missing") && <p className="text-[11px] text-amber-300">{t("agent.noTools")}</p>}

      <details className="text-[11px] text-slate-400">
        <summary className="cursor-pointer select-none">{t("agent.options")}</summary>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" data-testid="agent-frames" checked={state.framesAllowed} onChange={(event) => state.setFramesAllowed(event.target.checked)} disabled={state.running} />
            {t("agent.shareFrames")}
          </label>
          <label className="block">
            {t("agent.model")}
            <input
              data-testid="agent-model"
              value={state.model}
              onChange={(event) => state.setModel(event.target.value)}
              placeholder={t("agent.modelPlaceholder")}
              disabled={state.running}
              className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-slate-200 outline-none"
            />
          </label>
        </div>
      </details>
      <p className="text-[10px] leading-snug text-slate-500">{state.framesAllowed ? t("agent.dataWithFrames") : t("agent.data")}</p>

      {!state.running && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {AGENT_TASKS.map((task) => (
              <button
                key={task.id}
                type="button"
                data-testid={`agent-task-${task.id}`}
                disabled={!usable}
                onClick={() => void state.start(task.prompt)}
                className="rounded-md bg-white/5 px-2 py-1.5 text-left text-[11px] text-slate-200 hover:bg-white/10 disabled:opacity-40"
              >
                {t(`agent.tasks.${task.id}`)}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <textarea
              data-testid="agent-request"
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder={t("agent.requestPlaceholder")}
              rows={2}
              className="min-w-0 flex-1 resize-none rounded bg-white/5 px-2 py-1.5 text-[11px] text-slate-200 outline-none"
            />
            <button
              type="button"
              data-testid="agent-send"
              disabled={!usable || !request.trim()}
              onClick={() => {
                void state.start(request);
                setRequest("");
              }}
              className="rounded-md bg-[#2563EB] px-2.5 text-[11px] text-white disabled:opacity-40"
            >
              {t("agent.send")}
            </button>
          </div>
        </>
      )}
    </>;
  const activity = <>
      {(state.running || state.log.length > 0) && (
        <div className={`${wide ? "min-h-0 flex-1" : "max-h-72"} space-y-1 overflow-y-auto rounded bg-black/20 p-2`} data-testid="agent-log" aria-live="polite">
          {state.log.slice(-30).map((entry) => (
            <div key={entry.id} className={`flex gap-1.5 text-[11px] leading-snug ${entry.type === "error" ? "text-amber-300" : entry.type === "tool" ? "text-slate-500" : "text-slate-300"}`}>
              {entry.type === "tool" &&
                (entry.status === "started" ? <LoaderCircle size={11} className="mt-0.5 shrink-0 animate-spin" /> : entry.status === "failed" ? <X size={11} className="mt-0.5 shrink-0" /> : <Check size={11} className="mt-0.5 shrink-0" />)}
              <span className="min-w-0 break-words">{entry.type === "tool" ? t(`agent.toolNames.${entry.text}`, entry.text) : entry.text}</span>
            </div>
          ))}
          {state.running && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <LoaderCircle size={11} className="animate-spin" />
              {t("agent.working", undefined, { tool: tool?.name ?? "" })}
            </div>
          )}
        </div>
      )}
      {state.running && (
        <button type="button" data-testid="agent-stop" onClick={state.cancel} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 py-1.5 text-[11px] text-slate-300 hover:bg-white/5">
          <Square size={10} fill="currentColor" />
          {t("agent.stop")}
        </button>
      )}

      {state.error && state.status !== "cancelled" && (
        <div className="flex gap-1.5 rounded bg-amber-400/10 p-2 text-[11px] text-amber-200" role="alert" data-testid="agent-error">
          <TriangleAlert size={12} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div>{t(`agent.errors.${state.error.code}`, t("agent.errors.failed"))}</div>
            {state.error.code === "auth" && tool && <code className="mt-1 inline-block rounded bg-white/10 px-1">{SIGN_IN_COMMANDS[tool.id]}</code>}
            {state.error.message && <div className="mt-1 break-words text-[10px] text-amber-200/70">{state.error.message}</div>}
          </div>
        </div>
      )}

      {(state.runUsage.inputTokens > 0 || state.conversationUsage.inputTokens > 0) && (
        <div className="rounded bg-white/[0.03] px-2 py-1.5 text-[10px] leading-relaxed text-slate-400" data-testid="agent-usage">
          <div>{t("agent.usage.task", undefined, { usage: usageText(state.runUsage) })}</div>
          {state.conversationUsage.inputTokens > state.runUsage.inputTokens && <div>{t("agent.usage.conversation", undefined, { usage: usageText(state.conversationUsage) })}</div>}
        </div>
      )}
      {!state.running && state.status === "done" && grouped.length === 0 && <p className="text-[11px] text-slate-400" data-testid="agent-no-proposals">{t("agent.noProposals")}</p>}
    </>;
  const review = <>
      {!state.running && grouped.length > 0 && (
        <div className="space-y-2" data-testid="agent-proposals">
          <div className="text-[11px] font-medium text-slate-200">{t("agent.proposalsTitle", undefined, { count: state.proposals.items.length })}</div>
          {grouped.map((group) => (
            <div key={group.kind} className="space-y-1">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
                <span>
                  {t(`agent.kinds.${group.kind}`)} · {group.items.length}
                  {(group.kind === "zoom" && state.proposals.replaceZooms) || (group.kind === "caption" && state.proposals.replaceCaptions) ? ` · ${t("agent.replaces")}` : ""}
                </span>
                <button
                  type="button"
                  className="normal-case text-slate-400 hover:text-slate-200"
                  onClick={() => {
                    const all = group.items.every((item) => state.chosen.has(item.id));
                    state.setChosen((current) => {
                      const next = new Set(current);
                      for (const item of group.items) {
                        if (all) next.delete(item.id);
                        else next.add(item.id);
                      }
                      return next;
                    });
                  }}
                >
                  {group.items.every((item) => state.chosen.has(item.id)) ? t("agent.selectNone") : t("agent.selectAll")}
                </button>
              </div>
              {group.items.slice(0, 200).map((item) => (
                <div key={item.id} className="flex items-start gap-1.5 rounded bg-white/[0.03] px-1.5 py-1 text-[11px]" data-testid="agent-proposal" data-kind={item.kind}>
                  <input type="checkbox" className="mt-0.5" checked={state.chosen.has(item.id)} onChange={() => state.toggle(item.id)} aria-label={t("agent.choose")} />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSeek(item.startMs / 1000)}>
                    <span className="tabular-nums text-slate-400">{clock(item.startMs)}–{clock(item.endMs)}</span>{" "}
                    <span className="break-words text-slate-200">{describeProposal(item)}</span>
                  </button>
                </div>
              ))}
            </div>
          ))}
          <div className="flex gap-1.5">
            <button type="button" data-testid="agent-apply" disabled={chosenCount === 0} onClick={onApply} className="flex-1 rounded-md bg-[#2563EB] py-1.5 text-[11px] text-white disabled:opacity-40">
              {t("agent.apply", undefined, { count: chosenCount })}
            </button>
            <button type="button" data-testid="agent-reject" onClick={state.clearProposals} className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-slate-300 hover:bg-white/5">
              {t("agent.reject")}
            </button>
          </div>
        </div>
      )}

      {state.canFollowUp && (
        <div className="flex gap-1.5">
          <textarea
            data-testid="agent-follow-up"
            value={followUp}
            onChange={(event) => setFollowUp(event.target.value)}
            placeholder={t("agent.followUpPlaceholder")}
            rows={2}
            className="min-w-0 flex-1 resize-none rounded bg-white/5 px-2 py-1.5 text-[11px] text-slate-200 outline-none"
          />
          <button
            type="button"
            data-testid="agent-follow-up-send"
            disabled={!usable || !followUp.trim()}
            onClick={() => {
              void state.start(followUp, true);
              setFollowUp("");
            }}
            className="rounded-md border border-white/15 px-2.5 text-[11px] text-slate-200 disabled:opacity-40"
          >
            {t("agent.send")}
          </button>
        </div>
      )}
    </>;

  if (wide) {
    return (
      <div className="grid h-full min-h-0 grid-cols-2 gap-5" data-testid="agent-panel-wide">
        <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto pr-1">
          {controls}
          {activity}
        </div>
        <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto pr-1">
          {state.proposals.items.length === 0 && !state.canFollowUp ? <p className="text-[11px] text-slate-500">{t("agent.reviewHint")}</p> : review}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-white/10 p-3" data-testid="agent-panel">
      {header}
      {controls}
      {activity}
      {review}
    </div>
  );
}
