import { describe, expect, it } from "vitest";
import { audioClipName } from "./audioClipName";

describe("audio clip names", () => {
  it("names generated voiceovers by their provider instead of a file id", () => {
    expect(audioClipName("/x/voiceovers/elevenlabs-3f1c9a2e-0d1b-4c3a-9f7e-111111111111.mp3", true)).toBe("ElevenLabs seslendirme");
    expect(audioClipName("C:\\voiceovers\\fish-audio-abc.mp3", false)).toBe("Fish Audio voiceover");
    expect(audioClipName("/v/ema-lightning-abc.mp3", true)).toBe("Ema Lightning seslendirme");
  });

  it("shows other files by name without the extension", () => {
    expect(audioClipName("/music/Upbeat intro.m4a", true)).toBe("Upbeat intro");
    expect(audioClipName("", true)).toBe("Ses");
  });
});
