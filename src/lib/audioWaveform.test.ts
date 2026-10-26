import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));
import { computePeaks } from "../../electron/audioWaveform";

describe("audio waveform peaks", () => {
  it("takes the absolute peak per bucket and scales the loudest to 1", () => {
    const samples = Int16Array.from([100, -200, 50, 0, -800, 400, 10, -20]);
    expect(computePeaks(samples, 8, 4)).toEqual([0.25, 0.063, 1, 0.025]);
  });

  it("returns zeros for silence instead of dividing by zero", () => {
    expect(computePeaks(new Int16Array(8), 8, 4)).toEqual([0, 0, 0, 0]);
  });
});
