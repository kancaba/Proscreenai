/** Ready-made editing tasks and the instructions every agent run starts with. */

export type AgentTaskId = "tutorial-edit" | "smart-zoom" | "fix-captions" | "cut-pauses" | "speed-up-waits" | "chapters" | "short-version" | "blur-private";

export interface AgentTask {
  id: AgentTaskId;
  /** What the agent is asked to do (English; the agent answers in the user's language). */
  prompt: string;
  /** The task looks at the screen, so it needs video frames. */
  needsFrames?: boolean;
}

export const AGENT_TASKS: AgentTask[] = [
  {
    id: "tutorial-edit",
    needsFrames: true,
    prompt: [
      "Edit this screen recording into a short product tutorial, the way the user edits by hand: gentle zooms, one explaining caption per step, typing sped up, dead time cut and a fade at the end.",
      "1. Understand it first. Call get_project, get_clicks, get_typing and get_pauses. Then look at frames with get_frame: the start, the end, and just after the main clicks and screen changes, so you know what every step does and what the buttons and fields are called (about 25–35 frames).",
      "2. Split the recording into steps: one action and its result each (search, pick a result, fill in fields, open an option, save, open a help panel...).",
      "3. Captions, with propose_captions and replaceExisting: true: one per step, telling the viewer what they can do or what happens there. Plain and friendly, addressed to the viewer, one sentence of at most 90 characters ending with a period. Name buttons, options and fields exactly as on screen, with button and option names in quotes. Show each from the start of its step for 3.5–6 s, never overlapping, and none on parts you cut. The captions are usually read aloud afterwards, so in the final video (after cuts and speed changes) each needs at least about 75 ms per character plus 0.5 s before the next one starts. Write them in the language of your summary. The user's own captions, for the style: \"Müşteriyi ünvan veya VKN / TCKN ile arayabilirsiniz.\" · \"Müşteri bilgilerini “Bilgileri elle gir” seçeneğiyle de doldurabilirsiniz.\" · \"Ünvanla aradığınız firma, firma listesine kayıtlıysa bilgiler kayıttan gelir.\" · \"Gelen bilgileri kontrol edip eksik zorunlu alanları tamamlayın.\" · \"“Firma listesine de kaydet” ile müşteriyi listenize ekleyebilirsiniz.\"",
      "4. Zooms, with propose_zooms and replaceExisting: true: depth 1 (a gentle 1.25x; depth 2 only for small text that is hard to read), one per step or group of nearby clicks, focused on where the action is (the click, or the field being typed in), starting about 0.5 s before it. Let them follow each other closely (touching, or less than 1 s apart) so the camera glides from step to step. None on parts you cut.",
      "5. Speed, with propose_speed: 2x for typing stretches from get_typing longer than 1.5 s, and for waiting or loading where nothing changes on screen. Do not speed up time a caption needs to be read; cut instead when the moment is not worth showing.",
      "6. Cuts, with propose_trims: the start before the first action and the end after the last result when nothing happens (keep about 0.5 s), long stretches where nothing happens on screen, and mistakes or repeated attempts (when the same thing is done twice, keep the cleaner one). Check the frames on both sides of a cut so the video still makes sense, and never cut a step a caption explains.",
      "7. propose_fade with fadeOutMs 1000.",
      "8. Check everything with review_proposals and fix overlaps. In the summary, list the steps you found in a few words each.",
    ].join("\n"),
  },
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
  {
    id: "blur-private",
    needsFrames: true,
    prompt:
      "Hide private information on screen. Look at frames with get_frame (start, end, and moments around clicks from get_clicks and screen changes) and find e-mail addresses, personal names, tax or ID numbers, phone numbers, addresses, passwords, tokens and API keys. For each, propose a blur area with propose_blur covering the text with a small margin, for the whole time it is visible; check a frame before and after to find when it appears and disappears, and use separate areas when it moves or the page scrolls. Do not blur ordinary interface labels, menus or company names that are part of the product. If get_frame is not available, do not guess positions: say in the summary that frame access must be allowed for this task.",
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
    "You cannot watch the video. Work only through the screenmovie tools: get_project, get_clicks, get_typing, get_transcript, get_pauses" +
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
