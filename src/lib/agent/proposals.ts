/**
 * Edits an AI agent may suggest. Agents never change the project: their tool calls are
 * checked here and collected as proposals, which the user reviews and applies in the editor.
 * Every check returns a plain message so the agent can correct itself and try again.
 */

export type ProposalKind = "zoom" | "trim" | "speed" | "caption" | "text";
export type TextPreset = "title" | "subtitle" | "label" | "callout" | "typing";

export const AGENT_SPEEDS = [0.25, 0.5, 0.75, 1.25, 1.5, 1.75, 2] as const;
export type AgentSpeed = (typeof AGENT_SPEEDS)[number];
export const TEXT_PRESETS: TextPreset[] = ["title", "subtitle", "label", "callout", "typing"];

interface ProposalBase {
  id: string;
  startMs: number;
  endMs: number;
  reason?: string;
}
export interface ZoomProposal extends ProposalBase {
  kind: "zoom";
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  focus: { cx: number; cy: number };
}
export interface TrimProposal extends ProposalBase {
  kind: "trim";
}
export interface SpeedProposal extends ProposalBase {
  kind: "speed";
  speed: AgentSpeed;
}
export interface CaptionProposal extends ProposalBase {
  kind: "caption";
  text: string;
}
export interface TextProposal extends ProposalBase {
  kind: "text";
  text: string;
  preset: TextPreset;
  /** Top-left corner in percent of the frame; the preset's default place when absent. */
  position?: { x: number; y: number };
}
export type Proposal = ZoomProposal | TrimProposal | SpeedProposal | CaptionProposal | TextProposal;

export interface ProposalSet {
  items: Proposal[];
  /** The proposed zooms / speech captions replace the project's current ones. */
  replaceZooms: boolean;
  replaceCaptions: boolean;
}

export const EMPTY_PROPOSALS: ProposalSet = { items: [], replaceZooms: false, replaceCaptions: false };

/** What the checks need to know about the project. */
export interface ProposalContext {
  durationMs: number;
  zooms: Array<{ startMs: number; endMs: number }>;
  speeds: Array<{ startMs: number; endMs: number }>;
}

export interface ProposalResult {
  set: ProposalSet;
  accepted: number;
  errors: string[];
}

const LIMITS = {
  zoom: { min: 500, max: 60000 },
  trim: { min: 100, max: Number.POSITIVE_INFINITY },
  speed: { min: 500, max: Number.POSITIVE_INFINITY },
  caption: { min: 300, max: 15000 },
  text: { min: 500, max: 30000 },
};
const MAX_TEXT = 200;
const MAX_ITEMS_PER_KIND = 500;

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const overlaps = (a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }) =>
  a.startMs < b.endMs && b.startMs < a.endMs;
const describe = (index: number, item: unknown) => {
  const record = item as Record<string, unknown> | null;
  return `item ${index + 1}${record && isNumber(record.startMs) ? ` (${record.startMs}–${record.endMs} ms)` : ""}`;
};

function readSpan(raw: Record<string, unknown>, kind: ProposalKind, durationMs: number): { startMs: number; endMs: number } | string {
  if (!isNumber(raw.startMs) || !isNumber(raw.endMs)) return "startMs and endMs must be numbers (milliseconds)";
  const startMs = Math.round(Math.max(0, raw.startMs));
  const endMs = Math.round(Math.min(durationMs, raw.endMs));
  if (raw.startMs >= durationMs) return `starts after the video ends (${durationMs} ms)`;
  if (endMs <= startMs) return "endMs must be after startMs";
  const { min, max } = LIMITS[kind];
  if (endMs - startMs < min) return `is shorter than ${min} ms`;
  if (endMs - startMs > max) return `is longer than ${max} ms`;
  return { startMs, endMs };
}

const reasonOf = (raw: Record<string, unknown>) =>
  typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim().slice(0, 240) : undefined;

function readText(raw: Record<string, unknown>): string | null {
  if (typeof raw.text !== "string") return null;
  const text = raw.text.replace(/\s+/g, " ").trim();
  return text && text.length <= MAX_TEXT ? text : null;
}

/** Turns one raw item into a proposal, or explains what is wrong with it. */
function readItem(kind: ProposalKind, raw: unknown, durationMs: number, id: string): Proposal | string {
  if (!raw || typeof raw !== "object") return "must be an object";
  const item = raw as Record<string, unknown>;
  const span = readSpan(item, kind, durationMs);
  if (typeof span === "string") return span;
  const base = { id, ...span, reason: reasonOf(item) };
  switch (kind) {
    case "zoom": {
      const depth = item.depth ?? 3;
      if (!Number.isInteger(depth) || (depth as number) < 1 || (depth as number) > 6) return "depth must be an integer from 1 to 6";
      const cx = item.focusX ?? 0.5;
      const cy = item.focusY ?? 0.5;
      if (!isNumber(cx) || !isNumber(cy) || cx < 0 || cx > 1 || cy < 0 || cy > 1) return "focusX and focusY must be between 0 and 1";
      return { ...base, kind, depth: depth as ZoomProposal["depth"], focus: { cx, cy } };
    }
    case "trim":
      return { ...base, kind };
    case "speed": {
      if (!AGENT_SPEEDS.includes(item.speed as AgentSpeed)) return `speed must be one of ${AGENT_SPEEDS.join(", ")}`;
      return { ...base, kind, speed: item.speed as AgentSpeed };
    }
    case "caption": {
      const text = readText(item);
      if (!text) return `text must be 1–${MAX_TEXT} characters`;
      return { ...base, kind, text };
    }
    case "text": {
      const text = readText(item);
      if (!text) return `text must be 1–${MAX_TEXT} characters`;
      const preset = (item.style ?? "title") as TextPreset;
      if (!TEXT_PRESETS.includes(preset)) return `style must be one of ${TEXT_PRESETS.join(", ")}`;
      let position: TextProposal["position"];
      if (item.x !== undefined || item.y !== undefined) {
        if (!isNumber(item.x) || !isNumber(item.y) || item.x < 0 || item.x > 90 || item.y < 0 || item.y > 90) {
          return "x and y must be percentages from 0 to 90";
        }
        position = { x: item.x, y: item.y };
      }
      return { ...base, kind, text, preset, ...(position ? { position } : {}) };
    }
  }
}

export interface AddOptions {
  /** For zooms and captions: replace what the project already has. */
  replaceExisting?: boolean;
}

/**
 * Checks raw items from an agent and adds the valid ones to the set. Items of a kind that
 * cannot overlap (zooms, speed changes) are checked against each other, against earlier
 * proposals, and against the project unless they replace it.
 */
export function addProposals(
  set: ProposalSet,
  kind: ProposalKind,
  rawItems: unknown,
  context: ProposalContext,
  options: AddOptions = {},
  nextId: () => string,
): ProposalResult {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { set, accepted: 0, errors: ["Pass a non-empty array of items."] };
  }
  const replace = options.replaceExisting === true;
  let next: ProposalSet = {
    ...set,
    replaceZooms: kind === "zoom" ? replace || set.replaceZooms : set.replaceZooms,
    replaceCaptions: kind === "caption" ? replace || set.replaceCaptions : set.replaceCaptions,
  };
  // Replacing starts this kind over, so a corrected list does not stack on the first try.
  if (replace) next = { ...next, items: next.items.filter((item) => item.kind !== kind) };

  const errors: string[] = [];
  let accepted = 0;
  const sameKind = () => next.items.filter((item) => item.kind === kind);
  for (const [index, raw] of rawItems.entries()) {
    if (sameKind().length >= MAX_ITEMS_PER_KIND) {
      errors.push(`Stopped at ${describe(index, raw)}: at most ${MAX_ITEMS_PER_KIND} ${kind} proposals.`);
      break;
    }
    const item = readItem(kind, raw, context.durationMs, nextId());
    if (typeof item === "string") {
      errors.push(`${describe(index, raw)}: ${item}`);
      continue;
    }
    if (kind === "zoom" || kind === "speed" || kind === "caption") {
      const clash = sameKind().find((other) => overlaps(other, item));
      if (clash) {
        errors.push(`${describe(index, raw)}: overlaps another ${kind} proposal (${clash.startMs}–${clash.endMs} ms)`);
        continue;
      }
      const existing = kind === "zoom" ? (next.replaceZooms ? [] : context.zooms) : kind === "speed" ? context.speeds : [];
      const taken = existing.find((other) => overlaps(other, item));
      if (taken) {
        errors.push(`${describe(index, raw)}: overlaps an existing ${kind} (${taken.startMs}–${taken.endMs} ms)${kind === "zoom" ? "; pass replaceExisting: true to replace the current zooms" : ""}`);
        continue;
      }
    }
    next = { ...next, items: [...next.items, item] };
    accepted += 1;
  }
  return { set: next, accepted, errors };
}

/** Removes proposals of one kind (or all of them). */
export function clearProposals(set: ProposalSet, kind?: ProposalKind): ProposalSet {
  if (!kind) return EMPTY_PROPOSALS;
  return {
    items: set.items.filter((item) => item.kind !== kind),
    replaceZooms: kind === "zoom" ? false : set.replaceZooms,
    replaceCaptions: kind === "caption" ? false : set.replaceCaptions,
  };
}

/** Short text an agent can read back to check its own work. */
export function summarizeProposals(set: ProposalSet): string {
  if (set.items.length === 0) return "No proposals yet.";
  const lines = [...set.items]
    .sort((a, b) => a.startMs - b.startMs)
    .map((item) => {
      const detail =
        item.kind === "zoom"
          ? `depth ${item.depth} at (${item.focus.cx.toFixed(2)}, ${item.focus.cy.toFixed(2)})`
          : item.kind === "speed"
            ? `${item.speed}x`
            : item.kind === "caption" || item.kind === "text"
              ? JSON.stringify(item.text)
              : "cut";
      return `${item.kind} ${item.startMs}–${item.endMs} ms: ${detail}${item.reason ? ` — ${item.reason}` : ""}`;
    });
  const flags = [set.replaceZooms ? "replaces current zooms" : "", set.replaceCaptions ? "replaces current speech captions" : ""].filter(Boolean);
  return `${set.items.length} proposals${flags.length ? ` (${flags.join(", ")})` : ""}:\n${lines.join("\n")}`;
}

/** The raw form an agent sends for a stored proposal (used to re-check proposals from the editor). */
function toRaw(item: Proposal): Record<string, unknown> {
  const base = { startMs: item.startMs, endMs: item.endMs, reason: item.reason };
  switch (item.kind) {
    case "zoom":
      return { ...base, depth: item.depth, focusX: item.focus.cx, focusY: item.focus.cy };
    case "speed":
      return { ...base, speed: item.speed };
    case "caption":
      return { ...base, text: item.text };
    case "text":
      return { ...base, text: item.text, style: item.preset, ...(item.position ? { x: item.position.x, y: item.position.y } : {}) };
    default:
      return base;
  }
}

/** Re-checks a proposal set that came from elsewhere (IPC), keeping only valid items. */
export function sanitizeProposalSet(value: unknown, context: ProposalContext, nextId: () => string): ProposalSet {
  const raw = value as Partial<ProposalSet> | null;
  if (!raw || !Array.isArray(raw.items)) return EMPTY_PROPOSALS;
  let set: ProposalSet = EMPTY_PROPOSALS;
  const kinds: ProposalKind[] = ["zoom", "trim", "speed", "caption", "text"];
  for (const kind of kinds) {
    const items = raw.items.filter((item): item is Proposal => !!item && (item as Proposal).kind === kind).map(toRaw);
    if (items.length === 0) continue;
    const replaceExisting = kind === "zoom" ? raw.replaceZooms === true : kind === "caption" ? raw.replaceCaptions === true : false;
    set = addProposals(set, kind, items, context, { replaceExisting }, nextId).set;
  }
  return set;
}
