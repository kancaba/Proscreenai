import { describe, expect, it } from "vitest";
import { sliceWaveform } from "./waveformSlice";

const waveform = { durationMs: 4000, peaksPerSecond: 10, peaks: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };

describe("waveform slicing", () => {
  it("shows the part of the file the clip plays, so trimming the start shifts the drawing", () => {
    expect(sliceWaveform(waveform, 0, 1000, 2)).toEqual([0.4, 0.9]);
    expect(sliceWaveform(waveform, 1000, 1000, 2)).toEqual([1, 0.5]);
  });

  it("keeps the loudest peak of each column and handles empty sizes", () => {
    expect(sliceWaveform(waveform, 0, 2000, 1)).toEqual([1]);
    expect(sliceWaveform(waveform, 0, 0, 10)).toEqual([]);
    expect(sliceWaveform(waveform, 0, 1000, 0)).toEqual([]);
  });

  it("is silent past the end of the file", () => {
    expect(sliceWaveform(waveform, 5000, 1000, 2)).toEqual([0, 0]);
  });
});
