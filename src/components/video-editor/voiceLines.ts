import { type CutMap, toOutputMs, toSourceMs } from "./timeline/editedTime";

/** A caption to be read aloud: source-time span and its text. */
export interface VoiceLine {
	id: string;
	startMs: number;
	endMs: number;
	text: string;
}

/** A caption with its generated speech. */
export interface VoicedLine {
	line: VoiceLine;
	path: string;
	durationMs: number;
}

export interface PlacedVoice {
	lineId: string;
	path: string;
	durationMs: number;
	/** Where the speech starts, source time. */
	startMs: number;
	/** The speech starts later than its caption, because the speech before it was still playing. */
	shifted: boolean;
	/** New end (source time) for the caption, so it stays on screen while it is read; absent when it already does. */
	captionEndMs?: number;
}

/** Silence kept between two lines read one after the other. */
export const VOICE_GAP_MS = 150;
/** The caption stays this long after its speech ends. */
const CAPTION_TAIL_MS = 250;

/** How far the last speech runs past the end of the edited video (0 when it fits). */
export function voiceOverrunMs(placed: PlacedVoice[], map: CutMap, videoEndMs: number): number {
	const end = Math.max(0, ...placed.map((item) => toOutputMs(map, item.startMs) + item.durationMs));
	return Math.max(0, Math.round(end - videoEndMs));
}

/**
 * Puts each line's speech at its caption on the edited timeline. Speech never overlaps: a line
 * still playing pushes the next one back. A caption shorter than its speech is lengthened, up to
 * the start of the next caption.
 */
export function placeVoiceLines(voiced: VoicedLine[], map: CutMap, gapMs = VOICE_GAP_MS): PlacedVoice[] {
	const sorted = [...voiced].sort((a, b) => a.line.startMs - b.line.startMs);
	const placed: PlacedVoice[] = [];
	let previousEnd = Number.NEGATIVE_INFINITY;
	sorted.forEach((item, index) => {
		const wanted = toOutputMs(map, item.line.startMs);
		const outStart = Math.max(wanted, previousEnd + gapMs);
		const outEnd = outStart + item.durationMs;
		previousEnd = outEnd;
		const next = sorted[index + 1];
		const captionOutEnd = toOutputMs(map, item.line.endMs);
		const limit = next ? toOutputMs(map, next.line.startMs) : Number.POSITIVE_INFINITY;
		const wantedEnd = Math.min(outEnd + CAPTION_TAIL_MS, limit);
		const captionEndMs = wantedEnd > captionOutEnd + 1 ? Math.round(toSourceMs(map, wantedEnd, "before")) : undefined;
		placed.push({
			lineId: item.line.id,
			path: item.path,
			durationMs: Math.round(item.durationMs),
			startMs: Math.round(toSourceMs(map, outStart, "after")),
			shifted: outStart - wanted > 50,
			...(captionEndMs !== undefined && captionEndMs > item.line.endMs ? { captionEndMs } : {}),
		});
	});
	return placed;
}
