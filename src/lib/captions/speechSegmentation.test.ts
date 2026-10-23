import { describe, expect, it } from "vitest";
import { detectSpeech, frameLevelsDb, joinWordPieces, planChunks, snapToSpeech } from "./speechSegmentation";

const RATE = 16000;

/** Tone bursts (speech stand-ins) at the given ranges over a noise floor. */
function synth(totalMs: number, bursts: Array<[number, number]>, noise = 0) {
  const samples = new Int16Array((RATE * totalMs) / 1000);
  let seed = 7;
  for (let index = 0; index < samples.length; index += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const t = (index / RATE) * 1000;
    const voiced = bursts.some(([from, to]) => t >= from && t < to);
    const hiss = noise * ((seed / 2147483648) * 2 - 1);
    samples[index] = Math.round((voiced ? 0.3 * Math.sin(index / 5) : 0) * 32767 + hiss * 32767);
  }
  return samples;
}

describe("speech detection", () => {
  it("finds speech between silences within a frame", () => {
    const ranges = detectSpeech(frameLevelsDb(synth(6000, [[500, 2000], [3000, 5200]]), RATE));
    expect(ranges).toHaveLength(2);
    expect(Math.abs(ranges[0].startMs - 500)).toBeLessThanOrEqual(20);
    expect(Math.abs(ranges[1].endMs - 5200)).toBeLessThanOrEqual(20);
  });

  it("adapts to a noise floor and bridges short pauses", () => {
    const ranges = detectSpeech(frameLevelsDb(synth(6000, [[500, 1500], [1600, 2500], [4000, 5000]], 0.03), RATE));
    expect(ranges.map((r) => [r.startMs, r.endMs])).toEqual([
      [500, 2500],
      [4000, 5000],
    ]);
  });

  it("finds nothing in silence", () => {
    expect(detectSpeech(frameLevelsDb(new Int16Array(RATE), RATE))).toEqual([]);
  });
});

describe("chunk planning", () => {
  it("keeps chunks under the limit, cut in pauses, and skips silence", () => {
    const speech = Array.from({ length: 12 }, (_, i) => ({ startMs: i * 8000 + 1000, endMs: i * 8000 + 6000 }));
    const chunks = planChunks(speech, 100000, 30000);
    for (const chunk of chunks) expect(chunk.endMs - chunk.startMs).toBeLessThanOrEqual(30000);
    for (const range of speech) {
      expect(chunks.some((c) => c.startMs <= range.startMs && c.endMs >= range.endMs)).toBe(true);
    }
    for (let i = 1; i < chunks.length; i += 1) expect(chunks[i].startMs).toBeGreaterThanOrEqual(chunks[i - 1].endMs);
  });

  it("cuts continuous speech that is longer than a chunk", () => {
    const chunks = planChunks([{ startMs: 0, endMs: 70000 }], 70000, 30000);
    expect(chunks.length).toBe(3);
    expect(chunks[chunks.length - 1].endMs).toBe(70000);
    for (const chunk of chunks) expect(chunk.endMs - chunk.startMs).toBeLessThanOrEqual(30000);
  });
});

describe("word pieces", () => {
  it("joins suffix runs onto their word", () => {
    const words = joinWordPieces([
      { text: "dışa ", startMs: 0, endMs: 300 },
      { text: "aktar", startMs: 300, endMs: 600 },
      { text: "ıyoruz ", startMs: 600, endMs: 900, confidence: 0.5 },
      { text: " ve ", startMs: 950, endMs: 1000 },
    ]);
    expect(words.map((w) => w.text)).toEqual(["dışa", "aktarıyoruz", "ve"]);
    expect(words[1]).toMatchObject({ startMs: 300, endMs: 900, confidence: 0.5 });
  });
});

describe("snapping", () => {
  it("moves phrase edges onto the speech and leaves inner words alone", () => {
    const speech = [{ startMs: 1000, endMs: 3000 }, { startMs: 4000, endMs: 6000 }];
    const words = snapToSpeech(
      [
        { text: "a", startMs: 1400, endMs: 1800 },
        { text: "b", startMs: 1900, endMs: 3150 },
        { text: "c", startMs: 4500, endMs: 5000 },
        { text: "d", startMs: 5100, endMs: 6100 },
      ],
      speech,
    );
    expect(words.map((w) => [w.startMs, w.endMs])).toEqual([
      [1000, 1800],
      [1900, 3000],
      [4000, 5000],
      [5100, 6000],
    ]);
  });
});
