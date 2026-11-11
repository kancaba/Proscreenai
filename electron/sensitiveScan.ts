import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ipcMain } from "electron";
import {
	findSensitive,
	type OcrLine,
	type SensitiveHit,
	suggestBlurs,
} from "../src/lib/sensitiveText";
import { resolveReadableMediaPath } from "./ipcValidation";

/*
 * Looks for private details in a recording: frames are taken at regular times, their text is
 * read on this Mac by the Vision helper, and details that stay on screen become blur
 * suggestions. Nothing leaves the computer.
 */

export interface SensitiveScanDeps {
	getFfmpegPath: () => string;
	getHelperPath: () => Promise<string>;
}

/** At most this many frames are read, however long the video. */
const MAX_FRAMES = 150;
const MIN_INTERVAL_MS = 1000;

export function scanIntervalMs(durationMs: number) {
	return Math.max(MIN_INTERVAL_MS, Math.ceil(durationMs / MAX_FRAMES / 500) * 500);
}

function run(
	command: string,
	args: string[],
	signal: AbortSignal,
	onLine?: (line: string) => void,
) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
		const stop = () => child.kill("SIGKILL");
		signal.addEventListener("abort", stop, { once: true });
		let buffer = "";
		let errors = "";
		child.stdout.on("data", (chunk) => {
			buffer += String(chunk);
			let newline = buffer.indexOf("\n");
			while (newline >= 0) {
				onLine?.(buffer.slice(0, newline));
				buffer = buffer.slice(newline + 1);
				newline = buffer.indexOf("\n");
			}
		});
		child.stderr.on("data", (chunk) => {
			errors = (errors + String(chunk)).slice(-2000);
		});
		child.on("error", reject);
		child.on("close", (code) => {
			signal.removeEventListener("abort", stop);
			if (signal.aborted) reject(new Error("cancelled"));
			else if (code === 0) resolve();
			else reject(new Error(errors.trim() || `${path.basename(command)} exited with ${code}`));
		});
	});
}

export async function scanVideoForSensitiveText(
	deps: SensitiveScanDeps,
	videoPath: string,
	durationMs: number,
	signal: AbortSignal,
	onProgress: (fraction: number) => void,
) {
	const intervalMs = scanIntervalMs(durationMs);
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "screenmovie-scan-"));
	try {
		// One frame every interval, from the start; text is read best near full size.
		await run(
			deps.getFfmpegPath(),
			[
				"-hide_banner",
				"-nostdin",
				"-v",
				"error",
				"-i",
				videoPath,
				"-vf",
				`fps=1000/${intervalMs},scale='min(1920,iw)':-2`,
				"-q:v",
				"3",
				path.join(dir, "frame-%05d.jpg"),
			],
			signal,
		);
		onProgress(0.1);
		const files = (await fs.readdir(dir)).filter((name) => name.endsWith(".jpg")).sort();
		if (files.length === 0) return { suggestions: [], frames: 0, intervalMs };
		const hits: SensitiveHit[][] = files.map(() => []);
		let read = 0;
		await run(
			await deps.getHelperPath(),
			files.map((name) => path.join(dir, name)),
			signal,
			(line) => {
				let message: { type?: string; index?: number; lines?: OcrLine[] };
				try {
					message = JSON.parse(line);
				} catch {
					return;
				}
				if (
					message.type !== "frame" ||
					typeof message.index !== "number" ||
					!Array.isArray(message.lines)
				)
					return;
				hits[message.index] = findSensitive(message.lines);
				read += 1;
				onProgress(0.1 + 0.9 * (read / files.length));
			},
		);
		const frames = hits.map((frameHits, index) => ({
			timeMs: index * intervalMs,
			hits: frameHits,
		}));
		return {
			suggestions: suggestBlurs(frames, intervalMs, durationMs),
			frames: files.length,
			intervalMs,
		};
	} finally {
		await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
	}
}

export function registerSensitiveScanHandlers(deps: SensitiveScanDeps) {
	const running = new Map<string, { controller: AbortController; owner: number }>();

	ipcMain.handle("cancel-sensitive-scan", (event, requestId: unknown) => {
		const request = typeof requestId === "string" ? running.get(requestId) : undefined;
		if (request?.owner === event.sender.id) request.controller.abort();
	});

	ipcMain.handle(
		"scan-sensitive-text",
		async (event, input: { videoPath?: unknown; durationMs?: unknown; requestId?: unknown }) => {
			const requestId =
				typeof input?.requestId === "string" && input.requestId.length <= 100
					? input.requestId
					: null;
			const durationMs =
				typeof input?.durationMs === "number" &&
				Number.isFinite(input.durationMs) &&
				input.durationMs > 0
					? input.durationMs
					: null;
			if (!requestId || !durationMs) return { success: false, message: "Invalid request." };
			if (process.platform !== "darwin")
				return { success: false, message: "Text recognition is available on macOS." };
			const controller = new AbortController();
			running.set(requestId, { controller, owner: event.sender.id });
			const abort = () => controller.abort();
			event.sender.once("destroyed", abort);
			try {
				const videoPath = await resolveReadableMediaPath(input.videoPath);
				const result = await scanVideoForSensitiveText(
					deps,
					videoPath,
					durationMs,
					controller.signal,
					(fraction) => {
						if (!event.sender.isDestroyed())
							event.sender.send("sensitive-scan-progress", { requestId, fraction });
					},
				);
				return { success: true, ...result };
			} catch (error) {
				if (controller.signal.aborted) return { success: false, cancelled: true };
				return { success: false, message: error instanceof Error ? error.message : String(error) };
			} finally {
				running.delete(requestId);
				if (!event.sender.isDestroyed()) event.sender.removeListener("destroyed", abort);
			}
		},
	);
}
