import type { Fades } from "./fades";
import type { AnnotationRegion } from "../components/video-editor/types";
import type { ExportQuality, GifFrameRate, GifSizePreset } from "./exporter/types";
import type { ResolutionPreset } from "./video/outputSettings";
export interface SequenceOutput {
	format: "gif" | "mp4";
	quality: ExportQuality;
	resolution: ResolutionPreset;
	customWidth: number;
	customHeight: number;
	gifFps: GifFrameRate;
	gifSize: GifSizePreset;
	loop: boolean;
}
export const defaultSequenceOutput: SequenceOutput = {
	format: "mp4",
	quality: "high",
	resolution: "source",
	customWidth: 1920,
	customHeight: 1080,
	gifFps: 15,
	gifSize: "medium",
	loop: true,
};

import type { ProjectEditorState } from "../components/video-editor/projectPersistence";

export interface ClipEdit {
	videoPath: string;
	sourceMs: number;
	editor: Omit<ProjectEditorState, "sequence">;
}

function validEdit(value: ClipEdit): boolean {
	return (
		!!value &&
		typeof value.videoPath === "string" &&
		value.videoPath.length > 0 &&
		Number.isSafeInteger(value.sourceMs) &&
		value.sourceMs > 0 &&
		!!value.editor &&
		typeof value.editor === "object" &&
		!Array.isArray(value.editor) &&
		!("sequence" in value.editor)
	);
}
// All sequence positions are milliseconds. Track 0 is V1; negative tracks are audio only.
export interface ClipTransform {
	scale: number;
	x: number;
	y: number;
	opacity: number;
	turns: number;
	flip: boolean;
}
export const DEFAULT_TRANSFORM: ClipTransform = {
	scale: 1,
	x: 0.5,
	y: 0.5,
	opacity: 1,
	turns: 0,
	flip: false,
};
function validTransform(t: ClipTransform) {
	return (
		!!t &&
		[t.x, t.y, t.opacity].every((n) => Number.isFinite(n) && n >= 0 && n <= 1) &&
		Number.isFinite(t.scale) &&
		t.scale >= 0.1 &&
		t.scale <= 2 &&
		Number.isInteger(t.turns) &&
		t.turns >= 0 &&
		t.turns <= 3 &&
		typeof t.flip === "boolean"
	);
}
export interface SequenceClip {
	edit?: ClipEdit;
	transform?: ClipTransform;
	still?: boolean;
	graphic?: AnnotationRegion;
	id: string;
	path: string;
	name: string;
	track: number;
	start: number;
	inMs: number;
	outMs: number;
	sourceMs: number;
	volume: number;
	hasAudio: boolean;
}
export interface Sequence {
	output?: SequenceOutput;
	fades?: Fades;
	pendingEdit?: { clipId: string; edit: ClipEdit };
	width: number;
	height: number;
	fps?: 30 | 60;
	videoTracks?: number;
	audioTracks?: number;
	clips: SequenceClip[];
}

export const clipEnd = (c: SequenceClip) => c.start + c.outMs - c.inMs;
export const sequenceEnd = (clips: SequenceClip[]) =>
	clips.reduce((end, c) => Math.max(end, clipEnd(c)), 0);
export const activeAt = (c: SequenceClip, time: number) => c.start <= time && time < clipEnd(c);

export function validSequence(value: unknown): value is Sequence {
	if (!value || typeof value !== "object") return false;
	const s = value as Sequence;
	const validDimension = (n: number) => Number.isInteger(n) && n >= 2 && n <= 8192 && n % 2 === 0;
	if (
		s.fades !== undefined &&
		(!s.fades ||
			![s.fades.fadeInMs, s.fades.fadeOutMs].every(
				(n) => Number.isInteger(n) && n >= 0 && n <= 10000,
			))
	)
		return false;
	const o = s.output;
	if (
		o !== undefined &&
		(!o ||
			!["gif", "mp4"].includes(o.format) ||
			!["source", "high", "good", "medium"].includes(o.quality) ||
			!["source", "720", "1080", "1440", "2160", "custom"].includes(o.resolution) ||
			![15, 20, 25, 30].includes(o.gifFps) ||
			!["medium", "large", "original"].includes(o.gifSize) ||
			typeof o.loop !== "boolean" ||
			![o.customWidth, o.customHeight].every((n) => validDimension(n) && n >= 64 && n <= 4096))
	)
		return false;
	for (const count of [s.videoTracks, s.audioTracks]) {
		if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > 8)) return false;
	}
	if (s.fps !== undefined && s.fps !== 30 && s.fps !== 60) return false;
	if (
		!validDimension(s.width) ||
		!validDimension(s.height) ||
		!Array.isArray(s.clips) ||
		s.clips.length > 512
	)
		return false;
	const ids = new Set<string>();
	for (const c of s.clips) {
		if (
			!c ||
			typeof c.id !== "string" ||
			!c.id ||
			ids.has(c.id) ||
			typeof c.path !== "string" ||
			!c.path ||
			typeof c.name !== "string" ||
			![c.track, c.start, c.inMs, c.outMs, c.sourceMs].every(Number.isSafeInteger) ||
			c.track < -8 ||
			c.track > 7 ||
			clipEnd(c) > 7 * 24 * 60 * 60 * 1000 ||
			c.start < 0 ||
			c.inMs < 0 ||
			c.outMs <= c.inMs ||
			c.outMs > c.sourceMs ||
			!Number.isFinite(c.volume) ||
			c.volume < 0 ||
			c.volume > 1 ||
			(c.still !== undefined &&
				(typeof c.still !== "boolean" || (c.still && (c.track < 0 || c.hasAudio)))) ||
			(c.graphic !== undefined &&
				!(
					c.still &&
					c.graphic &&
					["text", "figure", "image"].includes(c.graphic.type) &&
					c.graphic.style &&
					c.graphic.size &&
					c.graphic.position
				)) ||
			(c.transform !== undefined && !validTransform(c.transform)) ||
			typeof c.hasAudio !== "boolean" ||
			(c.edit !== undefined && !validEdit(c.edit))
		)
			return false;
		ids.add(c.id);
	}
	return (
		s.pendingEdit === undefined ||
		(!!s.pendingEdit && ids.has(s.pendingEdit.clipId) && validEdit(s.pendingEdit.edit))
	);
}

// Overwrite only the covered time on the destination track. Uncovered tails keep their source offsets.
export function placeClip(clips: SequenceClip[], placed: SequenceClip): SequenceClip[] {
	const result: SequenceClip[] = [];
	const end = clipEnd(placed);
	for (const c of clips) {
		if (c.id === placed.id) continue;
		if (c.track !== placed.track || clipEnd(c) <= placed.start || c.start >= end) {
			result.push(c);
			continue;
		}
		if (c.start < placed.start) result.push({ ...c, outMs: c.inMs + placed.start - c.start });
		if (clipEnd(c) > end)
			result.push({
				...c,
				id: c.start < placed.start ? crypto.randomUUID() : c.id,
				start: end,
				inMs: c.inMs + end - c.start,
			});
	}
	return [...result, placed];
}

export type ClipGesture = "move" | "left" | "right";
export function dragClip(
	c: SequenceClip,
	action: ClipGesture,
	delta: number,
	track: number,
): SequenceClip {
	delta = Math.round(delta);
	if (action === "move") return { ...c, start: Math.max(0, c.start + delta), track };
	if (action === "right")
		return { ...c, outMs: Math.max(c.inMs + 1, Math.min(c.sourceMs, c.outMs + delta)) };
	const shift = Math.max(-c.start, -c.inMs, Math.min(delta, c.outMs - c.inMs - 1));
	return { ...c, start: c.start + shift, inMs: c.inMs + shift };
}

export function snapDelta(
	c: SequenceClip,
	action: ClipGesture,
	delta: number,
	targets: number[],
	tolerance: number,
) {
	const edges =
		action === "move" ? [c.start, clipEnd(c)] : [action === "left" ? c.start : clipEnd(c)];
	let closest = tolerance + 1,
		adjustment = 0;
	for (const edge of edges)
		for (const target of targets) {
			const difference = target - edge - delta;
			if (Math.abs(difference) < closest && Math.abs(difference) <= tolerance) {
				closest = Math.abs(difference);
				adjustment = difference;
			}
		}
	return delta + adjustment;
}
