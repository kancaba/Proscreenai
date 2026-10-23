import { describe, expect, it } from "vitest";
import { buildCaptionCues, captionsOutsideTrims } from "./captionCues";

const word = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs });

describe("caption cues", () => {
  it("starts a new caption at a pause and capitalises with the locale", () => {
    const cues = buildCaptionCues(
      [word("ilk", 0, 300), word("cümle", 350, 800), word("ikinci", 2000, 2400), word("satır", 2450, 2900)],
      { locale: "tr" },
    );
    expect(cues.map((c) => c.text)).toEqual(["İlk cümle", "İkinci satır"]);
    expect(cues[0].startMs).toBe(0);
    expect(cues[0].endMs).toBeLessThanOrEqual(2000);
    expect(cues[1].endMs).toBeGreaterThanOrEqual(2900);
  });

  it("splits long speech by length and duration", () => {
    const words = Array.from({ length: 40 }, (_, i) => word("kelime", i * 250, i * 250 + 200));
    const cues = buildCaptionCues(words, { maxChars: 40, maxDurationMs: 4000 });
    for (const cue of cues) {
      expect(cue.text.length).toBeLessThanOrEqual(40);
      expect(cue.endMs - cue.startMs).toBeLessThanOrEqual(4400);
    }
    for (let i = 1; i < cues.length; i += 1) expect(cues[i].startMs).toBeGreaterThanOrEqual(cues[i - 1].endMs);
  });

  it("keeps a short caption on screen long enough to read", () => {
    const [cue] = buildCaptionCues([word("evet", 1000, 1200)]);
    expect(cue.endMs - cue.startMs).toBeGreaterThanOrEqual(900);
  });
});

describe("captions and cut ranges", () => {
  it("drops captions inside a cut and trims ones that overlap it", () => {
    const cues = [
      { startMs: 0, endMs: 2000, text: "a" },
      { startMs: 3000, endMs: 4000, text: "b" },
      { startMs: 4500, endMs: 7000, text: "c" },
    ];
    const kept = captionsOutsideTrims(cues, [{ startMs: 2800, endMs: 5000 }]);
    expect(kept).toEqual([
      { startMs: 0, endMs: 2000, text: "a" },
      { startMs: 5000, endMs: 7000, text: "c" },
    ]);
  });
});
