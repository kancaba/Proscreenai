import { type ClipEdit, type SequenceClip, type Sequence } from "@/lib/sequence";
import { normalizeProjectEditor, type EditorProjectData } from "./projectPersistence";
import { audioTimelineSpan } from "./audioRegionSpan";
import { createCutMap, toSourceMs } from "./timeline/editedTime";

export type ClipTool =
	| "appearance"
	| "zoom"
	| "text"
	| "blur"
	| "speed"
	| "captions"
	| "voiceover"
	| "ai";

export interface ClipSession {
	initial: EditorProjectData;
	clip: SequenceClip;
	tool: ClipTool;
	onCancel: () => void;
	onSave: () => Promise<void>;
	onDraft: (edit: ClipEdit) => void;
	onApply: (path: string, edit: ClipEdit) => Promise<void>;
}

// An applied clip can subsequently be trimmed or split on the sequence. Map that
// visible subrange back through the original cuts and speed changes before reopening it.
export function clipProject(
	clip: SequenceClip,
	sequence: Sequence,
	at: number,
	draft?: ClipEdit,
): EditorProjectData {
	const edit = draft ?? clip.edit;
	const editor = normalizeProjectEditor(
		edit?.editor ?? {
			aspectRatio: "native",
			padding: 0,
			borderRadius: 0,
			shadowIntensity: 0,
			wallpaper: "#000000",
			exportResolution: "source",
			exportFps: sequence.fps ?? 30,
			exportQuality: "source",
		},
	);
	const length = edit?.sourceMs ?? clip.sourceMs;
	const map = createCutMap(editor.trimRegions, length, editor.speedRegions);
	const local = Math.max(0, Math.min(clip.outMs - clip.inMs - 1, at - clip.start));
	const sourceTime = toSourceMs(map, draft ? local : clip.inMs + local);
	if (!draft && (clip.inMs > 0 || clip.outMs < clip.sourceMs)) {
		editor.audioRegions = editor.audioRegions.flatMap((region) => {
			const span = audioTimelineSpan(region, map);
			const start = Math.max(span.start, clip.inMs),
				end = Math.min(span.end, clip.outMs);
			if (end <= start) return [];
			const startMs = Math.round(toSourceMs(map, start));
			return [
				{
					...region,
					startMs,
					endMs: startMs + end - start,
					sourceStartMs: (region.sourceStartMs ?? 0) + start - span.start,
				},
			];
		});
		if (clip.inMs > 0) {
			const start = Math.min(length, Math.round(toSourceMs(map, clip.inMs)));
			if (start > 0) editor.trimRegions.push({ id: crypto.randomUUID(), startMs: 0, endMs: start });
		}
		if (editor.ending)
			editor.ending = {
				...editor.ending,
				durationMs: Math.min(
					editor.ending.durationMs,
					Math.max(0, Math.round(clip.outMs - Math.max(clip.inMs, map.outputMs))),
				),
			};
		if (clip.outMs < clip.sourceMs) {
			const end = Math.min(length, Math.round(toSourceMs(map, clip.outMs, "before")));
			if (end < length)
				editor.trimRegions.push({ id: crypto.randomUUID(), startMs: end, endMs: length });
		}
	}
	return {
		version: 1,
		videoPath: edit?.videoPath ?? clip.path,
		editor,
		workspace: { playheadSeconds: Math.min(length, sourceTime) / 1000 },
	};
}
