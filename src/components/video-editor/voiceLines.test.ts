import { describe, expect, it } from "vitest";
import { createCutMap } from "./timeline/editedTime";
import { placeVoiceLines, type VoicedLine, voiceOverrunMs } from "./voiceLines";

const line = (id: string, startMs: number, endMs: number, durationMs: number): VoicedLine => ({
	line: { id, startMs, endMs, text: id },
	path: `/voice/${id}.mp3`,
	durationMs,
});

describe("placing voiced captions", () => {
	it("starts each line at its caption when there is room", () => {
		const placed = placeVoiceLines([line("b", 6000, 10000, 3000), line("a", 1000, 5000, 3500)], createCutMap([], 20000));
		expect(placed.map((p) => [p.lineId, p.startMs, p.shifted, p.captionEndMs])).toEqual([
			["a", 1000, false, undefined],
			["b", 6000, false, undefined],
		]);
	});

	it("never overlaps speech and lengthens short captions up to the next one", () => {
		const placed = placeVoiceLines([line("a", 1000, 3000, 4000), line("b", 4000, 8000, 2000)], createCutMap([], 20000));
		// a is read until 5000, so b waits for it (plus the gap).
		expect(placed[1]).toMatchObject({ lineId: "b", startMs: 5150, shifted: true });
		// a's caption stays until b's caption starts.
		expect(placed[0].captionEndMs).toBe(4000);
	});

	it("works on the edited timeline: cut and sped-up parts", () => {
		// 2000–4000 is cut; 6000–10000 plays at 2x.
		const map = createCutMap([{ id: "cut", startMs: 2000, endMs: 4000 }], 20000, [{ startMs: 6000, endMs: 10000, speed: 2 }]);
		const placed = placeVoiceLines([line("a", 1000, 2000, 2500), line("b", 6000, 10000, 1000)], map);
		// a plays 1000–3500 on the edited timeline, which is source 1000…5500 past the cut.
		expect(placed[0]).toMatchObject({ startMs: 1000, shifted: false, captionEndMs: 5750 });
		// b's caption starts at 4000 on the edited timeline, after a ends at 3500 + gap.
		expect(placed[1]).toMatchObject({ startMs: 6000, shifted: false });
	});

	it("tells how far the speech runs past the end", () => {
		const map = createCutMap([], 10000);
		const placed = placeVoiceLines([line("a", 1000, 4000, 3000), line("b", 8000, 9500, 3500)], map);
		expect(voiceOverrunMs(placed, map, 10000)).toBe(1500);
		expect(voiceOverrunMs(placed.slice(0, 1), map, 10000)).toBe(0);
	});
});
