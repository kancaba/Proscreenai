import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { atomicWrite } from "./projectLibrary";
import {
	validateCaptureRegion,
	regionCropFilter,
	type CaptureRegion,
} from "../src/utils/captureRegion";
const run = promisify(execFile);
export interface RecordingEntry {
	id: string;
	name: string;
	startedAt: string;
	kind: "browser" | "native";
	bytes: number;
}
interface Journal extends RecordingEntry {
	schema: 1;
	source: string;
	microphone: string | null;
	audioTracks?: string[];
	region: CaptureRegion | null;
	nextSequence: number;
	completed?: string;
}
/** Append acknowledgements mean both the media prefix and its journal reached fsync. */
export class RecordingRecovery {
	private queue: Promise<unknown> = Promise.resolve();
	private active = new Set<string>();
	constructor(private directory: string) {}
	private serial<T>(fn: () => Promise<T>) {
		const job = this.queue.then(fn);
		this.queue = job.catch(() => undefined);
		return job;
	}
	private file(id: string) {
		if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("Geçersiz kayıt kimliği");
		return path.join(this.directory, id + ".json");
	}
	private async read(id: string): Promise<Journal> {
		const file = this.file(id);
		if ((await fs.stat(file)).size > 16384) throw Error("Geçersiz kayıt günlüğü");
		const j = JSON.parse(await fs.readFile(file, "utf8")) as Journal;
		if (
			j.schema !== 1 ||
			j.id !== id ||
			!["browser", "native"].includes(j.kind) ||
			typeof j.source !== "string" ||
			!Number.isSafeInteger(j.bytes) ||
			j.bytes < 0 ||
			!Number.isSafeInteger(j.nextSequence) ||
			j.nextSequence < 0 ||
			typeof j.startedAt !== "string"
		)
			throw Error("Geçersiz kayıt günlüğü");
		j.region = validateCaptureRegion(j.region);
		return j;
	}
	private async checkSpace(directory: string) {
		const disk = await fs.statfs(directory).catch((error) => {
			if (["ENOSYS", "ENOTSUP"].includes(error.code)) return null;
			throw error;
		});
		if (disk && disk.bavail * disk.bsize < 64 * 1024 * 1024)
			throw Error("Kayıt için yeterli boş disk alanı yok");
	}
	async begin(
		kind: Journal["kind"],
		name: string,
		region: CaptureRegion | null,
		source?: string,
		microphone?: string | null,
		audioTracks: string[] = [],
	) {
		return this.serial(async () => {
			const id = randomUUID();
			await fs.mkdir(this.directory, { recursive: true });
			await this.checkSpace(kind === "browser" ? this.directory : path.dirname(source!));
			const target = kind === "browser" ? path.join(this.directory, id + ".webm") : source!;
			if (!target) throw Error("Kayıt yolu eksik");
			if (kind === "browser") {
				const h = await fs.open(target, "wx", 0o600);
				await h.close();
			}
			const j: Journal = {
				schema: 1,
				id,
				kind,
				name: name.slice(0, 200),
				startedAt: new Date().toISOString(),
				source: target,
				microphone: microphone ?? null,
				audioTracks: [...audioTracks],
				region: validateCaptureRegion(region),
				bytes: 0,
				nextSequence: 0,
			};
			await atomicWrite(this.file(id), JSON.stringify(j));
			this.active.add(id);
			return id;
		});
	}
	append(id: string, sequence: number, data: ArrayBuffer) {
		return this.serial(async () => {
			if (!this.active.has(id)) throw Error("Etkin kayıt bulunamadı");
			const j = await this.read(id);
			if (
				j.kind !== "browser" ||
				sequence !== j.nextSequence ||
				!(data instanceof ArrayBuffer) ||
				!data.byteLength ||
				data.byteLength > 32 * 1024 * 1024
			)
				throw Error("Geçersiz kayıt parçası");
			await this.checkSpace(this.directory);
			const h = await fs.open(j.source, "r+");
			try {
				await h.truncate(j.bytes);
				const bytes = Buffer.from(data);
				let offset = 0;
				while (offset < bytes.length) {
					const written = await h.write(bytes, offset, bytes.length - offset, j.bytes + offset);
					if (!written.bytesWritten) throw Error("Disk yazımı tamamlanamadı");
					offset += written.bytesWritten;
				}
				await h.sync();
			} finally {
				await h.close();
			}
			j.bytes += data.byteLength;
			j.nextSequence++;
			await atomicWrite(this.file(id), JSON.stringify(j));
		});
	}
	release(id: string) {
		this.active.delete(id);
	}
	async list(): Promise<RecordingEntry[]> {
		await this.queue;
		const entries: RecordingEntry[] = [];
		for (const file of await fs.readdir(this.directory).catch(() => [])) {
			if (!file.endsWith(".json")) continue;
			const j = await this.read(file.slice(0, -5)).catch(() => null);
			if (!j || this.active.has(j.id)) continue;
			const stat = await fs.stat(j.completed || j.source).catch(() => null);
			if (stat && stat.size > 0)
				entries.push({
					id: j.id,
					kind: j.kind,
					name: j.name,
					startedAt: j.startedAt,
					bytes: j.kind === "browser" && !j.completed ? j.bytes : stat.size,
				});
		}
		return entries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
	}
	/** Preserve raw files on every failure. A completed recovery remains retryable until opened. */
	finish(id: string, outputDirectory: string, ffmpeg: string, active = false) {
		return this.serial(async () => {
			if (this.active.has(id) && !active) throw Error("Kayıt sürerken kurtarma yapılamaz");
			const j = await this.read(id);
			if (j.completed) {
				await fs.access(j.completed);
				return j.completed;
			}
			await fs.mkdir(outputDirectory, { recursive: true });
			const output = path.join(outputDirectory, `recovered-${id}.mp4`);
			const temp = path.join(outputDirectory, `.recover-${id}.mp4`);
			const prefix = path.join(this.directory, id + ".prefix.webm");
			let input = j.source;
			try {
				if (j.kind === "browser") {
					if (!j.bytes) throw Error("Henüz diske yazılmış görüntü yok");
					if ((await fs.stat(j.source)).size < j.bytes) throw Error("Kayıt parçası eksik");
					await pipeline(
						createReadStream(j.source, { start: 0, end: j.bytes - 1 }),
						createWriteStream(prefix, { mode: 0o600 }),
					);
					input = prefix;
				}
				// Re-encode the readable prefix; tolerate an interrupted final packet, never overwrite raw media.
				const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", input];
				if (j.audioTracks?.length) {
					for (const audio of j.audioTracks) args.push("-i", audio);
					args.push("-map", "0:v:0");
					if (j.audioTracks.length === 1) args.push("-map", "1:a:0");
					else
						args.push(
							"-filter_complex",
							j.audioTracks.map((_, i) => `[${i + 1}:a:0]`).join("") +
								`amix=inputs=${j.audioTracks.length}:duration=longest:normalize=0[a]`,
							"-map",
							"[a]",
						);
				} else if (j.microphone) {
					args.push(
						"-i",
						j.microphone,
						"-filter_complex",
						"[0:a:0][1:a:0]amix=inputs=2:duration=longest:normalize=0[a]",
						"-map",
						"0:v:0",
						"-map",
						"[a]",
					);
				} else args.push("-map", "0:v:0", "-map", "0:a?");

				args.push(
					"-vf",
					j.region ? regionCropFilter(j.region) : "scale=trunc(iw/2)*2:trunc(ih/2)*2",
					"-c:v",
					"libx264",
					"-preset",
					"veryfast",
					"-crf",
					"18",
					"-pix_fmt",
					"yuv420p",
					"-c:a",
					"aac",
					"-movflags",
					"+faststart",
					temp,
				);
				await run(ffmpeg, args, { timeout: 1800000, maxBuffer: 2 * 1024 * 1024 });
				// A full decode catches files that contain headers but no recoverable video frames.
				await run(
					ffmpeg,
					[
						"-v",
						"error",
						"-xerror",
						"-i",
						temp,
						"-map",
						"0:v:0",
						"-frames:v",
						"1",
						"-f",
						"null",
						"-",
					],
					{ timeout: 30000, maxBuffer: 1024 * 1024 },
				);
				if ((await fs.stat(temp)).size < 1024) throw Error("Kurtarılabilir görüntü bulunamadı");
				await fs.rename(temp, output);
				j.completed = output;
				await atomicWrite(this.file(id), JSON.stringify(j));
				this.active.delete(id);
				return output;
			} finally {
				await fs.rm(temp, { force: true }).catch(() => undefined);
				await fs.rm(prefix, { force: true }).catch(() => undefined);
			}
		});
	}
	complete(id: string) {
		return this.serial(async () => {
			this.active.delete(id);
			await fs.rm(this.file(id), { force: true });
		});
	}
}
