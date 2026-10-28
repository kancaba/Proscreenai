import { describe, expect, it } from "vitest";
import { TEXT_STYLE_PRESETS } from "./annotationEffects";
import { applyCaptionStyle, CAPTION_STYLES, captionLook, detectCaptionStyle } from "./captionStyles";
import { type AnnotationRegion, DEFAULT_ANNOTATION_STYLE } from "./types";

const text = (id: string, generatedBy?: "transcript"): AnnotationRegion => ({
  id, startMs: 0, endMs: 1000, type: "text", content: id, textContent: id,
  position: { x: 10, y: 74 }, size: { width: 80, height: 20 },
  style: { ...DEFAULT_ANNOTATION_STYLE, fontSize: 31 }, zIndex: 1, ...(generatedBy ? { generatedBy } : {}),
});

describe("caption looks", () => {
  it("classic is the look speech captions always had", () => {
    const subtitle = TEXT_STYLE_PRESETS.find((preset) => preset.id === "subtitle")?.style;
    expect(captionLook({ id: "classic" })).toMatchObject({ color: subtitle?.color, backgroundColor: subtitle?.backgroundColor, fontWeight: subtitle?.fontWeight, textShadow: "none", strokeWidth: 0 });
  });

  it("every look sets colour, background, outline, shadow and highlight", () => {
    for (const style of CAPTION_STYLES) {
      const look = captionLook({ id: style.id, brandColor: "#ff0000" });
      for (const field of ["color", "backgroundColor", "textShadow", "strokeWidth", "strokeColor", "highlightColor"] as const) expect(look[field], `${style.id}.${field}`).toBeDefined();
    }
  });

  it("brand colour picks readable text", () => {
    expect(captionLook({ id: "brand", brandColor: "#1e3a8a" })).toMatchObject({ backgroundColor: "#1e3a8a", color: "#ffffff" });
    expect(captionLook({ id: "brand", brandColor: "#fde68a" })).toMatchObject({ backgroundColor: "#fde68a", color: "#111111" });
  });

  it("changes only speech captions, and only their look", () => {
    const [caption, title] = applyCaptionStyle([text("a", "transcript"), text("b")], { id: "cinema" });
    expect(caption.style).toMatchObject({ backgroundColor: "transparent", strokeWidth: 3, textShadow: "strong", fontSize: 31 });
    expect(caption.position).toEqual({ x: 10, y: 74 });
    expect(title.style).toEqual(text("b").style);
  });
});

describe("knowing the current look", () => {
  it("recognises a look, including older captions without outline fields", () => {
    expect(detectCaptionStyle(applyCaptionStyle([text("a", "transcript")], { id: "neon" }))).toEqual({ id: "neon" });
    expect(detectCaptionStyle(applyCaptionStyle([text("a", "transcript")], { id: "brand", brandColor: "#123456" }))).toEqual({ id: "brand", brandColor: "#123456" });
    const older = { ...text("a", "transcript"), style: { ...DEFAULT_ANNOTATION_STYLE, color: "#ffffff", backgroundColor: "#000000b3", fontWeight: "normal" as const } };
    expect(detectCaptionStyle([older])).toEqual({ id: "classic" });
    expect(detectCaptionStyle([text("b")])).toBeNull();
  });
});
