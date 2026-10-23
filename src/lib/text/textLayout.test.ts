import { describe, expect, it } from "vitest";
import { fitFontSize, layoutRichText, type MeasureText } from "./textLayout";

// Every character is half the font size wide.
const measure: MeasureText = (text, _bold, size) => text.length * size * 0.5;

describe("text layout", () => {
  it("wraps at the width and keeps formatted runs", () => {
    const lines = layoutRichText("one two **three** four", 10, 50, measure);
    expect(lines.map((line) => line.map((token) => token.text).join(""))).toEqual(["one two ", "three four"]);
    expect(lines[1][0]).toMatchObject({ text: "three", bold: true });
  });
});

describe("fitting text to its box", () => {
  it("keeps the chosen size when the text fits", () => {
    expect(fitFontSize({ text: "Kısa", fontSize: 28, boxWidth: 600, boxHeight: 100, measure })).toBe(28);
  });

  it("shrinks text that would overflow a smaller box, and the result fits", () => {
    const text = "Fatura İşlemleri menüsünden İhracat Faturası ekranını açıyoruz.";
    const size = fitFontSize({ text, fontSize: 28, boxWidth: 260, boxHeight: 70, measure });
    expect(size).toBeLessThan(28);
    expect(size).toBeGreaterThan(28 * 0.35);
    const lines = layoutRichText(text, size, 260 - 16 - size * 0.4, measure);
    expect(lines.length * size * 1.4 + size * 0.2).toBeLessThanOrEqual(70.5);
  });

  it("scales with the box: the same caption at twice the size gets twice the font", () => {
    const text = "Para birimi listesinde dolar araması yapıp Amerikan Doları'nı seçiyoruz.";
    const small = fitFontSize({ text, fontSize: 28, boxWidth: 300, boxHeight: 80, measure });
    const large = fitFontSize({ text, fontSize: 56, boxWidth: 600, boxHeight: 160, scale: 2, measure });
    expect(Math.abs(large - small * 2)).toBeLessThan(0.6);
  });
});
