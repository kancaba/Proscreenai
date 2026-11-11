import { describe, expect, it } from "vitest";
import { addProposals, clearProposals, EMPTY_PROPOSALS, type ProposalContext, sanitizeProposalSet, summarizeProposals } from "./proposals";

const context: ProposalContext = { durationMs: 20000, zooms: [{ startMs: 1000, endMs: 3000 }], speeds: [] };
let counter = 0;
const nextId = () => `p${++counter}`;

describe("agent proposals", () => {
  it("accepts valid zooms and explains invalid ones", () => {
    const result = addProposals(
      EMPTY_PROPOSALS,
      "zoom",
      [
        { startMs: 5000, endMs: 7000, depth: 3, focusX: 0.3, focusY: 0.4, reason: "click" },
        { startMs: 6000, endMs: 8000, depth: 3 },
        { startMs: 9000, endMs: 9100, depth: 3 },
        { startMs: 10000, endMs: 12000, depth: 9 },
        { startMs: 2000, endMs: 4000 },
      ],
      context,
      {},
      nextId,
    );
    expect(result.accepted).toBe(1);
    expect(result.errors).toHaveLength(4);
    expect(result.errors.join("\n")).toMatch(/overlaps another zoom/);
    expect(result.errors.join("\n")).toMatch(/shorter than 500 ms/);
    expect(result.errors.join("\n")).toMatch(/depth must be/);
    expect(result.errors.join("\n")).toMatch(/replaceExisting/);
    expect(result.set.items[0]).toMatchObject({ kind: "zoom", focus: { cx: 0.3, cy: 0.4 }, reason: "click" });
  });

  it("replacing starts the kind over and allows overlap with current zooms", () => {
    const first = addProposals(EMPTY_PROPOSALS, "zoom", [{ startMs: 5000, endMs: 7000 }], context, {}, nextId);
    const second = addProposals(first.set, "zoom", [{ startMs: 2000, endMs: 4000 }], context, { replaceExisting: true }, nextId);
    expect(second.errors).toEqual([]);
    expect(second.set.items.map((item) => item.startMs)).toEqual([2000]);
    expect(second.set.replaceZooms).toBe(true);
  });

  it("clamps to the video and checks speeds, text and captions", () => {
    const trims = addProposals(EMPTY_PROPOSALS, "trim", [{ startMs: 19000, endMs: 25000 }, { startMs: 21000, endMs: 22000 }], context, {}, nextId);
    expect(trims.set.items[0]).toMatchObject({ startMs: 19000, endMs: 20000 });
    expect(trims.errors[0]).toMatch(/after the video ends/);
    expect(addProposals(EMPTY_PROPOSALS, "speed", [{ startMs: 0, endMs: 5000, speed: 3 }], context, {}, nextId).errors[0]).toMatch(/speed must be/);
    const text = addProposals(EMPTY_PROPOSALS, "text", [{ startMs: 0, endMs: 2500, text: "  Giriş  ", style: "title", x: 10, y: 10 }], context, {}, nextId);
    expect(text.set.items[0]).toMatchObject({ text: "Giriş", preset: "title", position: { x: 10, y: 10 } });
    expect(addProposals(EMPTY_PROPOSALS, "caption", [{ startMs: 0, endMs: 1000, text: "" }], context, {}, nextId).errors[0]).toMatch(/text must be/);
    expect(addProposals(EMPTY_PROPOSALS, "caption", "nope", context, {}, nextId).errors[0]).toMatch(/non-empty array/);
  });

  it("accepts blur areas on the frame and explains bad ones", () => {
    const result = addProposals(
      EMPTY_PROPOSALS,
      "blur",
      [
        { startMs: 2000, endMs: 9000, x: 0.62, y: 0.1, width: 0.25, height: 0.04, reason: "e-mail" },
        { startMs: 2000, endMs: 9000, x: 0.1, y: 0.5, width: 0.2, height: 0.05, style: "pixelate" },
        { startMs: 0, endMs: 1000, x: 0.9, y: 0.1, width: 0.3, height: 0.05 },
        { startMs: 0, endMs: 1000, x: 0.1, y: 0.1, width: 0.001, height: 0.05 },
        { startMs: 0, endMs: 1000, x: "left", y: 0.1, width: 0.2, height: 0.05 },
        { startMs: 0, endMs: 1000, x: 0.1, y: 0.1, width: 0.2, height: 0.05, style: "black" },
      ],
      context,
      {},
      nextId,
    );
    // Blur areas may overlap in time: one screen can show several private details.
    expect(result.accepted).toBe(2);
    expect(result.set.items[0]).toMatchObject({ kind: "blur", rect: { x: 0.62, y: 0.1, width: 0.25, height: 0.04 }, style: "blur", reason: "e-mail" });
    expect(result.set.items[1]).toMatchObject({ style: "pixelate" });
    expect(result.errors.join("\n")).toMatch(/inside the frame/);
    expect(result.errors.join("\n")).toMatch(/at least 0.01/);
    expect(result.errors.join("\n")).toMatch(/must be numbers/);
    expect(result.errors.join("\n")).toMatch(/blur or pixelate/);
    expect(summarizeProposals(result.set)).toMatch(/blur 2000–9000 ms: blur area x 0.62, y 0.1, 0.25 × 0.04 — e-mail/);
    // A set coming back from the editor keeps its blur areas.
    expect(sanitizeProposalSet(result.set, context, nextId).items.map((item) => item.kind)).toEqual(["blur", "blur"]);
  });

  it("accepts one fade per end and explains bad ones", () => {
    const result = addProposals(
      EMPTY_PROPOSALS,
      "fade",
      [
        { edge: "out", startMs: 19000, endMs: 20000, reason: "soft ending" },
        { edge: "in", startMs: 0, endMs: 500 },
        { edge: "in", startMs: 0, endMs: 700 },
        { edge: "out", startMs: 15000, endMs: 16000 },
        { edge: "side", startMs: 0, endMs: 1000 },
      ],
      context,
      {},
      nextId,
    );
    expect(result.accepted).toBe(2);
    expect(result.errors).toEqual([
      "item 3 (0–700 ms): a fade lasts 500, 1000, 2000 ms",
      "item 4 (15000–16000 ms): a fade out ends at the end of the video (20000 ms)",
      "item 5 (0–1000 ms): edge must be in or out",
    ]);
    expect(summarizeProposals(result.set)).toMatch(/fade 19000–20000 ms: fade out, 1000 ms — soft ending/);
    // A new fade for the same end replaces the earlier one.
    const longer = addProposals(result.set, "fade", [{ edge: "out", startMs: 18000, endMs: 20000 }], context, {}, nextId).set;
    expect(longer.items.filter((item) => item.kind === "fade").map((item) => [item.startMs, item.endMs])).toEqual([[0, 500], [18000, 20000]]);
    expect(sanitizeProposalSet(longer, context, nextId).items.map((item) => item.kind)).toEqual(["fade", "fade"]);
  });

  it("summarises and clears", () => {
    const { set } = addProposals(EMPTY_PROPOSALS, "trim", [{ startMs: 1000, endMs: 2000, reason: "pause" }], context, {}, nextId);
    expect(summarizeProposals(set)).toMatch(/trim 1000–2000 ms: cut — pause/);
    expect(clearProposals(set, "trim").items).toEqual([]);
    expect(summarizeProposals(clearProposals(set))).toBe("No proposals yet.");
  });
});
