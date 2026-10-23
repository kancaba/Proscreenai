/** Ready-made editing tasks and the instructions every agent run starts with. */

export type AgentTaskId = "smart-zoom" | "fix-captions" | "cut-pauses" | "speed-up-waits" | "chapters" | "short-version";

export interface AgentTask {
  id: AgentTaskId;
  /** What the agent is asked to do (English; the agent answers in the user's language). */
  prompt: string;
}

export const AGENT_TASKS: AgentTask[] = [
  {
    id: "smart-zoom",
    prompt:
      "Propose zooms for the moments that matter. Use get_clicks and, if there is speech, get_transcript: zoom where the user clicks or types and where the speaker points at something on screen. Each zoom 1.5–6 s, starting about 0.5 s before the action, depth 2–4, focused on the click area. Group clicks that are close in time and place into one zoom. No overlaps. Use propose_zooms with replaceExisting: true.",
  },
  {
    id: "fix-captions",
    prompt:
      "Clean up the speech captions. Read the current captions from get_project; if there are none, build them from get_transcript phrases. Fix obvious recognition mistakes, add punctuation and capital letters, keep each caption under 84 characters and keep the timing (split long ones at natural pauses). Keep the spoken language. Use propose_captions with replaceExisting: true and include every caption, not only the changed ones.",
  },
  {
    id: "cut-pauses",
    prompt:
      "Cut long silent pauses. Use get_pauses with minMs 1200 and get_clicks. Propose a trim for each long pause, keeping about 300 ms of silence on each side, and do not cut moments where the user is clicking. Do not trim the first or last second. Use propose_trims.",
  },
  {
    id: "speed-up-waits",
    prompt:
      "Speed up waiting. Find stretches longer than 4 s with no speech (get_pauses) and few or no clicks (get_clicks), such as loading or long typing. Propose 1.5x or 2x speed for them with propose_speed. Leave stretches with speech at normal speed.",
  },
  {
    id: "chapters",
    prompt:
      "Add chapter titles. From get_transcript (and get_clicks if there is little speech), find where the topic or task changes. Propose a short title (at most 40 characters, in the spoken language) for each section with propose_text, style \"title\", shown for 2.5 s at the start of the section. Aim for one title per 30–90 s.",
  },
  {
    id: "short-version",
    prompt:
      "Make a short version of at most 60 seconds. Using get_transcript, get_pauses and get_clicks, keep the introduction and the key actions and remove less important parts with propose_trims (the trims are the parts that are cut). Explain in the summary what is kept.",
  },
];

export interface AgentInstructionsInput {
  language: "tr" | "en" | string;
  framesAllowed: boolean;
}

/** Instructions sent ahead of every task or follow-up. */
export function agentInstructions({ language, framesAllowed }: AgentInstructionsInput): string {
  const reply = language === "tr" ? "Turkish" : language === "en" ? "English" : `the language with code "${language}"`;
  return [
    "You are helping edit a screen recording in Pro Screen AI, a video editor.",
    "You cannot watch the video. Work only through the screenmovie tools: get_project, get_clicks, get_transcript, get_pauses" +
      (framesAllowed ? ", get_frame (a still image at a time)" : "") +
      ", and the propose_* tools. Do not use any other tools, files or commands.",
    "All times are milliseconds in the source video. Base every decision on the tool data; never invent clicks or speech.",
    "Nothing changes until the user reviews your proposals in the editor, so propose complete, consistent edits. If a propose_* call reports errors, fix those items and call it again. Use review_proposals to check your work.",
    `Finish with a short summary for the user in ${reply}: what you proposed and why, in a few sentences. Do not ask questions; make reasonable choices.`,
  ].join("\n");
}

/** Full prompt for a task or a free request, with the standing instructions first. */
export function buildAgentPrompt(request: string, input: AgentInstructionsInput): string {
  return `${agentInstructions(input)}\n\nTask:\n${request.trim()}`;
}
