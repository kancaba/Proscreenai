import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { RecordingRecovery } from "../../electron/recordingRecovery";
const dirs: string[] = [];
async function fixture() {
	const dir = await mkdtemp(path.join(os.tmpdir(), "screenmovie-recording-"));
	dirs.push(dir);
	return { dir, store: new RecordingRecovery(dir) };
}
const bytes = (value: string) => new TextEncoder().encode(value).buffer as ArrayBuffer;
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
describe("RecordingRecovery", () => {
	it("persists ordered media chunks and acknowledged length across a fresh instance", async () => {
		const { dir, store } = await fixture();
		const id = await store.begin("browser", "Test", null);
		await Promise.all([
			store.append(id, 0, bytes("header")),
			store.append(id, 1, bytes("-frame")),
			store.append(id, 2, bytes("-audio")),
		]);
		expect(await store.list()).toEqual([]);
		const restarted = new RecordingRecovery(dir);
		expect((await restarted.list())[0]).toMatchObject({ id, bytes: 18 });
		expect(await readFile(path.join(dir, id + ".webm"), "utf8")).toBe("header-frame-audio");
		const journal = JSON.parse(await readFile(path.join(dir, id + ".json"), "utf8"));
		expect(journal.nextSequence).toBe(3);
	});
	it("rejects out-of-order or repeated chunks without damaging the acknowledged prefix", async () => {
		const { dir, store } = await fixture();
		const id = await store.begin("browser", "Test", null);
		await store.append(id, 0, bytes("first"));
		await expect(store.append(id, 0, bytes("duplicate"))).rejects.toThrow();
		await expect(store.append(id, 2, bytes("gap"))).rejects.toThrow();
		await store.append(id, 1, bytes("-second"));
		expect(await readFile(path.join(dir, id + ".webm"), "utf8")).toBe("first-second");
	});
	it("offers a released renderer session and ignores malformed or empty journals", async () => {
		const { dir, store } = await fixture();
		await store.begin("browser", "Empty", null);
		const id = await store.begin("browser", "Interrupted", null);
		await store.append(id, 0, bytes("frame"));
		store.release(id);
		await writeFile(path.join(dir, "bad.json"), "broken");
		expect((await store.list()).map((e) => e.id)).toEqual([id]);
		await expect(store.finish("../secret", dir, "invalid")).rejects.toThrow();
	});
	it("keeps raw media and journal after failed processing so recovery can be retried", async () => {
		const { dir, store } = await fixture();
		const id = await store.begin("browser", "Test", null);
		await store.append(id, 0, bytes("raw"));
		store.release(id);
		await expect(store.finish(id, dir, "/not/a/real/ffmpeg")).rejects.toThrow();
		expect(await readFile(path.join(dir, id + ".webm"), "utf8")).toBe("raw");
		expect((await store.list())[0].id).toBe(id);
	});
	it("excludes an active native session and retains its video and audio on completion", async () => {
		const { dir, store } = await fixture();
		const source = path.join(dir, "native.mp4"),
			mic = path.join(dir, "mic.m4a");
		const id = await store.begin("native", "Mac", null, source, mic);
		await writeFile(source, "video");
		await writeFile(mic, "audio");
		expect(await store.list()).toEqual([]);
		await expect(store.finish(id, dir, "invalid")).rejects.toThrow("Kayıt sürerken");
		store.release(id);
		expect((await store.list())[0].kind).toBe("native");
		await store.complete(id);
		expect(await store.list()).toEqual([]);
		expect(await readFile(source, "utf8")).toBe("video");
		expect(await readFile(mic, "utf8")).toBe("audio");
	});
});
