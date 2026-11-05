import { describe, expect, it } from "vitest";
import {
	activeAt,
	clipEnd,
	dragClip,
	placeClip,
	sequenceEnd,
	snapDelta,
	validSequence,
	type SequenceClip,
} from "./sequence";
import {
	createProjectData,
	normalizeProjectEditor,
	validateProjectData,
} from "../components/video-editor/projectPersistence";

import { clipProject } from "../components/video-editor/sequenceClipEdit";

const video: SequenceClip = {
	id: "original",
	path: "/a.mp4",
	name: "a",
	track: 0,
	start: 1000,
	inMs: 4000,
	outMs: 9000,
	sourceMs: 12000,
	volume: 1,
	hasAudio: true,
};
describe("free clip placement", () => {
	it("moves a linked video and its sound without moving other tracks or changing source time", () => {
		const overlay = dragClip({ ...video, id: "upper" }, "move", 2000, 1);
		const clips = placeClip([video], overlay);
		expect(clips).toEqual([video, { ...video, id: "upper", start: 3000, track: 1 }]);
		expect(activeAt(overlay, 2999)).toBe(false);
		expect(activeAt(overlay, 8000)).toBe(false);
		expect(sequenceEnd(clips)).toBe(8000);
	});
	it("overwrites only the overlapping section and keeps both tails at the correct source times", () => {
		const placed = { ...video, id: "insert", start: 2000, inMs: 0, outMs: 1000 };
		const [left, right, insert] = placeClip([video], placed);
		expect(left).toMatchObject({ start: 1000, inMs: 4000, outMs: 5000 });
		expect(right).toMatchObject({ start: 3000, inMs: 6000, outMs: 9000 });
		expect(right.id).not.toBe(left.id);
		expect(insert).toBe(placed);
	});
	it("limits edge extensions by remaining source and timeline room", () => {
		expect(dragClip(video, "left", -9000, 1)).toMatchObject({
			track: 0,
			start: 0,
			inMs: 3000,
			outMs: 9000,
		});
		expect(dragClip(video, "right", 9000, 1)).toMatchObject({ outMs: 12000 });
		expect(clipEnd(dragClip(video, "left", 1200, 0))).toBe(clipEnd(video));
		expect(snapDelta(video, "move", 1998, [8000], 4)).toBe(2000);
	});
	it("round trips the sequence through project persistence, including an empty timeline", () => {
		for (const clips of [[], [video]]) {
			const sequence = { width: 1920, height: 1080, clips };
			const project = createProjectData("/a.mp4", normalizeProjectEditor({ sequence }));
			expect(validateProjectData(project)).toBe(true);
			expect(normalizeProjectEditor(JSON.parse(JSON.stringify(project)).editor).sequence).toEqual(
				sequence,
			);
		}
		expect(validSequence({ width: 1920, height: 1080, clips: [video, video] })).toBe(false);
	});
});

it("reopens a trimmed rendered clip at its original source offsets, including its sound", () => {
	const edit = {
		videoPath: "/original.mp4",
		sourceMs: 10000,
		editor: normalizeProjectEditor({
			trimRegions: [{ id: "cut", startMs: 1000, endMs: 3000 }],
			speedRegions: [{ id: "speed", startMs: 3000, endMs: 7000, speed: 2 }],
			audioRegions: [
				{
					id: "sound",
					startMs: 3000,
					endMs: 7000,
					volume: 1,
					audioPath: "/sound.wav",
					sourceStartMs: 250,
				},
			],
		}),
	};
	const clip = {
		...video,
		path: "/render.mp4",
		sourceMs: 6000,
		start: 500,
		inMs: 2000,
		outMs: 4000,
		edit,
	};
	const { editor, videoPath, workspace } = clipProject(
		clip,
		{ width: 320, height: 180, clips: [clip] },
		500,
	);
	expect(videoPath).toBe("/original.mp4");
	expect(workspace?.playheadSeconds).toBe(5);
	expect(editor.audioRegions[0]).toMatchObject({ sourceStartMs: 1250, startMs: 5000, endMs: 7000 });
	expect(edit.editor.trimRegions).toHaveLength(1);
});
