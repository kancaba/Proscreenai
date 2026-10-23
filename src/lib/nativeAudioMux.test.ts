import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { muxNativeAudio } from "../../electron/nativeAudioMux";
import { RecordingRecovery } from "../../electron/recordingRecovery";
const ffmpeg = createRequire(import.meta.url)("ffmpeg-static") as string;
const run = promisify(execFile),
	dirs: string[] = [];
async function fixture() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "screenmovie-mux-"));
	dirs.push(dir);
	const video = path.join(dir, "video.mp4"),
		a = path.join(dir, "system.m4a"),
		b = path.join(dir, "mic.m4a");
	await run(ffmpeg, [
		"-v",
		"error",
		"-y",
		"-f",
		"lavfi",
		"-i",
		"color=c=blue:s=128x72:r=30:d=1",
		"-c:v",
		"libx264",
		video,
	]);
	for (const [file, frequency] of [
		[a, "440"],
		[b, "660"],
	])
		await run(ffmpeg, [
			"-v",
			"error",
			"-y",
			"-f",
			"lavfi",
			"-i",
			`sine=frequency=${frequency}:duration=0.5`,
			"-c:a",
			"aac",
			file,
		]);
	return { dir, video, a, b };
}
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});
async function duration(file: string) {
	try {
		await run(ffmpeg, ["-hide_banner", "-i", file]);
	} catch (e) {
		const log = (e as { stderr: string }).stderr;
		expect(log).toContain("Audio: aac");
		return Number(log.match(/Duration: 00:00:([\d.]+)/)?.[1]);
	}
	return 0;
}
describe("Native audio assembly", () => {
	it("mixes separate tracks without cutting the longer video", async () => {
		const { video, a, b } = await fixture();
		await muxNativeAudio(video, [a, b], ffmpeg);
		expect(await duration(video)).toBeGreaterThanOrEqual(0.99);
		expect((await fs.stat(a)).size).toBeGreaterThan(0);
	});
	it("preserves original video when audio processing fails", async () => {
		const { video, dir } = await fixture();
		const original = await fs.readFile(video);
		await expect(muxNativeAudio(video, [path.join(dir, "missing.m4a")], ffmpeg)).rejects.toThrow();
		expect(await fs.readFile(video)).toEqual(original);
	});
	it("recovers a native journal with two independent audio tracks", async () => {
		const { dir, video, a, b } = await fixture();
		const store = new RecordingRecovery(path.join(dir, "recovery"));
		const id = await store.begin("native", "Mac", null, video, null, [a, b]);
		store.release(id);
		const recovered = await store.finish(id, path.join(dir, "output"), ffmpeg);
		expect(await duration(recovered)).toBeGreaterThanOrEqual(0.99);
		expect((await fs.stat(video)).size).toBeGreaterThan(0);
	});
});
