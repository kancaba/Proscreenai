import { DEFAULT_HIGHLIGHT_COLOR } from "./annotationEffects";
import type { AnnotationRegion, AnnotationTextStyle } from "./types";

/*
 * Ready-made looks for the captions made from the video's speech. A look sets the colours,
 * background, outline, shadow and highlight colour together and leaves size and position alone,
 * so it can be switched at any time. The preview and the export draw these fields the same way.
 */

export type CaptionStyleId = "classic" | "cinema" | "highlight" | "light" | "neon" | "brand";

/** The caption look chosen for the project; `brandColor` is used by the "brand" look. */
export interface CaptionStyleChoice {
  id: CaptionStyleId;
  brandColor?: string;
}

type CaptionLook = Pick<AnnotationTextStyle, "color" | "backgroundColor" | "fontWeight" | "textShadow" | "strokeWidth" | "strokeColor" | "highlightColor">;

export interface CaptionStyle {
  id: CaptionStyleId;
  tr: string;
  en: string;
  look: (brandColor: string) => CaptionLook;
}

export const DEFAULT_BRAND_COLOR = "#2563eb";
export const DEFAULT_CAPTION_STYLE: CaptionStyleChoice = { id: "classic" };

/** Black or white, whichever reads better on a colour. */
function readableOn(hex: string): string {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255);
  const linear = (channel: number) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return luminance > 0.4 ? "#111111" : "#ffffff";
}

export const CAPTION_STYLES: CaptionStyle[] = [
  {
    id: "classic",
    tr: "Klasik",
    en: "Classic",
    // The look speech captions always had: white on a dark, see-through box.
    look: () => ({ color: "#ffffff", backgroundColor: "#000000b3", fontWeight: "normal", textShadow: "none", strokeWidth: 0, strokeColor: "#000000", highlightColor: DEFAULT_HIGHLIGHT_COLOR }),
  },
  {
    id: "cinema",
    tr: "Sinema",
    en: "Cinema",
    look: () => ({ color: "#ffffff", backgroundColor: "transparent", fontWeight: "bold", textShadow: "strong", strokeWidth: 3, strokeColor: "#000000", highlightColor: DEFAULT_HIGHLIGHT_COLOR }),
  },
  {
    id: "highlight",
    tr: "Vurgulu",
    en: "Highlight",
    look: () => ({ color: "#ffffff", backgroundColor: "transparent", fontWeight: "bold", textShadow: "soft", strokeWidth: 4, strokeColor: "#111111", highlightColor: "#facc15" }),
  },
  {
    id: "light",
    tr: "Açık kutu",
    en: "Light box",
    look: () => ({ color: "#111111", backgroundColor: "#ffffffeb", fontWeight: "bold", textShadow: "none", strokeWidth: 0, strokeColor: "#000000", highlightColor: "#2563eb" }),
  },
  {
    id: "neon",
    tr: "Neon",
    en: "Neon",
    look: () => ({ color: "#5eead4", backgroundColor: "#0b1020d9", fontWeight: "bold", textShadow: "soft", strokeWidth: 0, strokeColor: "#000000", highlightColor: "#f472b6" }),
  },
  {
    id: "brand",
    tr: "Marka rengi",
    en: "Brand colour",
    look: (brandColor) => ({ color: readableOn(brandColor), backgroundColor: brandColor, fontWeight: "bold", textShadow: "none", strokeWidth: 0, strokeColor: "#000000", highlightColor: readableOn(brandColor) === "#ffffff" ? "#fde047" : "#1d4ed8" }),
  },
];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** The style fields a caption gets with a look. */
export function captionLook(choice: CaptionStyleChoice): CaptionLook {
  const style = CAPTION_STYLES.find((candidate) => candidate.id === choice.id) ?? CAPTION_STYLES[0];
  return style.look(choice.brandColor && HEX_COLOR.test(choice.brandColor) ? choice.brandColor : DEFAULT_BRAND_COLOR);
}

/** Whether a region is a caption made from the video's speech. */
export const isSpeechCaption = (region: AnnotationRegion) => region.type === "text" && region.generatedBy === "transcript";

/** Every speech caption with the look; other texts stay as they are. */
export function applyCaptionStyle(regions: AnnotationRegion[], choice: CaptionStyleChoice): AnnotationRegion[] {
  const look = captionLook(choice);
  return regions.map((region) => (isSpeechCaption(region) ? { ...region, style: { ...region.style, ...look } } : region));
}

/** The look the speech captions have now, if they share one of the ready-made looks. */
export function detectCaptionStyle(regions: AnnotationRegion[]): CaptionStyleChoice | null {
  const caption = regions.find(isSpeechCaption);
  if (!caption) return null;
  const fields = ["color", "backgroundColor", "textShadow", "strokeWidth", "strokeColor", "highlightColor"] as const;
  for (const style of CAPTION_STYLES) {
    const choice: CaptionStyleChoice = style.id === "brand" ? { id: "brand", brandColor: caption.style.backgroundColor } : { id: style.id };
    const look = captionLook(choice);
    if (fields.every((field) => (caption.style[field] ?? defaults[field]) === look[field])) return choice;
  }
  return null;
}

/** Values older captions leave out. */
const defaults: Partial<AnnotationTextStyle> = { textShadow: "none", strokeWidth: 0, strokeColor: "#000000", highlightColor: DEFAULT_HIGHLIGHT_COLOR };
