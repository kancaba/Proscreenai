// Generated voiceovers are saved as "<provider>-<uuid>.mp3"; show the provider instead of the uuid.
const GENERATED = [
  { prefix: "elevenlabs-", name: "ElevenLabs" },
  { prefix: "fish-audio-", name: "Fish Audio" },
  { prefix: "ema-lightning-", name: "Ema Lightning" },
];

/** A readable name for an audio clip's file, e.g. "ElevenLabs seslendirme" or "music". */
export function audioClipName(audioPath: string, tr: boolean): string {
  const file = audioPath.split(/[\\/]/).pop() ?? "";
  const generated = GENERATED.find((entry) => file.startsWith(entry.prefix));
  if (generated) return `${generated.name} ${tr ? "seslendirme" : "voiceover"}`;
  return file.replace(/\.[^.]+$/, "") || (tr ? "Ses" : "Audio");
}
