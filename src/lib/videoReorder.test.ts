import { describe, expect, it } from "vitest";
import {
  createReorder,
  insertAddedAt,
  isInOrder,
  movePiece,
  moveRegions,
  piecesBetween,
  reorderSplits,
  reorderTelemetry,
  reorderVideoClips,
  splitRegions,
  validPieces,
} from "./videoReorder";

// A 10 s recording with a 4 s video added at its end (14 s), the added one moved to the start.
const joined = piecesBetween([10000], 14000);
const toStart = createReorder(movePiece(joined, 1, 0));

describe("pieces", () => {
  it("cuts the video at its splits and moves one piece", () => {
    expect(joined).toEqual([{ startMs: 0, endMs: 10000 }, { startMs: 10000, endMs: 14000 }]);
    expect(movePiece(piecesBetween([2000, 5000], 8000), 2, 0)).toEqual([
      { startMs: 5000, endMs: 8000 },
      { startMs: 0, endMs: 2000 },
      { startMs: 2000, endMs: 5000 },
    ]);
    expect(isInOrder(joined)).toBe(true);
    expect(isInOrder(movePiece(joined, 1, 0))).toBe(false);
  });

  it("puts an added video at the start, the playhead or leaves it at the end", () => {
    expect(insertAddedAt(14000, 10000, 0)).toEqual([{ startMs: 10000, endMs: 14000 }, { startMs: 0, endMs: 10000 }]);
    expect(insertAddedAt(14000, 10000, 3000)).toEqual([
      { startMs: 0, endMs: 3000 },
      { startMs: 10000, endMs: 14000 },
      { startMs: 3000, endMs: 10000 },
    ]);
    expect(isInOrder(insertAddedAt(14000, 10000, 10000))).toBe(true);
  });

  it("accepts only pieces that cover the video once", () => {
    expect(validPieces(movePiece(joined, 1, 0))).not.toBeNull();
    expect(validPieces([{ startMs: 0, endMs: 5 }, { startMs: 6, endMs: 9 }])).toBeNull();
    expect(validPieces([{ startMs: 0, endMs: 5 }, { startMs: 0, endMs: 5 }])).toBeNull();
    expect(validPieces("x")).toBeNull();
  });
});

describe("moving the edit with its pieces", () => {
  it("maps moments of the old video into the rebuilt one", () => {
    expect(toStart.time(10000)).toBe(0);
    expect(toStart.time(12500)).toBe(2500);
    expect(toStart.time(0)).toBe(4000);
    expect(toStart.time(9999)).toBe(13999);
    // The ending extension after the video stays after it.
    expect(toStart.time(15000)).toBe(15000);
  });

  it("moves zooms, texts and sounds with their start, keeping their length", () => {
    expect(moveRegions([{ id: "z", startMs: 11000, endMs: 13000 }, { id: "t", startMs: 9000, endMs: 11000 }], toStart)).toEqual([
      { id: "z", startMs: 1000, endMs: 3000 },
      { id: "t", startMs: 13000, endMs: 15000 },
    ]);
  });

  it("splits cuts and speeds at piece edges and joins bits that meet again", () => {
    let id = 0;
    const next = () => `trim-new-${++id}`;
    expect(splitRegions([{ id: "trim-1", startMs: 9000, endMs: 11000 }], toStart, next)).toEqual([
      { id: "trim-1", startMs: 0, endMs: 1000 },
      { id: "trim-new-1", startMs: 13000, endMs: 14000 },
    ]);
    const swapped = createReorder(movePiece(piecesBetween([2000, 5000], 8000), 2, 0));
    // A cut over the first two pieces, which stay side by side.
    expect(splitRegions([{ id: "trim-2", startMs: 1000, endMs: 3000 }], swapped, next)).toEqual([{ id: "trim-2", startMs: 4000, endMs: 6000 }]);
    expect(reorderSplits([2000, 5000], swapped)).toEqual([3000, 5000]);
  });

  it("relabels the joined videos in their new order", () => {
    const clips = [{ name: "a.mp4", startMs: 0 }, { name: "b.mp4", startMs: 10000 }];
    expect(reorderVideoClips(clips, toStart)).toEqual([{ name: "b.mp4", startMs: 0 }, { name: "a.mp4", startMs: 4000 }]);
    // b.mp4 put at 3 s of a.mp4: a, b, then the rest of a.
    expect(reorderVideoClips(clips, createReorder(insertAddedAt(14000, 10000, 3000)))).toEqual([
      { name: "a.mp4", startMs: 0 },
      { name: "b.mp4", startMs: 3000 },
      { name: "a.mp4", startMs: 7000 },
    ]);
    // A piece that holds the end of a.mp4 and all of b.mp4 keeps both labels.
    expect(reorderVideoClips(clips, createReorder(movePiece(piecesBetween([4000], 14000), 1, 0)))).toEqual([
      { name: "a.mp4", startMs: 0 },
      { name: "b.mp4", startMs: 6000 },
      { name: "a.mp4", startMs: 10000 },
    ]);
  });

  it("moves the cursor and key data", () => {
    const data = reorderTelemetry({ version: 2, samples: [{ timeMs: 500, cx: 0.1, cy: 0.2 }, { timeMs: 10500, cx: 0.5, cy: 0.5 }], keys: [12000, 100] }, toStart);
    expect(data?.samples.map((sample) => sample.timeMs)).toEqual([500, 4500]);
    expect(data?.samples[0].cx).toBe(0.5);
    expect(data?.keys).toEqual([2000, 4100]);
  });
});
