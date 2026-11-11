// Generated voiceovers are saved as "<provider>-<uuid>.mp3"; show the provider instead of the uuid.
const GENERATED = [
  { prefix: "elevenlabs-", name: "ElevenLabs" },
  { prefix: "fish-audio-", name: "Fish Audio" },
  { prefix: "ema-lightning-", name: "Ema Lightning" },
];

type Translate = (key: string, fallback?: string, vars?: Record<string, string | number>) => string;

/** A readable name for an audio clip's file, e.g. "ElevenLabs voiceover" or "music". */
export function audioClipName(audioPath: string, t: Translate): string {
  const file = audioPath.split(/[\\/]/).pop() ?? "";
  const generated = GENERATED.find((entry) => file.startsWith(entry.prefix));
  if (generated) return t("editor.audioClipName.voiceover", "{{name}} voiceover", { name: generated.name });
  return file.replace(/\.[^.]+$/, "") || t("editor.audioClipName.audio", "Audio");
}
