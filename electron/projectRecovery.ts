import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { atomicWrite } from "./projectLibrary";

export interface RecoverableProject {
	version: number;
	videoPath: string;
	editor: Record<string, unknown>;
	workspace?: { playheadSeconds: number };
}
export interface RecoveryEntry {
	id: string;
	kind: "draft" | "backup";
	name: string;
	updatedAt: string;
	projectPath: string | null;
}
interface RecoveryRecord extends RecoveryEntry {
	schema: 1;
	project: RecoverableProject;
}
const MAX_BYTES = 40 * 1024 * 1024;
export function isRecoverableProject(value: unknown): value is RecoverableProject {
	if (!value || typeof value !== "object") return false;
	const p = value as RecoverableProject;
	return (
		(p.version === 1 || p.version === 2) &&
		typeof p.videoPath === "string" &&
		p.videoPath.length > 0 &&
		!!p.editor &&
		typeof p.editor === "object" &&
		!Array.isArray(p.editor)
	);
}
function snapshot(project: unknown, maxBytes = Infinity): RecoverableProject {
	if (!isRecoverableProject(project)) throw new Error("Geçersiz proje verisi");
	// Only persist the project contract, never unrelated renderer/session fields.
	const result: RecoverableProject = {
		version: project.version,
		videoPath: project.videoPath,
		editor: project.editor,
	};
	const playhead = project.workspace?.playheadSeconds;
	if (typeof playhead === "number" && Number.isFinite(playhead))
		result.workspace = { playheadSeconds: Math.max(0, playhead) };
	const json = JSON.stringify(result);
	if (Buffer.byteLength(json) > maxBytes) throw new Error("Taslak boyutu sınırı aşıldı");
	return JSON.parse(json);
}
export class ProjectRecovery {
	private pending: Promise<unknown> = Promise.resolve();
	constructor(private readonly directory: string) {}
	private serialize<T>(action: () => Promise<T>): Promise<T> {
		const op = this.pending.then(action);
		this.pending = op.catch(() => undefined);
		return op;
	}
	private id(kind: RecoveryEntry["kind"], origin: string) {
		return `${kind}-${createHash("sha256").update(origin).digest("hex")}`;
	}
	private file(id: string) {
		if (!/^(draft|backup)-[a-f0-9]{64}$/.test(id)) throw new Error("Geçersiz kurtarma kaydı");
		return path.join(this.directory, `${id}.json`);
	}
	private async read(id: string): Promise<RecoveryRecord> {
		const file = this.file(id);
		if (id.startsWith("draft-") && (await fs.stat(file)).size > MAX_BYTES + 4096) throw new Error("Geçersiz kurtarma dosyası");
		const record: RecoveryRecord = JSON.parse(await fs.readFile(file, "utf8"));
		if (
			record.schema !== 1 ||
			record.id !== id ||
			!["draft", "backup"].includes(record.kind) ||
			!isRecoverableProject(record.project) ||
			typeof record.name !== "string" ||
			typeof record.updatedAt !== "string"
		)
			throw new Error("Geçersiz kurtarma dosyası");
		return record;
	}
	private async write(
		kind: RecoveryEntry["kind"],
		project: RecoverableProject,
		projectPath: string | null,
	) {
		const id = this.id(kind, projectPath || project.videoPath);
		const record: RecoveryRecord = {
			schema: 1,
			id,
			kind,
			project,
			projectPath,
			name: path.basename(
				projectPath || project.videoPath,
				path.extname(projectPath || project.videoPath),
			),
			updatedAt: new Date().toISOString(),
		};
		await fs.mkdir(this.directory, { recursive: true });
		await atomicWrite(this.file(id), JSON.stringify(record));
		return record;
	}
	writeDraft(project: unknown, projectPath: string | null) {
		const clean = snapshot(project, MAX_BYTES);
		return this.serialize(async () => {
			// A delayed autosave must not resurrect a draft already saved to disk.
			if (projectPath) {
				const saved = await fs
					.readFile(projectPath, "utf8")
					.then(JSON.parse)
					.catch(() => null);
				if (
					isRecoverableProject(saved) &&
					saved.videoPath === clean.videoPath &&
					JSON.stringify(saved.editor) === JSON.stringify(clean.editor)
				) {
					await fs.rm(this.file(this.id("draft", projectPath)), { force: true });
					return null;
				}
			}
			return this.write("draft", clean, projectPath);
		});
	}
	saveProject(filePath: string, project: unknown) {
		const clean = snapshot(project);
		return this.serialize(async () => {
			const previous = await fs
				.readFile(filePath, "utf8")
				.then(JSON.parse)
				.catch((error) => {
					if (error instanceof SyntaxError || error.code === "ENOENT") return null;
					throw error;
				});
			// A corrupt old file must never replace the last valid backup.
			if (isRecoverableProject(previous)) await this.write("backup", snapshot(previous), filePath);
			await atomicWrite(filePath, JSON.stringify(clean, null, 2));
			await fs.rm(this.file(this.id("draft", filePath)), { force: true });
			await fs.rm(this.file(this.id("draft", clean.videoPath)), { force: true });
		});
	}
	async list(): Promise<RecoveryEntry[]> {
		await this.pending;
		const files = await fs.readdir(this.directory).catch(() => []);
		const entries: RecoveryEntry[] = [];
		// Do not load dozens of image-heavy projects into memory concurrently.
		for (const name of files.filter((name) => /^(draft|backup)-[a-f0-9]{64}\.json$/.test(name))) {
			const record = await this.read(name.slice(0, -5)).catch(() => null);
			if (record) {
				const { id, kind, name, updatedAt, projectPath } = record;
				entries.push({ id, kind, name, updatedAt, projectPath });
			}
		}
		return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}
	async load(id: string) {
		await this.pending;
		return this.read(id);
	}
	clearDraft(id: string) {
		if (!id.startsWith("draft-")) return Promise.resolve();
		return this.serialize(() => fs.rm(this.file(id), { force: true }));
	}
}
