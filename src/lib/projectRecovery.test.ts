import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectRecovery } from "../../electron/projectRecovery";
const dirs: string[] = [];
async function fixture() {
	const dir = await mkdtemp(path.join(os.tmpdir(), "screenmovie-recovery-"));
	dirs.push(dir);
	return {
		dir,
		store: new ProjectRecovery(path.join(dir, "recovery")),
		file: path.join(dir, "demo.screenmovie"),
	};
}
const project = (padding: number) => ({
	version: 1,
	videoPath: "/video.mp4",
	editor: { padding },
	workspace: { playheadSeconds: 2.5 },
});
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
describe("ProjectRecovery", () => {
	it("recovers unsaved edits across a new process without overwriting the source", async () => {
		const { dir, store, file } = await fixture();
		await writeFile(file, JSON.stringify(project(10)));
		await store.writeDraft(project(20), file);
		const restarted = new ProjectRecovery(path.join(dir, "recovery"));
		const entries = await restarted.list();
		expect(entries).toHaveLength(1);
		expect((await restarted.load(entries[0].id)).project.editor.padding).toBe(20);
		expect(JSON.parse(await readFile(file, "utf8")).editor.padding).toBe(10);
	});
	it("serializes concurrent saves and keeps the preceding complete version", async () => {
		const { store, file } = await fixture();
		await store.saveProject(file, project(1));
		await Promise.all([store.saveProject(file, project(2)), store.saveProject(file, project(3))]);
		expect(JSON.parse(await readFile(file, "utf8")).editor.padding).toBe(3);
		const backup = (await store.list()).find((e) => e.kind === "backup")!;
		expect((await store.load(backup.id)).project.editor.padding).toBe(2);
	});
	it("does not overwrite a valid backup with a damaged project", async () => {
		const { store, file } = await fixture();
		await store.saveProject(file, project(1));
		await store.saveProject(file, project(2));
		await writeFile(file, "{damaged");
		await store.saveProject(file, project(3));
		const backup = (await store.list())[0];
		expect((await store.load(backup.id)).project.editor.padding).toBe(1);
	});
	it("clears drafts on explicit save and ignores late matching autosaves", async () => {
		const { store, file } = await fixture();
		await store.writeDraft(project(2), null);
		await store.saveProject(file, project(2));
		expect((await store.list()).some((e) => e.kind === "draft")).toBe(false);
		await store.writeDraft(project(3), file);
		await store.saveProject(file, project(3));
		await store.writeDraft(project(3), file);
		expect((await store.list()).some((e) => e.kind === "draft")).toBe(false);
	});
	it("rejects path traversal and ignores malformed records", async () => {
		const { dir, store } = await fixture();
		await mkdir(path.join(dir, "recovery"));
		await writeFile(path.join(dir, "recovery", "draft-" + "a".repeat(64) + ".json"), "broken");
		expect(await store.list()).toEqual([]);
		await expect(store.load("../private")).rejects.toThrow();
		expect(() => store.writeDraft({ videoPath: "x" }, null)).toThrow();
	});
	it("stores only the project contract and validates the view state", async () => {
		const { store } = await fixture();
		await store.writeDraft(
			{ ...project(1), apiKey: "must-not-persist", workspace: { playheadSeconds: NaN } },
			null,
		);
		const record = await store.load((await store.list())[0].id);
		expect(JSON.stringify(record)).not.toContain("must-not-persist");
		expect(record.project.workspace).toBeUndefined();
	});
	it("keeps the draft size limit out of explicit saves and backups", async () => {
		const { store, file } = await fixture();
		const large = { ...project(1), editor: { image: "x".repeat(41 * 1024 * 1024) } };
		expect(() => store.writeDraft(large, null)).toThrow("Taslak boyutu");
		await store.saveProject(file, large);
		await store.saveProject(file, project(2));
		const backup = (await store.list()).find((entry) => entry.kind === "backup");
		expect(backup).toBeDefined();
		expect((await store.load(backup!.id)).project.editor.image).toHaveLength(41 * 1024 * 1024);
	});

});
