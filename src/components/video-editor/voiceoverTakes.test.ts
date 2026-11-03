import { describe, expect, it } from "vitest";
import { normalizeProjectEditor } from "./projectPersistence";
import { addVoiceoverTake, MAX_VOICEOVER_TAKES, normalizeVoiceoverTakes, type VoiceoverTake } from "./voiceoverTakes";

const take = (id: string, path = `/v/${id}.mp3`): VoiceoverTake => ({ id, path, durationMs: 2400, text: "Merhaba", voice: "Ema Lightning", createdAt: 1 });

describe("voiceovers made for a project", () => {
  it("keeps the newest first, once per file, up to the limit", () => {
    expect(addVoiceoverTake([take("a"), take("b")], take("c")).map((t) => t.id)).toEqual(["c", "a", "b"]);
    expect(addVoiceoverTake([take("a"), take("b")], take("d", "/v/a.mp3")).map((t) => t.id)).toEqual(["d", "b"]);
    const many = Array.from({ length: MAX_VOICEOVER_TAKES }, (_, i) => take(`t${i}`));
    const kept = addVoiceoverTake(many, take("new"));
    expect(kept).toHaveLength(MAX_VOICEOVER_TAKES);
    expect(kept[0].id).toBe("new");
    expect(kept.at(-1)?.id).toBe(`t${MAX_VOICEOVER_TAKES - 2}`);
  });

  it("are saved with the project and broken ones are dropped", () => {
    const saved = [take("a"), { id: "b", path: "", durationMs: 10 }, { id: "c", path: "/v/c.mp3", durationMs: 0 }, { id: "d", path: "/v/d.mp3", durationMs: 1200.4 }];
    expect(normalizeVoiceoverTakes(saved)).toEqual([take("a"), { id: "d", path: "/v/d.mp3", durationMs: 1200, text: "", voice: "", createdAt: 0 }]);
    expect(normalizeProjectEditor({ voiceoverTakes: [take("a")] }).voiceoverTakes).toEqual([take("a")]);
    expect(normalizeProjectEditor({}).voiceoverTakes).toBeUndefined();
  });
});
