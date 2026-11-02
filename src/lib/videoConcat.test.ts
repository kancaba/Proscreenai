import { describe, expect, it } from "vitest";
import { canJoinWithoutEncoding, concatListFile, copyJoinArgs, encodeJoinArgs, ffmpegProgressMs, joinedBaseName, joinTelemetry, parseFfmpegProbe, type ProbedVideo } from "./videoConcat";

// What ffmpeg prints for a screen recording made by the app and for a test clip with sound.
const RECORDING = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/Users/me/recording-1.mp4':
  Duration: 00:00:30.28, start: 0.008333, bitrate: 5306 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 2960x1858, 5282 kb/s, 40.90 fps, 240 tbr, 600 tbn (default)
`;
const CLIP = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'clip.mov':
  Duration: 00:01:02.50, start: 0.000000, bitrate: 3182 kb/s
  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 3102 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)
`;

describe("reading ffmpeg's description of a video", () => {
  it("reads length, picture and sound", () => {
    expect(parseFfmpegProbe(RECORDING)).toEqual({
      durationMs: 30280,
      video: { codec: "h264", width: 2960, height: 1858, fps: 40.9, pixelFormat: "yuv420p" },
      audio: null,
    });
    expect(parseFfmpegProbe(CLIP)).toEqual({
      durationMs: 62500,
      video: { codec: "hevc", width: 1920, height: 1080, fps: 30, pixelFormat: "yuv420p" },
      audio: { codec: "aac", sampleRate: 48000, channels: "stereo" },
    });
  });
});

describe("joining videos", () => {
  const recording = { path: "/a/recording-1.mp4", probe: parseFfmpegProbe(RECORDING) };
  const sameKind = { path: "/a/recording-2.mp4", probe: { ...recording.probe, durationMs: 5000 } };
  const clip = { path: "/b/clip.mov", probe: parseFfmpegProbe(CLIP) };

  it("puts two recordings of the same screen one after the other without re-encoding", () => {
    expect(canJoinWithoutEncoding([recording, sameKind])).toBe(true);
    expect(copyJoinArgs("/tmp/list.txt", "/out.mp4", "h264")).toContain("copy");
  });

  it("re-encodes videos that differ, fitting them into the first one's size with sound for all", () => {
    expect(canJoinWithoutEncoding([recording, clip])).toBe(false);
    const webm: { path: string; probe: ProbedVideo } = { path: "/a/x.webm", probe: recording.probe };
    expect(canJoinWithoutEncoding([recording, webm])).toBe(false);
    const args = encodeJoinArgs([recording, clip], "/out.mp4", "libx264");
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("[1:v:0]scale=2960:1858:force_original_aspect_ratio=decrease,pad=2960:1858");
    expect(graph).toContain("fps=60"); // a variable frame rate recording becomes 60 fps
    expect(graph).toContain("anullsrc=r=48000:cl=stereo,atrim=duration=30.280[a0]"); // the silent recording gets silence
    expect(graph).toContain("[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]");
    expect(args.slice(-1)).toEqual(["/out.mp4"]);
  });

  it("leaves sound out when no video has any", () => {
    const graph = encodeJoinArgs([recording, sameKind], "/out.mp4", "h264_videotoolbox");
    expect(graph.join(" ")).toContain("[v0][v1]concat=n=2:v=1:a=0[v]");
    expect(graph).not.toContain("[a]");
  });

  it("quotes paths in the list ffmpeg reads", () => {
    expect(concatListFile(["/a/it's.mp4", "/b/c.mp4"])).toBe("file '/a/it'\\''s.mp4'\nfile '/b/c.mp4'\n");
  });

  it("follows ffmpeg's progress and names the joined file after the first", () => {
    expect(ffmpegProgressMs("frame=  10 time=00:00:01.50 bitrate=... time=00:01:02.25 speed=2x")).toBe(62250);
    expect(ffmpegProgressMs("nothing yet")).toBeNull();
    expect(joinedBaseName("recording-1.mp4")).toBe("recording-1");
    expect(joinedBaseName("recording-1-montaj-20261027-153012.mp4")).toBe("recording-1");
    expect(joinedBaseName("recording-1-montaj-20261027-153012-2.mp4")).toBe("recording-1");
  });
});

describe("cursor and key data of a joined video", () => {
  it("moves each file's data to where that file starts", () => {
    const joined = joinTelemetry([
      { data: { version: 2, samples: [{ timeMs: 100, cx: 0.1, cy: 0.2 }, { timeMs: 3100, cx: 0.5, cy: 0.5 }], keys: [500, 2990] }, offsetMs: 0, durationMs: 3000 },
      { data: null, offsetMs: 3000, durationMs: 1000 },
      { data: { samples: [{ timeMs: 0, cx: 0.9, cy: 0.9 }], keys: [200] }, offsetMs: 4000, durationMs: 2000 },
    ]);
    expect(joined.samples.map((sample) => sample.timeMs)).toEqual([100, 3000, 4000]);
    expect(joined.samples[2]).toMatchObject({ cx: 0.9, cy: 0.9 });
    expect(joined.keys).toEqual([500, 2990, 4200]);
  });

  it("reads old files that are only a list of samples", () => {
    expect(joinTelemetry([{ data: [{ timeMs: 10 }], offsetMs: 1000, durationMs: 50 }]).samples).toEqual([{ timeMs: 1010 }]);
  });
});

describe("putting pieces of one video in a new order", () => {
  it("takes each piece from its place in the file", () => {
    const video: ProbedVideo = { durationMs: 14000, video: { codec: "h264", width: 1920, height: 1080, fps: 60 }, audio: { codec: "aac", sampleRate: 48000, channels: "stereo" } };
    const args = encodeJoinArgs([
      { path: "/v.mp4", probe: video, range: { startMs: 10000 } },
      { path: "/v.mp4", probe: video, range: { startMs: 0, endMs: 10000 } },
    ], "/out.mp4", "libx264");
    expect(args.slice(2, 6)).toEqual(["-ss", "10.000", "-i", "/v.mp4"]);
    expect(args.slice(6, 12)).toEqual(["-ss", "0.000", "-t", "10.000", "-i", "/v.mp4"]);
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("[0:v:0]setpts=PTS-STARTPTS,scale=1920:1080");
    expect(graph).toContain("[1:a:0]asetpts=PTS-STARTPTS,aresample=48000");
  });
});
