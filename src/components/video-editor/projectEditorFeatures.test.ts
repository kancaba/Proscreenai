import { describe, expect, it } from "vitest";
import { normalizeProjectEditor, type ProjectEditorState } from "./projectPersistence";

const saved = (editor: Record<string, unknown>) => normalizeProjectEditor(editor as Partial<ProjectEditorState>);

describe("saved projects keep the newer editing features", () => {
  it("keeps cut crossfades, and only as a true flag", () => {
    const editor = saved({ trimRegions: [{ id: "trim-1", startMs: 1000, endMs: 2000, crossfade: true }, { id: "trim-2", startMs: 3000, endMs: 4000, crossfade: "yes" }] });
    expect(editor.trimRegions).toEqual([{ id: "trim-1", startMs: 1000, endMs: 2000, crossfade: true }, { id: "trim-2", startMs: 3000, endMs: 4000 }]);
  });

  it("keeps video fades and defaults older projects to none", () => {
    expect(saved({ fades: { fadeInMs: 500, fadeOutMs: 2000 } }).fades).toEqual({ fadeInMs: 500, fadeOutMs: 2000 });
    expect(saved({}).fades).toEqual({ fadeInMs: 0, fadeOutMs: 0 });
  });

  it("keeps where an audio clip starts in its file and the file's length", () => {
    const editor = saved({ audioRegions: [{ id: "audio-1", startMs: 0, endMs: 5000, audioPath: "/a.mp3", volume: 1, sourceStartMs: 1500, sourceDurationMs: 9000 }] });
    expect(editor.audioRegions[0]).toMatchObject({ sourceStartMs: 1500, sourceDurationMs: 9000 });
  });

  it("keeps the audio track of a clip, defaulting to A1", () => {
    const editor = saved({ audioRegions: [{ id: "a", startMs: 0, endMs: 1000, audioPath: "/a.mp3", volume: 1, track: 2 }, { id: "b", startMs: 0, endMs: 1000, audioPath: "/a.mp3", volume: 1, track: -3 }] });
    expect(editor.audioRegions[0].track).toBe(2);
    expect(editor.audioRegions[1].track).toBeUndefined();
  });
});
