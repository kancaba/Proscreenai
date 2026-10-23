import { parseRichText, type RichTextRun } from "@/components/video-editor/annotationEffects";

/**
 * Text layout shared by the editor preview and the exporter, so both wrap and size text the
 * same way. Widths come from a measuring callback (a canvas context in practice).
 */

export type MeasureText = (text: string, bold: boolean, fontSize: number) => number;

export type TextToken = RichTextRun & { width: number; newline?: boolean };

/** Splits formatted text into lines that fit `maxWidth`, keeping each run's style. */
export function layoutRichText(text: string, fontSize: number, maxWidth: number, measure: MeasureText): TextToken[][] {
  const lines: TextToken[][] = [];
  let line: TextToken[] = [];
  let lineWidth = 0;
  const pushLine = () => {
    lines.push(line);
    line = [];
    lineWidth = 0;
  };
  for (const run of parseRichText(text)) {
    for (const piece of run.text.split(/(\n|[^\S\n]+)/)) {
      if (!piece) continue;
      if (piece === "\n") {
        // Kept as a zero-width token so the typewriter counts it like the preview does.
        line.push({ ...run, text: "", width: 0, newline: true });
        pushLine();
        continue;
      }
      const width = measure(piece, run.bold, fontSize);
      const isSpace = !piece.trim();
      if (!isSpace && line.some((token) => token.text.trim()) && lineWidth + width > maxWidth) {
        // A trailing space does not count towards the line's visible width.
        const last = line[line.length - 1];
        if (last && !last.newline && !last.text.trim()) line[line.length - 1] = { ...last, width: 0 };
        pushLine();
      }
      line.push({ ...run, text: piece, width });
      lineWidth += width;
    }
  }
  pushLine();
  return lines;
}

/** Width of formatted text on one line. */
export function measureRichText(text: string, fontSize: number, measure: MeasureText): number {
  let width = 0;
  for (const run of parseRichText(text)) width += measure(run.text.replace(/[^\S\n]+$/, ""), run.bold, fontSize);
  return width;
}

/** The editor's text box model: 8 px padded box, text block with 0.1em × 0.2em padding, line-height 1.4. */
export const TEXT_BOX = { padding: 8, padX: 0.2, padY: 0.1, lineHeight: 1.4 } as const;

export interface FitInput {
  text: string;
  fontSize: number;
  boxWidth: number;
  boxHeight: number;
  /** Multiplies the box padding (export resolution / preview size). */
  scale?: number;
  measure: MeasureText;
}

function fits(input: FitInput, size: number) {
  const scale = input.scale ?? 1;
  const innerWidth = Math.max(0, input.boxWidth - TEXT_BOX.padding * 2 * scale);
  const wrapWidth = Math.max(0, innerWidth - size * TEXT_BOX.padX * 2);
  const lines = layoutRichText(input.text, size, wrapWidth, input.measure);
  const widest = Math.max(0, ...lines.map((line) => line.reduce((sum, token) => sum + token.width, 0)));
  const height = lines.length * size * TEXT_BOX.lineHeight + size * TEXT_BOX.padY * 2;
  return widest <= wrapWidth + 0.5 && height <= input.boxHeight + 0.5;
}

/**
 * The font size to draw with: the chosen size when the text fits its box, otherwise the
 * largest smaller size that fits (down to 35 %), so captions stay whole when the frame is
 * smaller, e.g. after switching to 1:1 or 9:16.
 */
export function fitFontSize(input: FitInput): number {
  if (!input.text.trim() || input.fontSize <= 0 || fits(input, input.fontSize)) return input.fontSize;
  let low = input.fontSize * 0.35;
  let high = input.fontSize;
  if (!fits(input, low)) return low;
  for (let step = 0; step < 12; step += 1) {
    const middle = (low + high) / 2;
    if (fits(input, middle)) low = middle;
    else high = middle;
  }
  return Math.floor(low * 10) / 10;
}
