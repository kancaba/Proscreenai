import { app, dialog, ipcMain } from "electron";
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import {
	DEFAULT_TRANSFORM,
	validSequence,
	sequenceEnd,
	clipEnd,
	type Sequence,
} from "../src/lib/sequence";
import { outputDimensions } from "../src/lib/video/outputSettings";
import { GIF_SIZE_PRESETS } from "../src/lib/exporter/types";
import { resolveReadableMediaPath } from "./ipcValidation";
import { probe } from "./videoAppend";

const seconds = (ms: number) => (ms / 1000).toFixed(3);

export function sequenceExportArgs(sequence: Sequence, output: string): string[] {
	const { width, height, clips } = sequence;
	const opts = sequence.output;
	const gif = opts?.format === "gif";
	const fps = gif ? opts.gifFps : (sequence.fps ?? 30);
	const duration = seconds(sequenceEnd(clips));
	const args = ["-nostdin", "-hide_banner", "-loglevel", "error", "-filter_complex_threads", "2"];
	const filters = [`color=black:s=${width}x${height}:r=${fps}:d=${duration}[base]`];
	const audio: string[] = [];
	let picture = "base";
	const ordered = clips
		.filter((c) => !gif || c.track >= 0)
		.sort((a, b) => a.track - b.track || a.start - b.start);
	ordered.forEach((c, i) => {
		if (c.still) args.push("-loop", "1", "-framerate", String(fps));
		args.push(
			"-threads",
			"1",
			"-ss",
			seconds(c.still ? 0 : c.inMs),
			"-t",
			seconds(c.outMs - c.inMs),
			"-i",
			c.path,
		);
		if (c.track >= 0) {
			const t = c.transform ?? DEFAULT_TRANSFORM;
			const w = Math.max(2, Math.round((width * t.scale) / 2) * 2),
				h = Math.max(2, Math.round((height * t.scale) / 2) * 2);
			const transforms = [
				...(t.flip ? ["hflip"] : []),
				...[[], ["transpose=clock"], ["hflip", "vflip"], ["transpose=cclock"]][t.turns],
				...(c.still ? ["format=rgba"] : []),
				`scale=${w}:${h}:force_original_aspect_ratio=decrease`,
				`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${c.still ? "black@0" : "black"}`,
				"setsar=1",
				...(t.opacity < 1 ? ["format=rgba", `colorchannelmixer=aa=${t.opacity}`] : []),
				`setpts=PTS-STARTPTS+${seconds(c.start)}/TB`,
			];
			filters.push(`[${i}:v:0]${transforms.join(",")}[v${i}]`);
			filters.push(
				`[${picture}][v${i}]overlay=x=${Math.round(width * t.x - w / 2)}:y=${Math.round(height * t.y - h / 2)}:eof_action=repeat:enable='gte(t,${seconds(c.start)})*lt(t,${seconds(clipEnd(c))})'[layer${i}]`,
			);
			picture = `layer${i}`;
		}
		if (!gif && c.hasAudio && c.volume > 0) {
			filters.push(
				`[${i}:a:0]asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=${c.volume},adelay=${c.start}:all=1[a${i}]`,
			);
			audio.push(`[a${i}]`);
		}
	});
	if (audio.length)
		filters.push(`${audio.join("")}amix=inputs=${audio.length}:normalize=0,apad[audio]`);
	let sound = "audio";
	if (sequence.fades) {
		const { fadeInMs, fadeOutMs } = sequence.fades;
		const total = sequenceEnd(clips);
		const share = Math.min(1, total / (fadeInMs + fadeOutMs || 1));
		for (const [kind, ms] of [
			["in", fadeInMs],
			["out", fadeOutMs],
		] as const) {
			if (!ms) continue;
			const timings = `t=${kind}:st=${seconds(kind === "in" ? 0 : total - ms * share)}:d=${seconds(ms * share)}`;
			filters.push(`[${picture}]fade=${timings}[fade${kind}]`);
			picture = "fade" + kind;
			if (audio.length) {
				filters.push(`[${sound}]afade=${timings}[audio${kind}]`);
				sound = "audio" + kind;
			}
		}
	}
	if (opts) {
		const size = outputDimensions(
			width,
			height,
			width / height,
			opts.resolution,
			opts.customWidth,
			opts.customHeight,
			opts.quality,
		);
		const scale = gif ? Math.min(1, GIF_SIZE_PRESETS[opts.gifSize].maxHeight / height) : 1;
		const w = gif ? Math.max(2, Math.round((width * scale) / 2) * 2) : size.width;
		const h = gif ? Math.max(2, Math.round((height * scale) / 2) * 2) : size.height;
		filters.push(
			`[${picture}]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1[sized]`,
		);
		picture = "sized";
	}
	if (gif) {
		filters.push(
			`[${picture}]split[colors][frames]`,
			"[colors]palettegen=stats_mode=single[palette]",
			"[frames][palette]paletteuse=new=1[gif]",
		);
		return [
			...args,
			"-filter_complex",
			filters.join(";"),
			"-map",
			"[gif]",
			"-loop",
			opts.loop ? "0" : "-1",
			"-t",
			duration,
			"-progress",
			"pipe:1",
			output,
		];
	}
	args.push("-filter_complex", filters.join(";"), "-map", `[${picture}]`);
	if (audio.length) args.push("-map", `[${sound}]`, "-c:a", "aac", "-b:a", "192k");
	return [
		...args,
		"-c:v",
		"libx264",
		"-preset",
		"veryfast",
		"-crf",
		({ source: "15", high: "18", good: "21", medium: "25" } as const)[opts?.quality ?? "high"],
		"-pix_fmt",
		"yuv420p",
		"-movflags",
		"+faststart",
		"-t",
		duration,
		"-progress",
		"pipe:1",
		output,
	];
}

function render(
	ffmpeg: string,
	args: string[],
	signal?: AbortSignal,
	progress?: (ms: number) => void,
) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(ffmpeg, args, { signal });
		let errors = "",
			pending = "";
		child.stderr.on("data", (chunk) => {
			errors = (errors + chunk).slice(-2000);
		});
		child.stdout.on("data", (chunk) => {
			const lines = (pending + chunk).split("\n");
			pending = lines.pop() ?? "";
			for (const line of lines)
				if (line.startsWith("out_time_us=")) progress?.(Number(line.slice(12)) / 1000);
		});
		let failure: Error | undefined;
		child.on("error", (error) => {
			failure = error;
		});
		child.on("close", (code) =>
			code === 0 && !failure
				? resolve()
				: reject(failure ?? new Error(errors || "Video render failed")),
		);
	});
}

export function registerSequenceMedia(ffmpeg: () => string, recordingsDir: () => Promise<string>) {
	ipcMain.handle("pick-sequence-media", async () => {
		const picked = await dialog.showOpenDialog({
			properties: ["openFile", "multiSelections"],
			filters: [
				{
					name: "Video & audio",
					extensions: [
						"mp4",
						"mov",
						"m4v",
						"webm",
						"mkv",
						"avi",
						"mp3",
						"m4a",
						"wav",
						"ogg",
						"aac",
						"flac",
						"png",
						"jpg",
						"jpeg",
						"webp",
					],
				},
			],
		});
		return picked.filePaths;
	});
	ipcMain.handle("inspect-sequence-media", async (_, raw: unknown) => {
		const media = await resolveReadableMediaPath(raw);
		const info = await probe(ffmpeg(), media, true);
		const rotated = Math.abs(Math.round((info.video?.rotation ?? 0) / 90)) % 2 === 1;
		return {
			duration: info.durationMs,
			width: (rotated ? info.video?.height : info.video?.width) ?? 0,
			height: (rotated ? info.video?.width : info.video?.height) ?? 0,
			fps: info.video?.fps ?? 30,
			hasAudio: Boolean(info.audio),
		};
	});
	ipcMain.handle("sequence-preview-copy", async (_, raw: unknown) => {
		const media = await resolveReadableMediaPath(raw);
		const stat = await fs.stat(media);
		const key = createHash("sha256")
			.update(JSON.stringify([media, stat.size, stat.mtimeMs]))
			.digest("hex");
		const dir = path.join(app.getPath("userData"), "sequence-previews");
		await fs.mkdir(dir, { recursive: true });
		const output = path.join(dir, key + ".mp4");
		try {
			await fs.access(output);
			return output;
		} catch {
			/* generate a playable copy */
		}
		const temp = path.join(dir, randomUUID() + ".mp4");
		try {
			await render(ffmpeg(), [
				"-v",
				"error",
				"-nostdin",
				"-i",
				media,
				"-map",
				"0:v:0?",
				"-map",
				"0:a:0?",
				"-vf",
				"scale=trunc(iw/2)*2:trunc(ih/2)*2",
				"-c:v",
				"libx264",
				"-preset",
				"veryfast",
				"-pix_fmt",
				"yuv420p",
				"-c:a",
				"aac",
				temp,
			]);
			await fs.rename(temp, output);
			return output;
		} finally {
			await fs.rm(temp, { force: true });
		}
	});
	ipcMain.handle("store-sequence-graphic", async (_, data: ArrayBuffer) => {
		const bytes = Buffer.from(data);
		if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
			throw Error("Invalid PNG");
		const output = path.join(await recordingsDir(), `graphic-${randomUUID()}.png`);
		await fs.writeFile(output, bytes, { flag: "wx" });
		return output;
	});
	ipcMain.handle("store-sequence-source", async (_, data: ArrayBuffer) => {
		const output = path.join(await recordingsDir(), `kurgu-${randomUUID()}.mp4`);
		await fs.writeFile(output, Buffer.from(data), { flag: "wx" });
		return output;
	});
	const jobs = new Map<number, AbortController>();
	ipcMain.handle("cancel-sequence-export", (e) => jobs.get(e.sender.id)?.abort());
	ipcMain.handle("export-sequence", async (e, value: unknown) => {
		if (!validSequence(value) || !value.clips.length) throw new Error("Invalid sequence");
		const sender = e.sender,
			id = sender.id;
		if (jobs.has(id)) throw new Error("Export in progress");
		const job = new AbortController();
		jobs.set(id, job);
		const stop = () => job.abort();
		sender.once("destroyed", stop);
		let temp: string | undefined;
		try {
			const clips = await Promise.all(
				value.clips.map(async (c) => ({ ...c, path: await resolveReadableMediaPath(c.path) })),
			);
			const ext = value.output?.format ?? "mp4";
			const picked = await dialog.showSaveDialog({
				defaultPath: `Kurgu.${ext}`,
				filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
			});
			if (!picked.filePath || picked.canceled || job.signal.aborted) return null;
			const target = picked.filePath;
			const actual = await fs.realpath(target).catch(() => path.resolve(target));
			const sources = await Promise.all(
				clips
					.filter((c) => c.edit)
					.map((c) => fs.realpath(c.edit!.videoPath).catch(() => path.resolve(c.edit!.videoPath))),
			);
			if (sources.includes(actual) || clips.some((c) => c.path === actual))
				throw new Error("Kaynak dosyanın üzerine yazılamaz.");
			temp = path.join(path.dirname(target), `.sequence-${randomUUID()}.${ext}`);
			const length = sequenceEnd(clips);
			await render(ffmpeg(), sequenceExportArgs({ ...value, clips }, temp), job.signal, (ms) => {
				if (!sender.isDestroyed())
					sender.send("sequence-export-progress", Math.min(1, ms / length));
			});
			if (job.signal.aborted) return null;
			await fs.rename(temp, target);
			return target;
		} catch (error) {
			if (job.signal.aborted) return null;
			throw error;
		} finally {
			jobs.delete(id);
			sender.removeListener("destroyed", stop);
			if (temp) await fs.rm(temp, { force: true });
		}
	});
}
