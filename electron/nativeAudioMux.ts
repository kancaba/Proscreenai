import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
const run = promisify(execFile);
/** Original video and audio remain intact until a complete mux is ready. */
export async function muxNativeAudio(videoPath: string, audioPaths: string[], ffmpeg: string) {
	if (!audioPaths.length) return;
	const temp = videoPath + ".audio-mux.mp4";
	const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", videoPath];
	for (const input of audioPaths) args.push("-i", input);
	args.push("-map", "0:v:0");
	if (audioPaths.length === 1) args.push("-map", "1:a:0");
	else
		args.push(
			"-filter_complex",
			audioPaths.map((_, i) => `[${i + 1}:a:0]`).join("") +
				`amix=inputs=${audioPaths.length}:duration=longest:normalize=0[a]`,
			"-map",
			"[a]",
		);
	args.push("-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", temp);
	try {
		await run(ffmpeg, args, { timeout: 1800000, maxBuffer: 2 * 1024 * 1024 });
		await fs.rename(temp, videoPath);
	} finally {
		await fs.rm(temp, { force: true }).catch(() => undefined);
	}
}
