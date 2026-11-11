import { describe, expect, it } from "vitest";
import { audioClipName } from "./audioClipName";

const t = (_key: string, fallback = "", vars: Record<string, string | number> = {}) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(vars[name] ?? ""));

describe("audio clip names", () => {
  it("names generated voiceovers by their provider instead of a file id", () => {
    expect(audioClipName("/x/voiceovers/elevenlabs-3f1c9a2e-0d1b-4c3a-9f7e-111111111111.mp3", t)).toBe("ElevenLabs voiceover");
    expect(audioClipName("C:\\voiceovers\\fish-audio-abc.mp3", t)).toBe("Fish Audio voiceover");
    expect(audioClipName("/v/ema-lightning-abc.mp3", t)).toBe("Ema Lightning voiceover");
  });

  it("shows other files by name without the extension", () => {
    expect(audioClipName("/music/Upbeat intro.m4a", t)).toBe("Upbeat intro");
    expect(audioClipName("", t)).toBe("Audio");
  });
});
