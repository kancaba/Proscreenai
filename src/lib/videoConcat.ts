/*
 * Adding a video to the end of the edit joins it to the current video into one new file, so the
 * preview, the timeline tools and the export keep working on a single video. These helpers read
 * what ffmpeg says about the files, decide how to join them and line up their cursor and key data.
 */

export interface ProbedVideo {
  durationMs: number;
  video: { codec: string; width: number; height: number; fps: number; pixelFormat?: string } | null;
  audio: { codec: string; sampleRate: number; channels: string } | null;
}

/** Reads `ffmpeg -i file` output (stderr). */
export function parseFfmpegProbe(output: string): ProbedVideo {
  const duration = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationMs = duration ? Math.round((Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])) * 1000) : 0;

  const videoLine = output.split("\n").find((line) => /Stream #\d+:\d+.*: Video: /.test(line) && !/attached pic/.test(line));
  let video: ProbedVideo["video"] = null;
  if (videoLine) {
    const codec = videoLine.match(/Video: (\w+)/)?.[1] ?? "unknown";
    const size = videoLine.match(/,\s*(\d{2,5})x(\d{2,5})[\s,]/);
    const fps = videoLine.match(/([\d.]+) fps/) ?? videoLine.match(/([\d.]+) tbr/);
    const pixelFormat = videoLine.match(/,\s*(yuv\w+|nv12|p010\w*|rgb\w+|bgr\w+)\b/)?.[1];
    video = {
      codec,
      width: size ? Number(size[1]) : 0,
      height: size ? Number(size[2]) : 0,
      fps: fps ? Number(fps[1]) : 0,
      ...(pixelFormat ? { pixelFormat } : {}),
    };
  }

  const audioLine = output.split("\n").find((line) => /Stream #\d+:\d+.*: Audio: /.test(line));
  const audio = audioLine
    ? {
      codec: audioLine.match(/Audio: (\w+)/)?.[1] ?? "unknown",
      sampleRate: Number(audioLine.match(/(\d+) Hz/)?.[1] ?? 0),
      channels: audioLine.match(/\d+ Hz,\s*([^,]+)/)?.[1]?.trim() ?? "",
    }
    : null;

  return { durationMs, video, audio };
}

const COPYABLE_VIDEO = new Set(["h264", "hevc"]);
const COPYABLE_CONTAINERS = /\.(mp4|mov|m4v)$/i;

/** Whether the files can simply be put one after the other without re-encoding. */
export function canJoinWithoutEncoding(files: Array<{ path: string; probe: ProbedVideo }>): boolean {
  const [first, ...rest] = files;
  if (!first?.probe.video || !COPYABLE_VIDEO.has(first.probe.video.codec)) return false;
  return files.every(({ path, probe }) => {
    if (!COPYABLE_CONTAINERS.test(path) || !probe.video) return false;
    const a = first.probe;
    const sameVideo = probe.video.codec === a.video?.codec && probe.video.width === a.video.width && probe.video.height === a.video.height && probe.video.pixelFormat === a.video.pixelFormat;
    const sameAudio = probe.audio === null
      ? a.audio === null
      : a.audio !== null && probe.audio.codec === "aac" && probe.audio.codec === a.audio.codec && probe.audio.sampleRate === a.audio.sampleRate && probe.audio.channels === a.audio.channels;
    return sameVideo && sameAudio;
  }) && rest.length > 0;
}

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

/** Text for ffmpeg's concat list (paths quoted the way it reads them). */
export function concatListFile(paths: string[]): string {
  return paths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join("\n") + "\n";
}

/** ffmpeg arguments that join files that already match (no re-encoding). */
export function copyJoinArgs(listPath: string, outputPath: string, codec: string): string[] {
  return ["-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", ...(codec === "hevc" ? ["-tag:v", "hvc1"] : []), "-movflags", "+faststart", outputPath];
}

/**
 * ffmpeg arguments that re-encode the files into one: every video is fitted (letterboxed) into
 * the first one's size and frame rate, and a video without sound gets silence. A `range` takes
 * only that part of its file (to the file's end when `endMs` is left out), so pieces of one video
 * can be put in a new order.
 */
export function encodeJoinArgs(files: Array<{ path: string; probe: ProbedVideo; range?: { startMs: number; endMs?: number } }>, outputPath: string, encoder: "h264_videotoolbox" | "libx264"): string[] {
  const first = files[0].probe.video;
  const width = even(first?.width || 1920);
  const height = even(first?.height || 1080);
  // Screen recordings have a variable frame rate (ffmpeg reports an average like 40.9); they get 60.
  const fps = first?.fps && Math.abs(first.fps - Math.round(first.fps)) < 0.01 ? Math.min(120, Math.max(1, Math.round(first.fps))) : 60;
  const withAudio = files.some(({ probe }) => probe.audio);
  const filters: string[] = [];
  const inputs: string[] = [];
  const lengthMs = ({ probe, range }: (typeof files)[number]) => range ? (range.endMs ?? probe.durationMs) - range.startMs : probe.durationMs;
  files.forEach((file, index) => {
    const { probe } = file;
    // A piece taken from inside a file starts its own clock at 0.
    const restart = file.range ? "setpts=PTS-STARTPTS," : "";
    filters.push(`[${index}:v:0]${restart}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps},format=yuv420p[v${index}]`);
    if (withAudio) {
      filters.push(probe.audio
        ? `[${index}:a:0]${file.range ? "asetpts=PTS-STARTPTS," : ""}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${index}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${(lengthMs(file) / 1000).toFixed(3)}[a${index}]`);
    }
    inputs.push(withAudio ? `[v${index}][a${index}]` : `[v${index}]`);
  });
  filters.push(`${inputs.join("")}concat=n=${files.length}:v=1:a=${withAudio ? 1 : 0}${withAudio ? "[v][a]" : "[v]"}`);
  // About 0.1 bit per pixel per frame keeps screen text sharp.
  const bitrate = Math.round((width * height * fps * 0.1) / 1000);
  const video = encoder === "h264_videotoolbox"
    ? ["-c:v", "h264_videotoolbox", "-b:v", `${bitrate}k`, "-maxrate", `${Math.round(bitrate * 1.5)}k`, "-bufsize", `${bitrate * 2}k`]
    : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18"];
  return [
    "-nostdin", "-y",
    // Seeking before the input is frame-accurate when re-encoding and decodes only what is used.
    ...files.flatMap(({ path, range }) => [
      ...(range ? ["-ss", (range.startMs / 1000).toFixed(3), ...(range.endMs === undefined ? [] : ["-t", ((range.endMs - range.startMs) / 1000).toFixed(3)])] : []),
      "-i", path,
    ]),
    "-filter_complex", filters.join(";"),
    "-map", "[v]",
    ...(withAudio ? ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"] : []),
    ...video,
    "-movflags", "+faststart",
    outputPath,
  ];
}

/** Seconds of output ffmpeg has written so far, from a progress line in its stderr. */
export function ffmpegProgressMs(chunk: string): number | null {
  const matches = [...chunk.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  const last = matches[matches.length - 1];
  return last ? Math.round((Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3])) * 1000) : null;
}

export interface TelemetryFile {
  version?: number;
  samples?: Array<{ timeMs: number } & Record<string, unknown>>;
  keys?: number[];
}

/** Data a little past a file's reported end (rounding, the last frame) still belongs to it. */
const END_SLACK_MS = 250;

/** Cursor samples and key times of the joined video: each file's moved by where it starts. */
export function joinTelemetry(parts: Array<{ data: TelemetryFile | unknown[] | null; offsetMs: number; durationMs: number }>): Required<TelemetryFile> {
  const samples: Required<TelemetryFile>["samples"] = [];
  const keys: number[] = [];
  for (const { data, offsetMs, durationMs } of parts) {
    if (!data) continue;
    const ownSamples = Array.isArray(data) ? data : Array.isArray(data.samples) ? data.samples : [];
    for (const sample of ownSamples as Array<Record<string, unknown>>) {
      const time = sample?.timeMs;
      if (typeof time !== "number" || !Number.isFinite(time) || time < 0 || time > durationMs + END_SLACK_MS) continue;
      samples.push({ ...sample, timeMs: Math.min(time, durationMs) + offsetMs });
    }
    const ownKeys = !Array.isArray(data) && Array.isArray(data.keys) ? data.keys : [];
    for (const time of ownKeys) {
      if (typeof time === "number" && Number.isFinite(time) && time >= 0 && time <= durationMs + END_SLACK_MS) keys.push(Math.min(time, durationMs) + offsetMs);
    }
  }
  samples.sort((a, b) => a.timeMs - b.timeMs);
  keys.sort((a, b) => a - b);
  return { version: 2, samples, keys };
}

/** "screen-recording-montaj-20261027-153012(-2).mp4" → "screen-recording", so names do not pile up. */
export function joinedBaseName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/-montaj-\d{8}-\d{6}(?:-\d+)?$/, "");
  return base || "video";
}
